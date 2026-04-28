import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL;
const adminOrigin =
  process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? 'http://127.0.0.1:5173';

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
  email: string;
  password: string;
  token: string;
  adminId: number;
  secret: string;
};

const PLAYWRIGHT_ADMIN_PERMISSION_KEYS = [
  'finance.read',
  'finance.approve_deposit',
  'finance.fail_deposit',
  'finance.approve_withdrawal',
  'finance.reject_withdrawal',
  'finance.pay_withdrawal',
  'finance.reconcile',
  'audit.read',
  'audit.export',
  'audit.retry_notification',
  'risk.read',
  'risk.freeze_user',
  'risk.release_user',
  'analytics.read',
  'config.read',
  'config.release_bonus',
  'config.update',
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

const requestJson = async <T>(
  path: string,
  init: RequestInit = {},
  baseUrl = apiBaseUrl,
) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await readBody<T>(response);
  return { response, body };
};

const expectOk = async <T>(
  path: string,
  init: RequestInit = {},
  baseUrl = apiBaseUrl,
) => {
  const { response, body } = await requestJson<T>(path, init, baseUrl);
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

const seedApprovedKycTier = async (
  userId: number,
  tier: 'tier_1' | 'tier_2',
) => {
  const [existing] = await sql<Array<{ id: number; current_tier: string | null }>>`
    select id, current_tier
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
      values (${userId}, ${tier}, 'approved', now(), now(), now())
    `;
    return;
  }

  const currentTier = existing.current_tier === 'tier_2' ? 'tier_2' : tier;

  await sql`
    update kyc_profiles
    set
      current_tier = ${currentTier},
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

const setConfigNumber = async (key: string, value: string) => {
  await sql`
    insert into system_config (config_key, config_number, description)
    values (${key}, ${value}, 'playwright-e2e')
    on conflict (config_key)
    do update
    set
      config_number = excluded.config_number,
      updated_at = now()
  `;
};

const setPrizePoolBalance = async (value: string) => {
  await sql`
    insert into house_account (id, prize_pool_balance)
    values (1, ${value})
    on conflict (id)
    do update
    set
      prize_pool_balance = excluded.prize_pool_balance,
      updated_at = now()
  `;
};

const registerAdminAccount = async (email: string, password: string) => {
  await expectOk<{ email: string }>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
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

  return {
    userId: user.id,
    adminId: admin.id,
  };
};

const loginAdmin = async (email: string, password: string, totpCode?: string) =>
  expectOk<{
    token: string;
    user: { adminId: number };
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
    email,
    password,
    token: verification.token,
    adminId: login.user.adminId,
    secret: enrollment.secret,
  };
};

const createUserSession = async (email: string, password: string) =>
  expectOk<{ token: string; user: { id: number } }>('/auth/user/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
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

  return requestJson<T>(
    payload.path,
    {
      method: payload.method ?? 'GET',
      headers,
      body,
    },
    apiBaseUrl,
  );
};

const seedGuaranteedPrize = async () => {
  await setConfigNumber('draw_cost', '10');
  await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
  await setConfigNumber('pool_system.pool_max_payout_ratio', '0');
  await setPrizePoolBalance('0.00');

  await sql`
    insert into prizes (
      name,
      stock,
      weight,
      pool_threshold,
      user_pool_threshold,
      reward_amount,
      payout_budget,
      payout_spent,
      payout_period_days,
      is_active
    )
    values (
      ${`Playwright Prize ${Date.now()}`},
      50,
      100,
      '0.00',
      '0.00',
      '5.00',
      '0.00',
      '0.00',
      1,
      true
    )
  `;
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('user main flow covers deposit approval, draw, phone verification, and withdrawal review', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const now = Date.now();
  const email = `critical-user-${now}@example.com`;
  const password = 'Password123!';
  const phone = `+61490${String(now).slice(-6)}`;
  const adminMakerEmail = `critical-admin-maker-${now}@example.com`;
  const adminMakerPassword = 'AdminPassword123!';
  const adminCheckerEmail = `critical-admin-checker-${now}@example.com`;
  const adminCheckerPassword = 'AdminPassword123!';

  await seedGuaranteedPrize();
  await registerAdminAccount(adminMakerEmail, adminMakerPassword);
  const adminMakerSession = await enableAdminMfa(
    adminMakerEmail,
    adminMakerPassword,
  );
  await registerAdminAccount(adminCheckerEmail, adminCheckerPassword);
  const adminCheckerSession = await enableAdminMfa(
    adminCheckerEmail,
    adminCheckerPassword,
  );

  await page.goto('/register');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);

  const verification = await waitForNotificationPayload({
    kind: 'email_verification',
    recipient: email,
  });
  const verificationUrl = String(verification.verificationUrl ?? '');
  await page.goto(verificationUrl);
  await page.getByRole('button', { name: 'Verify Email' }).click();

  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Account readiness')).toBeVisible();

  const userSession = await createUserSession(email, password);

  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing user for ${email}.`);
  }

  await seedApprovedKycTier(user.id, 'tier_1');

  await page.goto('/app/wallet');
  await page.getByLabel('Top-up amount').fill('100.00');
  await page.getByLabel('Reference ID').fill('deposit-ref-001');
  await page.getByRole('button', { name: 'Create top-up request' }).click();
  await expect(page.getByTestId('dashboard-notice')).toHaveText(
    'Top-up request submitted. The order will move through provider settlement before crediting the wallet.',
  );

  const deposit = await waitForRecord(
    async () => {
      const [row] = await sql<Array<{ id: number }>>`
        select id
        from deposits
        where user_id = ${user.id}
        order by id desc
        limit 1
      `;
      return row ?? null;
    },
    'top-up record',
  );

  const depositReview = {
    operatorNote: 'receipt matched',
    settlementReference: 'dep-e2e-001',
    processingChannel: 'manual_bank',
  };

  await adminRequest({
    path: `/admin/deposits/${deposit.id}/provider-pending`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: depositReview,
  });
  await adminRequest({
    path: `/admin/deposits/${deposit.id}/provider-succeeded`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: depositReview,
  });
  await adminRequest({
    path: `/admin/deposits/${deposit.id}/provider-succeeded`,
    token: adminCheckerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminCheckerSession.secret),
    body: depositReview,
  });
  await adminRequest({
    path: `/admin/deposits/${deposit.id}/credit`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: depositReview,
  });
  await adminRequest({
    path: `/admin/deposits/${deposit.id}/credit`,
    token: adminCheckerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminCheckerSession.secret),
    body: depositReview,
  });

  await page.reload();
  await expect(page.getByText('Current balance')).toBeVisible();
  await expect(page.getByText('100.00').first()).toBeVisible();

  await page.goto('/app/slot');
  await page.getByRole('button', { name: /^Spin / }).first().click();
  await expect(page.getByText('Won').first()).toBeVisible();

  await page.goto('/app/wallet');
  await expect(page.getByText('Current balance')).toBeVisible();
  await expect(page.getByText('90.00').first()).toBeVisible();

  await page.goto('/app/security');
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  const phoneNotification = await waitForNotificationPayload({
    kind: 'phone_verification',
    recipient: phone,
  });
  await page.getByLabel('SMS code').fill(String(phoneNotification.code ?? ''));
  await page.getByRole('button', { name: 'Confirm phone' }).click();
  await expect(page.getByTestId('dashboard-notice')).toHaveText(
    'Phone verified. Withdrawal tools are now available.',
  );

  await seedApprovedKycTier(user.id, 'tier_2');

  await page.goto('/app/payments');
  await page.getByLabel('Cardholder name').fill('Reward User');
  await page.getByLabel('Bank name').fill('Playwright Bank');
  await page.getByLabel('Card brand').fill('Visa');
  await page.getByLabel('Last 4 digits').fill('4242');
  await page.getByRole('button', { name: 'Save bank card' }).click();
  await expect(page.getByTestId('dashboard-notice')).toHaveText(
    'Bank card saved.',
  );

  await page.getByLabel('Withdrawal amount', { exact: true }).fill('40.00');
  await page
    .getByRole('button', { name: 'Request withdrawal', exact: true })
    .click();
  await expect(page.getByTestId('dashboard-notice')).toHaveText(
    'Withdrawal request submitted. Funds are reserved while approval and payout progress.',
  );

  const firstWithdrawal = await waitForRecord(
    async () => {
      const [row] = await sql<Array<{ id: number }>>`
        select id
        from withdrawals
        where user_id = ${user.id}
        order by id desc
        limit 1
      `;
      return row ?? null;
    },
    'first withdrawal',
  );

  await adminRequest({
    path: `/admin/withdrawals/${firstWithdrawal.id}/approve`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    breakGlassCode: ADMIN_BREAK_GLASS_CODE,
    body: {
      operatorNote: 'kyc passed',
    },
  });
  await adminRequest({
    path: `/admin/withdrawals/${firstWithdrawal.id}/provider-submit`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: {
      operatorNote: 'submitted to bank',
      settlementReference: 'wd-e2e-001',
      processingChannel: 'manual_bank',
    },
  });
  await adminRequest({
    path: `/admin/withdrawals/${firstWithdrawal.id}/provider-processing`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: {
      operatorNote: 'bank transfer in progress',
      settlementReference: 'wd-e2e-001',
      processingChannel: 'manual_bank',
    },
  });
  await adminRequest({
    path: `/admin/withdrawals/${firstWithdrawal.id}/pay`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: {
      operatorNote: 'maker pay review',
      settlementReference: 'wd-e2e-001',
      processingChannel: 'manual_bank',
    },
  });
  await adminRequest({
    path: `/admin/withdrawals/${firstWithdrawal.id}/pay`,
    token: adminCheckerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminCheckerSession.secret),
    body: {
      operatorNote: 'checker pay review',
      settlementReference: 'wd-e2e-001',
      processingChannel: 'manual_bank',
    },
  });

  await page.reload();

  await page.getByLabel('Withdrawal amount', { exact: true }).fill('20.00');
  await page
    .getByRole('button', { name: 'Request withdrawal', exact: true })
    .click();

  const secondWithdrawal = await waitForRecord(
    async () => {
      const [row] = await sql<Array<{ id: number }>>`
        select id
        from withdrawals
        where user_id = ${user.id}
          and id > ${firstWithdrawal.id}
        order by id desc
        limit 1
      `;
      return row ?? null;
    },
    'second withdrawal',
  );

  await adminRequest({
    path: `/admin/withdrawals/${secondWithdrawal.id}/reject`,
    token: adminMakerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminMakerSession.secret),
    body: {
      operatorNote: 'manual review rejected by maker',
    },
  });
  await adminRequest({
    path: `/admin/withdrawals/${secondWithdrawal.id}/reject`,
    token: adminCheckerSession.token,
    method: 'PATCH',
    totpCode: generateTotpCode(adminCheckerSession.secret),
    body: {
      operatorNote: 'manual review rejected by checker',
    },
  });

  const [finalWallet] = await sql<
    Array<{ withdrawable_balance: string; locked_balance: string }>
  >`
    select withdrawable_balance, locked_balance
    from user_wallets
    where user_id = ${user.id}
    limit 1
  `;

  expect(finalWallet).toEqual({
    withdrawable_balance: '50.00',
    locked_balance: '0.00',
  });

  const statuses = await sql<Array<{ status: string }>>`
    select status
    from withdrawals
    where user_id = ${user.id}
    order by id asc
  `;

  expect(statuses.map((item) => item.status)).toEqual(['paid', 'rejected']);
  expect(userSession.user.id).toBe(user.id);
});

