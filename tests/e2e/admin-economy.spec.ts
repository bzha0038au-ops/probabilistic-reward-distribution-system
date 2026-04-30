import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from '@playwright/test';
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
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ECONOMY_ADMIN_PERMISSION_KEYS = [
  'finance.read',
  'finance.reconcile',
  'risk.read',
  'risk.freeze_user',
] as const;

type ApiEnvelope<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error?: { message?: string; code?: string }; requestId?: string };

type AdminSession = {
  token: string;
  secret: string;
};

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

const waitForRecord = async <T>(
  query: () => Promise<T | null | undefined>,
  label: string,
  timeoutMs = 15_000,
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

const registerAdminAccount = async (
  email: string,
  password: string,
  permissions: readonly string[],
) => {
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
    values (${user.id}, ${'Playwright Economy Admin'}, true)
    returning id
  `;

  for (const permissionKey of permissions) {
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

const loginUser = async (email: string, password: string) =>
  expectOk<{
    token: string;
    user: { id: number };
  }>('/auth/user/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
    }),
  });

const userRequest = async <T>(payload: {
  path: string;
  token: string;
  method?: string;
  body?: Record<string, unknown>;
}) => {
  const headers = new Headers({
    authorization: `Bearer ${payload.token}`,
  });

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
      `User request to ${payload.path} failed with ${response.status}: ${JSON.stringify(envelope)}`,
    );
  }
  return envelope.data;
};

const adminRequest = async <T>(payload: {
  path: string;
  token: string;
  method?: string;
  body?: Record<string, unknown>;
  totpCode?: string;
}) => {
  const headers = new Headers({
    cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(payload.token)}; ${CSRF_COOKIE}=${CSRF_TOKEN}`,
    origin: adminOrigin,
    [CSRF_HEADER]: CSRF_TOKEN,
  });

  if (payload.totpCode) {
    headers.set('x-admin-totp-code', payload.totpCode);
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

const enableAdminMfa = async (
  email: string,
  password: string,
): Promise<AdminSession> => {
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

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test.describe.configure({ mode: 'serial' });

test('admin economy page can freeze gift capability with step-up mfa', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const now = Date.now();
  const adminEmail = `economy-admin-${now}@example.com`;
  const adminPassword = 'AdminPassword123!';
  const targetEmail = `economy-target-${now}@example.com`;
  const targetPassword = 'Password123!';

  await registerAdminAccount(
    adminEmail,
    adminPassword,
    ECONOMY_ADMIN_PERMISSION_KEYS,
  );
  const adminSession = await enableAdminMfa(adminEmail, adminPassword);

  await expectOk<{ email: string }>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail,
      password: targetPassword,
      birthDate: TEST_BIRTH_DATE,
    }),
  });

  const [targetUser] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${targetEmail}
    limit 1
  `;

  expect(targetUser?.id).toBeTruthy();

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
      (${targetUser!.id}, 'B_LUCK', '25.00', '0.00', '25.00', '0.00'),
      (${targetUser!.id}, 'IAP_VOUCHER', '0.00', '0.00', '0.00', '0.00')
    on conflict (user_id, asset_code)
    do update
    set
      available_balance = excluded.available_balance,
      locked_balance = excluded.locked_balance,
      lifetime_earned = excluded.lifetime_earned,
      lifetime_spent = excluded.lifetime_spent,
      updated_at = now()
  `;

  await sql`
    insert into gift_energy_accounts (
      user_id,
      current_energy,
      max_energy,
      refill_policy,
      last_refill_at
    )
    values (
      ${targetUser!.id},
      7,
      10,
      ${{
        type: 'daily_reset',
        intervalHours: 24,
        refillAmount: 10,
      }},
      now()
    )
    on conflict (user_id)
    do update
    set
      current_energy = excluded.current_energy,
      max_energy = excluded.max_energy,
      refill_policy = excluded.refill_policy,
      last_refill_at = excluded.last_refill_at,
      updated_at = now()
  `;

  await page.goto(`${adminOrigin}/login`);
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page
    .getByLabel('MFA Code')
    .fill(generateTotpCode(adminSession.secret));
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(
    (url) => url.origin === new URL(adminOrigin).origin && url.pathname !== '/login',
  );

  await page.goto(`${adminOrigin}/economy`);

  await expect(
    page.getByRole('heading', { name: 'Economy Operations' }),
  ).toBeVisible();
  await expect(page.getByText('Gift Summary', { exact: true })).toBeVisible();
  await expect(
    page.locator('p').filter({ hasText: /^B_LUCK$/ }).first(),
  ).toBeVisible();

  const stepUpCode = generateTotpCode(adminSession.secret);
  await page.getByTestId('economy-step-up-code').fill(stepUpCode);

  const freezeForm = page.getByTestId('economy-freeze-gift-form');
  await expect(
    freezeForm.locator('input[type="hidden"][name="totpCode"]'),
  ).toHaveValue(stepUpCode);

  await freezeForm.locator('input[name="userId"]').fill(String(targetUser!.id));
  await freezeForm
    .locator('input[name="reason"]')
    .fill('playwright_gift_lock_review');

  await freezeForm
    .getByRole('button', { name: 'Freeze gift capability' })
    .click();

  await expect(
    page.getByText(`Gift capability frozen for user #${targetUser!.id}.`, {
      exact: true,
    }),
  ).toBeVisible();

  const freezeRecord = await waitForRecord(
    async () => {
      const [row] = await sql<
        Array<{ id: number; scope: string; status: string; user_id: number }>
      >`
        select id, scope, status, user_id
        from freeze_records
        where user_id = ${targetUser!.id}
          and scope = 'gift_lock'
          and status = 'active'
        order by id desc
        limit 1
      `;
      return row ?? null;
    },
    'gift lock freeze record',
  );

  expect(freezeRecord).toMatchObject({
    user_id: targetUser!.id,
    scope: 'gift_lock',
    status: 'active',
  });

  await page.goto(`${adminOrigin}/economy`);
  await expect(
    page.getByText(`user #${targetUser!.id}`, { exact: true }),
  ).toBeVisible();
});

