import 'dotenv/config';

import { asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bankCards,
  deposits,
  drawRecords,
  fairnessSeeds,
  houseAccount,
  ledgerEntries,
  prizes,
  systemConfig,
  userWallets,
  users,
} from '@reward/database';

process.env.NODE_ENV ||= 'test';
process.env.ADMIN_JWT_SECRET ||= 'integration-admin-secret-1234567890';
process.env.USER_JWT_SECRET ||= 'integration-user-secret-1234567890';

const integrationDatabaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
const runIntegrationTests =
  process.env.RUN_INTEGRATION_TESTS === 'true' && Boolean(integrationDatabaseUrl);
const describeIntegration = runIntegrationTests ? describe : describe.skip;

type DbModule = typeof import('../db');
type AppModule = typeof import('../app');
type DrawModule = typeof import('../modules/draw/service');
type UserSessionModule = typeof import('../shared/user-session');

let db: DbModule['db'] | null = null;
let client: DbModule['client'] | null = null;
let app: Awaited<ReturnType<AppModule['buildApp']>> | null = null;
let executeDraw: DrawModule['executeDraw'] | null = null;
let createUserSessionToken: UserSessionModule['createUserSessionToken'] | null = null;

const getDb = () => {
  if (!db) {
    throw new Error('Integration DB not initialized.');
  }
  return db;
};

const getClient = () => {
  if (!client) {
    throw new Error('Integration client not initialized.');
  }
  return client;
};

const getApp = () => {
  if (!app) {
    throw new Error('Integration app not initialized.');
  }
  return app;
};

const getExecuteDraw = () => {
  if (!executeDraw) {
    throw new Error('executeDraw not initialized.');
  }
  return executeDraw;
};

const getCreateUserSessionToken = () => {
  if (!createUserSessionToken) {
    throw new Error('createUserSessionToken not initialized.');
  }
  return createUserSessionToken;
};

const resetDatabase = async () => {
  await getClient().unsafe(`
    TRUNCATE TABLE
      admin_permissions,
      admin_actions,
      auth_events,
      fairness_seeds,
      freeze_records,
      suspicious_accounts,
      deposits,
      withdrawals,
      bank_cards,
      draw_records,
      prizes,
      ledger_entries,
      house_transactions,
      house_account,
      user_wallets,
      admins,
      users,
      system_config
    RESTART IDENTITY CASCADE
  `);
};

const seedDrawScenario = async () => {
  const database = getDb();
  await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
  const [user] = await database
    .insert(users)
    .values({
      email: 'draw-user@example.com',
      passwordHash: 'hashed-password',
      role: 'user',
      userPoolBalance: '0.00',
    })
    .returning();

  await database.insert(userWallets).values({
    userId: user.id,
    withdrawableBalance: '100.00',
    bonusBalance: '0.00',
    lockedBalance: '0.00',
    wageredAmount: '0.00',
  });

  const [prize] = await database
    .insert(prizes)
    .values({
      name: 'Guaranteed Prize',
      stock: 1,
      weight: 100,
      poolThreshold: '0.00',
      userPoolThreshold: '0.00',
      rewardAmount: '5.00',
      payoutBudget: '0.00',
      payoutSpent: '0.00',
      payoutPeriodDays: 1,
      isActive: true,
    })
    .returning();

  const { invalidateProbabilityPool } = await import(
    '../modules/draw/pool-cache'
  );
  await invalidateProbabilityPool();

  return { user, prize };
};

const seedUserWithWallet = async (params: {
  email: string;
  withdrawableBalance?: string;
  bonusBalance?: string;
  lockedBalance?: string;
  wageredAmount?: string;
}) => {
  const database = getDb();
  const [user] = await database
    .insert(users)
    .values({
      email: params.email,
      passwordHash: 'hashed-password',
      role: 'user',
      userPoolBalance: '0.00',
    })
    .returning();

  await database.insert(userWallets).values({
    userId: user.id,
    withdrawableBalance: params.withdrawableBalance ?? '0.00',
    bonusBalance: params.bonusBalance ?? '0.00',
    lockedBalance: params.lockedBalance ?? '0.00',
    wageredAmount: params.wageredAmount ?? '0.00',
  });

  return user;
};

const setConfigNumber = async (key: string, value: string) => {
  await getDb()
    .insert(systemConfig)
    .values({
      configKey: key,
      configNumber: value,
      description: 'integration-test',
    })
    .onConflictDoUpdate({
      target: systemConfig.configKey,
      set: {
        configNumber: value,
        updatedAt: new Date(),
      },
    });
};

