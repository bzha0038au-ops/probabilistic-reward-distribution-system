import 'dotenv/config';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { inArray } from 'drizzle-orm';

import {
  adminActions,
  admins,
  bankCards,
  prizes,
  systemConfig,
  userWallets,
  users,
} from '@reward/database';
import { client, db } from '../src/db';
import { grantAdminPermission } from '../src/modules/admin-permission/service';
import { recordAuthEvent } from '../src/modules/audit/service';
import { executeDraw } from '../src/modules/draw/service';
import { invalidateProbabilityPool } from '../src/modules/draw/pool-cache';
import { approveDeposit, createTopUp, failDeposit } from '../src/modules/top-up/service';
import {
  approveWithdrawal,
  createWithdrawal,
  markWithdrawalProviderProcessing,
  markWithdrawalProviderSubmitted,
  payWithdrawal,
  rejectWithdrawal,
} from '../src/modules/withdraw/service';
import { ensureUserFreeze, recordSuspiciousActivity } from '../src/modules/risk/service';
import { setPrizePoolBalance } from '../src/modules/house/service';
import { setConfigDecimal } from '../src/modules/system/store';
import {
  ADMIN_FAILURE_THRESHOLD_KEY,
  ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
  ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY,
  ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
  AUTH_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_WINDOW_MINUTES_KEY,
  DEFAULT_DRAW_COST_KEY,
  ECONOMY_MARKETING_BUDGET_KEY,
  PAYMENT_DEPOSIT_ENABLED_KEY,
  PAYMENT_MAX_DEPOSIT_KEY,
  PAYMENT_MAX_WITHDRAW_KEY,
  PAYMENT_MIN_DEPOSIT_KEY,
  PAYMENT_MIN_WITHDRAW_KEY,
  PAYMENT_WITHDRAW_ENABLED_KEY,
  PAYOUT_MAX_BIG_PER_HOUR_KEY,
  SYSTEM_LOGIN_ENABLED_KEY,
  SYSTEM_MAINTENANCE_MODE_KEY,
  SYSTEM_REGISTRATION_ENABLED_KEY,
} from '../src/modules/system/keys';

const ADMIN_EMAIL = 'admin.manual@example.com';
const ADMIN_PASSWORD = 'Admin123!';
const USER_PASSWORD = 'User123!';
const SEED_VERSION_KEY = 'manual_test.seed_version';
const SEED_VERSION = '1';
const MANUAL_PROCESSING_CHANNEL = 'manual_bank_transfer';

type SeedUserSpec = {
  email: string;
  password: string;
  role: 'user' | 'admin';
  displayName: string;
  userPoolBalance?: string;
  wallet: {
    withdrawableBalance: string;
    bonusBalance: string;
    lockedBalance: string;
    wageredAmount: string;
  };
};

const seedUsers: SeedUserSpec[] = [
  {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
    displayName: 'Manual Test Admin',
    wallet: {
      withdrawableBalance: '0.00',
      bonusBalance: '0.00',
      lockedBalance: '0.00',
      wageredAmount: '0.00',
    },
  },
  {
    email: 'alice.manual@example.com',
    password: USER_PASSWORD,
    role: 'user',
    displayName: 'Alice Manual',
    userPoolBalance: '18.00',
    wallet: {
      withdrawableBalance: '220.00',
      bonusBalance: '20.00',
      lockedBalance: '0.00',
      wageredAmount: '50.00',
    },
  },
  {
    email: 'bob.manual@example.com',
    password: USER_PASSWORD,
    role: 'user',
    displayName: 'Bob Manual',
    userPoolBalance: '10.00',
    wallet: {
      withdrawableBalance: '180.00',
      bonusBalance: '10.00',
      lockedBalance: '0.00',
      wageredAmount: '40.00',
    },
  },
  {
    email: 'carol.manual@example.com',
    password: USER_PASSWORD,
    role: 'user',
    displayName: 'Carol Manual',
    userPoolBalance: '35.00',
    wallet: {
      withdrawableBalance: '260.00',
      bonusBalance: '0.00',
      lockedBalance: '0.00',
      wageredAmount: '80.00',
    },
  },
  {
    email: 'frozen.manual@example.com',
    password: USER_PASSWORD,
    role: 'user',
    displayName: 'Frozen Manual',
    userPoolBalance: '5.00',
    wallet: {
      withdrawableBalance: '90.00',
      bonusBalance: '0.00',
      lockedBalance: '0.00',
      wageredAmount: '20.00',
    },
  },
];

