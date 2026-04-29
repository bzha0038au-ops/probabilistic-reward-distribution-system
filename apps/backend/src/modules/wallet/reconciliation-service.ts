import type { ReconciliationAlertStatus } from '@reward/shared-types/finance';
import { reconciliationAlerts, walletReconciliationRuns } from '@reward/database';
import { and, eq, sql } from '@reward/database/orm';

import { db } from '../../db';
import { getConfigView } from '../../shared/config';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';
import { emitReconciliationAlertSecurityEvent } from '../security-events/service';
import { notifyWalletReconciliationAlert } from './reconciliation-alert-notifier';
import {
  countWalletInvariantSubjects,
  listWalletInvariantMismatches,
  type WalletInvariantMismatch,
} from './invariant-service';

export type WalletReconciliationRunTrigger = 'manual' | 'scheduled';
export type WalletReconciliationRunStatus = 'completed' | 'failed';

const config = getConfigView();
const WALLET_RECONCILIATION_ALERT_TYPE = 'wallet_balance_drift';
const AUTO_RESOLVABLE_RECONCILIATION_STATUSES = [
  'open',
  'acknowledged',
  'require_engineering',
] as const;
const SLA_ESCALATABLE_RECONCILIATION_STATUSES = ['open', 'acknowledged'] as const;

type AlertWorkflowMetadata = {
  operatorNote: string | null;
};

type StoredAlertRecord = {
  id: number;
  runId: number | null;
  userId: number | null;
  fingerprint: string;
  status: string;
  expectedTotal: string | number;
  actualTotal: string | number;
  metadata: unknown;
  firstDetectedAt: Date | string | null;
  lastDetectedAt: Date | string | null;
  resolvedAt: Date | string | null;
};

type WalletReconciliationNotificationEvent = {
  stage: 'opened' | 'reopened' | 'sla_breached' | 'resolved';
  context: Parameters<typeof notifyWalletReconciliationAlert>[1];
};

const alertRecordSelection = {
  id: reconciliationAlerts.id,
  runId: reconciliationAlerts.runId,
  userId: reconciliationAlerts.userId,
  fingerprint: reconciliationAlerts.fingerprint,
  status: reconciliationAlerts.status,
  expectedTotal: reconciliationAlerts.expectedTotal,
  actualTotal: reconciliationAlerts.actualTotal,
  metadata: reconciliationAlerts.metadata,
  firstDetectedAt: reconciliationAlerts.firstDetectedAt,
  lastDetectedAt: reconciliationAlerts.lastDetectedAt,
  resolvedAt: reconciliationAlerts.resolvedAt,
} as const;

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
    escalatedUsers?: number;
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

const computeDeltaAmount = (mismatch: WalletInvariantMismatch) =>
  toMoneyString(
    toDecimal(mismatch.actualTotal).minus(toDecimal(mismatch.expectedTotal)),
  );

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readWorkflowMetadata = (metadata: unknown): AlertWorkflowMetadata => {
  const workflow = toRecord(Reflect.get(toRecord(metadata), 'workflow'));

  return {
    operatorNote:
      typeof Reflect.get(workflow, 'operatorNote') === 'string'
        ? (Reflect.get(workflow, 'operatorNote') as string)
        : null,
  };
};

const mergeAlertMetadata = (
  currentMetadata: unknown,
  nextMetadata: ReturnType<typeof buildAlertMetadata>
) => ({
  ...toRecord(currentMetadata),
  ...nextMetadata,
});

const buildReopenedAlertMetadata = (
  currentMetadata: unknown,
  nextMetadata: ReturnType<typeof buildAlertMetadata>
) => ({
  ...toRecord(currentMetadata),
  ...nextMetadata,
  workflow: {
    status: 'open',
    operatorNote: null,
    statusUpdatedByAdminId: null,
    statusUpdatedAt: null,
    systemEscalationReason: null,
    systemEscalatedAt: null,
  },
});

const buildSlaEscalatedMetadata = (currentMetadata: unknown, escalatedAt: Date) => {
  const metadata = toRecord(currentMetadata);
  const workflow = toRecord(Reflect.get(metadata, 'workflow'));

  return {
    ...metadata,
    workflow: {
      ...workflow,
      status: 'require_engineering',
      statusUpdatedByAdminId: null,
      statusUpdatedAt: escalatedAt.toISOString(),
      systemEscalationReason: 'sla_breach_24h',
      systemEscalatedAt: escalatedAt.toISOString(),
    },
  };
};