test('admin critical actions cover notification retry, freeze release, and system config change', async () => {
  test.setTimeout(60_000);

  const now = Date.now();
  const requesterAdminEmail = `ops-admin-requester-${now}@example.com`;
  const requesterAdminPassword = 'AdminPassword123!';
  const approverAdminEmail = `ops-admin-approver-${now}@example.com`;
  const approverAdminPassword = 'AdminPassword123!';
  const userEmail = `ops-user-${now}@example.com`;
  const userPassword = 'Password123!';

  await registerAdminAccount(requesterAdminEmail, requesterAdminPassword);
  const requesterSession = await loginAdmin(
    requesterAdminEmail,
    requesterAdminPassword,
  );
  await registerAdminAccount(approverAdminEmail, approverAdminPassword);
  const approverSession = await enableAdminMfa(
    approverAdminEmail,
    approverAdminPassword,
  );

  await expectOk<{ email: string }>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });
  const userSession = await createUserSession(userEmail, userPassword);

  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${userEmail}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing ops user for ${userEmail}.`);
  }

  const [delivery] = await sql<Array<{ id: number }>>`
    insert into notification_deliveries (
      kind,
      channel,
      recipient,
      recipient_key,
      provider,
      subject,
      payload,
      status,
      attempts,
      max_attempts,
      last_error
    )
    values (
      'security_alert',
      'email',
      ${userEmail},
      ${userEmail},
      'mock',
      'Security alert',
      ${JSON.stringify({ reason: 'playwright retry' })}::jsonb,
      'failed',
      3,
      5,
      'simulated failure'
    )
    returning id
  `;

  await adminRequest({
    path: `/admin/notification-deliveries/${delivery.id}/retry`,
    token: approverSession.token,
    method: 'POST',
    totpCode: generateTotpCode(approverSession.secret),
    body: {},
  });

  const retriedDelivery = await waitForRecord(
    async () => {
      const [row] = await sql<
        Array<{ status: string; attempts: number; last_error: string | null }>
      >`
        select status, attempts, last_error
        from notification_deliveries
        where id = ${delivery.id}
        limit 1
      `;
      return row ?? null;
    },
    'retried notification',
  );

  expect(retriedDelivery).toEqual({
    status: 'pending',
    attempts: 0,
    last_error: null,
  });

  const freezeRecord = await adminRequest<{ id: number }>({
    path: '/admin/freeze-records',
    token: approverSession.token,
    method: 'POST',
    totpCode: generateTotpCode(approverSession.secret),
    body: {
      userId: user.id,
      reason: 'manual_admin',
    },
  });

  const frozenWallet = await userRequest<{ balance: string }>({
    path: '/wallet',
    token: userSession.token,
  });
  expect(frozenWallet.response.status).toBe(401);

  const frozenLogin = await requestJson<{ token: string; user: { id: number } }>(
    '/auth/user/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
      }),
    },
  );
  expect(frozenLogin.response.status).toBe(423);

  await adminRequest({
    path: `/admin/freeze-records/${freezeRecord.id}/release`,
    token: approverSession.token,
    method: 'POST',
    totpCode: generateTotpCode(approverSession.secret),
    body: {
      reason: 'review_cleared',
    },
  });

  const releasedSession = await createUserSession(userEmail, userPassword);

  const releasedWallet = await userRequest<{ balance: string }>({
    path: '/wallet',
    token: releasedSession.token,
  });
  expect(releasedWallet.response.status).toBe(200);

  const changeRequest = await adminRequest<{ id: number }>({
    path: '/admin/control-center/system-config/drafts',
    token: requesterSession.token,
    method: 'POST',
    body: {
      drawCost: '11',
      authFailureWindowMinutes: '21',
      reason: 'playwright critical flow',
    },
  });

  await adminRequest({
    path: `/admin/control-center/change-requests/${changeRequest.id}/submit`,
    token: requesterSession.token,
    method: 'POST',
    body: {
      confirmationText: `SUBMIT ${changeRequest.id}`,
    },
  });

  await adminRequest({
    path: `/admin/control-center/change-requests/${changeRequest.id}/approve`,
    token: approverSession.token,
    method: 'POST',
    body: {},
  });

  await adminRequest({
    path: `/admin/control-center/change-requests/${changeRequest.id}/publish`,
    token: approverSession.token,
    method: 'POST',
    totpCode: generateTotpCode(approverSession.secret),
    body: {
      confirmationText: `PUBLISH ${changeRequest.id}`,
    },
  });

  const config = await adminRequest<{
    drawCost: string;
    authFailureWindowMinutes: string;
  }>({
    path: '/admin/config',
    token: approverSession.token,
  });

  expect(config.drawCost).toBe('11.00');
  expect(config.authFailureWindowMinutes).toBe('21.00');
});