const hashPassword = (password: string) => hashSync(password, genSaltSync(10));

const buildManualReview = (params: {
  note: string;
  settlementReference?: string;
  processingChannel?: string;
}) => ({
  adminId: null,
  sourceType: 'system' as const,
  operatorNote: params.note,
  settlementReference: params.settlementReference,
  processingChannel: params.processingChannel,
});

const ensureFreshSeed = async () => {
  const existing = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.email, seedUsers.map((user) => user.email)));

  if (existing.length > 0) {
    throw new Error(
      `Manual seed users already exist: ${existing.map((row) => row.email).join(', ')}`
    );
  }
};

const insertSeedUser = async (spec: SeedUserSpec) => {
  const [user] = await db
    .insert(users)
    .values({
      email: spec.email,
      passwordHash: hashPassword(spec.password),
      role: spec.role,
      userPoolBalance: spec.userPoolBalance ?? '0.00',
    })
    .returning();

  await db.insert(userWallets).values({
    userId: user.id,
    withdrawableBalance: spec.wallet.withdrawableBalance,
    bonusBalance: spec.wallet.bonusBalance,
    lockedBalance: spec.wallet.lockedBalance,
    wageredAmount: spec.wallet.wageredAmount,
  });

  return user;
};

const seedConfig = async () => {
  await Promise.all([
    setConfigDecimal(db, DEFAULT_DRAW_COST_KEY, '10', 'Manual test draw cost'),
    setConfigDecimal(db, PAYMENT_DEPOSIT_ENABLED_KEY, 1, 'Manual test deposits enabled'),
    setConfigDecimal(db, PAYMENT_WITHDRAW_ENABLED_KEY, 1, 'Manual test withdrawals enabled'),
    setConfigDecimal(db, PAYMENT_MIN_DEPOSIT_KEY, '10', 'Manual test min deposit'),
    setConfigDecimal(db, PAYMENT_MAX_DEPOSIT_KEY, '1000', 'Manual test max deposit'),
    setConfigDecimal(db, PAYMENT_MIN_WITHDRAW_KEY, '10', 'Manual test min withdraw'),
    setConfigDecimal(db, PAYMENT_MAX_WITHDRAW_KEY, '500', 'Manual test max withdraw'),
    setConfigDecimal(
      db,
      PAYOUT_MAX_BIG_PER_HOUR_KEY,
      '10',
      'Manual test max big prize per hour'
    ),
    setConfigDecimal(db, SYSTEM_REGISTRATION_ENABLED_KEY, 1, 'Manual test registration'),
    setConfigDecimal(db, SYSTEM_LOGIN_ENABLED_KEY, 1, 'Manual test login'),
    setConfigDecimal(db, SYSTEM_MAINTENANCE_MODE_KEY, 0, 'Manual test maintenance'),
    setConfigDecimal(
      db,
      AUTH_FAILURE_WINDOW_MINUTES_KEY,
      '15',
      'Manual test auth failure window'
    ),
    setConfigDecimal(
      db,
      AUTH_FAILURE_THRESHOLD_KEY,
      '8',
      'Manual test user auth failure threshold'
    ),
    setConfigDecimal(
      db,
      ADMIN_FAILURE_THRESHOLD_KEY,
      '5',
      'Manual test admin auth failure threshold'
    ),
    setConfigDecimal(
      db,
      ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY,
      '0',
      'Manual test min wager before withdraw'
    ),
    setConfigDecimal(
      db,
      ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
      '5',
      'Manual test suspicious threshold'
    ),
    setConfigDecimal(
      db,
      ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
      '0',
      'Manual test auto freeze disabled'
    ),
    setConfigDecimal(
      db,
      ECONOMY_MARKETING_BUDGET_KEY,
      '500.00',
      'Manual test marketing budget'
    ),
  ]);

  await setPrizePoolBalance(db, '300.00', {
    entryType: 'manual_seed_pool_set',
    referenceType: 'manual_seed',
  });
};