const toNotificationContext = (
  alert: StoredAlertRecord,
  status: ReconciliationAlertStatus
) => ({
  alertId: alert.id,
  runId: alert.runId,
  fingerprint: alert.fingerprint,
  userId: alert.userId,
  userEmail: null,
  status,
  expectedTotal: toMoneyString(alert.expectedTotal ?? 0),
  actualTotal: toMoneyString(alert.actualTotal ?? 0),
  firstDetectedAt: alert.firstDetectedAt,
  lastDetectedAt: alert.lastDetectedAt,
  resolvedAt: alert.resolvedAt,
  statusNote: readWorkflowMetadata(alert.metadata).operatorNote,
});

const dispatchNotificationEvents = async (
  events: WalletReconciliationNotificationEvent[]
) => {
  const settled = await Promise.allSettled(
    events.map((event) => notifyWalletReconciliationAlert(event.stage, event.context))
  );

  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      const event = events[index];
      logger.error('wallet reconciliation alert notification failed', {
        alertId: event?.context.alertId,
        stage: event?.stage,
        err: result.reason,
      });
    }
  });
};

const upsertAlert = async (
  runId: number,
  mismatch: WalletInvariantMismatch
): Promise<WalletReconciliationNotificationEvent | null> => {
  const now = new Date();
  const metadata = buildAlertMetadata(mismatch);
  const fingerprint = buildFingerprint(mismatch.userId);
  const [existing] = await db
    .select({
      ...alertRecordSelection,
      metadata: reconciliationAlerts.metadata,
    })
    .from(reconciliationAlerts)
    .where(eq(reconciliationAlerts.fingerprint, fingerprint))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(reconciliationAlerts)
      .values({
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
      })
      .returning(alertRecordSelection);

    if (created) {
      await emitReconciliationAlertSecurityEvent({
        eventType: 'wallet_reconciliation_alert_opened',
        alertId: created.id,
        userId: created.userId,
        status: created.status,
        deltaAmount: computeDeltaAmount(mismatch),
        runId,
        fingerprint: created.fingerprint,
        metadata: {
          alertType: WALLET_RECONCILIATION_ALERT_TYPE,
          unknownEntryTypesCount: mismatch.unknownEntryTypes.length,
        },
        occurredAt: now,
      });
    }

    return created
      ? {
          stage: 'opened',
          context: toNotificationContext(created as StoredAlertRecord, 'open'),
        }
      : null;
  }

  const isReopened = existing.status === 'resolved';
  const nextStatus: ReconciliationAlertStatus =
    existing.status === 'acknowledged' ||
    existing.status === 'require_engineering'
      ? (existing.status as ReconciliationAlertStatus)
      : 'open';

  const [updated] = await db
    .update(reconciliationAlerts)
    .set({
      runId,
      userId: mismatch.userId,
      status: isReopened ? 'open' : nextStatus,
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
      metadata: isReopened
        ? buildReopenedAlertMetadata(existing.metadata, metadata)
        : mergeAlertMetadata(existing.metadata, metadata),
      ...(isReopened ? { firstDetectedAt: now } : {}),
      lastDetectedAt: now,
      resolvedAt: null,
      updatedAt: now,
    })
    .where(eq(reconciliationAlerts.id, existing.id))
    .returning(alertRecordSelection);

  if (!updated) {
    return null;
  }

  await emitReconciliationAlertSecurityEvent({
    eventType: 'wallet_reconciliation_alert_updated',
    alertId: updated.id,
    userId: updated.userId,
    status: updated.status,
    deltaAmount: computeDeltaAmount(mismatch),
    runId,
    fingerprint: updated.fingerprint,
    metadata: {
      alertType: WALLET_RECONCILIATION_ALERT_TYPE,
      unknownEntryTypesCount: mismatch.unknownEntryTypes.length,
      reopened: isReopened,
    },
    occurredAt: now,
  });

  if (!isReopened) {
    return null;
  }

  return {
    stage: 'reopened',
    context: toNotificationContext(updated as StoredAlertRecord, 'open'),
  };
};