test('admin economy page can reverse a fulfilled voucher order with step-up mfa', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const now = Date.now();
  const adminEmail = `economy-reverse-admin-${now}@example.com`;
  const adminPassword = 'AdminPassword123!';
  const userEmail = `economy-reverse-user-${now}@example.com`;
  const userPassword = 'Password123!';
  const sku = `reward.ios.voucher.playwright-${now}`;
  const externalTransactionId = `playwright-ios-transaction-${now}`;

  await registerAdminAccount(
    adminEmail,
    adminPassword,
    ECONOMY_ADMIN_PERMISSION_KEYS,
  );
  const adminSession = await enableAdminMfa(adminEmail, adminPassword);

  await expectOk<{ email: string }>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      password: userPassword,
      birthDate: TEST_BIRTH_DATE,
    }),
  });

  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${userEmail}
    limit 1
  `;

  expect(user?.id).toBeTruthy();

  await sql`
    insert into iap_products (
      sku,
      store_channel,
      delivery_type,
      asset_code,
      asset_amount,
      is_active,
      metadata
    )
    values (
      ${sku},
      'ios',
      'voucher',
      'IAP_VOUCHER',
      '12.50',
      true,
      ${{
        seedSource: 'admin_economy_e2e',
        bucket: 'playwright',
      }}
    )
    on conflict (sku, store_channel)
    do update
    set
      delivery_type = excluded.delivery_type,
      asset_code = excluded.asset_code,
      asset_amount = excluded.asset_amount,
      is_active = excluded.is_active,
      metadata = excluded.metadata,
      updated_at = now()
  `;

  const userSession = await loginUser(userEmail, userPassword);
  const purchase = await userRequest<{
    order: { id: number; status: string };
    fulfillment: { assetCode: string; amount: string };
  }>({
    path: '/iap/purchases/verify',
    token: userSession.token,
    method: 'POST',
    body: {
      idempotencyKey: `playwright-admin-reverse-${now}`,
      storeChannel: 'ios',
      sku,
      receipt: {
        externalTransactionId,
        rawPayload: {
          environment: 'Sandbox',
        },
      },
    },
  });

  expect(purchase.order.status).toBe('verified');
  expect(purchase.fulfillment).toBeNull();

  await page.goto(`${adminOrigin}/login`);
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page
    .getByLabel('MFA Code')
    .fill(generateTotpCode(adminSession.secret));
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(
    (url) => url.origin === new URL(adminOrigin).origin && url.pathname !== '/login',
  );

  await page.goto(`${adminOrigin}/economy`);

  const orderCard = page.getByTestId(`economy-order-${purchase.order.id}`);
  await expect(orderCard).toBeVisible();
  await expect(orderCard).toContainText(sku);
  await expect(orderCard).toContainText('verified');

  const replayStepUpCode = generateTotpCode(adminSession.secret);
  await page.getByTestId('economy-step-up-code').fill(replayStepUpCode);

  const replayForm = page.getByTestId(
    `economy-order-replay-form-${purchase.order.id}`,
  );
  await expect(
    replayForm.locator('input[type="hidden"][name="totpCode"]'),
  ).toHaveValue(replayStepUpCode);
  await replayForm.getByRole('button', { name: 'Approve' }).click();

  await expect(
    page.getByText(`Order #${purchase.order.id} fulfillment replayed.`, {
      exact: true,
    }),
  ).toBeVisible();

  const fulfilledOrder = await waitForRecord(
    async () => {
      const [row] = await sql<
        Array<{ id: number; status: string; user_id: number }>
      >`
        select id, status, user_id
        from store_purchase_orders
        where id = ${purchase.order.id}
          and status = 'fulfilled'
        limit 1
      `;
      return row ?? null;
    },
    'fulfilled store purchase order',
  );

  expect(fulfilledOrder).toMatchObject({
    id: purchase.order.id,
    status: 'fulfilled',
    user_id: user!.id,
  });

  const fulfilledVoucherBalance = await waitForRecord(
    async () => {
      const [row] = await sql<
        Array<{ available_balance: string }>
      >`
        select available_balance
        from user_asset_balances
        where user_id = ${user!.id}
          and asset_code = 'IAP_VOUCHER'
        limit 1
      `;
      return row?.available_balance === '12.50' ? row : null;
    },
    'fulfilled voucher balance',
  );

  expect(fulfilledVoucherBalance.available_balance).toBe('12.50');

  const reverseStepUpCode = generateTotpCode(adminSession.secret);
  await page.getByTestId('economy-step-up-code').fill(reverseStepUpCode);
  const reverseForm = page.getByTestId(
    `economy-order-reverse-form-${purchase.order.id}`,
  );
  await expect(
    reverseForm.locator('input[type="hidden"][name="totpCode"]'),
  ).toHaveValue(reverseStepUpCode);
  await reverseForm.locator('select[name="targetStatus"]').selectOption('refunded');
  await reverseForm.locator('input[name="reason"]').fill('playwright_manual_refund');
  await reverseForm.getByRole('button', { name: 'Reverse' }).click();

  await expect(
    page.getByText(`Order #${purchase.order.id} marked refunded.`, {
      exact: true,
    }),
  ).toBeVisible();

  const reversedOrder = await waitForRecord(
    async () => {
      const [row] = await sql<
        Array<{ id: number; status: string; user_id: number }>
      >`
        select id, status, user_id
        from store_purchase_orders
        where id = ${purchase.order.id}
        limit 1
      `;
      return row ?? null;
    },
    'reversed store purchase order',
  );

  expect(reversedOrder).toMatchObject({
    id: purchase.order.id,
    status: 'refunded',
    user_id: user!.id,
  });

  const [voucherBalance] = await sql<
    Array<{ available_balance: string }>
  >`
    select available_balance
    from user_asset_balances
    where user_id = ${user!.id}
      and asset_code = 'IAP_VOUCHER'
    limit 1
  `;

  expect(voucherBalance?.available_balance).toBe('0.00');
});
