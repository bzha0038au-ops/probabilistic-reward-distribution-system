import { expect, test, type Page } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const TEST_BIRTH_DATE = '1990-01-01';

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set for e2e tests.');
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

const expectOk = async <T>(path: string, init: RequestInit = {}) => {
  const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('PLAYWRIGHT_API_BASE_URL must be set for e2e tests.');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = await readBody<T>(response);

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

const registerAndSignInVerifiedUser = async (
  page: Page,
  payload: { email: string; password: string },
) => {
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

const seedKycTier1 = async (userId: number) => {
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
      values (${userId}, 'tier_1', 'approved', now(), now(), now())
    `;
    return;
  }

  await sql`
    update kyc_profiles
    set
      current_tier = 'tier_1',
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
  await sql`
    insert into user_wallets (
      user_id,
      withdrawable_balance,
      bonus_balance,
      locked_balance,
      wagered_amount
    )
    values (${userId}, ${withdrawableBalance}, '0.00', '0.00', '0.00')
    on conflict (user_id)
    do update
    set
      withdrawable_balance = excluded.withdrawable_balance,
      bonus_balance = excluded.bonus_balance,
      locked_balance = excluded.locked_balance,
      wagered_amount = excluded.wagered_amount,
      updated_at = now()
  `;

  await sql`
    insert into user_asset_balances (
      user_id,
      asset_code,
      available_balance,
      locked_balance,
      lifetime_earned,
      lifetime_spent
    )
    values (${userId}, 'B_LUCK', ${withdrawableBalance}, '0.00', ${withdrawableBalance}, '0.00')
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

const seedPredictionMarket = async () => {
  const now = Date.now();
  const [market] = await sql<Array<{ id: number }>>`
    insert into prediction_markets (
      slug,
      round_key,
      title,
      description,
      resolution_rules,
      source_of_truth,
      category,
      tags,
      invalid_policy,
      mechanism,
      status,
      outcomes,
      total_pool_amount,
      opens_at,
      locks_at,
      resolves_at
    )
    values (
      ${`playwright-market-${now}`},
      ${`market-round-${now}`},
      ${'BTC closes above 100k on 2026-04-29 UTC'},
      ${'Two-sided pari-mutuel market used by the web markets E2E.'},
      ${'This market resolves against the BTC/USD close printed by the referenced exchange at 00:00 UTC on 2026-04-29.'},
      ${'BTC/USD close from the configured exchange daily candle.'},
      'crypto',
      ${['btc', 'macro']},
      'refund_all',
      'pari_mutuel',
      'open',
      ${[
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' },
      ]},
      '0.00',
      now() - interval '5 minutes',
      now() + interval '2 hours',
      now() + interval '1 day'
    )
    returning id
  `;

  if (!market) {
    throw new Error('Failed to seed prediction market.');
  }

  return market.id;
};

const lockPredictionMarket = async (marketId: number) => {
  await sql`
    update prediction_markets
    set
      status = 'locked',
      locks_at = now() - interval '1 minute',
      updated_at = now()
    where id = ${marketId}
  `;
};

const resolvePredictionMarket = async (payload: {
  marketId: number;
  userId: number;
  winningOutcomeKey: string;
  payoutAmount: string;
}) => {
  await sql`
    update prediction_markets
    set
      status = 'resolved',
      winning_outcome_key = ${payload.winningOutcomeKey},
      winning_pool_amount = ${payload.payoutAmount},
      resolved_at = now(),
      updated_at = now()
    where id = ${payload.marketId}
  `;

  await sql`
    update prediction_positions
    set
      status = case
        when outcome_key = ${payload.winningOutcomeKey} then 'won'
        else 'lost'
      end,
      payout_amount = case
        when outcome_key = ${payload.winningOutcomeKey}
          then cast(${payload.payoutAmount} as numeric)
        else cast('0.00' as numeric)
      end,
      settled_at = now()
    where market_id = ${payload.marketId}
      and user_id = ${payload.userId}
  `;
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('user can browse a market, place a position, refresh, and see the position while locked-state messaging works', async ({
  page,
}) => {
  const now = Date.now();
  const email = `markets-user-${now}@example.com`;
  const password = 'Password123!';

  await registerAndSignInVerifiedUser(page, { email, password });

  const userId = await lookupUserId(email);
  await seedKycTier1(userId);
  await seedWalletBalance(userId, '50.00');
  const marketId = await seedPredictionMarket();

  await page.goto('/app/markets');
  await expect(page.getByText('Prediction Markets')).toBeVisible();
  await expect(page.getByTestId(`market-summary-${marketId}`)).toContainText(
    'BTC closes above 100k on 2026-04-29 UTC',
  );

  await page.getByTestId(`market-open-${marketId}`).click();
  await expect(page).toHaveURL(new RegExp(`/app/markets/${marketId}$`));
  await expect(page.getByTestId('market-available-balance')).toHaveText('50.00');

  await page.getByTestId('market-outcome-option-yes').click();
  await page.getByLabel('Stake amount').fill('60.00');
  await page.getByTestId('market-place-button').click();
  await expect(page.getByTestId('market-form-error')).toHaveText(
    'Insufficient balance.',
  );

  await page.getByLabel('Stake amount').fill('15.00');
  await page.getByTestId('market-place-button').click();
  await expect(page.getByTestId('market-notice')).toHaveText(
    'Position placed. Market and balance refreshed.',
  );

  await page.getByTestId('market-refresh-button').click();
  await expect(page.getByTestId('market-available-balance')).toHaveText('35.00');
  await expect(page.getByTestId('market-positions')).toContainText('Yes');
  await expect(page.getByTestId('market-positions')).toContainText('15.00');

  await lockPredictionMarket(marketId);

  await page.getByTestId('market-refresh-button').click();
  await expect(page.getByText('This market is not accepting new positions.')).toBeVisible();
  await expect(page.getByTestId('market-place-button')).toBeDisabled();
});

test('user can open the portfolio page and filter grouped prediction market history', async ({
  page,
}) => {
  const now = Date.now();
  const email = `markets-portfolio-user-${now}@example.com`;
  const password = 'Password123!';

  await registerAndSignInVerifiedUser(page, { email, password });

  const userId = await lookupUserId(email);
  await seedKycTier1(userId);
  await seedWalletBalance(userId, '75.00');
  const marketId = await seedPredictionMarket();

  await page.goto(`/app/markets/${marketId}`);
  await page.getByTestId('market-outcome-option-yes').click();
  await page.getByLabel('Stake amount').fill('15.00');
  await page.getByTestId('market-place-button').click();
  await expect(page.getByTestId('market-notice')).toHaveText(
    'Position placed. Market and balance refreshed.',
  );

  await page.getByRole('link', { name: 'My markets' }).click();
  await expect(page).toHaveURL(/\/app\/markets\/portfolio$/);
  await expect(page.getByTestId('markets-portfolio-page')).toBeVisible();
  await expect(page.getByTestId(`markets-portfolio-item-${marketId}`)).toContainText(
    'BTC closes above 100k on 2026-04-29 UTC',
  );
  await expect(page.getByTestId(`markets-portfolio-item-${marketId}`)).toContainText(
    '15.00',
  );

  await resolvePredictionMarket({
    marketId,
    userId,
    winningOutcomeKey: 'yes',
    payoutAmount: '15.00',
  });

  await page.goto('/app/markets/portfolio');
  const portfolioPage = page.getByTestId('markets-portfolio-page');
  await expect(portfolioPage).toBeVisible();
  await portfolioPage.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('No records match this status filter yet.')).toBeVisible();

  await portfolioPage.getByRole('button', { name: 'Resolved' }).click();
  await expect(page.getByTestId(`markets-portfolio-item-${marketId}`)).toContainText(
    'Resolved',
  );
  await expect(page.getByTestId(`markets-portfolio-item-${marketId}`)).toContainText(
    'Yes',
  );
  await expect(page.getByTestId(`markets-portfolio-item-${marketId}`)).toContainText(
    '15.00',
  );
});
