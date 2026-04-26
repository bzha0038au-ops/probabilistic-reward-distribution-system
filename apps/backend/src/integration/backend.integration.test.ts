import 'dotenv/config';

import { asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authSessions,
  bankCards,
  deposits,
  drawRecords,
  fairnessSeeds,
  freezeRecords,
  houseAccount,
  ledgerEntries,
  prizes,
  systemConfig,
  userWallets,
  users,
  withdrawals,
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
type TopUpModule = typeof import('../modules/top-up/service');
type WithdrawModule = typeof import('../modules/withdraw/service');
type RiskModule = typeof import('../modules/risk/service');
type UserSessionModule = typeof import('../shared/user-session');

let db: DbModule['db'] | null = null;
let client: DbModule['client'] | null = null;
let app: Awaited<ReturnType<AppModule['buildApp']>> | null = null;
let executeDraw: DrawModule['executeDraw'] | null = null;
let topUpModule: TopUpModule | null = null;
let withdrawModule: WithdrawModule | null = null;
let riskModule: RiskModule | null = null;
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

const getTopUpModule = () => {
  if (!topUpModule) {
    throw new Error('topUpModule not initialized.');
  }
  return topUpModule;
};

const getWithdrawModule = () => {
  if (!withdrawModule) {
    throw new Error('withdrawModule not initialized.');
  }
  return withdrawModule;
};

const getRiskModule = () => {
  if (!riskModule) {
    throw new Error('riskModule not initialized.');
  }
  return riskModule;
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
      auth_sessions,
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
    const topUpServiceModule = await import('../modules/top-up/service');
    const withdrawServiceModule = await import('../modules/withdraw/service');
    const riskServiceModule = await import('../modules/risk/service');
    const userSessionModule = await import('../shared/user-session');

    db = dbModule.db;
    client = dbModule.client;
    executeDraw = drawModule.executeDraw;
    topUpModule = topUpServiceModule;
    withdrawModule = withdrawServiceModule;
    riskModule = riskServiceModule;
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

  it('revokes the current user session on logout', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'session-user@example.com',
        password: 'secret-123',
      },
    });

    const loginResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'session-user@example.com',
        password: 'secret-123',
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginPayload = loginResponse.json();
    const token = loginPayload.data?.token as string;
    const sessionId = loginPayload.data?.sessionId as string;

    const [session] = await getDb()
      .select({ jti: authSessions.jti, status: authSessions.status })
      .from(authSessions)
      .where(eq(authSessions.jti, sessionId))
      .limit(1);
    expect(session).toMatchObject({
      jti: sessionId,
      status: 'active',
    });

    const currentResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(currentResponse.statusCode).toBe(200);

    const logoutResponse = await getApp().inject({
      method: 'DELETE',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(logoutResponse.statusCode).toBe(200);

    const revokedResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(revokedResponse.statusCode).toBe(401);
  });

  it('revokes active sessions after a password change', async () => {
    const registerResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'password-change@example.com',
        password: 'secret-123',
      },
    });
    expect(registerResponse.statusCode).toBe(201);

    const [user] = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, 'password-change@example.com'))
      .limit(1);

    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const { updateUserPassword } = await import('../modules/user/service');
    await updateUserPassword(user.id, 'new-secret-456');

    const response = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(401);
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

  it('deposit FSM only allows pending deposits to transition once', async () => {
    const approvedUser = await seedUserWithWallet({
      email: 'deposit-fsm-approved@example.com',
    });

    const pendingApproved = await getTopUpModule().createTopUp({
      userId: approvedUser.id,
      amount: '25.50',
    });

    expect(pendingApproved?.status).toBe('pending');

    const approved = await getTopUpModule().approveDeposit(pendingApproved.id);
    expect(approved?.status).toBe('success');

    const approvedAgain = await getTopUpModule().approveDeposit(pendingApproved.id);
    expect(approvedAgain?.status).toBe('success');

    const failedAfterApprove = await getTopUpModule().failDeposit(pendingApproved.id);
    expect(failedAfterApprove?.status).toBe('success');

    const [approvedWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, approvedUser.id))
      .limit(1);

    expect(approvedWallet).toEqual({
      withdrawableBalance: '25.50',
      lockedBalance: '0.00',
    });

    const approvedEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, approvedUser.id))
      .orderBy(asc(ledgerEntries.id));

    expect(approvedEntries).toEqual([{ entryType: 'deposit', amount: '25.50' }]);

    const failedUser = await seedUserWithWallet({
      email: 'deposit-fsm-failed@example.com',
    });

    const pendingFailed = await getTopUpModule().createTopUp({
      userId: failedUser.id,
      amount: '12.00',
    });

    expect(pendingFailed?.status).toBe('pending');

    const failed = await getTopUpModule().failDeposit(pendingFailed.id);
    expect(failed?.status).toBe('failed');

    const approvedAfterFail = await getTopUpModule().approveDeposit(pendingFailed.id);
    expect(approvedAfterFail?.status).toBe('failed');

    const failedAgain = await getTopUpModule().failDeposit(pendingFailed.id);
    expect(failedAgain?.status).toBe('failed');

    const [failedWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, failedUser.id))
      .limit(1);

    expect(failedWallet).toEqual({
      withdrawableBalance: '0.00',
      lockedBalance: '0.00',
    });

    const failedEntries = await getDb()
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, failedUser.id));

    expect(failedEntries).toHaveLength(0);
  });

  it('withdrawal FSM supports pending -> approved -> paid terminal flow', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal-fsm-approved@example.com',
      withdrawableBalance: '100.00',
    });

    const pending = await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '40.00',
    });

    expect(pending?.status).toBe('pending');

    const approved = await getWithdrawModule().approveWithdrawal(pending.id);
    expect(approved?.status).toBe('approved');

    const approvedAgain = await getWithdrawModule().approveWithdrawal(pending.id);
    expect(approvedAgain?.status).toBe('approved');

    const paid = await getWithdrawModule().payWithdrawal(pending.id);
    expect(paid?.status).toBe('paid');

    const paidAgain = await getWithdrawModule().payWithdrawal(pending.id);
    expect(paidAgain?.status).toBe('paid');

    const rejectedAfterPay = await getWithdrawModule().rejectWithdrawal(pending.id);
    expect(rejectedAfterPay?.status).toBe('paid');

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
      lockedBalance: '0.00',
    });

    const [stored] = await getDb()
      .select({ status: withdrawals.status })
      .from(withdrawals)
      .where(eq(withdrawals.id, pending.id))
      .limit(1);

    expect(stored?.status).toBe('paid');

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([
      { entryType: 'withdraw_request', amount: '-40.00' },
      { entryType: 'withdraw_paid', amount: '-40.00' },
    ]);
  });

  it('withdrawal FSM supports pending -> rejected and pending -> paid terminal flows', async () => {
    const rejectedUser = await seedUserWithWallet({
      email: 'withdrawal-fsm-rejected@example.com',
      withdrawableBalance: '100.00',
    });

    const pendingRejected = await getWithdrawModule().createWithdrawal({
      userId: rejectedUser.id,
      amount: '30.00',
    });

    expect(pendingRejected?.status).toBe('pending');

    const rejected = await getWithdrawModule().rejectWithdrawal(pendingRejected.id);
    expect(rejected?.status).toBe('rejected');

    const approvedAfterReject = await getWithdrawModule().approveWithdrawal(pendingRejected.id);
    expect(approvedAfterReject?.status).toBe('rejected');

    const paidAfterReject = await getWithdrawModule().payWithdrawal(pendingRejected.id);
    expect(paidAfterReject?.status).toBe('rejected');

    const [rejectedWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, rejectedUser.id))
      .limit(1);

    expect(rejectedWallet).toEqual({
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });

    const rejectedEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, rejectedUser.id))
      .orderBy(asc(ledgerEntries.id));

    expect(rejectedEntries).toEqual([
      { entryType: 'withdraw_request', amount: '-30.00' },
      { entryType: 'withdraw_rejected_refund', amount: '30.00' },
    ]);

    const paidUser = await seedUserWithWallet({
      email: 'withdrawal-fsm-paid@example.com',
      withdrawableBalance: '80.00',
    });

    const pendingPaid = await getWithdrawModule().createWithdrawal({
      userId: paidUser.id,
      amount: '20.00',
    });

    expect(pendingPaid?.status).toBe('pending');

    const paidDirectly = await getWithdrawModule().payWithdrawal(pendingPaid.id);
    expect(paidDirectly?.status).toBe('paid');

    const approvedAfterDirectPay = await getWithdrawModule().approveWithdrawal(pendingPaid.id);
    expect(approvedAfterDirectPay?.status).toBe('paid');

    const [paidWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, paidUser.id))
      .limit(1);

    expect(paidWallet).toEqual({
      withdrawableBalance: '60.00',
      lockedBalance: '0.00',
    });
  });

  it('freeze FSM keeps a single active record and allows re-freeze after release', async () => {
    const user = await seedUserWithWallet({
      email: 'freeze-fsm@example.com',
    });

    const first = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_review',
    });
    expect(first?.id).toBeTruthy();

    const duplicate = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'ignored',
    });
    expect(duplicate?.id).toBe(first?.id);

    const released = await getRiskModule().releaseUserFreeze({ userId: user.id });
    expect(released?.status).toBe('released');
    expect(released?.releasedAt).toBeTruthy();

    const releasedAgain = await getRiskModule().releaseUserFreeze({ userId: user.id });
    expect(releasedAgain).toBeNull();

    const recreated = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_review_again',
    });
    expect(recreated?.id).toBeTruthy();
    expect(recreated?.id).not.toBe(first?.id);

    const records = await getDb()
      .select({
        id: freezeRecords.id,
        status: freezeRecords.status,
        reason: freezeRecords.reason,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user.id))
      .orderBy(asc(freezeRecords.id));

    expect(records).toEqual([
      {
        id: first?.id ?? 0,
        status: 'released',
        reason: 'manual_review',
      },
      {
        id: recreated?.id ?? 0,
        status: 'active',
        reason: 'manual_review_again',
      },
    ]);
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
