import { reconciliationAlerts, walletReconciliationRuns } from '@reward/database';
import { and, eq, sql } from '@reward/database/orm';

import { db } from '../../db';
import { logger } from '../../shared/logger';
import {
  countWalletInvariantSubjects,
  listWalletInvariantMismatches,
  type WalletInvariantMismatch,
} from './invariant-service';

export type WalletReconciliationRunTrigger = 'manual' | 'scheduled';
export type WalletReconciliationRunStatus = 'completed' | 'failed';

const WALLET_RECONCILIATION_ALERT_TYPE = 'wallet_balance_drift';
const AUTO_RESOLVABLE_RECONCILIATION_STATUSES = ['open'] as const;

const createRun = async (trigger: WalletReconciliationRunTrigger) => {
  const now = new Date();
  const [created] = await db
    .insert(walletReconciliationRuns)
    .values({
      trigger,
      status: 'running',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

const finishRun = async (
  runId: number,
  status: WalletReconciliationRunStatus,
  summary: {
    scannedUsers: number;
    mismatchedUsers: number;
    resolvedUsers?: number;
    unknownEntryTypeUsers?: number;
    error?: string;
  }
) => {
  const now = new Date();
  await db
    .update(walletReconciliationRuns)
    .set({
      status,
      scannedUsers: summary.scannedUsers,
      mismatchedUsers: summary.mismatchedUsers,
      summary,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(walletReconciliationRuns.id, runId));
};

const buildFingerprint = (userId: number) =>
  `${WALLET_RECONCILIATION_ALERT_TYPE}:user:${String(userId)}`;

const buildAlertMetadata = (mismatch: WalletInvariantMismatch) => ({
  deltas: {
    withdrawable: {
      expected: mismatch.expectedWithdrawableBalance,
      actual: mismatch.actualWithdrawableBalance,
    },
    bonus: {
      expected: mismatch.expectedBonusBalance,
      actual: mismatch.actualBonusBalance,
    },
    locked: {
      expected: mismatch.expectedLockedBalance,
      actual: mismatch.actualLockedBalance,
    },
    wagered: {
      expected: mismatch.expectedWageredAmount,
      actual: mismatch.actualWageredAmount,
    },
    total: {
      expected: mismatch.expectedTotal,
      actual: mismatch.actualTotal,
    },
  },
  unknownEntryTypes: mismatch.unknownEntryTypes,
});

const mergeAlertMetadata = (
  currentMetadata: unknown,
  nextMetadata: ReturnType<typeof buildAlertMetadata>
) => ({
  ...(
    typeof currentMetadata === 'object' &&
    currentMetadata !== null &&
    !Array.isArray(currentMetadata)
      ? currentMetadata
      : {}
  ),
  ...nextMetadata,
});

const upsertAlert = async (runId: number, mismatch: WalletInvariantMismatch) => {
  const now = new Date();
  const metadata = buildAlertMetadata(mismatch);
  const fingerprint = buildFingerprint(mismatch.userId);
  const [existing] = await db
    .select({
      id: reconciliationAlerts.id,
      status: reconciliationAlerts.status,
      metadata: reconciliationAlerts.metadata,
    })
    .from(reconciliationAlerts)
    .where(eq(reconciliationAlerts.fingerprint, fingerprint))
    .limit(1);

  if (!existing) {
    await db.insert(reconciliationAlerts).values({
      runId,
      userId: mismatch.userId,
      fingerprint,
      alertType: WALLET_RECONCILIATION_ALERT_TYPE,
      severity: 'critical',
      status: 'open',
      expectedWithdrawableBalance: mismatch.expectedWithdrawableBalance,
      actualWithdrawableBalance: mismatch.actualWithdrawableBalance,
      expectedBonusBalance: mismatch.expectedBonusBalance,
      actualBonusBalance: mismatch.actualBonusBalance,
      expectedLockedBalance: mismatch.expectedLockedBalance,
      actualLockedBalance: mismatch.actualLockedBalance,
      expectedWageredAmount: mismatch.expectedWageredAmount,
      actualWageredAmount: mismatch.actualWageredAmount,
      expectedTotal: mismatch.expectedTotal,
      actualTotal: mismatch.actualTotal,
      metadata,
      firstDetectedAt: now,
      lastDetectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return;
  }

  await db
    .update(reconciliationAlerts)
    .set({
      runId,
      userId: mismatch.userId,
      status:
        existing.status === 'acknowledged' ||
        existing.status === 'require_engineering'
          ? existing.status
          : 'open',
      severity: 'critical',
      expectedWithdrawableBalance: mismatch.expectedWithdrawableBalance,
      actualWithdrawableBalance: mismatch.actualWithdrawableBalance,
      expectedBonusBalance: mismatch.expectedBonusBalance,
      actualBonusBalance: mismatch.actualBonusBalance,
      expectedLockedBalance: mismatch.expectedLockedBalance,
      actualLockedBalance: mismatch.actualLockedBalance,
      expectedWageredAmount: mismatch.expectedWageredAmount,
      actualWageredAmount: mismatch.actualWageredAmount,
      expectedTotal: mismatch.expectedTotal,
      actualTotal: mismatch.actualTotal,
      metadata: mergeAlertMetadata(existing.metadata, metadata),
      lastDetectedAt: now,
      resolvedAt: null,
      updatedAt: now,
    })
    .where(eq(reconciliationAlerts.id, existing.id));
};

const readCountFromRows = (result: unknown) => {
  const rows = Array.isArray(result)
    ? result
    : typeof result === 'object' &&
        result !== null &&
        Array.isArray(Reflect.get(result, 'rows'))
      ? (Reflect.get(result, 'rows') as unknown[])
      : [];

  return rows.length;
};

const resolveRecoveredAlerts = async (
  runId: number,
  mismatchedUserIds: number[]
) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const autoResolvableStatusesSql = sql.join(
    AUTO_RESOLVABLE_RECONCILIATION_STATUSES.map((status) => sql`${status}`),
    sql`, `
  );

  if (mismatchedUserIds.length === 0) {
    const resolved = await db
      .update(reconciliationAlerts)
      .set({
        runId,
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
          sql`${reconciliationAlerts.status} IN (${autoResolvableStatusesSql})`
        )
      )
      .returning({ id: reconciliationAlerts.id });

    return resolved.length;
  }

  const result = await db.execute(sql`
    UPDATE ${reconciliationAlerts}
    SET
      run_id = ${runId},
      status = 'resolved',
      resolved_at = ${nowIso},
      updated_at = ${nowIso}
    WHERE ${reconciliationAlerts.alertType} = ${WALLET_RECONCILIATION_ALERT_TYPE}
      AND ${reconciliationAlerts.status} IN (${autoResolvableStatusesSql})
      AND ${reconciliationAlerts.userId} IS NOT NULL
      AND ${reconciliationAlerts.userId} NOT IN (
        ${sql.join(
          mismatchedUserIds.map((userId) => sql`${userId}`),
          sql`, `
        )}
      )
    RETURNING ${reconciliationAlerts.id} AS id
  `);

  return result.count ?? readCountFromRows(result);
};

export async function runWalletReconciliation(
  trigger: WalletReconciliationRunTrigger = 'manual'
) {
  const run = await createRun(trigger);

  try {
    const [scannedUsers, mismatches] = await Promise.all([
      countWalletInvariantSubjects(db),
      listWalletInvariantMismatches(db),
    ]);

    for (const mismatch of mismatches) {
      await upsertAlert(run.id, mismatch);
    }

    const resolvedUsers = await resolveRecoveredAlerts(
      run.id,
      mismatches.map((mismatch) => mismatch.userId)
    );
    const unknownEntryTypeUsers = mismatches.filter(
      (mismatch) => mismatch.unknownEntryTypes.length > 0
    ).length;

    await finishRun(run.id, 'completed', {
      scannedUsers,
      mismatchedUsers: mismatches.length,
      resolvedUsers,
      unknownEntryTypeUsers,
    });

    logger.info('wallet reconciliation run completed', {
      runId: run.id,
      trigger,
      scannedUsers,
      mismatchedUsers: mismatches.length,
      resolvedUsers,
      unknownEntryTypeUsers,
    });

    return {
      runId: run.id,
      mismatches,
      resolvedUsers,
    };
  } catch (error) {
    await finishRun(run.id, 'failed', {
      scannedUsers: 0,
      mismatchedUsers: 0,
      error: error instanceof Error ? error.message : 'unknown_error',
    });

    throw error;
  }
}
