import type {
  ReconciliationAlertRecord,
  ReconciliationAlertStatus,
  ReconciliationAlertSummary,
} from '@reward/shared-types/finance';
import { reconciliationAlerts, users, walletReconciliationRuns } from '@reward/database';
import { and, desc, eq, sql } from '@reward/database/orm';

import { db } from '../../db';
import { getConfigView } from '../../shared/config';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';
import { emitReconciliationAlertSecurityEvent } from '../security-events/service';
import { notifyWalletReconciliationAlert } from '../wallet/reconciliation-alert-notifier';

const WALLET_RECONCILIATION_ALERT_TYPE = 'wallet_balance_drift';
const config = getConfigView();

type AlertRow = {
  id: number;
  userId: number | null;
  userEmail: string | null;
  fingerprint: string;
  status: string;
  expectedWithdrawableBalance: string | number;
  actualWithdrawableBalance: string | number;
  expectedBonusBalance: string | number;
  actualBonusBalance: string | number;
  expectedLockedBalance: string | number;
  actualLockedBalance: string | number;
  expectedWageredAmount: string | number;
  actualWageredAmount: string | number;
  expectedTotal: string | number;
  actualTotal: string | number;
  metadata: unknown;
  firstDetectedAt: Date | string | null;
  lastDetectedAt: Date | string | null;
  resolvedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  runId: number | null;
};

type AlertWorkflowMetadata = {
  statusNote: string | null;
  statusUpdatedByAdminId: number | null;
  statusUpdatedAt: string | null;
  systemEscalatedAt: string | null;
};

const buildActiveVsResolvedSort = () => sql<number>`
  case
    when ${reconciliationAlerts.status} = 'resolved' then 1
    else 0
  end
`;

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readIntegerLike = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const readDateLike = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
};

const buildSlaDueAt = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return new Date(
    parsed.getTime() + config.walletReconciliationSlaHours * 60 * 60 * 1000
  ).toISOString();
};

const isUnresolvedAlertStatus = (status: string) => status !== 'resolved';

const readWorkflowMetadata = (metadataValue: unknown): AlertWorkflowMetadata => {
  const workflow = toRecord(Reflect.get(toRecord(metadataValue), 'workflow'));

  return {
    statusNote:
      typeof Reflect.get(workflow, 'operatorNote') === 'string'
        ? (Reflect.get(workflow, 'operatorNote') as string)
        : null,
    statusUpdatedByAdminId: readIntegerLike(
      Reflect.get(workflow, 'statusUpdatedByAdminId')
    ),
    statusUpdatedAt: readDateLike(Reflect.get(workflow, 'statusUpdatedAt')),
    systemEscalatedAt: readDateLike(Reflect.get(workflow, 'systemEscalatedAt')),
  };
};

const buildSnapshot = (params: {
  withdrawableBalance: string | number;
  bonusBalance: string | number;
  lockedBalance: string | number;
  wageredAmount: string | number;
  totalBalance: string | number;
  capturedAt: Date | string | null;
  metadata: Record<string, unknown>;
}): ReconciliationAlertRecord['ledgerSnapshot'] => ({
  withdrawableBalance: toMoneyString(params.withdrawableBalance ?? 0),
  bonusBalance: toMoneyString(params.bonusBalance ?? 0),
  lockedBalance: toMoneyString(params.lockedBalance ?? 0),
  wageredAmount: toMoneyString(params.wageredAmount ?? 0),
  totalBalance: toMoneyString(params.totalBalance ?? 0),
  latestLedgerEntryId: readIntegerLike(
    Reflect.get(params.metadata, 'latestLedgerEntryId')
  ),
  capturedAt: readDateLike(params.capturedAt),
  metadata: params.metadata,
});

const computeDeltaAmount = (row: Pick<AlertRow, 'actualTotal' | 'expectedTotal'>) =>
  toMoneyString(toDecimal(row.actualTotal ?? 0).minus(row.expectedTotal ?? 0));

