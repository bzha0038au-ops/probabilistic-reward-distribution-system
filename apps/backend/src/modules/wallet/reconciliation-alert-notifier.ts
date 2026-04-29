import type { ReconciliationAlertStatus } from '@reward/shared-types/finance';

import { getConfigView } from '../../shared/config';
import { dispatchOpsAlert } from '../../shared/ops-notify';
import { toDecimal, toMoneyString } from '../../shared/money';

const config = getConfigView();

export type WalletReconciliationNotificationStage =
  | 'opened'
  | 'reopened'
  | 'sla_breached'
  | 'resolved';

export type WalletReconciliationNotificationContext = {
  alertId: number;
  runId: number | null;
  fingerprint: string;
  userId: number | null;
  userEmail: string | null;
  status: ReconciliationAlertStatus;
  expectedTotal: string;
  actualTotal: string;
  firstDetectedAt: Date | string | null;
  lastDetectedAt: Date | string | null;
  resolvedAt?: Date | string | null;
  statusNote?: string | null;
};

const formatDateTime = (value: Date | string | null | undefined) => {
  if (!value) {
    return 'n/a';
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toISOString();
};

const computeDeltaAmount = (context: WalletReconciliationNotificationContext) =>
  toMoneyString(
    toDecimal(context.actualTotal ?? 0).minus(context.expectedTotal ?? 0)
  );

const buildAdminQueueUrl = () =>
  config.adminBaseUrl?.trim()
    ? `${config.adminBaseUrl.replace(/\/+$/, '')}/reconciliation`
    : null;

const buildSummary = (
  stage: WalletReconciliationNotificationStage,
  context: WalletReconciliationNotificationContext
) => {
  const label =
    stage === 'opened'
      ? 'opened'
      : stage === 'reopened'
        ? 'reopened'
        : stage === 'sla_breached'
          ? 'breached 24h SLA'
          : 'resolved';

  return `Wallet reconciliation alert ${label} for user ${context.userId ?? 'unknown'}`;
};

const buildMessage = (
  stage: WalletReconciliationNotificationStage,
  context: WalletReconciliationNotificationContext
) => {
  const deltaAmount = computeDeltaAmount(context);
  const queueUrl = buildAdminQueueUrl();

  return [
    `stage=${stage}`,
    `alert_id=${String(context.alertId)}`,
    `run_id=${context.runId === null ? 'n/a' : String(context.runId)}`,
    `user_id=${context.userId === null ? 'n/a' : String(context.userId)}`,
    context.userEmail ? `user_email=${context.userEmail}` : null,
    `status=${context.status}`,
    `delta_amount=${deltaAmount}`,
    `expected_total=${context.expectedTotal}`,
    `actual_total=${context.actualTotal}`,
    `first_detected_at=${formatDateTime(context.firstDetectedAt)}`,
    `last_detected_at=${formatDateTime(context.lastDetectedAt)}`,
    stage === 'resolved'
      ? `resolved_at=${formatDateTime(context.resolvedAt ?? null)}`
      : null,
    context.statusNote ? `operator_note=${context.statusNote}` : null,
    queueUrl ? `queue=${queueUrl}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};

export const notifyWalletReconciliationAlert = async (
  stage: WalletReconciliationNotificationStage,
  context: WalletReconciliationNotificationContext
) =>
  dispatchOpsAlert({
    summary: buildSummary(stage, context),
    text: buildMessage(stage, context),
    severity: stage === 'resolved' ? 'info' : 'critical',
    source: 'reward-backend/wallet-reconciliation',
    component: 'wallet-reconciliation',
    dedupKey: `wallet-reconciliation:${context.fingerprint}`,
    action: stage === 'resolved' ? 'resolve' : 'trigger',
    slackWebhookUrl: config.walletReconciliationSlackWebhookUrl,
    pagerDutyRoutingKey: config.walletReconciliationPagerDutyRoutingKey,
    timeoutMs: config.walletReconciliationNotifyRequestTimeoutMs,
    customDetails: {
      alertId: context.alertId,
      runId: context.runId,
      userId: context.userId,
      userEmail: context.userEmail,
      status: context.status,
      stage,
      deltaAmount: computeDeltaAmount(context),
      expectedTotal: context.expectedTotal,
      actualTotal: context.actualTotal,
      firstDetectedAt: formatDateTime(context.firstDetectedAt),
      lastDetectedAt: formatDateTime(context.lastDetectedAt),
      resolvedAt: formatDateTime(context.resolvedAt ?? null),
      queueUrl: buildAdminQueueUrl(),
    },
  });