const invalidatePoolCache = async () => {
  const { invalidateProbabilityPool } = await import(
    '../modules/draw/pool-cache'
  );
  await invalidateProbabilityPool();
};

describeIntegration('backend integration', () => {
  beforeAll(async () => {
    const dbModule = await import('../db');
    const appModule = await import('../app');
    const drawModule = await import('../modules/draw/service');
    const userSessionModule = await import('../shared/user-session');

    db = dbModule.db;
    client = dbModule.client;
    executeDraw = drawModule.executeDraw;
    createUserSessionToken = userSessionModule.createUserSessionToken;
    app = await appModule.buildApp({ installProcessHandlers: false });
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (client) {
      await client.end();
    }
  });

  it('executeDraw persists a winning draw and related ledger entries', async () => {
    const { user, prize } = await seedDrawScenario();

    const record = await getExecuteDraw()(user.id, {
      clientNonce: 'integration-unit-draw',
    });

    expect(record?.status).toBe('won');
    expect(record?.prizeId).toBe(prize.id);
    expect(record?.drawCost).toBe('10.00');
    expect(record?.rewardAmount).toBe('5.00');

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        bonusBalance: userWallets.bonusBalance,
        wageredAmount: userWallets.wageredAmount,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '90.00',
      bonusBalance: '5.00',
      wageredAmount: '10.00',
    });

    const [house] = await getDb()
      .select({ prizePoolBalance: houseAccount.prizePoolBalance })
      .from(houseAccount)
      .where(eq(houseAccount.id, 1))
      .limit(1);

    expect(house?.prizePoolBalance).toBe('5.00');

    const userEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(userEntries).toEqual([
      { entryType: 'draw_cost', amount: '-10.00' },
      { entryType: 'draw_reward', amount: '5.00' },
    ]);

    const [storedRecord] = await getDb()
      .select({
        status: drawRecords.status,
        drawCost: drawRecords.drawCost,
        rewardAmount: drawRecords.rewardAmount,
      })
      .from(drawRecords)
      .where(eq(drawRecords.userId, user.id))
      .limit(1);

    expect(storedRecord).toEqual({
      status: 'won',
      drawCost: '10.00',
      rewardAmount: '5.00',
    });
  });

  it('POST /draw executes a winning draw for authenticated users', async () => {
    const { user, prize } = await seedDrawScenario();
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/draw',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        clientNonce: 'integration-api-draw',
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      userId: user.id,
      prizeId: prize.id,
      status: 'won',
      drawCost: '10.00',
      rewardAmount: '5.00',
    });
    expect(payload.data.fairness).toMatchObject({
      clientNonce: 'integration-api-draw',
    });
  });

  it('POST /auth/register creates a user and wallet via HTTP', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'new-user@example.com',
        password: 'secret-123',
      },
    });

    expect(response.statusCode).toBe(201);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      email: 'new-user@example.com',
    });

    const [user] = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, 'new-user@example.com'))
      .limit(1);

    expect(user).toMatchObject({
      email: 'new-user@example.com',
    });

    const [wallet] = await getDb()
      .select({ userId: userWallets.userId })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.userId).toBe(user.id);
  });

  it('executeDraw returns out_of_stock when the selected prize has no stock', async () => {
    await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
    const user = await seedUserWithWallet({
      email: 'out-of-stock@example.com',
      withdrawableBalance: '50.00',
    });

    await getDb()
      .insert(prizes)
      .values({
        name: 'Out of Stock Prize',
        stock: 0,
        weight: 100,
        poolThreshold: '0.00',
        userPoolThreshold: '0.00',
        rewardAmount: '5.00',
        payoutBudget: '0.00',
        payoutSpent: '0.00',
        payoutPeriodDays: 1,
        isActive: true,
      });

    await invalidatePoolCache();

    const record = await getExecuteDraw()(user.id, {
      clientNonce: 'integration-out-of-stock',
    });

    expect(record?.status).toBe('out_of_stock');
    expect(record?.rewardAmount).toBe('0.00');
  });

  it('executeDraw returns budget_exhausted when payout budget is spent', async () => {
    await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
    const user = await seedUserWithWallet({
      email: 'budget-exhausted@example.com',
      withdrawableBalance: '50.00',
    });

    await getDb()
      .insert(prizes)
      .values({
        name: 'Budget Exhausted Prize',
        stock: 1,
        weight: 100,
        poolThreshold: '0.00',
        userPoolThreshold: '0.00',
        rewardAmount: '5.00',
        payoutBudget: '1.00',
        payoutSpent: '1.00',
        payoutPeriodDays: 1,
        isActive: true,
      });

    await invalidatePoolCache();

    const record = await getExecuteDraw()(user.id, {
      clientNonce: 'integration-budget-exhausted',
    });

    expect(record?.status).toBe('budget_exhausted');
    expect(record?.rewardAmount).toBe('0.00');
  });

  it('executeDraw returns payout_limited when reserve blocks payout', async () => {
    await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
    await setConfigNumber('pool_system.pool_min_reserve', '100.00');
    const user = await seedUserWithWallet({
      email: 'payout-limited@example.com',
      withdrawableBalance: '50.00',
    });

    await getDb()
      .insert(prizes)
      .values({
        name: 'Reserve Limited Prize',
        stock: 1,
        weight: 100,
        poolThreshold: '0.00',
        userPoolThreshold: '0.00',
        rewardAmount: '5.00',
        payoutBudget: '0.00',
        payoutSpent: '0.00',
        payoutPeriodDays: 1,
        isActive: true,
      });

    await invalidatePoolCache();

    const record = await getExecuteDraw()(user.id, {
      clientNonce: 'integration-payout-limited',
    });

    expect(record?.status).toBe('payout_limited');
    expect(record?.rewardAmount).toBe('0.00');
  });

  it('POST /bank-cards creates cards and updates default selection', async () => {
    const user = await seedUserWithWallet({
      email: 'bank-card@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const createFirst = await getApp().inject({
      method: 'POST',
      url: '/bank-cards',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        cardholderName: 'Test User',
        bankName: 'Demo Bank',
        brand: 'Visa',
        last4: '1234',
        isDefault: true,
      },
    });

    expect(createFirst.statusCode).toBe(201);
    const firstPayload = createFirst.json();
    expect(firstPayload.ok).toBe(true);

    const createSecond = await getApp().inject({
      method: 'POST',
      url: '/bank-cards',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        cardholderName: 'Test User',
        bankName: 'Demo Bank',
        brand: 'Mastercard',
        last4: '5678',
        isDefault: false,
      },
    });

    const secondPayload = createSecond.json();
    const secondId = secondPayload.data?.id as number;
    expect(secondId).toBeTruthy();

    const setDefault = await getApp().inject({
      method: 'PATCH',
      url: `/bank-cards/${secondId}/default`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(setDefault.statusCode).toBe(200);

    const cards = await getDb()
      .select({
        id: bankCards.id,
        isDefault: bankCards.isDefault,
      })
      .from(bankCards)
      .where(eq(bankCards.userId, user.id))
      .orderBy(asc(bankCards.id));

    expect(cards.find((card) => card.id === secondId)?.isDefault).toBe(true);
  });

  it('POST /top-ups creates a pending deposit record', async () => {
    const user = await seedUserWithWallet({
      email: 'top-up@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/top-ups',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 25.5,
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.ok).toBe(true);

    const [deposit] = await getDb()
      .select({
        id: deposits.id,
        status: deposits.status,
        amount: deposits.amount,
      })
      .from(deposits)
      .where(eq(deposits.userId, user.id))
      .limit(1);

    expect(deposit).toMatchObject({
      status: 'pending',
      amount: '25.50',
    });
  });

  it('POST /withdrawals locks balance and writes ledger entry', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal@example.com',
      withdrawableBalance: '100.00',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/withdrawals',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 40,
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.ok).toBe(true);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '60.00',
      lockedBalance: '40.00',
    });

    const [entry] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id))
      .limit(1);

    expect(entry).toEqual({
      entryType: 'withdraw_request',
      amount: '-40.00',
    });
  });

  it('GET /fairness/commit and /fairness/reveal expose commitment data', async () => {
    const commitResponse = await getApp().inject({
      method: 'GET',
      url: '/fairness/commit',
    });

    expect(commitResponse.statusCode).toBe(200);
    const commitPayload = commitResponse.json();
    expect(commitPayload.ok).toBe(true);

    const epochSeconds = Number(commitPayload.data.epochSeconds);
    const currentEpoch = Number(commitPayload.data.epoch);
    const previousEpoch = currentEpoch - 1;

    const seed = 'integration-seed';
    const commitHash = createHash('sha256').update(seed).digest('hex');

    await getDb().insert(fairnessSeeds).values({
      epoch: previousEpoch,
      epochSeconds,
      commitHash,
      seed,
    });

    const revealResponse = await getApp().inject({
      method: 'GET',
      url: `/fairness/reveal?epoch=${previousEpoch}`,
    });

    expect(revealResponse.statusCode).toBe(200);
    const revealPayload = revealResponse.json();
    expect(revealPayload.ok).toBe(true);
    expect(revealPayload.data).toMatchObject({
      epoch: previousEpoch,
      seed,
      commitHash,
    });
  });
});