const mapAlertRow = (row: AlertRow): ReconciliationAlertRecord => {
  const metadata = toRecord(row.metadata);
  const workflow = readWorkflowMetadata(metadata);
  const slaDueAt = buildSlaDueAt(row.firstDetectedAt);
  const slaBreached =
    isUnresolvedAlertStatus(row.status) &&
    slaDueAt !== null &&
    new Date(slaDueAt).valueOf() <= Date.now();
  const escalatedAt =
    workflow.systemEscalatedAt ??
    (row.status === 'require_engineering' ? workflow.statusUpdatedAt : null);

  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.userEmail,
    dedupeKey: row.fingerprint,
    status: row.status as ReconciliationAlertStatus,
    deltaAmount: computeDeltaAmount(row),
    ledgerSnapshot: buildSnapshot({
      withdrawableBalance: row.expectedWithdrawableBalance,
      bonusBalance: row.expectedBonusBalance,
      lockedBalance: row.expectedLockedBalance,
      wageredAmount: row.expectedWageredAmount,
      totalBalance: row.expectedTotal,
      capturedAt: row.lastDetectedAt,
      metadata: { ...metadata, snapshotKind: 'ledger' },
    }),
    walletSnapshot: buildSnapshot({
      withdrawableBalance: row.actualWithdrawableBalance,
      bonusBalance: row.actualBonusBalance,
      lockedBalance: row.actualLockedBalance,
      wageredAmount: row.actualWageredAmount,
      totalBalance: row.actualTotal,
      capturedAt: row.lastDetectedAt,
      metadata: { ...metadata, snapshotKind: 'wallet' },
    }),
    statusNote: workflow.statusNote,
    statusUpdatedByAdminId: workflow.statusUpdatedByAdminId,
    statusUpdatedAt: workflow.statusUpdatedAt,
    firstDetectedAt: row.firstDetectedAt,
    lastDetectedAt: row.lastDetectedAt,
    slaDueAt,
    slaBreached,
    escalatedAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const selectAlertRows = () =>
  db
    .select({
      id: reconciliationAlerts.id,
      userId: reconciliationAlerts.userId,
      userEmail: users.email,
      fingerprint: reconciliationAlerts.fingerprint,
      status: reconciliationAlerts.status,
      expectedWithdrawableBalance: reconciliationAlerts.expectedWithdrawableBalance,
      actualWithdrawableBalance: reconciliationAlerts.actualWithdrawableBalance,
      expectedBonusBalance: reconciliationAlerts.expectedBonusBalance,
      actualBonusBalance: reconciliationAlerts.actualBonusBalance,
      expectedLockedBalance: reconciliationAlerts.expectedLockedBalance,
      actualLockedBalance: reconciliationAlerts.actualLockedBalance,
      expectedWageredAmount: reconciliationAlerts.expectedWageredAmount,
      actualWageredAmount: reconciliationAlerts.actualWageredAmount,
      expectedTotal: reconciliationAlerts.expectedTotal,
      actualTotal: reconciliationAlerts.actualTotal,
      metadata: reconciliationAlerts.metadata,
      firstDetectedAt: reconciliationAlerts.firstDetectedAt,
      lastDetectedAt: reconciliationAlerts.lastDetectedAt,
      resolvedAt: reconciliationAlerts.resolvedAt,
      createdAt: reconciliationAlerts.createdAt,
      updatedAt: reconciliationAlerts.updatedAt,
      runId: reconciliationAlerts.runId,
    })
    .from(reconciliationAlerts)
    .leftJoin(users, eq(users.id, reconciliationAlerts.userId));

const clampLimit = (limit: number, fallback: number, max: number) => {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), max);
};

const buildWorkflowMetadata = (payload: {
  currentMetadata: unknown;
  status: ReconciliationAlertStatus;
  adminId: number | null;
  statusNote: string;
  updatedAt: Date;
}) => {
  const currentMetadata = toRecord(payload.currentMetadata);
  const workflow = toRecord(Reflect.get(currentMetadata, 'workflow'));

  return {
    ...currentMetadata,
    workflow: {
      ...workflow,
      status: payload.status,
      operatorNote: payload.statusNote,
      statusUpdatedByAdminId: payload.adminId,
      statusUpdatedAt: payload.updatedAt.toISOString(),
      systemEscalationReason: null,
      systemEscalatedAt: null,
    },
  };
};

export async function listReconciliationAlerts(limit = 100) {
  const rows = await selectAlertRows()
    .where(eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE))
    .orderBy(
      buildActiveVsResolvedSort(),
      desc(reconciliationAlerts.lastDetectedAt),
      desc(reconciliationAlerts.id)
    )
    .limit(clampLimit(limit, 100, 250));

  return rows.map((row) => mapAlertRow(row as AlertRow));
}

export async function getReconciliationAlertById(alertId: number) {
  const [row] = await selectAlertRows()
    .where(
      and(
        eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
        eq(reconciliationAlerts.id, alertId)
      )
    )
    .limit(1);

  return row ? mapAlertRow(row as AlertRow) : null;
}

const buildZeroDriftStreakDays = async () => {
  const rows = await db
    .select({
      completedAt: walletReconciliationRuns.completedAt,
      mismatchedUsers: walletReconciliationRuns.mismatchedUsers,
    })
    .from(walletReconciliationRuns)
    .where(
      and(
        eq(walletReconciliationRuns.status, 'completed'),
        sql`${walletReconciliationRuns.completedAt} is not null`
      )
    )
    .orderBy(desc(walletReconciliationRuns.completedAt))
    .limit(180);

  const dailyResults: Array<{ day: string; mismatchedUsers: number }> = [];
  const seenDays = new Set<string>();

  for (const row of rows) {
    if (!row.completedAt) {
      continue;
    }

    const day = row.completedAt.toISOString().slice(0, 10);
    if (seenDays.has(day)) {
      continue;
    }

    seenDays.add(day);
    dailyResults.push({
      day,
      mismatchedUsers: Number(row.mismatchedUsers ?? 0),
    });
  }

  let streakDays = 0;
  let previousDay: Date | null = null;

  for (const result of dailyResults) {
    if (result.mismatchedUsers > 0) {
      break;
    }

    const currentDay = new Date(`${result.day}T00:00:00.000Z`);
    if (
      previousDay &&
      previousDay.valueOf() - currentDay.valueOf() !== 24 * 60 * 60 * 1000
    ) {
      break;
    }

    streakDays += 1;
    previousDay = currentDay;
  }

  return streakDays;
};

