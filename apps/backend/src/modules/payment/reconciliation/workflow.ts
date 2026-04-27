import Decimal from 'decimal.js';

import { getConfig } from '../../../shared/config';
import {
  normalizePaymentAdapterKey,
  type PaymentAdapterReconciliationOrder,
} from '../adapters';
import {
  isNonTerminalLocalStatus,
  type ReconciliationOrderSnapshot,
} from './findings';
import {
  getConfiguredAdapter,
  providerSupportsFlow,
  type PreparedPaymentProvider,
} from '../service';

export type LocalOrderRow = ReconciliationOrderSnapshot & {
  sourceMetadata: Record<string, unknown> | null;
};

export type LatestReferenceMaps = {
  provider: Map<number, string>;
  settlement: Map<number, string>;
};

export type ReconciliationReview = {
  adminId: null;
  operatorNote: string;
  settlementReference: string | null;
  processingChannel: string | null;
  sourceType: 'reconciliation';
  sourceEventKey: string;
};

export const OPEN_ISSUE_STATUS = 'open';
export const RESOLVED_ISSUE_STATUS = 'resolved';

export const DEPOSIT_OPEN_STATUSES = [
  'requested',
  'provider_pending',
  'provider_succeeded',
] as const;

export const WITHDRAWAL_OPEN_STATUSES = [
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing',
] as const;

export const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

export const toMetadataRecord = (
  value: unknown
): Record<string, unknown> | null => {
  const record = toRecord(value);
  return Object.keys(record).length > 0 ? record : null;
};

export const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export const toMoneyEquals = (
  left: string | number | null | undefined,
  right: string
) => {
  try {
    return new Decimal(left ?? 0).eq(new Decimal(right));
  } catch {
    return String(left ?? '') === right;
  }
};

export const normalizeReference = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const normalizeLookupKey = (value: string | null | undefined) => {
  const normalized = normalizeReference(value);
  return normalized ? normalizePaymentAdapterKey(normalized) : null;
};

const toDate = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

export const isTimedOutNonTerminalOrder = (
  order: ReconciliationOrderSnapshot,
  now: Date,
  timeoutMs: number
) => {
  const createdAt = toDate(order.createdAt);
  return (
    createdAt !== null &&
    now.getTime() - createdAt.getTime() >= timeoutMs &&
    isNonTerminalLocalStatus(order.flow, order.status)
  );
};

export const readActionResultStatus = (
  value: { status?: string | null } | null | undefined,
  fallback: string
) => readString(value?.status) ?? fallback;

export const isRemoteSuccessLike = (
  remote: PaymentAdapterReconciliationOrder | null
) => remote !== null && (remote.status === 'success' || remote.status === 'paid');

export const isRemoteFailureLike = (
  remote: PaymentAdapterReconciliationOrder | null
) => remote !== null && (remote.status === 'failed' || remote.status === 'rejected');

export const isRemoteProcessingLike = (
  remote: PaymentAdapterReconciliationOrder | null
) => remote !== null && remote.status === 'processing';

export const isRemoteApprovedLike = (
  remote: PaymentAdapterReconciliationOrder | null
) => remote !== null && remote.status === 'approved';

export const getProviderConfigAdapterKey = (provider: PreparedPaymentProvider) =>
  readString(Reflect.get(provider.parsedConfig, 'reconciliationAdapter')) ??
  getConfiguredAdapter(provider) ??
  'manual_review';

export const isReconciliationEnabled = (provider: PreparedPaymentProvider) =>
  Reflect.get(provider.parsedConfig, 'reconciliationEnabled') !== false;

export const getProviderLookbackMinutes = (provider: PreparedPaymentProvider) => {
  const configured = Reflect.get(provider.parsedConfig, 'reconciliationLookbackMinutes');
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : getConfig().paymentReconciliationLookbackMinutes;
};

