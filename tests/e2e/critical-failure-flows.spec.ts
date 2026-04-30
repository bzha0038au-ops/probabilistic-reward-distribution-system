import { expect, test, type Page, type Route } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL;
const adminOrigin =
  process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? 'http://127.0.0.1:5173';
const TEST_BIRTH_DATE = '1990-01-01';

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set for e2e tests.');
}

if (!apiBaseUrl) {
  throw new Error('PLAYWRIGHT_API_BASE_URL must be set for e2e tests.');
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
});

const ADMIN_SESSION_COOKIE = 'reward_admin_session';
const CSRF_COOKIE = 'reward_csrf';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN = 'playwright-admin-csrf-token';
const ADMIN_BREAK_GLASS_CODE =
  'integration-break-glass-secret-1234567890-abcdefghijklmnopqrstuvwxyz';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type ApiEnvelope<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error?: { message?: string; code?: string }; requestId?: string };

type AdminSession = {
  token: string;
  secret: string;
};

const PLAYWRIGHT_ADMIN_PERMISSION_KEYS = [
  'finance.read',
  'finance.approve_withdrawal',
  'finance.reject_withdrawal',
  'risk.read',
  'risk.freeze_user',
] as const;

const readBody = async <T>(response: Response) =>
  (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

const decodeBase32 = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Invalid base32 secret.');
    }

    accumulator = (accumulator << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((accumulator >> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const generateTotpCode = (secret: string, now = Date.now()) => {
  const counter = BigInt(Math.floor(now / 30_000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
};

const requestJson = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = await readBody<T>(response);
  return { response, body };
};

const expectOk = async <T>(path: string, init: RequestInit = {}) => {
  const { response, body } = await requestJson<T>(path, init);
  if (!response.ok || !body.ok) {
    throw new Error(
      `Request to ${path} failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body.data;
};

const waitForNotificationPayload = async (payload: {
  kind: string;
  recipient: string;
  timeoutMs?: number;
}) => {
  const deadline = Date.now() + (payload.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const rows = await sql<Array<{ payload: Record<string, unknown> | string }>>`
      select payload
      from notification_deliveries
      where kind = ${payload.kind}
        and recipient = ${payload.recipient}
      order by id desc
      limit 1
    `;

    const value = rows[0]?.payload;
    if (typeof value === 'string') {
      return JSON.parse(value) as Record<string, unknown>;
    }

    if (value && typeof value === 'object') {
      return value;
    }

    await delay(200);
  }

  throw new Error(
    `Timed out waiting for ${payload.kind} notification for ${payload.recipient}.`,
  );
};

const waitForRecord = async <T>(
  query: () => Promise<T | null | undefined>,
  label: string,
  timeoutMs = 10_000,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const record = await query();
    if (record) {
      return record;
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${label}.`);
};

const registerAdminAccount = async (email: string, password: string) => {
  await expectOk<{ email: string }>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, birthDate: TEST_BIRTH_DATE }),
  });

  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing admin user for ${email}.`);
  }

  await sql`
    update users
    set role = 'admin', updated_at = now()
    where id = ${user.id}
  `;

  const [admin] = await sql<Array<{ id: number }>>`
    insert into admins (user_id, display_name, is_active)
    values (${user.id}, ${'Playwright Admin'}, true)
    returning id
  `;

  for (const permissionKey of PLAYWRIGHT_ADMIN_PERMISSION_KEYS) {
    await sql`
      insert into admin_permissions (admin_id, permission_key)
      values (${admin.id}, ${permissionKey})
      on conflict (admin_id, permission_key) do nothing
    `;
  }
};

const loginAdmin = async (email: string, password: string, totpCode?: string) =>
  expectOk<{
    token: string;
  }>('/auth/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    }),
  });

const adminRequest = async <T>(payload: {
  path: string;
  token: string;
  method?: string;
  body?: Record<string, unknown>;
  totpCode?: string;
  breakGlassCode?: string;
}) => {
  const headers = new Headers({
    cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(payload.token)}; ${CSRF_COOKIE}=${CSRF_TOKEN}`,
    origin: adminOrigin,
    [CSRF_HEADER]: CSRF_TOKEN,
  });

  if (payload.totpCode) {
    headers.set('x-admin-totp-code', payload.totpCode);
  }
  if (payload.breakGlassCode) {
    headers.set('x-admin-break-glass-code', payload.breakGlassCode);
  }

  let body: string | undefined;
  if (payload.body) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(payload.body);
  }

  const response = await fetch(`${apiBaseUrl}${payload.path}`, {
    method: payload.method ?? 'GET',
    headers,
    body,
  });
  const envelope = await readBody<T>(response);
  if (!response.ok || !envelope.ok) {
    throw new Error(
      `Admin request to ${payload.path} failed with ${response.status}: ${JSON.stringify(envelope)}`,
    );
  }
  return envelope.data;
};