export async function getReconciliationAlertSummary(): Promise<ReconciliationAlertSummary> {
  const [rows, overdueRow, zeroDriftStreakDays] = await Promise.all([
    db
      .select({
        status: reconciliationAlerts.status,
        total: sql<number>`count(*)::int`,
      })
      .from(reconciliationAlerts)
      .where(eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE))
      .groupBy(reconciliationAlerts.status),
    db
      .select({
        overdueCount: sql<number>`count(*) filter (
          where ${reconciliationAlerts.status} <> 'resolved'
            and ${reconciliationAlerts.firstDetectedAt}
              <= now() - (${config.walletReconciliationSlaHours} * interval '1 hour')
        )`,
        oldestOpenAt: sql<Date | null>`min(${reconciliationAlerts.firstDetectedAt}) filter (where ${reconciliationAlerts.status} <> 'resolved')`,
      })
      .from(reconciliationAlerts)
      .where(eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE)),
    buildZeroDriftStreakDays(),
  ]);

  const summary: ReconciliationAlertSummary = {
    openCount: 0,
    acknowledgedCount: 0,
    requireEngineeringCount: 0,
    resolvedCount: 0,
    unresolvedCount: 0,
    overdueCount: Number(overdueRow[0]?.overdueCount ?? 0),
    slaHours: config.walletReconciliationSlaHours,
    zeroDriftStreakDays,
    oldestOpenAt: overdueRow[0]?.oldestOpenAt ?? null,
  };

  for (const row of rows) {
    const total = Number(row.total ?? 0);
    if (row.status === 'open') {
      summary.openCount = total;
      continue;
    }
    if (row.status === 'acknowledged') {
      summary.acknowledgedCount = total;
      continue;
    }
    if (row.status === 'require_engineering') {
      summary.requireEngineeringCount = total;
      continue;
    }
    if (row.status === 'resolved') {
      summary.resolvedCount = total;
    }
  }

  summary.unresolvedCount =
    summary.openCount +
    summary.acknowledgedCount +
    summary.requireEngineeringCount;

  return summary;
}

export async function updateReconciliationAlertStatus(payload: {
  alertId: number;
  status: ReconciliationAlertStatus;
  adminId: number | null;
  statusNote: string;
}) {
  const [existing] = await db
    .select({
      id: reconciliationAlerts.id,
      metadata: reconciliationAlerts.metadata,
    })
    .from(reconciliationAlerts)
    .where(
      and(
        eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
        eq(reconciliationAlerts.id, payload.alertId)
      )
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(reconciliationAlerts)
    .set({
      status: payload.status,
      metadata: buildWorkflowMetadata({
        currentMetadata: existing.metadata,
        status: payload.status,
        adminId: payload.adminId,
        statusNote: payload.statusNote,
        updatedAt: now,
      }),
      resolvedAt: payload.status === 'resolved' ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(reconciliationAlerts.alertType, WALLET_RECONCILIATION_ALERT_TYPE),
        eq(reconciliationAlerts.id, payload.alertId)
      )
    )
    .returning({ id: reconciliationAlerts.id });

  if (!updated) {
    return null;
  }

  const alert = await getReconciliationAlertById(updated.id);
  if (alert && payload.status === 'resolved') {
    void notifyWalletReconciliationAlert('resolved', {
      alertId: alert.id,
      runId: null,
      fingerprint: alert.dedupeKey ?? `wallet-reconciliation:${String(alert.id)}`,
      userId: alert.userId,
      userEmail: alert.userEmail ?? null,
      status: alert.status,
      expectedTotal: alert.ledgerSnapshot.totalBalance ?? '0.00',
      actualTotal: alert.walletSnapshot.totalBalance ?? '0.00',
      firstDetectedAt: alert.firstDetectedAt ?? null,
      lastDetectedAt: alert.lastDetectedAt ?? null,
      resolvedAt: alert.resolvedAt ?? null,
      statusNote: alert.statusNote ?? null,
    }).catch((error) => {
      logger.error('manual reconciliation resolve notification failed', {
        alertId: alert.id,
        err: error,
      });
    });
  }

  if (alert) {
    await emitReconciliationAlertSecurityEvent({
      eventType: 'wallet_reconciliation_alert_status_changed',
      alertId: alert.id,
      userId: alert.userId,
      adminId: payload.adminId,
      status: alert.status,
      deltaAmount: alert.deltaAmount,
      fingerprint: `${alert.dedupeKey}:status:${alert.status}`,
      metadata: {
        alertType: WALLET_RECONCILIATION_ALERT_TYPE,
        statusNote: payload.statusNote,
        statusUpdatedByAdminId: payload.adminId,
      },
      occurredAt: now,
    });
  }

  return alert;
}
