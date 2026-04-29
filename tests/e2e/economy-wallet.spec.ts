import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { setTimeout as delay } from 'node:timers/promises';

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL;
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

type ApiEnvelope<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error?: { message?: string; code?: string }; requestId?: string };

const readBody = async <T>(response: Response) =>
  (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

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

const requestOk = async <T>(path: string, payload: unknown) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await readBody<T>(response);

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

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test.describe.configure({ mode: 'serial' });

test('web wallet shows economy assets, gift packs, and can send a B luck gift', async ({
  page,
}) => {
  const senderEmail = `economy-ui-sender-${Date.now()}@example.com`;
  const receiverEmail = `economy-ui-receiver-${Date.now()}@example.com`;
  const password = 'Password123!';

  await page.goto('/register');
  await page.getByLabel('Email Address').fill(senderEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Birth Date').fill(TEST_BIRTH_DATE);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);

  const senderNotification = await waitForNotificationPayload({
    kind: 'email_verification',
    recipient: senderEmail,
  });
  const senderVerificationUrl = new URL(
    String(senderNotification.verificationUrl ?? ''),
  );
  const senderVerificationToken =
    senderVerificationUrl.searchParams.get('token');

  expect(senderVerificationToken).toBeTruthy();

  await page.goto(String(senderNotification.verificationUrl ?? ''));
  await page.getByRole('button', { name: 'Verify Email' }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);

  await requestOk('/auth/register', {
    email: receiverEmail,
    password,
    birthDate: TEST_BIRTH_DATE,
  });
  const receiverNotification = await waitForNotificationPayload({
    kind: 'email_verification',
    recipient: receiverEmail,
  });
  const receiverVerificationToken = new URL(
    String(receiverNotification.verificationUrl ?? ''),
  ).searchParams.get('token');

  expect(receiverVerificationToken).toBeTruthy();

  await requestOk('/auth/email-verification/confirm', {
    token: receiverVerificationToken,
  });

  const [senderUser] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${senderEmail}
    limit 1
  `;
  const [receiverUser] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${receiverEmail}
    limit 1
  `;

  expect(senderUser?.id).toBeTruthy();
  expect(receiverUser?.id).toBeTruthy();

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
      (${senderUser!.id}, 'B_LUCK', '40.00', '0.00', '40.00', '0.00'),
      (${senderUser!.id}, 'IAP_VOUCHER', '0.00', '0.00', '0.00', '0.00'),
      (${receiverUser!.id}, 'B_LUCK', '0.00', '0.00', '0.00', '0.00'),
      (${receiverUser!.id}, 'IAP_VOUCHER', '0.00', '0.00', '0.00', '0.00')
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
      ${senderUser!.id},
      10,
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

  await sql`
    with seeded_product as (
      insert into iap_products (
        sku,
        store_channel,
        delivery_type,
        asset_code,
        asset_amount,
        delivery_content,
        is_active,
        metadata
      )
      values (
        'reward.ios.gift-pack.rose',
        'ios',
        'gift_pack',
        null,
        null,
        '{}'::jsonb,
        true,
        ${{
          seedSource: 'economy_wallet_e2e',
          title: 'Rose gift pack',
        }}
      )
      on conflict (sku, store_channel)
      do update
      set
        is_active = true,
        metadata = excluded.metadata,
        updated_at = now()
      returning id
    )
    insert into gift_pack_catalog (
      code,
      iap_product_id,
      reward_asset_code,
      reward_amount,
      delivery_content,
      is_active,
      metadata
    )
    select
      'rose_small_ios',
      id,
      'B_LUCK',
      '18.00',
      '{}'::jsonb,
      true,
      ${{
        seedSource: 'economy_wallet_e2e',
      }}
    from seeded_product
    on conflict (code)
    do update
    set
      iap_product_id = excluded.iap_product_id,
      reward_asset_code = excluded.reward_asset_code,
      reward_amount = excluded.reward_amount,
      is_active = true,
      metadata = excluded.metadata,
      updated_at = now()
  `;

  await page.getByLabel('Email Address').fill(senderEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/wallet');
  await expect(page.getByText('Economy wallet', { exact: true })).toBeVisible();
  await expect(page.getByText('Gift packs', { exact: true })).toBeVisible();
  await expect(page.getByText('Web view only')).toBeVisible();

  await page.locator('#gift-receiver-user-id').fill(String(receiverUser!.id));
  await page.locator('#gift-amount').fill('5');
  await page.getByRole('button', { name: 'Send gift' }).click();

  await expect(
    page.getByText(`#${senderUser!.id} → #${receiverUser!.id}`),
  ).toBeVisible();

  const receiverBalance = await waitForRecord(
    async () => {
      const [row] = await sql<Array<{ available_balance: string }>>`
        select available_balance
        from user_asset_balances
        where user_id = ${receiverUser!.id}
          and asset_code = 'B_LUCK'
        limit 1
      `;
      return row?.available_balance === '5.00' ? row : null;
    },
    'receiver B luck balance',
  );

  expect(receiverBalance.available_balance).toBe('5.00');
});
