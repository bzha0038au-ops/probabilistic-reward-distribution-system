import 'dotenv/config';

import { and, asc, desc, eq, inArray } from '@reward/database/orm';
import { createHash, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, type TestOptions, vi } from 'vitest';
import {
  adminActions,
  adminPermissions,
  admins,
  authSessions,
  authEvents,
  authTokens,
  bankCards,
  blackjackGames,
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
  quickEightRounds,
  systemConfig,
  userWallets,
  users,
  withdrawals,
} from '@reward/database';
import {
  CONFIG_ADMIN_PERMISSION_KEYS,
  DEFAULT_ADMIN_PERMISSION_KEYS,
  FINANCE_ADMIN_PERMISSION_KEYS,
  SECURITY_ADMIN_PERMISSION_KEYS,
  type AdminPermissionKey,
} from '../modules/admin-permission/definitions';

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
  // Always run incremental migrations so newly added SQL files are applied even
  // when the test database already has an older drizzle journal.
  await migrate(getDb(), { migrationsFolder });
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

const seedQuickEightScenario = async (params?: {
  email?: string;
  withdrawableBalance?: string;
  prizePoolBalance?: string;
}) => {
  const user = await seedUserWithWallet({
    email: params?.email ?? 'quick-eight-user@example.com',
    withdrawableBalance: params?.withdrawableBalance ?? '100.00',
  });

  await getDb()
    .insert(houseAccount)
    .values({
      id: 1,
      prizePoolBalance: params?.prizePoolBalance ?? '50000.00',
    })
    .onConflictDoUpdate({
      target: houseAccount.id,
      set: {
        prizePoolBalance: params?.prizePoolBalance ?? '50000.00',
        updatedAt: new Date(),
      },
    });

  return user;
};

const seedBlackjackScenario = async (params?: {
  email?: string;
  withdrawableBalance?: string;
  prizePoolBalance?: string;
}) =>
  seedQuickEightScenario({
    email: params?.email ?? 'blackjack-user@example.com',
    withdrawableBalance: params?.withdrawableBalance ?? '100.00',
    prizePoolBalance: params?.prizePoolBalance ?? '1000.00',
  });

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

