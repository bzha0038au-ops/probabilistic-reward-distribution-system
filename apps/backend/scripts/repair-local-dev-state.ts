import 'dotenv/config';

import {
  fairnessAudits,
  ledgerEntries,
  predictionMarketAppeals,
  predictionMarketOracles,
  reconciliationAlerts,
  users,
  userWallets,
} from '@reward/database';
import { and, eq, inArray } from '@reward/database/orm';

import { client, db } from '../src/db';
import { auditPendingFairnessEpochs } from '../src/modules/fairness/service';
import { runPredictionMarketOracleSettlementCycle } from '../src/modules/prediction-market/service';
import { runWalletReconciliation } from '../src/modules/wallet/reconciliation-service';
import { listWalletInvariantMismatches } from '../src/modules/wallet/invariant-service';
import { toDecimal, toMoneyString } from '../src/shared/money';

const ensureDevelopmentMode = () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development') {
    throw new Error(
      `repair-local-dev-state only runs in development. Current NODE_ENV=${nodeEnv}`,
    );
  }
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const seedWalletLedger = async (params: {
  userId: number;
  withdrawableBalance: string;
  bonusBalance: string;
  lockedBalance: string;
  wageredAmount: string;
}) => {
  const withdrawableBalance = toDecimal(params.withdrawableBalance);
  const bonusBalance = toDecimal(params.bonusBalance);
  const lockedBalance = toDecimal(params.lockedBalance);
  const wageredAmount = toDecimal(params.wageredAmount);

  let withdrawableCursor = toDecimal(0);

  const fundingAmount = withdrawableBalance.plus(lockedBalance).plus(wageredAmount);
  if (fundingAmount.gt(0)) {
    await db.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'deposit_credit',
      amount: toMoneyString(fundingAmount),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.plus(fundingAmount)),
      referenceType: 'local_repair',
      metadata: { reason: 'local_repair', seedBalanceType: 'withdrawable' },
    });
    withdrawableCursor = withdrawableCursor.plus(fundingAmount);
  }

  if (lockedBalance.gt(0)) {
    await db.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'withdraw_request',
      amount: toMoneyString(lockedBalance.negated()),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.minus(lockedBalance)),
      referenceType: 'local_repair',
      metadata: { reason: 'local_repair', seedBalanceType: 'locked' },
    });
    withdrawableCursor = withdrawableCursor.minus(lockedBalance);
  }

  if (wageredAmount.gt(0)) {
    await db.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'draw_cost',
      amount: toMoneyString(wageredAmount.negated()),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.minus(wageredAmount)),
      referenceType: 'local_repair',
      metadata: { reason: 'local_repair', seedBalanceType: 'wagered' },
    });
    withdrawableCursor = withdrawableCursor.minus(wageredAmount);
  }

  if (bonusBalance.gt(0)) {
    await db.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: 'gamification_reward',
      amount: toMoneyString(bonusBalance),
      balanceBefore: '0.00',
      balanceAfter: toMoneyString(bonusBalance),
      referenceType: 'local_repair',
      metadata: { reason: 'local_repair', seedBalanceType: 'bonus' },
    });
  }
};