const resolveRecoveredAlerts = async (
  runId: number,
  mismatchedUserIds: number[]
): Promise<WalletReconciliationNotificationEvent[]> => {
  const autoResolvableStatusesSql = sql.join(
    AUTO_RESOLVABLE_RECONCILIATION_STATUSES.map((status) => sql`${status}`),
    sql`, `
  );
  const candidates =
    mismatchedUserIds.length === 0
      ? await db
          .select(alertRecordSelection)
          .from(reconciliationAlerts)
          .where(
            and(
              eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
              sql`${reconciliationAlerts.status} IN (${autoResolvableStatusesSql})`
            )
          )
      : await db
          .select(alertRecordSelection)
          .from(reconciliationAlerts)
          .where(
            and(
              eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
              sql`${reconciliationAlerts.status} IN (${autoResolvableStatusesSql})`,
              sql`${reconciliationAlerts.userId} IS NOT NULL
                AND ${reconciliationAlerts.userId} NOT IN (
                  ${sql.join(
                    mismatchedUserIds.map((userId) => sql`${userId}`),
                    sql`, `
                  )}
                )`
            )
          );

  const notifications: WalletReconciliationNotificationEvent[] = [];

  for (const candidate of candidates) {
    const now = new Date();
    const [resolved] = await db
      .update(reconciliationAlerts)
      .set({
        runId,
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(reconciliationAlerts.id, candidate.id))
      .returning(alertRecordSelection);

    if (!resolved) {
      continue;
    }

    await emitReconciliationAlertSecurityEvent({
      eventType: 'wallet_reconciliation_alert_status_changed',
      alertId: resolved.id,
      userId: resolved.userId,
      status: 'resolved',
      deltaAmount: toMoneyString(
        toDecimal(resolved.actualTotal).minus(toDecimal(resolved.expectedTotal)),
      ),
      runId,
      fingerprint: `${resolved.fingerprint}:status:resolved`,
      metadata: {
        alertType: WALLET_RECONCILIATION_ALERT_TYPE,
        resolutionSource: 'auto_recovered',
      },
      occurredAt: now,
    });

    notifications.push({
      stage: 'resolved',
      context: toNotificationContext(
        resolved as StoredAlertRecord,
        'resolved'
      ),
    });
  }

  return notifications;
};

const escalateOverdueAlerts = async (
  runId: number
): Promise<WalletReconciliationNotificationEvent[]> => {
  const now = new Date();
  const slaEscalatableStatusesSql = sql.join(
    SLA_ESCALATABLE_RECONCILIATION_STATUSES.map((status) => sql`${status}`),
    sql`, `
  );
  const candidates = await db
    .select(alertRecordSelection)
    .from(reconciliationAlerts)
    .where(
      and(
        eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
        sql`${reconciliationAlerts.status} IN (${slaEscalatableStatusesSql})`,
        sql`${reconciliationAlerts.firstDetectedAt}
          <= now() - (${config.walletReconciliationSlaHours} * interval '1 hour')`
      )
    );

  const notifications: WalletReconciliationNotificationEvent[] = [];

  for (const candidate of candidates) {
    const [escalated] = await db
      .update(reconciliationAlerts)
      .set({
        runId,
        status: 'require_engineering',
        metadata: buildSlaEscalatedMetadata(candidate.metadata, now),
        updatedAt: now,
      })
      .where(eq(reconciliationAlerts.id, candidate.id))
      .returning(alertRecordSelection);

    if (!escalated) {
      continue;
    }

    await emitReconciliationAlertSecurityEvent({
      eventType: 'wallet_reconciliation_alert_status_changed',
      alertId: escalated.id,
      userId: escalated.userId,
      status: 'require_engineering',
      deltaAmount: toMoneyString(
        toDecimal(escalated.actualTotal).minus(toDecimal(escalated.expectedTotal)),
      ),
      runId,
      fingerprint: `${escalated.fingerprint}:status:require_engineering`,
      metadata: {
        alertType: WALLET_RECONCILIATION_ALERT_TYPE,
        systemEscalationReason: 'sla_breach_24h',
      },
      occurredAt: now,
    });

    notifications.push({
      stage: 'sla_breached',
      context: toNotificationContext(
        escalated as StoredAlertRecord,
        'require_engineering'
      ),
    });
  }

  return notifications;
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
    const notificationEvents: WalletReconciliationNotificationEvent[] = [];

    for (const mismatch of mismatches) {
      const notificationEvent = await upsertAlert(run.id, mismatch);
      if (notificationEvent) {
        notificationEvents.push(notificationEvent);
      }
    }

    const resolvedNotifications = await resolveRecoveredAlerts(
      run.id,
      mismatches.map((mismatch) => mismatch.userId)
    );
    const escalatedNotifications = await escalateOverdueAlerts(run.id);
    notificationEvents.push(...resolvedNotifications, ...escalatedNotifications);

    await dispatchNotificationEvents(notificationEvents);

    const resolvedUsers = resolvedNotifications.length;
    const escalatedUsers = escalatedNotifications.length;
    const unknownEntryTypeUsers = mismatches.filter(
      (mismatch) => mismatch.unknownEntryTypes.length > 0
    ).length;

    await finishRun(run.id, 'completed', {
      scannedUsers,
      mismatchedUsers: mismatches.length,
      resolvedUsers,
      escalatedUsers,
      unknownEntryTypeUsers,
    });

    logger.info('wallet reconciliation run completed', {
      runId: run.id,
      trigger,
      scannedUsers,
      mismatchedUsers: mismatches.length,
      resolvedUsers,
      escalatedUsers,
      unknownEntryTypeUsers,
    });

    return {
      runId: run.id,
      mismatches,
      resolvedUsers,
      escalatedUsers,
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