const findBlackjackClientNonce = async (params: {
  userId: number;
  prefix: string;
  attempts?: number;
  predicate: (
    preview: Awaited<
      ReturnType<
        (typeof import('../modules/blackjack/service'))['drawBlackjackDeck']
      >
    >,
    helpers: {
      scoreBlackjackCards: (typeof import('../modules/blackjack/service'))['scoreBlackjackCards'];
    }
  ) => boolean;
}) => {
  const { ensureFairnessSeed } = await import('../modules/fairness/service');
  const {
    drawBlackjackDeck,
    scoreBlackjackCards,
  } = await import('../modules/blackjack/service');
  const fairnessSeed = await ensureFairnessSeed(getDb());

  for (let attempt = 0; attempt < (params.attempts ?? 10000); attempt += 1) {
    const candidate = `${params.prefix}-${attempt}`;
    const preview = drawBlackjackDeck({
      seed: fairnessSeed.seed,
      userId: params.userId,
      clientNonce: candidate,
    });
    if (params.predicate(preview, { scoreBlackjackCards })) {
      return candidate;
    }
  }

  throw new Error(`Unable to find blackjack nonce for ${params.prefix}.`);
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

const grantAdminPermissions = async (
  adminId: number,
  permissionKeys: readonly AdminPermissionKey[] = DEFAULT_ADMIN_PERMISSION_KEYS
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

type IntegrationTestTag = 'critical';
type IntegrationTestFn = () => Promise<unknown> | unknown;
type IntegrationTestOptions = TestOptions & {
  tag?: IntegrationTestTag | IntegrationTestTag[];
};

const activeIntegrationTags = new Set(
  (process.env.INTEGRATION_TEST_TAGS ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) as IntegrationTestTag[]
);

const normalizeIntegrationTags = (
  tag: IntegrationTestOptions['tag']
): IntegrationTestTag[] => {
  if (!tag) {
    return [];
  }

  return Array.isArray(tag) ? tag : [tag];
};

const shouldRunIntegrationTest = (tags: IntegrationTestTag[]) =>
  activeIntegrationTags.size === 0 || tags.some((tag) => activeIntegrationTags.has(tag));

const INTEGRATION_HOOK_TIMEOUT_MS = 60_000;

const initializeRuntime = async () => {
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
  app = await appModule.buildApp();
};

const teardownRuntime = async () => {
  if (app) {
    await app.close();
    app = null;
  }

  if (client) {
    await client.end();
    client = null;
  }

  db = null;
  executeDraw = null;
  topUpModule = null;
  withdrawModule = null;
  riskModule = null;
  createUserSessionToken = null;
};

export const describeIntegrationSuite = (name: string, register: () => void) => {
  describeIntegration(name, () => {
    beforeAll(async () => {
      await initializeRuntime();
    }, INTEGRATION_HOOK_TIMEOUT_MS);

    beforeEach(async () => {
      await resetDatabase();
      resetAuthNotificationCaptures();
    }, INTEGRATION_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await teardownRuntime();
    }, INTEGRATION_HOOK_TIMEOUT_MS);

    register();
  });
};

export const itIntegration = (
  name: string,
  optionsOrFn: IntegrationTestOptions | IntegrationTestFn,
  maybeFn?: IntegrationTestFn
) => {
  const hasOptions = typeof optionsOrFn !== 'function';
  const options = hasOptions ? optionsOrFn : undefined;
  const fn = (hasOptions ? maybeFn : optionsOrFn) as IntegrationTestFn | undefined;

  if (!fn) {
    throw new Error('Missing integration test handler for ' + name + '.');
  }

  const tags = normalizeIntegrationTags(options?.tag);
  const shouldRun = shouldRunIntegrationTest(tags);
  const { tag, ...testOptions } = options ?? {};
  void tag;

  if (shouldRun) {
    return options ? it(name, testOptions, fn) : it(name, fn);
  }

  return it(name, { ...testOptions, skip: true }, fn);
};

export {
  ADMIN_ORIGIN,
  ADMIN_SESSION_COOKIE,
  CONFIG_ADMIN_PERMISSION_KEYS,
  CSRF_COOKIE,
  CSRF_HEADER,
  FINANCE_ADMIN_PERMISSION_KEYS,
  SECURITY_ADMIN_PERMISSION_KEYS,
  TEST_CSRF_TOKEN,
  adminActions,
  adminPermissions,
  admins,
  and,
  asc,
  authEvents,
  authNotificationCaptures,
  authSessions,
  authTokens,
  bankCards,
  blackjackGames,
  buildAdminCookieHeaders,
  createHash,
  createHmac,
  cryptoChainTransactions,
  cryptoDepositChannels,
  cryptoWithdrawAddresses,
  deposits,
  desc,
  drawRecords,
  enrollAdminMfa,
  eq,
  expect,
  expectPresent,
  extractTokenFromUrl,
  fairnessSeeds,
  findBlackjackClientNonce,
  freezeRecords,
  getApp,
  getCreateUserSessionToken,
  getDb,
  getExecuteDraw,
  getRiskModule,
  getTopUpModule,
  getWithdrawModule,
  grantAdminPermissions,
  houseAccount,
  inArray,
  invalidatePoolCache,
  ledgerEntries,
  loginAdmin,
  loginUser,
  paymentProviders,
  paymentWebhookEvents,
  prizes,
  quickEightRounds,
  registerUser,
  seedAdminAccount,
  seedBlackjackScenario,
  seedDrawScenario,
  seedQuickEightScenario,
  seedUserWithWallet,
  setConfigNumber,
  signPaymentWebhookPayload,
  systemConfig,
  userWallets,
  users,
  vi,
  verifyUserContacts,
  withdrawals,
};