const createAdminProfile = async (userId: number, displayName: string) => {
  const [admin] = await db
    .insert(admins)
    .values({
      userId,
      displayName,
      isActive: true,
    })
    .returning();

  await Promise.all(
    ['prizes.manage', 'finance.manage', 'security.manage', 'config.manage'].map(
      (permission) => grantAdminPermission(admin.id, permission)
    )
  );

  return admin;
};

const seedBankCards = async (usersByEmail: Record<string, { id: number; displayName: string }>) => {
  const [aliceCard, bobCard, carolCard, frozenCard] = await db
    .insert(bankCards)
    .values([
      {
        userId: usersByEmail['alice.manual@example.com'].id,
        cardholderName: usersByEmail['alice.manual@example.com'].displayName,
        bankName: 'Manual Test Bank',
        brand: 'Visa',
        last4: '4242',
        isDefault: true,
        status: 'active',
      },
      {
        userId: usersByEmail['bob.manual@example.com'].id,
        cardholderName: usersByEmail['bob.manual@example.com'].displayName,
        bankName: 'Manual Test Bank',
        brand: 'Mastercard',
        last4: '5454',
        isDefault: true,
        status: 'active',
      },
      {
        userId: usersByEmail['carol.manual@example.com'].id,
        cardholderName: usersByEmail['carol.manual@example.com'].displayName,
        bankName: 'Manual Test Bank',
        brand: 'Visa',
        last4: '9898',
        isDefault: true,
        status: 'active',
      },
      {
        userId: usersByEmail['frozen.manual@example.com'].id,
        cardholderName: usersByEmail['frozen.manual@example.com'].displayName,
        bankName: 'Manual Test Bank',
        brand: 'UnionPay',
        last4: '6767',
        isDefault: true,
        status: 'active',
      },
    ])
    .returning();

  return {
    aliceCard,
    bobCard,
    carolCard,
    frozenCard,
  };
};