const enableAdminMfa = async (email: string, password: string): Promise<AdminSession> => {
  const login = await loginAdmin(email, password);
  const enrollment = await adminRequest<{
    secret: string;
    enrollmentToken: string;
  }>({
    path: '/admin/mfa/enrollment',
    token: login.token,
    method: 'POST',
    body: {},
  });
  const totpCode = generateTotpCode(enrollment.secret);
  const verification = await adminRequest<{
    token: string;
  }>({
    path: '/admin/mfa/verify',
    token: login.token,
    method: 'POST',
    body: {
      enrollmentToken: enrollment.enrollmentToken,
      totpCode,
    },
  });

  return {
    token: verification.token,
    secret: enrollment.secret,
  };
};

const registerAndSignInUser = async (page: Page, payload: {
  email: string;
  password: string;
}) => {
  await page.goto('/register');
  await page.getByLabel('Email Address').fill(payload.email);
  await page.getByLabel('Password').fill(payload.password);
  await page.getByLabel('Birth Date').fill(TEST_BIRTH_DATE);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);

  const verification = await waitForNotificationPayload({
    kind: 'email_verification',
    recipient: payload.email,
  });
  const verificationUrl = String(verification.verificationUrl ?? '');

  await page.goto(verificationUrl);
  await page.getByRole('button', { name: 'Verify Email' }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);

  await page.getByLabel('Email Address').fill(payload.email);
  await page.getByLabel('Password').fill(payload.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Account readiness')).toBeVisible();
};

