import 'dotenv/config';

import { and, asc, desc, eq, inArray } from '@reward/database/orm';
import { createHash, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminActions,
  adminPermissions,
  admins,
  authSessions,
  authEvents,
  authTokens,
  bankCards,
  cryptoChainTransactions,
  cryptoDepositChannels,
  cryptoWithdrawAddresses,
  deposits,
  drawRecords,
  fairnessSeeds,
  freezeRecords,
  houseAccount,
  ledgerEntries,
  paymentProviders,
  paymentWebhookEvents,
  prizes,
  systemConfig,
  userWallets,
  users,
  withdrawals,
} from '@reward/database';

process.env.NODE_ENV ||= 'test';
process.env.ADMIN_JWT_SECRET ||= 'integration-admin-secret-1234567890';
process.env.USER_JWT_SECRET ||= 'integration-user-secret-1234567890';

const authNotificationCaptures = vi.hoisted(() => ({
  passwordReset: [] as Array<{
    email: string;
    resetUrl: string;
    expiresAt: Date;
  }>,
  emailVerification: [] as Array<{
    email: string;
    verificationUrl: string;
    expiresAt: Date;
  }>,
  phoneVerification: [] as Array<{
    phone: string;
    code: string;
    expiresAt: Date;
  }>,
  anomalousLogin: [] as Array<Record<string, unknown>>,
}));

vi.mock('../modules/auth/notification-service', () => {
  class NotificationThrottleError extends Error {
    constructor(
      message: string,
      readonly resetAt: number,
      readonly limit: number
    ) {
      super(message);
      this.name = 'NotificationThrottleError';
    }
  }

  class NotificationProviderUnavailableError extends Error {
    constructor(
      message: string,
      readonly channel: string
    ) {
      super(message);
      this.name = 'NotificationProviderUnavailableError';
    }
  }

  return {
    NotificationThrottleError,
    NotificationProviderUnavailableError,
    assertNotificationChannelAvailable: vi.fn(() => undefined),
    getNotificationProviderStatus: vi.fn(() => ({
      emailProvider: 'mock',
      smsProvider: 'mock',
    })),
    processPendingAuthNotifications: vi.fn(async () => 0),
    recoverStuckAuthNotifications: vi.fn(async () => 0),
    registerAuthNotificationEnqueueHook: vi.fn(() => undefined),
    listNotificationDeliveries: vi.fn(async () => []),
    getNotificationDeliverySummary: vi.fn(async () => ({
      counts: {
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
      },
      oldestPendingAt: null,
      providers: {
        emailProvider: 'mock',
        smsProvider: 'mock',
      },
    })),
    sendPasswordResetNotification: vi.fn(async (payload) => {
      authNotificationCaptures.passwordReset.push(payload);
      return true;
    }),
    sendEmailVerificationNotification: vi.fn(async (payload) => {
      authNotificationCaptures.emailVerification.push(payload);
      return true;
    }),
    sendPhoneVerificationNotification: vi.fn(async (payload) => {
      authNotificationCaptures.phoneVerification.push(payload);
      return true;
    }),
    sendAnomalousLoginAlert: vi.fn(async (payload) => {
      authNotificationCaptures.anomalousLogin.push(payload);
      return true;
    }),
  };
});

const integrationDatabaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
const runIntegrationTests =
  process.env.RUN_INTEGRATION_TESTS === 'true' && Boolean(integrationDatabaseUrl);
const migrationsFolder = fileURLToPath(
  new URL('../../../database/drizzle', import.meta.url)
);

const expectPresent = <T>(value: T | null | undefined) => {
  expect(value).toBeTruthy();
  if (value == null) {
    throw new Error('Expected value to be present.');
  }
  return value;
};
const describeIntegration = runIntegrationTests ? describe : describe.skip;

const ADMIN_SESSION_COOKIE = 'reward_admin_session';
const CSRF_COOKIE = 'reward_csrf';
const CSRF_HEADER = 'x-csrf-token';
const ADMIN_ORIGIN = new URL(
  process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5173'
).origin;
const TEST_CSRF_TOKEN = 'integration-csrf-token';

type DbModule = typeof import('../db');
type AppModule = typeof import('../app');
type DrawModule = typeof import('../modules/draw/service');
type TopUpModule = typeof import('../modules/top-up');
type WithdrawModule = typeof import('../modules/withdraw/service');
type RiskModule = typeof import('../modules/risk/service');
type UserSessionModule = typeof import('../shared/user-session');
type AppInjectOptions = import('light-my-request').InjectOptions;

let db: DbModule['db'] | null = null;
let client: DbModule['client'] | null = null;
let app: Awaited<ReturnType<AppModule['buildApp']>> | null = null;
let executeDraw: DrawModule['executeDraw'] | null = null;
let topUpModule: TopUpModule | null = null;
let withdrawModule: WithdrawModule | null = null;
let riskModule: RiskModule | null = null;
let createUserSessionToken: UserSessionModule['createUserSessionToken'] | null = null;
let requestIpCounter = 1;

const nextRequestIp = () => {
  const offset = requestIpCounter - 1;
  requestIpCounter += 1;
  return `127.0.${Math.floor(offset / 250)}.${(offset % 250) + 1}`;
};

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
  const appInstance = app;
  if (!appInstance) {
    throw new Error('Integration app not initialized.');
  }
  return {
    inject: (options: AppInjectOptions) =>
      appInstance.inject({
        remoteAddress: nextRequestIp(),
        ...options,
      }),
  };
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

const ensureMigrationsApplied = async () => {
  const [migrationTable] = (await getClient().unsafe(
    `
      SELECT to_regclass('drizzle.__drizzle_migrations') AS relation_name
    `
  )) as Array<{ relation_name: string | null }>;

  if (!migrationTable?.relation_name) {
    await migrate(getDb(), { migrationsFolder });
    return;
  }

  const [migrationCount] = (await getClient().unsafe(
    `
      SELECT count(*)::int AS count
      FROM drizzle.__drizzle_migrations
    `
  )) as Array<{ count: number }>;

  if ((migrationCount?.count ?? 0) === 0) {
    await migrate(getDb(), { migrationsFolder });
  }
};