const seedPrizes = async () => {
  const [guaranteedPrize] = await db
    .insert(prizes)
    .values({
      name: '[Manual] Guaranteed Seed Prize',
      stock: 20,
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

  await invalidateProbabilityPool();

  return guaranteedPrize;
};

const seedExtraPrizes = async () => {
  await db.insert(prizes).values([
    {
      name: '[Manual] Cashback 10',
      stock: 50,
      weight: 20,
      poolThreshold: '0.00',
      userPoolThreshold: '0.00',
      rewardAmount: '10.00',
      payoutBudget: '300.00',
      payoutSpent: '0.00',
      payoutPeriodDays: 1,
      isActive: true,
    },
    {
      name: '[Manual] Jackpot 50',
      stock: 5,
      weight: 5,
      poolThreshold: '0.00',
      userPoolThreshold: '0.00',
      rewardAmount: '50.00',
      payoutBudget: '200.00',
      payoutSpent: '0.00',
      payoutPeriodDays: 1,
      isActive: true,
    },
    {
      name: '[Manual] Inactive Prize',
      stock: 10,
      weight: 10,
      poolThreshold: '0.00',
      userPoolThreshold: '0.00',
      rewardAmount: '3.00',
      payoutBudget: '0.00',
      payoutSpent: '0.00',
      payoutPeriodDays: 1,
      isActive: false,
    },
  ]);

  await invalidateProbabilityPool();
};

const seedFinance = async (params: {
  aliceId: number;
  bobId: number;
  carolId: number;
  frozenId: number;
  aliceCardId: number;
  bobCardId: number;
  carolCardId: number;
  frozenCardId: number;
}) => {
  const approvedDeposit = await createTopUp({
    userId: params.aliceId,
    amount: '60.00',
    referenceId: 'manual-approved-deposit',
    metadata: { scenario: 'approved' },
  });
  await approveDeposit(approvedDeposit.id);

  const pendingDeposit = await createTopUp({
    userId: params.bobId,
    amount: '35.00',
    referenceId: 'manual-pending-deposit',
    metadata: { scenario: 'pending' },
  });

  const failedDeposit = await createTopUp({
    userId: params.carolId,
    amount: '20.00',
    referenceId: 'manual-failed-deposit',
    metadata: { scenario: 'failed' },
  });
  await failDeposit(failedDeposit.id);

  const approvedWithdrawal = await createWithdrawal({
    userId: params.aliceId,
    amount: '30.00',
    bankCardId: params.aliceCardId,
    metadata: { scenario: 'approved' },
  });
  await approveWithdrawal(
    approvedWithdrawal.id,
    buildManualReview({
      note: 'Manual seed approved the withdrawal for finance review.',
    })
  );

  const paidWithdrawal = await createWithdrawal({
    userId: params.bobId,
    amount: '25.00',
    bankCardId: params.bobCardId,
    metadata: { scenario: 'paid' },
  });
  await approveWithdrawal(
    paidWithdrawal.id,
    buildManualReview({
      note: 'Manual seed approved the payout request.',
    })
  );
  await markWithdrawalProviderSubmitted(
    paidWithdrawal.id,
    buildManualReview({
      note: 'Manual seed submitted the payout to the provider.',
      processingChannel: MANUAL_PROCESSING_CHANNEL,
      settlementReference: `manual-seed-submit-${paidWithdrawal.id}`,
    })
  );
  await markWithdrawalProviderProcessing(
    paidWithdrawal.id,
    buildManualReview({
      note: 'Manual seed moved the payout into processing.',
      processingChannel: MANUAL_PROCESSING_CHANNEL,
      settlementReference: `manual-seed-processing-${paidWithdrawal.id}`,
    })
  );
  await payWithdrawal(
    paidWithdrawal.id,
    buildManualReview({
      note: 'Manual seed completed the payout.',
      processingChannel: MANUAL_PROCESSING_CHANNEL,
      settlementReference: `manual-seed-paid-${paidWithdrawal.id}`,
    })
  );

  const pendingWithdrawal = await createWithdrawal({
    userId: params.carolId,
    amount: '40.00',
    bankCardId: params.carolCardId,
    metadata: { scenario: 'pending' },
  });

  const rejectedWithdrawal = await createWithdrawal({
    userId: params.frozenId,
    amount: '15.00',
    bankCardId: params.frozenCardId,
    metadata: { scenario: 'rejected' },
  });
  await rejectWithdrawal(
    rejectedWithdrawal.id,
    buildManualReview({
      note: 'Manual seed rejected the payout request.',
    })
  );

  return {
    pendingDeposit,
    approvedWithdrawal,
    paidWithdrawal,
    pendingWithdrawal,
    rejectedWithdrawal,
  };
};

const seedAuditAndRisk = async (params: {
  adminId: number;
  aliceId: number;
  bobId: number;
  carolId: number;
  frozenId: number;
}) => {
  await Promise.all([
    recordAuthEvent({
      eventType: 'admin_login_success',
      email: ADMIN_EMAIL,
      userId: params.adminId,
      ip: '127.0.0.1',
      userAgent: 'manual-seed',
    }),
    recordAuthEvent({
      eventType: 'admin_login_failed',
      email: ADMIN_EMAIL,
      userId: params.adminId,
      ip: '127.0.0.1',
      userAgent: 'manual-seed',
      metadata: { reason: 'bad_password' },
    }),
    recordAuthEvent({
      eventType: 'user_login_success',
      email: 'alice.manual@example.com',
      userId: params.aliceId,
      ip: '127.0.0.1',
      userAgent: 'manual-seed',
    }),
    recordAuthEvent({
      eventType: 'register_success',
      email: 'bob.manual@example.com',
      userId: params.bobId,
      ip: '127.0.0.1',
      userAgent: 'manual-seed',
    }),
    recordAuthEvent({
      eventType: 'user_login_failed',
      email: 'frozen.manual@example.com',
      userId: params.frozenId,
      ip: '127.0.0.1',
      userAgent: 'manual-seed',
      metadata: { reason: 'manual_review' },
    }),
  ]);

  await recordSuspiciousActivity({
    userId: params.carolId,
    reason: 'manual_seed_review',
    metadata: { source: 'manual_seed' },
    score: 3,
  });

  await ensureUserFreeze({
    userId: params.frozenId,
    reason: 'manual_test_freeze',
  });
};

const seedAdminActions = async (adminId: number) => {
  await db.insert(adminActions).values([
    {
      adminId,
      action: 'manual_seed_create_prize',
      targetType: 'prize',
      targetId: 1,
      ip: '127.0.0.1',
      metadata: { source: 'manual_seed' },
    },
    {
      adminId,
      action: 'manual_seed_update_config',
      targetType: 'system_config',
      targetId: null,
      ip: '127.0.0.1',
      metadata: { source: 'manual_seed' },
    },
    {
      adminId,
      action: 'manual_seed_approve_deposit',
      targetType: 'deposit',
      targetId: 1,
      ip: '127.0.0.1',
      metadata: { source: 'manual_seed' },
    },
  ]);
};

const markSeedVersion = async () => {
  await db
    .insert(systemConfig)
    .values({
      configKey: SEED_VERSION_KEY,
      configValue: { value: SEED_VERSION },
      description: 'Manual test seed version',
    })
    .onConflictDoUpdate({
      target: systemConfig.configKey,
      set: {
        configValue: { value: SEED_VERSION },
        updatedAt: new Date(),
      },
    });
};

const main = async () => {
  await ensureFreshSeed();
  await seedConfig();

  const createdUsers = await Promise.all(seedUsers.map((user) => insertSeedUser(user)));
  const usersByEmail = Object.fromEntries(
    createdUsers.map((user, index) => [
      user.email,
      { id: user.id, displayName: seedUsers[index].displayName },
    ])
  ) as Record<string, { id: number; displayName: string }>;

  const adminProfile = await createAdminProfile(
    usersByEmail[ADMIN_EMAIL].id,
    usersByEmail[ADMIN_EMAIL].displayName
  );

  const cards = await seedBankCards(usersByEmail);
  await seedPrizes();

  await executeDraw(usersByEmail['alice.manual@example.com'].id, {
    clientNonce: 'manual-seed-alice-1',
  });
  await executeDraw(usersByEmail['bob.manual@example.com'].id, {
    clientNonce: 'manual-seed-bob-1',
  });

  await seedExtraPrizes();

  const finance = await seedFinance({
    aliceId: usersByEmail['alice.manual@example.com'].id,
    bobId: usersByEmail['bob.manual@example.com'].id,
    carolId: usersByEmail['carol.manual@example.com'].id,
    frozenId: usersByEmail['frozen.manual@example.com'].id,
    aliceCardId: cards.aliceCard.id,
    bobCardId: cards.bobCard.id,
    carolCardId: cards.carolCard.id,
    frozenCardId: cards.frozenCard.id,
  });

  await seedAuditAndRisk({
    adminId: usersByEmail[ADMIN_EMAIL].id,
    aliceId: usersByEmail['alice.manual@example.com'].id,
    bobId: usersByEmail['bob.manual@example.com'].id,
    carolId: usersByEmail['carol.manual@example.com'].id,
    frozenId: usersByEmail['frozen.manual@example.com'].id,
  });

  await seedAdminActions(adminProfile.id);
  await markSeedVersion();

  console.log('Manual test data inserted.');
  console.log('');
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`User login: alice.manual@example.com / ${USER_PASSWORD}`);
  console.log(`User login: bob.manual@example.com / ${USER_PASSWORD}`);
  console.log(`User login: carol.manual@example.com / ${USER_PASSWORD}`);
  console.log(`User login: frozen.manual@example.com / ${USER_PASSWORD}`);
  console.log('');
  console.log(`Pending deposit id: ${finance.pendingDeposit.id}`);
  console.log(`Approved withdrawal id: ${finance.approvedWithdrawal.id}`);
  console.log(`Paid withdrawal id: ${finance.paidWithdrawal.id}`);
  console.log(`Pending withdrawal id: ${finance.pendingWithdrawal.id}`);
  console.log(`Rejected withdrawal id: ${finance.rejectedWithdrawal.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