export const getProviderTimeoutMinutes = (provider: PreparedPaymentProvider) => {
  const configured = Reflect.get(
    provider.parsedConfig,
    'reconciliationPendingTimeoutMinutes'
  );
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : getConfig().paymentReconciliationPendingTimeoutMinutes;
};

export const getProviderOrderLimit = (provider: PreparedPaymentProvider) => {
  const configured = Reflect.get(provider.parsedConfig, 'reconciliationMaxOrders');
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : getConfig().paymentReconciliationMaxOrdersPerProvider;
};

export const getSupportedFlows = (provider: PreparedPaymentProvider) =>
  (['deposit', 'withdrawal'] as const).filter((flow) =>
    providerSupportsFlow(provider, flow)
  );

export const getMetadataReference = (
  metadata: Record<string, unknown> | null | undefined
) => {
  const record = toRecord(metadata);
  const latestReview = toRecord(Reflect.get(record, 'financeReviewLatest'));

  return (
    readString(Reflect.get(record, 'providerReference')) ??
    readString(Reflect.get(record, 'providerOrderId')) ??
    readString(Reflect.get(record, 'referenceId')) ??
    readString(Reflect.get(latestReview, 'settlementReference')) ??
    null
  );
};

export const getMetadataProviderId = (
  metadata: Record<string, unknown> | null | undefined
) => {
  const record = toRecord(metadata);
  const raw =
    Reflect.get(record, 'paymentProviderId') ?? Reflect.get(record, 'providerId');
  const providerId = Number(raw);
  return Number.isFinite(providerId) && providerId > 0 ? providerId : null;
};

export const buildRemoteOrderMap = (
  orders: PaymentAdapterReconciliationOrder[]
) => {
  const map = new Map<string, PaymentAdapterReconciliationOrder>();

  for (const order of orders) {
    const key = normalizeLookupKey(order.referenceId ?? order.providerOrderId);
    if (!key) {
      continue;
    }

    map.set(key, order);
  }
  return map;
};

export const buildReconciliationSettlementReference = (
  provider: PreparedPaymentProvider,
  order: LocalOrderRow,
  remote: PaymentAdapterReconciliationOrder | null
) =>
  normalizeReference(
    remote?.referenceId ??
      remote?.providerOrderId ??
      order.providerReference
  ) ?? `reconciliation-${provider.id}-${order.flow}-${order.orderId}`;

export const buildReconciliationSourceEventKey = (
  provider: PreparedPaymentProvider,
  order: LocalOrderRow,
  remote: PaymentAdapterReconciliationOrder | null
) => {
  const referenceToken =
    normalizeLookupKey(
      remote?.referenceId ?? remote?.providerOrderId ?? order.providerReference
    ) ?? `order_${order.orderId}`;
  const statusToken = remote ? normalizePaymentAdapterKey(remote.status) : 'missing';

  return [
    'reconciliation',
    provider.id,
    order.flow,
    order.orderId,
    statusToken,
    referenceToken,
  ].join(':');
};

export const readReconciliationProcessingChannel = (
  provider: PreparedPaymentProvider,
  remote: PaymentAdapterReconciliationOrder | null
) => {
  const metadata = toRecord(remote?.metadata);
  return (
    readString(Reflect.get(metadata, 'processingChannel')) ??
    readString(Reflect.get(metadata, 'channel')) ??
    (getProviderConfigAdapterKey(provider) === 'manual_review'
      ? 'manual_reconciliation'
      : normalizePaymentAdapterKey(provider.name))
  );
};

export const buildReconciliationReview = (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  note: string;
}): ReconciliationReview => ({
  adminId: null,
  operatorNote: params.note,
  settlementReference: buildReconciliationSettlementReference(
    params.provider,
    params.order,
    params.remote
  ),
  processingChannel: readReconciliationProcessingChannel(
    params.provider,
    params.remote
  ),
  sourceType: 'reconciliation',
  sourceEventKey: buildReconciliationSourceEventKey(
    params.provider,
    params.order,
    params.remote
  ),
});