const resetDatabase = async () => {
  const tables = (await getClient().unsafe(
    `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '__drizzle%'
      ORDER BY tablename
    `
  )) as Array<{ tablename: string }>;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables
    .map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`)
    .join(', ');

  await getClient().unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
};

const signPaymentWebhookPayload = (secret: string, payload: string) =>
  `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

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

const verifyUserContacts = async (
  userId: number,
  requirements: { email?: boolean; phone?: boolean }
) => {
  const now = new Date();
  const [user] = await getDb()
    .update(users)
    .set({
      ...(requirements.email ? { emailVerifiedAt: now } : {}),
      ...(requirements.phone
        ? {
            phone: `+61490${String(userId).padStart(6, '0')}`,
            phoneVerifiedAt: now,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning();

  return user ?? null;
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

const resetAuthNotificationCaptures = () => {
  authNotificationCaptures.passwordReset.length = 0;
  authNotificationCaptures.emailVerification.length = 0;
  authNotificationCaptures.phoneVerification.length = 0;
  authNotificationCaptures.anomalousLogin.length = 0;
};

const extractTokenFromUrl = (url: string) => {
  const token = new URL(url).searchParams.get('token');
  if (!token) {
    throw new Error(`Missing token in URL: ${url}`);
  }
  return token;
};

const buildAdminCookieHeaders = (token: string) => ({
  cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; ${CSRF_COOKIE}=${TEST_CSRF_TOKEN}`,
  origin: ADMIN_ORIGIN,
  [CSRF_HEADER]: TEST_CSRF_TOKEN,
  'content-type': 'application/json',
});

const registerUser = async (email: string, password = 'secret-123') => {
  const response = await getApp().inject({
    method: 'POST',
    url: '/auth/register',
    headers: {
      'content-type': 'application/json',
    },
    payload: {
      email,
      password,
    },
  });

  expect(response.statusCode).toBe(201);

  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  expect(user).toBeDefined();
  return user!;
};

const loginUser = async (email: string, password: string) => {
  const response = await getApp().inject({
    method: 'POST',
    url: '/auth/user/session',
    headers: {
      'content-type': 'application/json',
    },
    payload: {
      email,
      password,
    },
  });

  expect(response.statusCode).toBe(200);
  return response.json().data as {
    token: string;
    sessionId: string;
  };
};

const seedAdminAccount = async (params: {
  email: string;
  password?: string;
  displayName?: string;
}) => {
  const { hashPassword } = await import('../modules/auth/password');
  const password = params.password ?? 'secret-123';
  const [user] = await getDb()
    .insert(users)
    .values({
      email: params.email,
      passwordHash: hashPassword(password),
      role: 'admin',
      userPoolBalance: '0.00',
    })
    .returning();

  const [admin] = await getDb()
    .insert(admins)
    .values({
      userId: user.id,
      displayName: params.displayName ?? 'Integration Admin',
      isActive: true,
    })
    .returning();

  return { user, admin, password };
};

const grantLegacyAdminPermissions = async (
  adminId: number,
  permissionKeys: string[] = ['finance.manage', 'security.manage', 'config.manage']
) => {
  for (const permissionKey of permissionKeys) {
    await getDb()
      .insert(adminPermissions)
      .values({
        adminId,
        permissionKey,
      })
      .onConflictDoNothing();
  }
};

const loginAdmin = async (email: string, password: string, totpCode?: string) => {
  const response = await getApp().inject({
    method: 'POST',
    url: '/auth/admin/login',
    headers: {
      'content-type': 'application/json',
    },
    payload: {
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    },
  });

  expect(response.statusCode).toBe(200);
  return response.json().data as {
    token: string;
    sessionId: string;
    user: {
      id: number;
      email: string;
      adminId: number;
      mfaEnabled: boolean;
    };
  };
};

const enrollAdminMfa = async (params: { email: string; password: string }) => {
  const initialSession = await loginAdmin(params.email, params.password);

  const enrollmentResponse = await getApp().inject({
    method: 'POST',
    url: '/admin/mfa/enrollment',
    headers: buildAdminCookieHeaders(initialSession.token),
    payload: {},
  });

  expect(enrollmentResponse.statusCode).toBe(201);
  const enrollmentPayload = enrollmentResponse.json().data as {
    secret: string;
    enrollmentToken: string;
  };

  const { generateTotpCode } = await import('../modules/admin-mfa/service');
  const verifyResponse = await getApp().inject({
    method: 'POST',
    url: '/admin/mfa/verify',
    headers: buildAdminCookieHeaders(initialSession.token),
    payload: {
      enrollmentToken: enrollmentPayload.enrollmentToken,
      totpCode: generateTotpCode(enrollmentPayload.secret),
    },
  });

  expect(verifyResponse.statusCode).toBe(200);
  const verifyPayload = verifyResponse.json().data as {
    token: string;
  };

  return {
    token: verifyPayload.token,
    totpCode: generateTotpCode(enrollmentPayload.secret),
  };
};

describeIntegration('backend integration', () => {
  beforeAll(async () => {
    const dbModule = await import('../db');
    const appModule = await import('../app');
    const drawModule = await import('../modules/draw/service');
    const topUpServiceModule = await import('../modules/top-up');
    const withdrawServiceModule = await import('../modules/withdraw/service');
    const riskServiceModule = await import('../modules/risk/service');
    const userSessionModule = await import('../shared/user-session');

    db = dbModule.db;
    client = dbModule.client;
    await ensureMigrationsApplied();
    executeDraw = drawModule.executeDraw;
    topUpModule = topUpServiceModule;
    withdrawModule = withdrawServiceModule;
    riskModule = riskServiceModule;
    createUserSessionToken = userSessionModule.createUserSessionToken;
    app = await appModule.buildApp({ installProcessHandlers: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    resetAuthNotificationCaptures();
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
    await verifyUserContacts(user.id, { email: true });
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

  it('retries email verification delivery when registration already created the user', async () => {
    const email = 'register-retry@example.com';
    const notificationModule = await import('../modules/auth/notification-service');

    vi.mocked(
      notificationModule.sendEmailVerificationNotification
    ).mockRejectedValueOnce(new Error('queue failed'));

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: 'secret-123',
      },
    });

    expect(firstResponse.statusCode).toBe(503);
    expect(firstResponse.json().error.code).toBe('AUTH_NOTIFICATION_ENQUEUE_FAILED');
    expect(authNotificationCaptures.emailVerification).toHaveLength(0);

    const usersWithEmailAfterFirstAttempt = await getDb()
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.email, email));

    expect(usersWithEmailAfterFirstAttempt).toHaveLength(1);

    const retryResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: 'secret-123',
      },
    });

    expect(retryResponse.statusCode).toBe(201);
    expect(retryResponse.json().data).toMatchObject({ email });
    expect(authNotificationCaptures.emailVerification).toHaveLength(1);

    const verificationTokens = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, usersWithEmailAfterFirstAttempt[0]!.id),
          eq(authTokens.tokenType, 'email_verification')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(verificationTokens).toHaveLength(1);
    expect(verificationTokens[0]?.consumedAt).toBeNull();
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
    expect(currentResponse.json().data).toMatchObject({
      user: {
        email: 'session-user@example.com',
        role: 'user',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
      session: {
        sessionId,
        kind: 'user',
        role: 'user',
        current: true,
      },
    });

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

  it('lists and revokes active user sessions', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'multi-session@example.com',
        password: 'secret-123',
      },
    });

    const firstSession = await loginUser('multi-session@example.com', 'secret-123');
    const secondSession = await loginUser('multi-session@example.com', 'secret-123');

    const listResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/sessions',
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: firstSession.sessionId,
          kind: 'user',
          role: 'user',
          current: true,
        }),
        expect.objectContaining({
          sessionId: secondSession.sessionId,
          kind: 'user',
          role: 'user',
          current: false,
        }),
      ])
    );

    const revokeResponse = await getApp().inject({
      method: 'DELETE',
      url: `/auth/user/sessions/${secondSession.sessionId}`,
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().data).toMatchObject({
      revoked: true,
      scope: 'single',
      sessionId: secondSession.sessionId,
    });

    const secondSessionCurrentResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
      },
    });

    expect(secondSessionCurrentResponse.statusCode).toBe(401);
  });

  it('completes password reset via HTTP and revokes existing user sessions', async () => {
    const email = 'password-reset@example.com';
    const originalPassword = 'secret-123';
    const nextPassword = 'new-secret-456';
    const user = await registerUser(email, originalPassword);
    const firstSession = await loginUser(email, originalPassword);
    const secondSession = await loginUser(email, originalPassword);

    const requestResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
      },
    });

    expect(requestResponse.statusCode).toBe(202);
    expect(authNotificationCaptures.passwordReset).toHaveLength(1);

    const resetToken = extractTokenFromUrl(
      authNotificationCaptures.passwordReset[0]!.resetUrl
    );

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        token: resetToken,
        password: nextPassword,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toEqual({ completed: true });

    const resetTokens = await getDb()
      .select({
        tokenType: authTokens.tokenType,
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'password_reset')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(resetTokens).toHaveLength(1);
    expect(resetTokens[0]?.consumedAt).not.toBeNull();

    const sessions = await getDb()
      .select({
        jti: authSessions.jti,
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(asc(authSessions.id));

    expect(sessions).toEqual([
      {
        jti: firstSession.sessionId,
        status: 'revoked',
        revokedReason: 'password_changed',
      },
      {
        jti: secondSession.sessionId,
        status: 'revoked',
        revokedReason: 'password_changed',
      },
    ]);

    const firstSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });
    expect(firstSessionCheck.statusCode).toBe(401);

    const secondSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
      },
    });
    expect(secondSessionCheck.statusCode).toBe(401);

    const staleLoginResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: originalPassword,
      },
    });
    expect(staleLoginResponse.statusCode).toBe(401);

    const freshLoginResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: nextPassword,
      },
    });
    expect(freshLoginResponse.statusCode).toBe(200);

    const passwordResetEvents = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(eq(authEvents.email, email))
      .orderBy(desc(authEvents.id));

    expect(
      passwordResetEvents.map((event) => event.eventType)
    ).toContain('password_reset_requested');
    expect(
      passwordResetEvents.map((event) => event.eventType)
    ).toContain('password_reset_success');
  });

  it('requests and confirms email verification through the HTTP flow', async () => {
    const email = 'verify-email@example.com';
    const password = 'secret-123';
    const user = await registerUser(email, password);
    const session = await loginUser(email, password);

    expect(authNotificationCaptures.emailVerification).toHaveLength(1);

    const requestResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/email-verification/request',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        resend: true,
      },
    });

    expect(requestResponse.statusCode).toBe(200);
    expect(requestResponse.json().data).toEqual({ accepted: true });
    expect(authNotificationCaptures.emailVerification).toHaveLength(2);

    const verificationTokensBeforeConfirm = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'email_verification')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(verificationTokensBeforeConfirm).toHaveLength(2);
    expect(verificationTokensBeforeConfirm[0]?.consumedAt).toBeNull();
    expect(verificationTokensBeforeConfirm[1]?.consumedAt).not.toBeNull();

    const emailVerificationToken = extractTokenFromUrl(
      authNotificationCaptures.emailVerification[1]!.verificationUrl
    );

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/email-verification/confirm',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        token: emailVerificationToken,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toEqual({
      verified: true,
      email,
    });

    const [verifiedUser] = await getDb()
      .select({
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(verifiedUser?.emailVerifiedAt).not.toBeNull();

    const verificationTokensAfterConfirm = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'email_verification')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(
      verificationTokensAfterConfirm.every((token) => token.consumedAt !== null)
    ).toBe(true);

    const emailVerificationEvents = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(eq(authEvents.email, email))
      .orderBy(desc(authEvents.id));

    expect(
      emailVerificationEvents.map((event) => event.eventType)
    ).toContain('email_verification_success');
  });

  it('requests and confirms phone verification through the HTTP flow', async () => {
    const email = 'verify-phone@example.com';
    const password = 'secret-123';
    const phone = '+61400111222';
    const user = await registerUser(email, password);
    const session = await loginUser(email, password);

    const requestResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/phone-verification/request',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        phone,
      },
    });

    expect(requestResponse.statusCode).toBe(200);
    expect(requestResponse.json().data).toEqual({ accepted: true });
    expect(authNotificationCaptures.phoneVerification).toHaveLength(1);

    const code = authNotificationCaptures.phoneVerification[0]!.code;
    const [issuedPhoneToken] = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
        phone: authTokens.phone,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'phone_verification')
        )
      )
      .orderBy(desc(authTokens.id))
      .limit(1);

    expect(issuedPhoneToken).toEqual({
      consumedAt: null,
      phone,
    });

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/phone-verification/confirm',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        phone,
        code,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toEqual({
      verified: true,
      phone,
    });

    const [verifiedUser] = await getDb()
      .select({
        phone: users.phone,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(verifiedUser).toEqual({
      phone,
      phoneVerifiedAt: expect.any(Date),
    });

    const [consumedPhoneToken] = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'phone_verification')
        )
      )
      .orderBy(desc(authTokens.id))
      .limit(1);

    expect(consumedPhoneToken?.consumedAt).not.toBeNull();

    const phoneVerificationEvents = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(eq(authEvents.email, email))
      .orderBy(desc(authEvents.id));

    expect(
      phoneVerificationEvents.map((event) => event.eventType)
    ).toContain('phone_verification_success');
  });

  it('enrolls admin MFA end-to-end and rotates admin sessions', async () => {
    const email = 'admin-mfa@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    const initialSession = await loginAdmin(email, password);
    const secondarySession = await loginAdmin(email, password);

    const enrollmentResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/mfa/enrollment',
      headers: buildAdminCookieHeaders(initialSession.token),
      payload: {},
    });

    expect(enrollmentResponse.statusCode).toBe(201);
    const enrollmentPayload = enrollmentResponse.json().data as {
      secret: string;
      enrollmentToken: string;
    };
    expect(enrollmentPayload.secret).toBeTruthy();
    expect(enrollmentPayload.enrollmentToken).toBeTruthy();

    const { generateTotpCode } = await import('../modules/admin-mfa/service');
    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/mfa/verify',
      headers: buildAdminCookieHeaders(initialSession.token),
      payload: {
        enrollmentToken: enrollmentPayload.enrollmentToken,
        totpCode: generateTotpCode(enrollmentPayload.secret),
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const verifyPayload = verifyResponse.json().data as {
      token: string;
      mfaEnabled: boolean;
    };
    expect(verifyPayload.mfaEnabled).toBe(true);
    expect(verifyPayload.token).toBeTruthy();

    const [storedAdmin] = await getDb()
      .select({
        mfaEnabled: admins.mfaEnabled,
        mfaSecretCiphertext: admins.mfaSecretCiphertext,
      })
      .from(admins)
      .where(eq(admins.id, admin.id))
      .limit(1);

    expect(storedAdmin).toEqual({
      mfaEnabled: true,
      mfaSecretCiphertext: expect.any(String),
    });

    const [mfaAction] = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'admin_mfa_enable')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(mfaAction?.action).toBe('admin_mfa_enable');

    const initialSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(initialSession.token)}`,
      },
    });
    expect(initialSessionCheck.statusCode).toBe(401);

    const secondarySessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(secondarySession.token)}`,
      },
    });
    expect(secondarySessionCheck.statusCode).toBe(401);

    const rotatedSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(verifyPayload.token)}`,
      },
    });
    expect(rotatedSessionCheck.statusCode).toBe(200);

    const loginWithoutTotpResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password,
      },
    });
    expect(loginWithoutTotpResponse.statusCode).toBe(401);

    const loginWithTotpResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password,
        totpCode: generateTotpCode(enrollmentPayload.secret),
      },
    });
    expect(loginWithTotpResponse.statusCode).toBe(200);
  });

  it('revokes all user sessions from the self-service endpoint', async () => {
    const email = 'user-revoke-all@example.com';
    const password = 'secret-123';
    const user = await registerUser(email, password);
    const firstSession = await loginUser(email, password);
    const secondSession = await loginUser(email, password);

    const revokeAllResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/sessions/revoke-all',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(revokeAllResponse.statusCode).toBe(200);
    expect(revokeAllResponse.json().data).toEqual({
      revokedCount: 2,
      scope: 'all',
    });

    const sessions = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(asc(authSessions.id));

    expect(sessions).toEqual([
      { status: 'revoked', revokedReason: 'logout_all' },
      { status: 'revoked', revokedReason: 'logout_all' },
    ]);

    const firstSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });
    expect(firstSessionCheck.statusCode).toBe(401);

    const secondSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
      },
    });
    expect(secondSessionCheck.statusCode).toBe(401);

    const [revokeAllEvent] = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.email, email),
          eq(authEvents.eventType, 'user_sessions_revoked_all')
        )
      )
      .orderBy(desc(authEvents.id))
      .limit(1);

    expect(revokeAllEvent?.eventType).toBe('user_sessions_revoked_all');
  });

  it('revokes the current admin session through the HTTP endpoint', async () => {
    const email = 'admin-logout@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    const session = await loginAdmin(email, password);

    const logoutResponse = await getApp().inject({
      method: 'DELETE',
      url: '/auth/admin/session',
      headers: buildAdminCookieHeaders(session.token),
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json().data).toEqual({
      revoked: true,
      scope: 'current',
    });

    const [storedSession] = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.jti, session.sessionId))
      .limit(1);

    expect(storedSession).toEqual({
      status: 'revoked',
      revokedReason: 'logout',
    });

    const revokedResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session.token)}`,
      },
    });
    expect(revokedResponse.statusCode).toBe(401);

    const [logoutAction] = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'admin_logout')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(logoutAction?.action).toBe('admin_logout');
  });

  it('revokes all admin sessions through the HTTP endpoint', async () => {
    const email = 'admin-revoke-all@example.com';
    const { admin, user, password } = await seedAdminAccount({ email });
    const firstSession = await loginAdmin(email, password);
    const secondSession = await loginAdmin(email, password);

    const revokeAllResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/sessions/revoke-all',
      headers: buildAdminCookieHeaders(secondSession.token),
      payload: {},
    });

    expect(revokeAllResponse.statusCode).toBe(200);
    expect(revokeAllResponse.json().data).toEqual({
      revokedCount: 2,
      scope: 'all',
    });

    const sessions = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(asc(authSessions.id));

    expect(sessions).toEqual([
      { status: 'revoked', revokedReason: 'logout_all' },
      { status: 'revoked', revokedReason: 'logout_all' },
    ]);

    const firstSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(firstSession.token)}`,
      },
    });
    expect(firstSessionCheck.statusCode).toBe(401);

    const secondSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(secondSession.token)}`,
      },
    });
    expect(secondSessionCheck.statusCode).toBe(401);

    const [revokeAllAction] = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'admin_sessions_revoked_all')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(revokeAllAction?.action).toBe('admin_sessions_revoked_all');
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

  it('executeDraw keeps prize inventory and draw records consistent under concurrent requests', async () => {
    await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
    const firstUser = await seedUserWithWallet({
      email: 'draw-concurrency-a@example.com',
      withdrawableBalance: '100.00',
    });
    const secondUser = await seedUserWithWallet({
      email: 'draw-concurrency-b@example.com',
      withdrawableBalance: '100.00',
    });

    const [prize] = await getDb()
      .insert(prizes)
      .values({
        name: 'Concurrency Prize',
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

    await invalidatePoolCache();

    const [firstDraw, secondDraw] = await Promise.all([
      getExecuteDraw()(firstUser.id, {
        clientNonce: 'integration-draw-concurrency-a',
      }),
      getExecuteDraw()(secondUser.id, {
        clientNonce: 'integration-draw-concurrency-b',
      }),
    ]);

    expect([firstDraw?.status, secondDraw?.status].sort()).toEqual([
      'out_of_stock',
      'won',
    ]);

    const [storedPrize] = await getDb()
      .select({
        stock: prizes.stock,
      })
      .from(prizes)
      .where(eq(prizes.id, prize.id))
      .limit(1);

    expect(storedPrize?.stock).toBe(0);

    const storedRecords = await getDb()
      .select({
        userId: drawRecords.userId,
        status: drawRecords.status,
      })
      .from(drawRecords)
      .where(inArray(drawRecords.userId, [firstUser.id, secondUser.id]))
      .orderBy(asc(drawRecords.userId));

    expect(storedRecords).toHaveLength(2);
    expect(storedRecords.map((record) => record.status).sort()).toEqual([
      'out_of_stock',
      'won',
    ]);
  });

  it('POST /bank-cards creates cards and updates default selection', async () => {
    const user = await seedUserWithWallet({
      email: 'bank-card@example.com',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
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

  it('POST /top-ups creates a requested deposit record', async () => {
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
        providerId: deposits.providerId,
        metadata: deposits.metadata,
      })
      .from(deposits)
      .where(eq(deposits.userId, user.id))
      .limit(1);

    expect(deposit).toMatchObject({
      status: 'requested',
      amount: '25.50',
      providerId: null,
      metadata: expect.objectContaining({
        paymentFlow: 'deposit',
        processingMode: 'manual',
        manualFallbackRequired: true,
        manualFallbackReason: 'no_active_payment_provider',
        manualFallbackStatus: 'requested',
      }),
    });
  });

  it('POST /withdrawals locks balance and writes ledger entry', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal@example.com',
      withdrawableBalance: '100.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
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

    const [stored] = await getDb()
      .select({
        status: withdrawals.status,
        metadata: withdrawals.metadata,
      })
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id))
      .limit(1);

    expect(stored).toMatchObject({
      status: 'requested',
      metadata: expect.objectContaining({
        paymentFlow: 'withdrawal',
        processingMode: 'manual',
        manualFallbackRequired: true,
        manualFallbackReason: 'no_active_payment_provider',
        manualFallbackStatus: 'requested',
      }),
    });
  });

  it('POST /crypto-deposits creates a requested crypto deposit and prevents duplicate tx claims', async () => {
    const [channel] = await getDb()
      .insert(cryptoDepositChannels)
      .values({
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        receiveAddress: '0xrewarddeposit000000000000000000000000000001',
        minConfirmations: 3,
        isActive: true,
      })
      .returning();

    const user = await seedUserWithWallet({
      email: 'crypto-deposit@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/crypto-deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        channelId: channel.id,
        amountClaimed: '25.75',
        txHash: '0xcryptoDeposit0001',
        fromAddress: '0xfrom0001',
      },
    });

    expect(response.statusCode).toBe(201);

    const [deposit] = await getDb()
      .select({
        id: deposits.id,
        status: deposits.status,
        channelType: deposits.channelType,
        assetType: deposits.assetType,
        assetCode: deposits.assetCode,
        network: deposits.network,
        submittedTxHash: deposits.submittedTxHash,
      })
      .from(deposits)
      .where(eq(deposits.userId, user.id))
      .orderBy(desc(deposits.id))
      .limit(1);

    expect(deposit).toMatchObject({
      status: 'requested',
      channelType: 'crypto',
      assetType: 'token',
      assetCode: 'USDT',
      network: 'ERC20',
      submittedTxHash: '0xcryptoDeposit0001',
    });

    const [chainTransaction] = await getDb()
      .select({
        txHash: cryptoChainTransactions.txHash,
        direction: cryptoChainTransactions.direction,
        amount: cryptoChainTransactions.amount,
        confirmations: cryptoChainTransactions.confirmations,
        consumedByDepositId: cryptoChainTransactions.consumedByDepositId,
      })
      .from(cryptoChainTransactions)
      .where(eq(cryptoChainTransactions.txHash, '0xcryptoDeposit0001'))
      .limit(1);

    expect(chainTransaction).toMatchObject({
      txHash: '0xcryptoDeposit0001',
      direction: 'deposit',
      amount: '25.750000000000000000',
      confirmations: 0,
      consumedByDepositId: deposit?.id,
    });

    const duplicate = await getApp().inject({
      method: 'POST',
      url: '/crypto-deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        channelId: channel.id,
        amountClaimed: '25.75',
        txHash: '0xcryptoDeposit0001',
      },
    });

    expect(duplicate.statusCode).toBe(422);
    expect(duplicate.json().error?.message).toContain('already been claimed');
  });

  it('crypto payout addresses and withdrawals reuse the common withdrawal order flow', async () => {
    const user = await seedUserWithWallet({
      email: 'crypto-withdrawal@example.com',
      withdrawableBalance: '100.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const createAddress = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdraw-addresses',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        address: '0xwithdrawaddress000000000000000000000000000001',
        label: 'Primary wallet',
        isDefault: true,
      },
    });

    expect(createAddress.statusCode).toBe(201);
    const payoutMethodId = createAddress.json().data?.payoutMethodId as number;
    expect(payoutMethodId).toBeTruthy();

    const createWithdrawalResponse = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdrawals',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: '40.00',
        payoutMethodId,
      },
    });

    expect(createWithdrawalResponse.statusCode).toBe(201);

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

    const [storedAddress] = await getDb()
      .select({
        payoutMethodId: cryptoWithdrawAddresses.payoutMethodId,
        address: cryptoWithdrawAddresses.address,
      })
      .from(cryptoWithdrawAddresses)
      .where(eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethodId))
      .limit(1);

    expect(storedAddress?.address).toBe(
      '0xwithdrawaddress000000000000000000000000000001'
    );

    const [storedWithdrawal] = await getDb()
      .select({
        status: withdrawals.status,
        channelType: withdrawals.channelType,
        assetType: withdrawals.assetType,
        assetCode: withdrawals.assetCode,
        network: withdrawals.network,
        payoutMethodId: withdrawals.payoutMethodId,
      })
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id))
      .orderBy(desc(withdrawals.id))
      .limit(1);

    expect(storedWithdrawal).toMatchObject({
      status: 'requested',
      channelType: 'crypto',
      assetType: 'token',
      assetCode: 'USDT',
      network: 'ERC20',
      payoutMethodId,
    });
  });

  it('admin crypto deposit confirmation credits the wallet after chain review', async () => {
    const [channel] = await getDb()
      .insert(cryptoDepositChannels)
      .values({
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        receiveAddress: '0xrewarddeposit000000000000000000000000000002',
        minConfirmations: 3,
        isActive: true,
      })
      .returning();

    const user = await seedUserWithWallet({
      email: 'crypto-admin-deposit@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const depositResponse = await getApp().inject({
      method: 'POST',
      url: '/crypto-deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        channelId: channel.id,
        amountClaimed: '18.25',
        txHash: '0xcryptoDepositConfirm0001',
        fromAddress: '0xfromconfirm0001',
      },
    });

    expect(depositResponse.statusCode).toBe(201);
    const depositId = depositResponse.json().data?.id as number;

    const email = 'crypto-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantLegacyAdminPermissions(admin.id, ['finance.manage']);
    const adminSession = await enrollAdminMfa({ email, password });
    const headers = buildAdminCookieHeaders(adminSession.token);

    const confirmResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${depositId}/crypto-confirm`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        settlementReference: '0xcryptoDepositConfirm0001',
        processingChannel: 'manual_crypto',
        operatorNote: 'confirmed on chain',
        confirmations: 3,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.withdrawableBalance).toBe('18.25');

    const [deposit] = await getDb()
      .select({
        status: deposits.status,
      })
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .limit(1);

    expect(deposit?.status).toBe('credited');

    const [chainTransaction] = await getDb()
      .select({
        confirmations: cryptoChainTransactions.confirmations,
      })
      .from(cryptoChainTransactions)
      .where(eq(cryptoChainTransactions.txHash, '0xcryptoDepositConfirm0001'))
      .limit(1);

    expect(chainTransaction?.confirmations).toBe(3);

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([{ entryType: 'deposit_credit', amount: '18.25' }]);
  });

  it('admin crypto withdrawal submit and confirm flows settle through the common withdrawal FSM', async () => {
    const user = await seedUserWithWallet({
      email: 'crypto-admin-withdrawal@example.com',
      withdrawableBalance: '90.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const createAddress = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdraw-addresses',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        address: '0xwithdrawaddress000000000000000000000000000002',
        label: 'Treasury wallet',
        isDefault: true,
      },
    });
    const payoutMethodId = createAddress.json().data?.payoutMethodId as number;

    const createWithdrawalResponse = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdrawals',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: '30.00',
        payoutMethodId,
      },
    });

    expect(createWithdrawalResponse.statusCode).toBe(201);
    const withdrawalId = createWithdrawalResponse.json().data?.id as number;

    const email = 'crypto-withdraw-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantLegacyAdminPermissions(admin.id, ['finance.manage']);
    const adminSession = await enrollAdminMfa({ email, password });
    const headers = buildAdminCookieHeaders(adminSession.token);

    const approveResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${withdrawalId}/approve`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        operatorNote: 'approved for payout',
      },
    });
    expect(approveResponse.statusCode).toBe(200);

    const submitResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${withdrawalId}/crypto-submit`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        settlementReference: '0xcryptoWithdrawal0001',
        processingChannel: 'manual_crypto',
        operatorNote: 'broadcasted tx',
      },
    });
    expect(submitResponse.statusCode).toBe(200);

    const confirmResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${withdrawalId}/crypto-confirm`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        settlementReference: '0xcryptoWithdrawal0001',
        processingChannel: 'manual_crypto',
        operatorNote: 'confirmations reached',
        confirmations: 6,
      },
    });
    expect(confirmResponse.statusCode).toBe(200);

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

    const [withdrawal] = await getDb()
      .select({
        status: withdrawals.status,
        submittedTxHash: withdrawals.submittedTxHash,
      })
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    expect(withdrawal).toMatchObject({
      status: 'paid',
      submittedTxHash: '0xcryptoWithdrawal0001',
    });

    const [chainTransaction] = await getDb()
      .select({
        txHash: cryptoChainTransactions.txHash,
        confirmations: cryptoChainTransactions.confirmations,
        consumedByWithdrawalId: cryptoChainTransactions.consumedByWithdrawalId,
      })
      .from(cryptoChainTransactions)
      .where(eq(cryptoChainTransactions.txHash, '0xcryptoWithdrawal0001'))
      .limit(1);

    expect(chainTransaction).toMatchObject({
      txHash: '0xcryptoWithdrawal0001',
      confirmations: 6,
      consumedByWithdrawalId: withdrawalId,
    });

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([
      { entryType: 'withdraw_request', amount: '-30.00' },
      { entryType: 'withdraw_paid', amount: '-30.00' },
    ]);
  });

  it('stores webhook events before asynchronously advancing deposits into provider_succeeded and dedupes duplicate callbacks', async () => {
    const webhookSecret = 'integration-stripe-webhook-secret';
    process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = webhookSecret;

    await getDb().insert(paymentProviders).values({
      name: 'stripe',
      providerType: 'deposit',
      isActive: true,
      config: {
        supportsDeposit: true,
      },
    });

    const user = await seedUserWithWallet({
      email: 'payment-webhook-deposit@example.com',
    });

    const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: user.id,
      amount: '18.50',
    }));

    const payload = JSON.stringify({
      id: 'evt_deposit_success_1',
      type: 'deposit.succeeded',
      data: {
        referenceType: 'deposit',
        referenceId: requestedDeposit.id,
        status: 'succeeded',
        settlementReference: 'gw-dep-001',
      },
    });
    const signature = signPaymentWebhookPayload(webhookSecret, payload);

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signature,
      },
      payload,
    });

    expect(firstResponse.statusCode).toBe(202);
    expect(firstResponse.json().data).toMatchObject({
      accepted: true,
      duplicate: false,
      requeued: false,
      eventId: 'evt_deposit_success_1',
      signatureStatus: 'verified',
    });

    const duplicateResponse = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signature,
      },
      payload,
    });

    expect(duplicateResponse.statusCode).toBe(200);
    expect(duplicateResponse.json().data).toMatchObject({
      accepted: true,
      duplicate: true,
      requeued: false,
      eventId: 'evt_deposit_success_1',
      signatureStatus: 'verified',
    });

    const queuedEvents = await getDb()
      .select({
        eventId: paymentWebhookEvents.eventId,
        payloadRaw: paymentWebhookEvents.payloadRaw,
        receiveCount: paymentWebhookEvents.receiveCount,
        signatureStatus: paymentWebhookEvents.signatureStatus,
        processingStatus: paymentWebhookEvents.processingStatus,
      })
      .from(paymentWebhookEvents)
      .orderBy(asc(paymentWebhookEvents.id));

    expect(queuedEvents).toEqual([
      {
        eventId: 'evt_deposit_success_1',
        payloadRaw: payload,
        receiveCount: 2,
        signatureStatus: 'verified',
        processingStatus: 'pending',
      },
    ]);

    const [depositBeforeProcessing] = await getDb()
      .select({ status: deposits.status })
      .from(deposits)
      .where(eq(deposits.id, requestedDeposit.id))
      .limit(1);

    expect(depositBeforeProcessing?.status).toBe('requested');

    const webhookModule = await import('../modules/payment/webhook-service');
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

    const [processedEvent] = await getDb()
      .select({
        processingStatus: paymentWebhookEvents.processingStatus,
        processingAttempts: paymentWebhookEvents.processingAttempts,
        processingResult: paymentWebhookEvents.processingResult,
      })
      .from(paymentWebhookEvents)
      .where(eq(paymentWebhookEvents.eventId, 'evt_deposit_success_1'))
      .limit(1);

    expect(processedEvent).toMatchObject({
      processingStatus: 'processed',
      processingAttempts: 1,
      processingResult: expect.objectContaining({
        action: 'deposit_mark_provider_succeeded',
        orderType: 'deposit',
        orderId: requestedDeposit.id,
        finalOrderStatus: 'provider_succeeded',
      }),
    });

    const [depositAfterProcessing] = await getDb()
      .select({ status: deposits.status })
      .from(deposits)
      .where(eq(deposits.id, requestedDeposit.id))
      .limit(1);

    expect(depositAfterProcessing?.status).toBe('provider_succeeded');

    // Provider success moves the order to provider_succeeded but does not credit
    // the wallet until an explicit credit transition happens.
    const [wallet] = await getDb()
      .select({ withdrawableBalance: userWallets.withdrawableBalance })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.withdrawableBalance).toBe('0.00');

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([]);
  });

  it('persists invalidly signed webhook events but keeps deposits at requested', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = 'integration-stripe-webhook-secret';

    await getDb().insert(paymentProviders).values({
      name: 'stripe',
      providerType: 'deposit',
      isActive: true,
      config: {
        supportsDeposit: true,
      },
    });

    const user = await seedUserWithWallet({
      email: 'payment-webhook-invalid-signature@example.com',
    });

    const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: user.id,
      amount: '11.00',
    }));

    const payload = JSON.stringify({
      id: 'evt_deposit_invalid_sig',
      type: 'deposit.succeeded',
      data: {
        referenceType: 'deposit',
        referenceId: requestedDeposit.id,
        status: 'succeeded',
      },
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': 'sha256=deadbeef',
      },
      payload,
    });

    expect(response.statusCode).toBe(202);

    const webhookModule = await import('../modules/payment/webhook-service');
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

    const [storedEvent] = await getDb()
      .select({
        signatureStatus: paymentWebhookEvents.signatureStatus,
        processingStatus: paymentWebhookEvents.processingStatus,
        processingResult: paymentWebhookEvents.processingResult,
      })
      .from(paymentWebhookEvents)
      .where(eq(paymentWebhookEvents.eventId, 'evt_deposit_invalid_sig'))
      .limit(1);

    expect(storedEvent).toMatchObject({
      signatureStatus: 'failed',
      processingStatus: 'ignored',
      processingResult: expect.objectContaining({
        reason: 'signature_verification_failed',
      }),
    });

    const [depositRecord] = await getDb()
      .select({ status: deposits.status })
      .from(deposits)
      .where(eq(deposits.id, requestedDeposit.id))
      .limit(1);

    expect(depositRecord?.status).toBe('requested');
  });

  it('does not regress provider_succeeded deposits when delayed provider_pending webhooks arrive later', async () => {
    const webhookSecret = 'integration-stripe-webhook-secret';
    process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = webhookSecret;

    await getDb().insert(paymentProviders).values({
      name: 'stripe',
      providerType: 'deposit',
      isActive: true,
      config: {
        supportsDeposit: true,
      },
    });

    const user = await seedUserWithWallet({
      email: 'payment-webhook-delayed@example.com',
    });

    const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: user.id,
      amount: '9.90',
    }));

    const successPayload = JSON.stringify({
      id: 'evt_deposit_success_2',
      type: 'deposit.succeeded',
      data: {
        referenceType: 'deposit',
        referenceId: requestedDeposit.id,
        status: 'succeeded',
      },
    });

    await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signPaymentWebhookPayload(webhookSecret, successPayload),
      },
      payload: successPayload,
    });

    const webhookModule = await import('../modules/payment/webhook-service');
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

    const delayedPendingPayload = JSON.stringify({
      id: 'evt_deposit_pending_2',
      type: 'deposit.pending',
      data: {
        referenceType: 'deposit',
        referenceId: requestedDeposit.id,
        status: 'pending',
      },
    });

    const delayedResponse = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signPaymentWebhookPayload(
          webhookSecret,
          delayedPendingPayload
        ),
      },
      payload: delayedPendingPayload,
    });

    expect(delayedResponse.statusCode).toBe(202);
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

    const eventStates = await getDb()
      .select({
        eventId: paymentWebhookEvents.eventId,
        processingStatus: paymentWebhookEvents.processingStatus,
        processingResult: paymentWebhookEvents.processingResult,
      })
      .from(paymentWebhookEvents)
      .orderBy(asc(paymentWebhookEvents.id));

    expect(eventStates).toEqual([
      {
        eventId: 'evt_deposit_success_2',
        processingStatus: 'processed',
        processingResult: expect.objectContaining({
          action: 'deposit_mark_provider_succeeded',
        }),
      },
      {
        eventId: 'evt_deposit_pending_2',
        processingStatus: 'processed',
        processingResult: expect.objectContaining({
          action: 'deposit_mark_provider_pending',
          finalOrderStatus: 'provider_succeeded',
        }),
      },
    ]);

    const [depositRecord] = await getDb()
      .select({ status: deposits.status })
      .from(deposits)
      .where(eq(deposits.id, requestedDeposit.id))
      .limit(1);

    expect(depositRecord?.status).toBe('provider_succeeded');

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([]);
  });

  it('deposit FSM only allows requested deposits to reach credit once', async () => {
    const approvedUser = await seedUserWithWallet({
      email: 'deposit-fsm-approved@example.com',
    });

    const requestedApprovedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: approvedUser.id,
      amount: '25.50',
    }));

    expect(requestedApprovedDeposit?.status).toBe('requested');

    const providerPending = await getTopUpModule().markDepositProviderPending(
      requestedApprovedDeposit.id,
      {
        processingChannel: 'manual_bank',
        operatorNote: 'receipt queued',
      }
    );
    expect(providerPending?.status).toBe('provider_pending');

    const approved = await getTopUpModule().markDepositProviderSucceeded(
      requestedApprovedDeposit.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'dep-001',
        operatorNote: 'receipt matched',
      }
    );
    expect(approved?.status).toBe('provider_succeeded');

    const credited = await getTopUpModule().creditDeposit(requestedApprovedDeposit.id, {
      processingChannel: 'manual_bank',
      operatorNote: 'wallet credited',
    });
    expect(credited?.status).toBe('credited');

    const approvedAgain = await getTopUpModule().markDepositProviderSucceeded(
      requestedApprovedDeposit.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'dep-001',
        operatorNote: 'late provider success',
      }
    );
    expect(approvedAgain?.status).toBe('credited');

    const creditedAgain = await getTopUpModule().creditDeposit(requestedApprovedDeposit.id, {
      operatorNote: 'duplicate credit',
    });
    expect(creditedAgain?.status).toBe('credited');

    const failedAfterApprove = await getTopUpModule().failDeposit(requestedApprovedDeposit.id, {
      operatorNote: 'late fail ignored',
    });
    expect(failedAfterApprove?.status).toBe('credited');

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

    expect(approvedEntries).toEqual([{ entryType: 'deposit_credit', amount: '25.50' }]);

    expect(credited?.metadata).toMatchObject({
      financeReviewLatest: expect.objectContaining({
        action: 'deposit_credit',
        processingChannel: 'manual_bank',
        operatorNote: 'wallet credited',
      }),
      financeReviewTrail: expect.arrayContaining([
        expect.objectContaining({
          action: 'deposit_credit',
          processingChannel: 'manual_bank',
          operatorNote: 'wallet credited',
        }),
      ]),
    });

    const failedUser = await seedUserWithWallet({
      email: 'deposit-fsm-failed@example.com',
    });

    const requestedFailedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: failedUser.id,
      amount: '12.00',
    }));

    expect(requestedFailedDeposit?.status).toBe('requested');

    const failed = await getTopUpModule().failDeposit(requestedFailedDeposit.id);
    expect(failed?.status).toBe('provider_failed');

    const approvedAfterFail = await getTopUpModule().approveDeposit(requestedFailedDeposit.id);
    expect(approvedAfterFail?.status).toBe('provider_failed');

    const failedAgain = await getTopUpModule().failDeposit(requestedFailedDeposit.id);
    expect(failedAgain?.status).toBe('provider_failed');

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

  it('admin deposit state routes stay idempotent across duplicate and out-of-order submissions', async () => {
    const makerEmail = 'finance-admin-deposit-maker@example.com';
    const checkerEmail = 'finance-admin-deposit-checker@example.com';
    const maker = await seedAdminAccount({ email: makerEmail });
    const checker = await seedAdminAccount({ email: checkerEmail });
    await grantLegacyAdminPermissions(maker.admin.id, ['finance.manage']);
    await grantLegacyAdminPermissions(checker.admin.id, ['finance.manage']);
    const makerSession = await enrollAdminMfa({
      email: makerEmail,
      password: maker.password,
    });
    const checkerSession = await enrollAdminMfa({
      email: checkerEmail,
      password: checker.password,
    });

    const user = await seedUserWithWallet({
      email: 'finance-route-deposit@example.com',
    });
    const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: user.id,
      amount: '75.00',
    }));

    const makerHeaders = buildAdminCookieHeaders(makerSession.token);
    const checkerHeaders = buildAdminCookieHeaders(checkerSession.token);
    const makerReviewPayload = {
      totpCode: makerSession.totpCode,
      operatorNote: 'maker-pass',
      settlementReference: 'dep-route-001',
      processingChannel: 'manual_bank',
    };
    const checkerReviewPayload = {
      totpCode: checkerSession.totpCode,
      operatorNote: 'checker-pass',
      settlementReference: 'dep-route-001',
      processingChannel: 'manual_bank',
    };

    const [firstPending, duplicatePending] = await Promise.all([
      getApp().inject({
        method: 'PATCH',
        url: `/admin/deposits/${requestedDeposit.id}/provider-pending`,
        headers: makerHeaders,
        payload: makerReviewPayload,
      }),
      getApp().inject({
        method: 'PATCH',
        url: `/admin/deposits/${requestedDeposit.id}/provider-pending`,
        headers: makerHeaders,
        payload: makerReviewPayload,
      }),
    ]);

    expect(firstPending.statusCode).toBe(200);
    expect(duplicatePending.statusCode).toBe(200);

    const markSucceededMaker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/provider-succeeded`,
      headers: makerHeaders,
      payload: makerReviewPayload,
    });
    expect(markSucceededMaker.statusCode).toBe(200);

    const markSucceededChecker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/provider-succeeded`,
      headers: checkerHeaders,
      payload: checkerReviewPayload,
    });
    expect(markSucceededChecker.statusCode).toBe(200);

    const creditMaker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/credit`,
      headers: makerHeaders,
      payload: makerReviewPayload,
    });
    expect(creditMaker.statusCode).toBe(200);

    const creditChecker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/credit`,
      headers: checkerHeaders,
      payload: checkerReviewPayload,
    });
    expect(creditChecker.statusCode).toBe(200);

    const failAfterApprove = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/provider-fail`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'late-fail',
      },
    });
    expect(failAfterApprove.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.withdrawableBalance).toBe('75.00');

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([{ entryType: 'deposit_credit', amount: '75.00' }]);

    const [storedDeposit] = await getDb()
      .select({
        status: deposits.status,
      })
      .from(deposits)
      .where(eq(deposits.id, requestedDeposit.id))
      .limit(1);

    expect(storedDeposit?.status).toBe('credited');
  });

  it('withdrawal FSM supports requested -> approved -> provider_submitted -> provider_processing -> paid', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal-fsm-approved@example.com',
      withdrawableBalance: '100.00',
    });

    const pending = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '40.00',
    }));

    expect(pending?.status).toBe('requested');

    const approved = await getWithdrawModule().approveWithdrawal(pending.id, {
      operatorNote: 'kyc verified',
    });
    expect(approved?.status).toBe('approved');

    const approvedAgain = await getWithdrawModule().approveWithdrawal(pending.id);
    expect(approvedAgain?.status).toBe('approved');

    const submitted = await getWithdrawModule().markWithdrawalProviderSubmitted(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-001',
      }
    );
    expect(submitted?.status).toBe('provider_submitted');

    const processing = await getWithdrawModule().markWithdrawalProviderProcessing(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-001',
      }
    );
    expect(processing?.status).toBe('provider_processing');

    const paid = await getWithdrawModule().payWithdrawal(pending.id, {
      operatorNote: 'bank transfer confirmed',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-001',
    });
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
      .select({ status: withdrawals.status, metadata: withdrawals.metadata })
      .from(withdrawals)
      .where(eq(withdrawals.id, pending.id))
      .limit(1);

    expect(stored).toMatchObject({
      status: 'paid',
      metadata: expect.objectContaining({
        financeReviewLatest: expect.objectContaining({
          action: 'withdrawal_pay',
          processingChannel: 'manual_bank',
          settlementReference: 'wd-001',
        }),
        financeReviewTrail: expect.arrayContaining([
          expect.objectContaining({
            action: 'withdrawal_pay',
            processingChannel: 'manual_bank',
            settlementReference: 'wd-001',
          }),
        ]),
      }),
    });

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

  it('withdrawal FSM supports requested -> rejected and the full provider payout path to paid', async () => {
    const rejectedUser = await seedUserWithWallet({
      email: 'withdrawal-fsm-rejected@example.com',
      withdrawableBalance: '100.00',
    });

    const pendingRejected = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: rejectedUser.id,
      amount: '30.00',
    }));

    expect(pendingRejected?.status).toBe('requested');

    const rejected = await getWithdrawModule().rejectWithdrawal(pendingRejected.id);
    expect(rejected?.status).toBe('rejected');

    const approvedAfterReject = await getWithdrawModule().approveWithdrawal(pendingRejected.id);
    expect(approvedAfterReject?.status).toBe('rejected');

    const paidAfterReject = await getWithdrawModule().payWithdrawal(pendingRejected.id, {
      operatorNote: 'too-late',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-rejected-001',
    });
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

    const pendingPaid = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: paidUser.id,
      amount: '20.00',
    }));

    expect(pendingPaid?.status).toBe('requested');

    const approvedPaid = await getWithdrawModule().approveWithdrawal(pendingPaid.id, {
      operatorNote: 'approved for payout',
    });
    expect(approvedPaid?.status).toBe('approved');

    const submittedPaid = await getWithdrawModule().markWithdrawalProviderSubmitted(
      pendingPaid.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-paid-001',
      }
    );
    expect(submittedPaid?.status).toBe('provider_submitted');

    const processingPaid = await getWithdrawModule().markWithdrawalProviderProcessing(
      pendingPaid.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-paid-001',
      }
    );
    expect(processingPaid?.status).toBe('provider_processing');

    const paidDirectly = await getWithdrawModule().payWithdrawal(pendingPaid.id, {
      operatorNote: 'settled externally',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-paid-001',
    });
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

  it('keeps withdrawal funds locked at provider_failed until an explicit reverse', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal-fsm-provider-failed@example.com',
      withdrawableBalance: '90.00',
    });

    const pending = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '35.00',
    }));

    const approved = await getWithdrawModule().approveWithdrawal(pending.id, {
      operatorNote: 'approved for provider submission',
    });
    expect(approved?.status).toBe('approved');

    const submitted = await getWithdrawModule().markWithdrawalProviderSubmitted(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-failed-001',
      }
    );
    expect(submitted?.status).toBe('provider_submitted');

    const processing = await getWithdrawModule().markWithdrawalProviderProcessing(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-failed-001',
      }
    );
    expect(processing?.status).toBe('provider_processing');

    const providerFailed = await getWithdrawModule().markWithdrawalProviderFailed(
      pending.id,
      {
        operatorNote: 'provider reported failure',
        processingChannel: 'manual_bank',
        settlementReference: 'wd-failed-001',
      }
    );
    expect(providerFailed?.status).toBe('provider_failed');

    const [walletAfterFailure] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(walletAfterFailure).toEqual({
      withdrawableBalance: '55.00',
      lockedBalance: '35.00',
    });

    const entriesAfterFailure = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entriesAfterFailure).toEqual([
      { entryType: 'withdraw_request', amount: '-35.00' },
    ]);

    const reversed = await getWithdrawModule().reverseWithdrawal(pending.id, {
      operatorNote: 'funds returned after provider failure',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-failed-001-reverse',
    });
    expect(reversed?.status).toBe('reversed');

    const [walletAfterReverse] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(walletAfterReverse).toEqual({
      withdrawableBalance: '90.00',
      lockedBalance: '0.00',
    });

    const finalEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(finalEntries).toEqual([
      { entryType: 'withdraw_request', amount: '-35.00' },
      { entryType: 'withdraw_reversed_refund', amount: '35.00' },
    ]);
  });

  it('admin withdrawal routes tolerate duplicate approvals and ignore out-of-order rejects after pay', async () => {
    const makerEmail = 'finance-admin-withdraw-maker@example.com';
    const checkerEmail = 'finance-admin-withdraw-checker@example.com';
    const maker = await seedAdminAccount({ email: makerEmail });
    const checker = await seedAdminAccount({ email: checkerEmail });
    await grantLegacyAdminPermissions(maker.admin.id, ['finance.manage']);
    await grantLegacyAdminPermissions(checker.admin.id, ['finance.manage']);
    const makerSession = await enrollAdminMfa({
      email: makerEmail,
      password: maker.password,
    });
    const checkerSession = await enrollAdminMfa({
      email: checkerEmail,
      password: checker.password,
    });

    const user = await seedUserWithWallet({
      email: 'finance-route-withdraw@example.com',
      withdrawableBalance: '120.00',
    });

    const pending = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '45.00',
    }));

    const makerHeaders = buildAdminCookieHeaders(makerSession.token);
    const checkerHeaders = buildAdminCookieHeaders(checkerSession.token);

    const approveOnce = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/approve`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'approve-once',
      },
    });
    const approveTwice = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/approve`,
      headers: checkerHeaders,
      payload: {
        totpCode: checkerSession.totpCode,
        operatorNote: 'approve-twice',
      },
    });

    expect(approveOnce.statusCode).toBe(200);
    expect(approveTwice.statusCode).toBe(200);

    const providerSubmit = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/provider-submit`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'provider-submit',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });
    expect(providerSubmit.statusCode).toBe(200);

    const providerProcessing = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/provider-processing`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'provider-processing',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });
    expect(providerProcessing.statusCode).toBe(200);

    const payOnce = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/pay`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'paid-once',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });
    const payTwice = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/pay`,
      headers: checkerHeaders,
      payload: {
        totpCode: checkerSession.totpCode,
        operatorNote: 'paid-twice',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });

    expect(payOnce.statusCode).toBe(200);
    expect(payTwice.statusCode).toBe(200);

    const rejectAfterPay = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/reject`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'too-late',
      },
    });
    expect(rejectAfterPay.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '75.00',
      lockedBalance: '0.00',
    });

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([
      { entryType: 'withdraw_request', amount: '-45.00' },
      { entryType: 'withdraw_paid', amount: '-45.00' },
    ]);

    const [storedWithdrawal] = await getDb()
      .select({
        status: withdrawals.status,
      })
      .from(withdrawals)
      .where(eq(withdrawals.id, pending.id))
      .limit(1);

    expect(storedWithdrawal?.status).toBe('paid');
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

  it('admin security freeze routes lock and release a user account with step-up MFA', async () => {
    const email = 'security-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantLegacyAdminPermissions(admin.id, ['security.manage']);
    const adminSession = await enrollAdminMfa({ email, password });

    const userEmail = 'security-route-user@example.com';
    const userPassword = 'secret-123';
    const user = await registerUser(userEmail, userPassword);
    const { token } = await loginUser(userEmail, userPassword);

    const headers = buildAdminCookieHeaders(adminSession.token);

    const freezeResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/freeze-records',
      headers,
      payload: {
        userId: user.id,
        reason: 'manual_review',
        totpCode: adminSession.totpCode,
      },
    });
    expect(freezeResponse.statusCode).toBe(201);

    const frozenWallet = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(frozenWallet.statusCode).toBe(401);

    const frozenLogin = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: userEmail,
        password: userPassword,
      },
    });
    expect(frozenLogin.statusCode).toBe(423);

    const releaseResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/freeze-records/${user.id}/release`,
      headers,
      payload: {
        reason: 'review_cleared',
        totpCode: adminSession.totpCode,
      },
    });
    expect(releaseResponse.statusCode).toBe(200);

    const restoredSession = await loginUser(userEmail, userPassword);

    const releasedWallet = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${restoredSession.token}`,
      },
    });
    expect(releasedWallet.statusCode).toBe(200);
  });

  it('admin control-center system config flow creates, approves, and publishes a config change', async () => {
    const requesterEmail = 'config-requester@example.com';
    const approverEmail = 'config-approver@example.com';
    const requester = await seedAdminAccount({ email: requesterEmail });
    const approver = await seedAdminAccount({ email: approverEmail });
    await grantLegacyAdminPermissions(requester.admin.id, ['config.manage']);
    await grantLegacyAdminPermissions(approver.admin.id, ['config.manage']);

    const requesterSession = await loginAdmin(requesterEmail, requester.password);
    const approverSession = await enrollAdminMfa({
      email: approverEmail,
      password: approver.password,
    });

    const requesterHeaders = buildAdminCookieHeaders(requesterSession.token);
    const approverHeaders = buildAdminCookieHeaders(approverSession.token);

    const createDraftResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/control-center/system-config/drafts',
      headers: requesterHeaders,
      payload: {
        drawCost: '11',
        authFailureWindowMinutes: '21',
        reason: 'integration-test',
      },
    });
    expect(createDraftResponse.statusCode).toBe(201);
    const requestId = Number(createDraftResponse.json().data.id);

    const submitResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/control-center/change-requests/${requestId}/submit`,
      headers: requesterHeaders,
      payload: {
        confirmationText: `SUBMIT ${requestId}`,
      },
    });
    expect(submitResponse.statusCode).toBe(200);

    const approveResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/control-center/change-requests/${requestId}/approve`,
      headers: approverHeaders,
      payload: {},
    });
    expect(approveResponse.statusCode).toBe(200);

    const publishResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/control-center/change-requests/${requestId}/publish`,
      headers: approverHeaders,
      payload: {
        confirmationText: `PUBLISH ${requestId}`,
        totpCode: approverSession.totpCode,
      },
    });
    expect(publishResponse.statusCode).toBe(200);

    const configResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/config',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(approverSession.token)}`,
      },
    });
    expect(configResponse.statusCode).toBe(200);
    expect(configResponse.json().data).toMatchObject({
      drawCost: '11.00',
      authFailureWindowMinutes: '21.00',
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