const lookupUserId = async (email: string) => {
  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing user for ${email}.`);
  }

  return user.id;
};

const unlockFinanceForUser = async (userId: number, phone: string) => {
  await sql`
    update users
    set
      phone = ${phone},
      phone_verified_at = now(),
      updated_at = now()
    where id = ${userId}
  `;
};

const seedApprovedKycTier2 = async (userId: number) => {
  const [existing] = await sql<Array<{ id: number }>>`
    select id
    from kyc_profiles
    where user_id = ${userId}
    limit 1
  `;

  if (!existing) {
    await sql`
      insert into kyc_profiles (
        user_id,
        current_tier,
        status,
        submitted_at,
        reviewed_at,
        updated_at
      )
      values (${userId}, 'tier_2', 'approved', now(), now(), now())
    `;
    return;
  }

  await sql`
    update kyc_profiles
    set
      current_tier = 'tier_2',
      requested_tier = null,
      status = 'approved',
      rejection_reason = null,
      freeze_record_id = null,
      reviewed_by_admin_id = null,
      reviewed_at = now(),
      updated_at = now()
    where id = ${existing.id}
  `;
};

const seedWalletBalance = async (userId: number, withdrawableBalance: string) => {
  const seededWageredAmount = '1000.00';

  await sql.begin(async (tx) => {
    await tx`
      insert into user_wallets (
        user_id,
        withdrawable_balance,
        bonus_balance,
        locked_balance,
        wagered_amount
      )
      values (${userId}, ${withdrawableBalance}, '0.00', '0.00', ${seededWageredAmount})
      on conflict (user_id)
      do update
      set
        withdrawable_balance = excluded.withdrawable_balance,
        bonus_balance = excluded.bonus_balance,
        locked_balance = excluded.locked_balance,
        wagered_amount = excluded.wagered_amount,
        updated_at = now()
    `;

    await tx`
      delete from ledger_entries
      where user_id = ${userId}
        and reference_type = 'e2e_seed'
    `;

    await tx`
      insert into ledger_entries (
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        metadata
      )
      values
        (
          ${userId},
          'deposit_credit',
          (${withdrawableBalance}::numeric + ${seededWageredAmount}::numeric),
          '0.00',
          (${withdrawableBalance}::numeric + ${seededWageredAmount}::numeric),
          'e2e_seed',
          jsonb_build_object('reason', 'e2e_seed', 'seedBalanceType', 'withdrawable')
        ),
        (
          ${userId},
          'draw_cost',
          (-1 * ${seededWageredAmount}::numeric),
          (${withdrawableBalance}::numeric + ${seededWageredAmount}::numeric),
          ${withdrawableBalance}::numeric,
          'e2e_seed',
          jsonb_build_object('reason', 'e2e_seed', 'seedBalanceType', 'wagered')
        )
    `;
  });
};

const seedBluckBalance = async (userId: number, availableBalance: string) => {
  await sql`
    insert into user_asset_balances (
      user_id,
      asset_code,
      available_balance,
      locked_balance,
      lifetime_earned,
      lifetime_spent
    )
    values
      (${userId}, 'B_LUCK', ${availableBalance}, '0.00', ${availableBalance}, '0.00'),
      (${userId}, 'IAP_VOUCHER', '0.00', '0.00', '0.00', '0.00')
    on conflict (user_id, asset_code)
    do update
    set
      available_balance = excluded.available_balance,
      locked_balance = excluded.locked_balance,
      lifetime_earned = excluded.lifetime_earned,
      lifetime_spent = excluded.lifetime_spent,
      updated_at = now()
  `;
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('wallet no longer requests the retired transactions endpoint', async ({
  page,
}) => {
  const now = Date.now();
  const email = `legacy-transactions-${now}@example.com`;
  const password = 'Password123!';

  await registerAndSignInUser(page, { email, password });
  const userId = await lookupUserId(email);
  await seedWalletBalance(userId, '25.00');
  await seedBluckBalance(userId, '25.00');

  let legacyTransactionsRequested = false;
  await page.route('**/api/backend/transactions**', async (route) => {
    legacyTransactionsRequested = true;
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { message: 'Not found.', code: 'NOT_FOUND' },
      }),
    });
  });

  await page.goto('/app/wallet');
  await expect(page.getByTestId('wallet-current-balance')).toHaveText('25.00');
  await page.waitForTimeout(250);

  await page.getByTestId('wallet-refresh-button').click();
  await expect(page.getByTestId('wallet-current-balance')).toHaveText('25.00');
  await page.waitForTimeout(250);

  expect(legacyTransactionsRequested).toBe(false);
});

test('legacy payments route redirects to wallet and browser bff rejects retired finance endpoints', async ({
  page,
}) => {
  const now = Date.now();
  const email = `legacy-payments-${now}@example.com`;
  const password = 'Password123!';

  await registerAndSignInUser(page, { email, password });
  await page.goto('/app/payments');
  await expect(page).toHaveURL(/\/app\/wallet$/);
  await expect(page.getByText('Economy wallet', { exact: true })).toBeVisible();

  const blocked = await page.evaluate(async () => {
    const [topUps, withdrawals, transactions] = await Promise.all([
      fetch('/api/backend/top-ups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: '10.00',
          referenceId: 'legacy-top-up',
        }),
      }),
      fetch('/api/backend/withdrawals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: '10.00',
          bankCardId: 1,
        }),
      }),
      fetch('/api/backend/transactions?limit=8'),
    ]);

    return Promise.all(
      [topUps, withdrawals, transactions].map(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
    );
  });

  for (const response of blocked) {
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      error: {
        message: 'Not found.',
        code: 'NOT_FOUND',
      },
    });
  }
});

test('phone-verified users with approved kyc still stay on wallet and cannot hit retired finance endpoints', async ({
  page,
}) => {
  const now = Date.now();
  const email = `legacy-after-phone-${now}@example.com`;
  const password = 'Password123!';
  const phone = `+61492${String(now).slice(-6)}`;

  await registerAndSignInUser(page, { email, password });
  const userId = await lookupUserId(email);
  await unlockFinanceForUser(userId, phone);
  await seedApprovedKycTier2(userId);
  await seedWalletBalance(userId, '80.00');
  await seedBluckBalance(userId, '80.00');

  await page.goto('/app/payments');
  await expect(page).toHaveURL(/\/app\/wallet$/);
  await expect(page.getByTestId('wallet-current-balance')).toHaveText('80.00');

  const blocked = await page.evaluate(async () => {
    const response = await fetch('/api/backend/withdrawals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: '20.00',
        bankCardId: 1,
      }),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(blocked.status).toBe(404);
  expect(blocked.body).toEqual({
    ok: false,
    error: {
      message: 'Not found.',
      code: 'NOT_FOUND',
    },
  });
});

test('wallet refresh recovers cleanly after a temporary backend disconnect', async ({
  page,
}) => {
  const now = Date.now();
  const email = `reconnect-user-${now}@example.com`;
  const password = 'Password123!';

  await registerAndSignInUser(page, { email, password });
  const userId = await lookupUserId(email);
  await seedWalletBalance(userId, '25.00');
  await seedBluckBalance(userId, '25.00');

  await page.goto('/app/wallet');
  await expect(page.getByTestId('wallet-current-balance')).toHaveText('25.00');

  const disconnectWalletRoute = (route: Route) => route.abort('internetdisconnected');

  await page.route('**/api/backend/wallet', disconnectWalletRoute);

  await page.getByTestId('wallet-refresh-button').click();
  await expect(page.getByTestId('dashboard-error')).toHaveText(
    'Failed to load dashboard data.',
  );

  await page.unroute('**/api/backend/wallet', disconnectWalletRoute);

  await seedWalletBalance(userId, '45.00');
  await seedBluckBalance(userId, '45.00');
  await page.getByTestId('wallet-refresh-button').click();

  await expect(page.getByTestId('dashboard-error')).toBeHidden();
  await expect(page.getByTestId('wallet-current-balance')).toHaveText('45.00');
});
