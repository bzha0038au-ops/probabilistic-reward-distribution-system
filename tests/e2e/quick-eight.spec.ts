import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { setTimeout as delay } from 'node:timers/promises';

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

const seedApprovedKycTier = async (userId: number) => {
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

const waitForQuickEightRound = async (userId: number, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [row] = await sql<
      Array<{
        id: number;
        status: string;
        hit_count: number;
        stake_amount: string;
        selected_numbers: unknown;
      }>
    >`
      select id, status, hit_count, stake_amount, selected_numbers
      from quick_eight_rounds
      where user_id = ${userId}
      order by id desc
      limit 1
    `;

    if (row) {
      return row;
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for a quick eight round for user ${userId}.`);
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('quick eight route supports a real authenticated play flow', async ({ page }) => {
  const email = `quick-eight-playwright-${Date.now()}@example.com`;
  const password = 'Password123!';

  await page.goto('/register');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Birth Date').fill(TEST_BIRTH_DATE);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);

  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing quick eight user for ${email}.`);
  }

  await sql`
    update users
    set email_verified_at = now(), updated_at = now()
    where id = ${user.id}
  `;
  await seedApprovedKycTier(user.id);
  await seedWalletBalance(user.id, '50.00');
  await setPrizePoolBalance('25000.00');

  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL(/\/app$/, { timeout: 30_000 });

  await page.goto('/app/quick-eight');
  await expect(page.getByRole('button', { name: 'Play Quick Eight' })).toBeVisible();
  await expect(page.getByLabel('Stake amount')).toBeVisible();
  await expect(page.getByText('Payout table', { exact: true })).toBeVisible();

  for (const number of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await page.getByRole('button', { name: String(number), exact: true }).click();
  }

  await page.getByRole('button', { name: 'Play Quick Eight' }).click();

  await expect(page.getByText('Latest round', { exact: true })).toBeVisible();

  const round = await waitForQuickEightRound(user.id);
  const selectedNumbers = Array.isArray(round.selected_numbers)
    ? round.selected_numbers
    : [];

  expect(round.stake_amount).toBe('1.00');
  expect(selectedNumbers).toHaveLength(8);
  expect(['won', 'lost']).toContain(round.status);
});
