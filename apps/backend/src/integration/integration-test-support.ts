import 'dotenv/config';

import { and, asc, desc, eq, inArray, sql } from '@reward/database/orm';
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
  kycDocuments,
  kycProfiles,
  kycReviewEvents,
  ledgerEntries,
  legalDocumentAcceptances,
  legalDocumentPublications,
  legalDocuments,
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
import type { KycTier } from '@reward/shared-types/kyc';
import { getConfig } from '../shared/config';
import { toDecimal, toMoneyString } from '../shared/money';
import { resetInMemoryRateLimiters } from '../shared/rate-limit';
import { getRedis } from '../shared/redis';

process.env.NODE_ENV ||= 'test';
process.env.ADMIN_JWT_SECRET ||= 'integration-admin-secret-1234567890';
process.env.USER_JWT_SECRET ||= 'integration-user-secret-1234567890';
process.env.ADMIN_MFA_BREAK_GLASS_SECRET ||=
  'integration-break-glass-secret-1234567890';

const KYC_TIER_RANK: Record<KycTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
};

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
  amlReview: [] as Array<Record<string, unknown>>,
  saasTenantInvite: [] as Array<Record<string, unknown>>,
  saasOnboardingComplete: [] as Array<Record<string, unknown>>,
}));

vi.mock('../modules/auth/notification-service', async () => {
  const actual = await vi.importActual<
    typeof import('../modules/auth/notification-service')
  >('../modules/auth/notification-service');

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
    ...actual,
    NotificationThrottleError,
    NotificationProviderUnavailableError,
    assertNotificationChannelAvailable: vi.fn(() => undefined),
    normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
    normalizePhone: vi.fn((phone: string) =>
      phone.trim().replace(/[^\d+]/g, '')
    ),
    normalizeRecipient: vi.fn((channel: string, recipient: string) =>
      channel === 'email'
        ? recipient.trim().toLowerCase()
        : recipient.trim().replace(/[^\d+]/g, '')
    ),
    getNotificationProviderStatus: vi.fn(() => ({
      emailProvider: 'mock',
      smsProvider: 'mock',
      pushProvider: 'expo_push',
    })),
    processPendingAuthNotifications: vi.fn(async () => 0),
    recoverStuckAuthNotifications: vi.fn(async () => 0),
    registerAuthNotificationEnqueueHook: vi.fn(() => undefined),
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
    sendAmlReviewNotification: vi.fn(async (payload) => {
      authNotificationCaptures.amlReview.push(payload);
      return true;
    }),
    sendSaasTenantInviteNotification: vi.fn(async (payload) => {
      authNotificationCaptures.saasTenantInvite.push(payload);
      return true;
    }),
    sendSaasOnboardingCompleteNotification: vi.fn(async (payload) => {
      authNotificationCaptures.saasOnboardingComplete.push(payload);
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
const TEST_ADMIN_BREAK_GLASS_CODE = process.env.ADMIN_MFA_BREAK_GLASS_SECRET!;

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
let appPromise: Promise<Awaited<ReturnType<AppModule['buildApp']>>> | null = null;
let appModulePromise: Promise<AppModule> | null = null;
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

const ensureApp = async () => {
  if (app) {
    return app;
  }

  if (!appPromise) {
    const modulePromise = appModulePromise ?? import('../app');
    appModulePromise = modulePromise;

    appPromise = modulePromise
      .then(({ buildApp }) => buildApp())
      .then((instance) => {
        app = instance;
        return instance;
      });
  }

  return appPromise;
};

const getApp = () => {
  return {
    inject: async (options: AppInjectOptions) =>
      (await ensureApp()).inject({
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

const clearRedisKeysByPatterns = async (patterns: string[]) => {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  for (const pattern of patterns) {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  }
};

const resetSharedCaches = async () => {
  const { rateLimitRedisPrefix } = getConfig();
  await clearRedisKeysByPatterns([
    `${rateLimitRedisPrefix}:*`,
    'saas:reward-envelope:*',
    'reward:draw:probability_pool:v1',
  ]);

  const { invalidateProbabilityPool } = await import(
    '../modules/draw/pool-cache'
  );
  await invalidateProbabilityPool();
};

const signPaymentWebhookPayload = (secret: string, payload: string) =>
  `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

const seedWalletLedger = async (params: {
  userId: number;
  withdrawableBalance: string;
  bonusBalance: string;
  lockedBalance: string;
  wageredAmount: string;
}) => {
  const database = getDb();
  const withdrawableBalance = toDecimal(params.withdrawableBalance);
  const bonusBalance = toDecimal(params.bonusBalance);
  const lockedBalance = toDecimal(params.lockedBalance);
  const wageredAmount = toDecimal(params.wageredAmount);

  if (
    withdrawableBalance.lt(0) ||
    bonusBalance.lt(0) ||
    lockedBalance.lt(0) ||
    wageredAmount.lt(0)
  ) {
    throw new Error('seedUserWithWallet only supports non-negative balances.');
  }

  let withdrawableCursor = toDecimal(0);

  const fundingAmount = withdrawableBalance.plus(lockedBalance).plus(wageredAmount);
  if (fundingAmount.gt(0)) {
    await database.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'deposit_credit',
      amount: toMoneyString(fundingAmount),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.plus(fundingAmount)),
      referenceType: 'integration_seed',
      metadata: { reason: 'integration_seed', seedBalanceType: 'withdrawable' },
    });
    withdrawableCursor = withdrawableCursor.plus(fundingAmount);
  }

  if (lockedBalance.gt(0)) {
    await database.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'withdraw_request',
      amount: toMoneyString(lockedBalance.negated()),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.minus(lockedBalance)),
      referenceType: 'integration_seed',
      metadata: { reason: 'integration_seed', seedBalanceType: 'locked' },
    });
    withdrawableCursor = withdrawableCursor.minus(lockedBalance);
  }

  if (wageredAmount.gt(0)) {
    await database.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'draw_cost',
      amount: toMoneyString(wageredAmount.negated()),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.minus(wageredAmount)),
      referenceType: 'integration_seed',
      metadata: { reason: 'integration_seed', seedBalanceType: 'wagered' },
    });
    withdrawableCursor = withdrawableCursor.minus(wageredAmount);
  }

  if (bonusBalance.gt(0)) {
    await database.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'gamification_reward',
      amount: toMoneyString(bonusBalance),
      balanceBefore: '0.00',
      balanceAfter: toMoneyString(bonusBalance),
      referenceType: 'integration_seed',
      metadata: { reason: 'integration_seed', seedBalanceType: 'bonus' },
    });
  }
};

async function seedDrawScenario(params?: {
  email?: string;
}): Promise<{
  user: typeof users.$inferSelect;
  prize: typeof prizes.$inferSelect;
}> {
  const database = getDb();
  await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
  const user = await seedUserWithWallet({
    email: params?.email ?? 'draw-user@example.com',
    withdrawableBalance: '100.00',
  });
  await seedApprovedKycProfile(user.id, 'tier_1');

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
}

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

  await seedWalletLedger({
    userId: user.id,
    withdrawableBalance: params.withdrawableBalance ?? '0.00',
    bonusBalance: params.bonusBalance ?? '0.00',
    lockedBalance: params.lockedBalance ?? '0.00',
    wageredAmount: params.wageredAmount ?? '0.00',
  });

  return user;
};

const listUserLedgerEntries = async (
  userId: number,
  options?: { includeIntegrationSeed?: boolean }
) =>
  getDb()
    .select({
      id: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      amount: ledgerEntries.amount,
      referenceType: ledgerEntries.referenceType,
      referenceId: ledgerEntries.referenceId,
      metadata: ledgerEntries.metadata,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        options?.includeIntegrationSeed
          ? sql`true`
          : sql`${ledgerEntries.referenceType} IS DISTINCT FROM 'integration_seed'`
      )
    )
    .orderBy(asc(ledgerEntries.id));

const seedQuickEightScenario = async (params?: {
  email?: string;
  withdrawableBalance?: string;
  prizePoolBalance?: string;
}) => {
  const user = await seedUserWithWallet({
    email: params?.email ?? 'quick-eight-user@example.com',
    withdrawableBalance: params?.withdrawableBalance ?? '100.00',
  });
  await seedApprovedKycProfile(user.id, 'tier_1');

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

const seedApprovedKycProfile = async (userId: number, targetTier: KycTier) => {
  const now = new Date();
  const [existing] = await getDb()
    .select({
      id: kycProfiles.id,
      currentTier: kycProfiles.currentTier,
    })
    .from(kycProfiles)
    .where(eq(kycProfiles.userId, userId))
    .limit(1);

  if (!existing) {
    await getDb().insert(kycProfiles).values({
      userId,
      currentTier: targetTier,
      status: 'approved',
      submittedAt: now,
      reviewedAt: now,
      updatedAt: now,
    });
    return;
  }

  const currentTier =
    KYC_TIER_RANK[existing.currentTier as KycTier] >= KYC_TIER_RANK[targetTier]
      ? (existing.currentTier as KycTier)
      : targetTier;

  await getDb()
    .update(kycProfiles)
    .set({
      currentTier,
      requestedTier: null,
      status: 'approved',
      rejectionReason: null,
      freezeRecordId: null,
      reviewedByAdminId: null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(kycProfiles.id, existing.id));
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

  const targetTier = requirements.phone
    ? 'tier_2'
    : requirements.email
      ? 'tier_1'
      : null;
  if (user && targetTier) {
    await seedApprovedKycProfile(user.id, targetTier);
  }

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
  authNotificationCaptures.amlReview.length = 0;
  authNotificationCaptures.saasTenantInvite.length = 0;
  authNotificationCaptures.saasOnboardingComplete.length = 0;
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
});

const buildAdminBreakGlassHeaders = (token: string) => ({
  ...buildAdminCookieHeaders(token),
  'x-admin-break-glass-code': TEST_ADMIN_BREAK_GLASS_CODE,
});

const buildUserAuthHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const registerUser = async (
  email: string,
  password = 'secret-123',
  referrerId?: number,
) => {
  const legalDocumentsResponse = await getApp().inject({
    method: 'GET',
    url: '/legal/current',
  });

  expect(legalDocumentsResponse.statusCode).toBe(200);
  const legalPayload = legalDocumentsResponse.json().data as {
    items: Array<{ slug: string; version: string }>;
  };

  const response = await getApp().inject({
    method: 'POST',
    url: '/auth/register',
    headers: {
      'content-type': 'application/json',
    },
    payload: {
      email,
      password,
      birthDate: '1990-01-01',
      ...(referrerId ? { referrerId } : {}),
      legalAcceptances: legalPayload.items.map((document) => ({
        slug: document.slug,
        version: document.version,
      })),
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
  const { verifyAdminCredentials } = await import('../modules/auth/service');
  const {
    confirmAdminMfaEnrollment,
    createAdminMfaEnrollment,
    generateTotpCode,
  } = await import('../modules/admin-mfa/service');
  const { createAdminSessionToken } = await import('../shared/admin-session');

  const verified = await verifyAdminCredentials(params.email, params.password);
  expect(verified).toBeTruthy();
  if (!verified) {
    throw new Error(`Unable to verify admin credentials for ${params.email}.`);
  }

  const initialSession = await createAdminSessionToken({
    adminId: verified.admin.id,
    userId: verified.user.id,
    email: verified.user.email,
    role: 'admin',
    mfaEnabled: false,
    mfaRecoveryMode: 'none',
  });

  const enrollment = await createAdminMfaEnrollment({
    adminId: verified.admin.id,
    email: verified.user.email,
    mfaEnabled: verified.admin.mfaEnabled,
  });
  const totpCode = generateTotpCode(enrollment.secret);
  const confirmed = await confirmAdminMfaEnrollment({
    currentAdmin: {
      adminId: verified.admin.id,
      userId: verified.user.id,
      email: verified.user.email,
      sessionId: initialSession.sessionId,
    },
    enrollmentToken: enrollment.enrollmentToken,
    totpCode,
  });

  return {
    token: confirmed.token,
    totpCode,
  };
};

const enrollUserMfa = async (params: { token: string }) => {
  const enrollmentResponse = await getApp().inject({
    method: 'POST',
    url: '/auth/user/mfa/enrollment',
    headers: buildUserAuthHeaders(params.token),
    payload: {},
  });

  expect(enrollmentResponse.statusCode).toBe(201);
  const enrollmentPayload = enrollmentResponse.json().data as {
    secret: string;
    enrollmentToken: string;
  };

  const { generateTotpCode } = await import('../modules/mfa/totp');
  const totpCode = generateTotpCode(enrollmentPayload.secret);
  const verifyResponse = await getApp().inject({
    method: 'POST',
    url: '/auth/user/mfa/verify',
    headers: buildUserAuthHeaders(params.token),
    payload: {
      enrollmentToken: enrollmentPayload.enrollmentToken,
      totpCode,
    },
  });

  expect(verifyResponse.statusCode).toBe(200);

  return {
    secret: enrollmentPayload.secret,
    totpCode,
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

const readTimeoutOverride = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const INTEGRATION_TEST_TIMEOUT_MS = readTimeoutOverride(
  'INTEGRATION_TEST_TIMEOUT_MS',
  45_000,
);
const INTEGRATION_HOOK_TIMEOUT_MS = readTimeoutOverride(
  'INTEGRATION_HOOK_TIMEOUT_MS',
  180_000,
);

const initializeRuntime = async () => {
  const dbModule = await import('../db');
  const drawModule = await import('../modules/draw/service');
  const topUpServiceModule = await import('../modules/top-up');
  const withdrawServiceModule = await import('../modules/withdraw/service');
  const riskServiceModule = await import('../modules/risk/service');
  const userSessionModule = await import('../shared/user-session');

  db = dbModule.db;
  client = dbModule.client;
  await ensureMigrationsApplied();
  appModulePromise = null;
  executeDraw = drawModule.executeDraw;
  topUpModule = topUpServiceModule;
  withdrawModule = withdrawServiceModule;
  riskModule = riskServiceModule;
  createUserSessionToken = userSessionModule.createUserSessionToken;
};

const teardownRuntime = async () => {
  if (app) {
    await app.close();
    app = null;
  }

  appPromise = null;
  appModulePromise = null;

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
      await resetSharedCaches();
      resetInMemoryRateLimiters();
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
  const options = hasOptions
    ? {
        timeout: INTEGRATION_TEST_TIMEOUT_MS,
        ...optionsOrFn,
      }
    : {
        timeout: INTEGRATION_TEST_TIMEOUT_MS,
      };
  const fn = (hasOptions ? maybeFn : optionsOrFn) as IntegrationTestFn | undefined;

  if (!fn) {
    throw new Error('Missing integration test handler for ' + name + '.');
  }

  const tags = normalizeIntegrationTags(options?.tag);
  const shouldRun = shouldRunIntegrationTest(tags);
  const { tag, ...testOptions } = options ?? {};
  void tag;

  if (shouldRun) {
    return it(name, testOptions, fn);
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
  TEST_ADMIN_BREAK_GLASS_CODE,
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
  buildAdminBreakGlassHeaders,
  buildAdminCookieHeaders,
  buildUserAuthHeaders,
  createHash,
  createHmac,
  cryptoChainTransactions,
  cryptoDepositChannels,
  cryptoWithdrawAddresses,
  deposits,
  desc,
  drawRecords,
  enrollAdminMfa,
  enrollUserMfa,
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
  kycDocuments,
  kycProfiles,
  kycReviewEvents,
  ledgerEntries,
  legalDocumentAcceptances,
  legalDocumentPublications,
  legalDocuments,
  loginAdmin,
  loginUser,
  listUserLedgerEntries,
  paymentProviders,
  paymentWebhookEvents,
  prizes,
  quickEightRounds,
  registerUser,
  seedAdminAccount,
  seedBlackjackScenario,
  seedApprovedKycProfile,
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
