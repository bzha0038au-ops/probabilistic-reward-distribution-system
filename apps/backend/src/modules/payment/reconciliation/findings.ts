import { createHash } from 'node:crypto';

import Decimal from 'decimal.js';

import type { PaymentFlow, PaymentOrderStatus } from '../types';

export type ReconciliationRunTrigger = 'scheduled' | 'manual';
export type ReconciliationRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked';
export type ReconciliationIssueStatus = 'open' | 'resolved';
export type ReconciliationIssueType =
  | 'provider_adapter_missing'
  | 'missing_provider_reference'
  | 'provider_order_missing'
  | 'local_order_missing'
  | 'order_status_mismatch'
  | 'ledger_mismatch'
  | 'amount_mismatch'
  | 'timed_out_non_terminal';
export type ReconciliationSeverity = 'warning' | 'error' | 'critical';

export type ReconciliationLedgerSummary = {
  status: string;
  healthy: boolean;
  metadata?: Record<string, unknown> | null;
};

export type ReconciliationOrderSnapshot = {
  flow: PaymentFlow;
  orderId: number;
  providerId: number | null;
  amount: string;
  status: string;
  providerReference: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  metadata?: Record<string, unknown> | null;
};

export type ReconciliationRemoteOrder = {
  flow: PaymentFlow;
  providerOrderId: string | null;
  referenceId: string | null;
  status: PaymentOrderStatus;
  rawStatus?: string | null;
  amount?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

export type ReconciliationFinding = {
  fingerprint: string;
  flow: PaymentFlow | 'provider';
  orderType: PaymentFlow | null;
  orderId: number | null;
  localStatus: string | null;
  remoteStatus: string | null;
  ledgerStatus: string | null;
  localReference: string | null;
  remoteReference: string | null;
  issueType: ReconciliationIssueType;
  severity: ReconciliationSeverity;
  requiresManualReview: boolean;
  autoRecheckEligible: boolean;
  metadata: Record<string, unknown>;
};

const SUCCESS_REMOTE_STATUSES = new Set<PaymentOrderStatus>(['success', 'paid']);
const FAILED_REMOTE_STATUSES = new Set<PaymentOrderStatus>(['failed', 'rejected']);
const PENDING_REMOTE_STATUSES = new Set<PaymentOrderStatus>([
  'pending',
  'processing',
  'approved',
]);

const normalizeReference = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const toDate = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const amountsDiffer = (
  left: string | null | undefined,
  right: string | null | undefined
) => {
  if (!left || !right) {
    return false;
  }

  try {
    return !new Decimal(left).eq(new Decimal(right));
  } catch {
    return left !== right;
  }
};

const buildFingerprint = (parts: Array<string | number | null | undefined>) =>
  createHash('sha256')
    .update(parts.map((item) => String(item ?? 'null')).join('|'))
    .digest('hex');

const buildFinding = (
  input: Omit<ReconciliationFinding, 'fingerprint'> & {
    providerId: number | null;
  }
): ReconciliationFinding => ({
  ...input,
  fingerprint: buildFingerprint([
    input.providerId,
    input.flow,
    input.orderType,
    input.orderId,
    input.issueType,
    input.localReference,
    input.remoteReference,
    input.localStatus,
    input.remoteStatus,
    input.ledgerStatus,
  ]),
});

export const isNonTerminalLocalStatus = (
  flow: PaymentFlow,
  status: string | null | undefined
) => {
  if (!status) {
    return true;
  }

  if (flow === 'deposit') {
    return ['requested', 'provider_pending', 'provider_succeeded'].includes(status);
  }

  return ['requested', 'approved', 'provider_submitted', 'provider_processing'].includes(
    status
  );
};

const isRemotePendingLike = (status: PaymentOrderStatus) =>
  PENDING_REMOTE_STATUSES.has(status);

const isRemoteSuccessLike = (status: PaymentOrderStatus) =>
  SUCCESS_REMOTE_STATUSES.has(status);

const isRemoteFailedLike = (status: PaymentOrderStatus) =>
  FAILED_REMOTE_STATUSES.has(status);

const expectsRemoteOrderPresence = (order: ReconciliationOrderSnapshot) => {
  if (order.flow === 'deposit') {
    return !['provider_failed', 'reversed'].includes(order.status);
  }

  return !['provider_failed', 'rejected', 'reversed'].includes(order.status);
};

const isLocalRemoteStatusCompatible = (
  order: ReconciliationOrderSnapshot,
  remote: ReconciliationRemoteOrder
) => {
  if (order.flow === 'deposit') {
    if (['requested', 'provider_pending'].includes(order.status)) {
      return isRemotePendingLike(remote.status);
    }
    if (order.status === 'provider_succeeded' || order.status === 'credited') {
      return isRemoteSuccessLike(remote.status);
    }
    if (order.status === 'provider_failed' || order.status === 'reversed') {
      return isRemoteFailedLike(remote.status);
    }

    return false;
  }

  if (order.status === 'requested' || order.status === 'approved') {
    return remote.status === 'approved' || isRemotePendingLike(remote.status);
  }
  if (
    order.status === 'provider_submitted' ||
    order.status === 'provider_processing'
  ) {
    return remote.status === 'processing' || isRemotePendingLike(remote.status);
  }
  if (order.status === 'paid') {
    return isRemoteSuccessLike(remote.status);
  }
  if (
    order.status === 'provider_failed' ||
    order.status === 'rejected' ||
    order.status === 'reversed'
  ) {
    return remote.status === 'rejected' || remote.status === 'failed';
  }

  return false;
};

export const buildProviderAdapterMissingFinding = (params: {
  providerId: number | null;
  flow: PaymentFlow;
  adapterKey: string | null;
}) =>
  buildFinding({
    providerId: params.providerId,
    flow: 'provider',
    orderType: null,
    orderId: null,
    localStatus: null,
    remoteStatus: null,
    ledgerStatus: null,
    localReference: params.adapterKey,
    remoteReference: null,
    issueType: 'provider_adapter_missing',
    severity: 'critical',
    requiresManualReview: true,
    autoRecheckEligible: false,
    metadata: {
      flow: params.flow,
      adapterKey: params.adapterKey,
      reason: 'No reconciliation-capable payment adapter is registered.',
    },
  });

export const buildRemoteOnlyFinding = (params: {
  providerId: number | null;
  remote: ReconciliationRemoteOrder;
}) =>
  buildFinding({
    providerId: params.providerId,
    flow: params.remote.flow,
    orderType: params.remote.flow,
    orderId: null,
    localStatus: null,
    remoteStatus: params.remote.status,
    ledgerStatus: null,
    localReference: null,
    remoteReference:
      normalizeReference(params.remote.referenceId) ??
      normalizeReference(params.remote.providerOrderId),
    issueType: 'local_order_missing',
    severity: 'critical',
    requiresManualReview: true,
    autoRecheckEligible: false,
    metadata: {
      rawStatus: params.remote.rawStatus ?? null,
      providerOrderId: params.remote.providerOrderId,
      amount: params.remote.amount ?? null,
      remoteMetadata: params.remote.metadata ?? null,
    },
  });

export const buildOrderFindings = (params: {
  providerId: number | null;
  order: ReconciliationOrderSnapshot;
  remote: ReconciliationRemoteOrder | null;
  ledger: ReconciliationLedgerSummary;
  now: Date;
  timeoutMs: number;
}) => {
  const { order, remote, ledger } = params;
  const findings: ReconciliationFinding[] = [];
  const localReference = normalizeReference(order.providerReference);
  const remoteReference = normalizeReference(
    remote?.referenceId ?? remote?.providerOrderId ?? null
  );
  const createdAt = toDate(order.createdAt);
  const timedOut =
    createdAt !== null &&
    params.now.getTime() - createdAt.getTime() >= params.timeoutMs &&
    isNonTerminalLocalStatus(order.flow, order.status);

  if (!localReference) {
    findings.push(
      buildFinding({
        providerId: params.providerId,
        flow: order.flow,
        orderType: order.flow,
        orderId: order.orderId,
        localStatus: order.status,
        remoteStatus: remote?.status ?? null,
        ledgerStatus: ledger.status,
        localReference,
        remoteReference,
        issueType: 'missing_provider_reference',
        severity: 'error',
        requiresManualReview: true,
        autoRecheckEligible: timedOut,
        metadata: {
          timedOut,
          orderCreatedAt: createdAt?.toISOString() ?? null,
        },
      })
    );
  }

  if (!remote && localReference && expectsRemoteOrderPresence(order)) {
    findings.push(
      buildFinding({
        providerId: params.providerId,
        flow: order.flow,
        orderType: order.flow,
        orderId: order.orderId,
        localStatus: order.status,
        remoteStatus: null,
        ledgerStatus: ledger.status,
        localReference,
        remoteReference,
        issueType: 'provider_order_missing',
        severity: timedOut ? 'critical' : 'error',
        requiresManualReview: true,
        autoRecheckEligible: true,
        metadata: {
          timedOut,
        },
      })
    );
  }

  if (remote && !isLocalRemoteStatusCompatible(order, remote)) {
    findings.push(
      buildFinding({
        providerId: params.providerId,
        flow: order.flow,
        orderType: order.flow,
        orderId: order.orderId,
        localStatus: order.status,
        remoteStatus: remote.status,
        ledgerStatus: ledger.status,
        localReference,
        remoteReference,
        issueType: 'order_status_mismatch',
        severity:
          isRemoteSuccessLike(remote.status) || isRemoteFailedLike(remote.status)
            ? 'critical'
            : 'error',
        requiresManualReview: true,
        autoRecheckEligible: false,
        metadata: {
          rawRemoteStatus: remote.rawStatus ?? null,
        },
      })
    );
  }

  if (remote && amountsDiffer(order.amount, remote.amount)) {
    findings.push(
      buildFinding({
        providerId: params.providerId,
        flow: order.flow,
        orderType: order.flow,
        orderId: order.orderId,
        localStatus: order.status,
        remoteStatus: remote.status,
        ledgerStatus: ledger.status,
        localReference,
        remoteReference,
        issueType: 'amount_mismatch',
        severity: 'critical',
        requiresManualReview: true,
        autoRecheckEligible: false,
        metadata: {
          localAmount: order.amount,
          remoteAmount: remote.amount ?? null,
        },
      })
    );
  }

  if (!ledger.healthy) {
    findings.push(
      buildFinding({
        providerId: params.providerId,
        flow: order.flow,
        orderType: order.flow,
        orderId: order.orderId,
        localStatus: order.status,
        remoteStatus: remote?.status ?? null,
        ledgerStatus: ledger.status,
        localReference,
        remoteReference,
        issueType: 'ledger_mismatch',
        severity: 'critical',
        requiresManualReview: true,
        autoRecheckEligible: false,
        metadata: {
          ledger: ledger.metadata ?? null,
        },
      })
    );
  }

  if (timedOut) {
    findings.push(
      buildFinding({
        providerId: params.providerId,
        flow: order.flow,
        orderType: order.flow,
        orderId: order.orderId,
        localStatus: order.status,
        remoteStatus: remote?.status ?? null,
        ledgerStatus: ledger.status,
        localReference,
        remoteReference,
        issueType: 'timed_out_non_terminal',
        severity: 'error',
        requiresManualReview: true,
        autoRecheckEligible: true,
        metadata: {
          ageMs:
            createdAt !== null ? Math.max(params.now.getTime() - createdAt.getTime(), 0) : null,
          timeoutMs: params.timeoutMs,
        },
      })
    );
  }

  return findings;
};