const repairWalletDrift = async () => {
  const mismatches = await listWalletInvariantMismatches(db);
  if (mismatches.length === 0) {
    return {
      repaired: [] as Array<{ userId: number; email: string | null }>,
      remaining: [] as typeof mismatches,
    };
  }

  const userIds = mismatches.map((mismatch) => mismatch.userId);
  const walletRows = await db
    .select({
      userId: userWallets.userId,
      withdrawableBalance: userWallets.withdrawableBalance,
      bonusBalance: userWallets.bonusBalance,
      lockedBalance: userWallets.lockedBalance,
      wageredAmount: userWallets.wageredAmount,
      email: users.email,
    })
    .from(userWallets)
    .innerJoin(users, eq(users.id, userWallets.userId))
    .where(inArray(userWallets.userId, userIds));

  const walletByUserId = new Map(walletRows.map((row) => [row.userId, row]));
  const repaired: Array<{ userId: number; email: string | null }> = [];

  for (const mismatch of mismatches) {
    const [existingLedger] = await db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, mismatch.userId))
      .limit(1);

    if (existingLedger) {
      continue;
    }

    const wallet = walletByUserId.get(mismatch.userId);
    if (!wallet) {
      continue;
    }

    await seedWalletLedger({
      userId: mismatch.userId,
      withdrawableBalance: toMoneyString(wallet.withdrawableBalance ?? 0),
      bonusBalance: toMoneyString(wallet.bonusBalance ?? 0),
      lockedBalance: toMoneyString(wallet.lockedBalance ?? 0),
      wageredAmount: toMoneyString(wallet.wageredAmount ?? 0),
    });

    repaired.push({
      userId: mismatch.userId,
      email: wallet.email,
    });
  }

  await runWalletReconciliation('manual');

  return {
    repaired,
    remaining: await listWalletInvariantMismatches(db),
  };
};

const cleanFairnessHistory = async () => {
  const deleted = await db
    .delete(fairnessAudits)
    .where(eq(fairnessAudits.failureCode, 'seed_missing'))
    .returning({ id: fairnessAudits.id });

  const cycle = await auditPendingFairnessEpochs(db);

  return {
    deletedCount: deleted.length,
    cycle,
  };
};

const isPlaceholderApiPullConfig = (value: unknown) => {
  const config = toRecord(value);
  const url = Reflect.get(config, 'url');
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname === 'example.com' || parsed.hostname.endsWith('.example.com');
  } catch {
    return false;
  }
};

const repairPredictionMarketOraclePlaceholders = async () => {
  const oracles = await db
    .select()
    .from(predictionMarketOracles)
    .where(eq(predictionMarketOracles.provider, 'api_pull'));

  const repairedMarketIds: number[] = [];

  for (const oracle of oracles) {
    if (!isPlaceholderApiPullConfig(oracle.config)) {
      continue;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(predictionMarketOracles)
        .set({
          provider: 'manual_admin',
          status: 'manual_only',
          config: {},
          metadata: {
            ...toRecord(oracle.metadata),
            localRepair: {
              repairedAt: now.toISOString(),
              previousProvider: oracle.provider,
              previousConfig: oracle.config,
              reason: 'placeholder_api_pull_config',
            },
          },
          lastCheckedAt: now,
          lastPayloadHash: null,
          lastPayload: null,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(predictionMarketOracles.id, oracle.id));

      await tx
        .update(predictionMarketAppeals)
        .set({
          status: 'resolved',
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(predictionMarketAppeals.marketId, oracle.marketId),
            inArray(predictionMarketAppeals.status, ['open', 'acknowledged']),
          ),
        );
    });

    repairedMarketIds.push(oracle.marketId);
  }

  const cycle = await runPredictionMarketOracleSettlementCycle();

  return {
    repairedMarketIds,
    cycle,
  };
};

const countOpenWalletAlerts = async () => {
  const alerts = await db
    .select({ id: reconciliationAlerts.id })
    .from(reconciliationAlerts)
    .where(eq(reconciliationAlerts.status, 'open'));

  return alerts.length;
};

const main = async () => {
  ensureDevelopmentMode();

  const wallet = await repairWalletDrift();
  const fairness = await cleanFairnessHistory();
  const oracle = await repairPredictionMarketOraclePlaceholders();
  const openWalletAlerts = await countOpenWalletAlerts();

  console.log('local-dev repair completed');
  console.log(
    JSON.stringify(
      {
        wallet: {
          repairedUsers: wallet.repaired,
          remainingMismatchCount: wallet.remaining.length,
          openAlertCount: openWalletAlerts,
        },
        fairness,
        predictionMarketOracle: oracle,
      },
      null,
      2,
    ),
  );

  if (wallet.remaining.length > 0) {
    throw new Error(
      `Wallet reconciliation still has ${wallet.remaining.length} mismatch(es).`,
    );
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
