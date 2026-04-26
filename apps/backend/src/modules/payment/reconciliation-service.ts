import {
  asc,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  or,
} from '@reward/database/orm';
import Decimal from 'decimal.js';

import { db } from '../../db';
import {
  deposits,
  ledgerEntries,
  paymentProviderEvents,
  paymentProviders,
  paymentReconciliationIssues,
  paymentReconciliationRuns,
  paymentSettlementEvents,
  withdrawals,
} from '@reward/database';
import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import {
  getRegisteredPaymentAdapter,
  normalizePaymentAdapterKey,
  type PaymentAdapterReconciliationOrder,
} from './adapter';
import {
  buildOrderFindings,
  buildProviderAdapterMissingFinding,
  buildRemoteOnlyFinding,
  isNonTerminalLocalStatus,
  type ReconciliationFinding,
  type ReconciliationLedgerSummary,
  type ReconciliationOrderSnapshot,
  type ReconciliationRunTrigger,
  type ReconciliationRunStatus,
} from './reconciliation';
import {
  getConfiguredAdapter,
  listActiveProviders,
  providerSupportsFlow,
  type PreparedPaymentProvider,
} from './service';
import {
  creditDeposit,
  failDeposit,
  markDepositProviderPending,
  markDepositProviderSucceeded,
  reverseDeposit,
} from '../top-up/service';
import {
  approveWithdrawal,
  markWithdrawalProviderProcessing,
  markWithdrawalProviderSubmitted,
  payWithdrawal,
  rejectWithdrawal,
  reverseWithdrawal,
} from '../withdraw/service';
import type { PaymentFlow } from './types';

type LocalOrderRow = ReconciliationOrderSnapshot & {
  sourceMetadata: Record<string, unknown> | null;
};

type LatestReferenceMaps = {
  provider: Map<number, string>;
  settlement: Map<number, string>;
};

type ReconciliationReview = {
  adminId: null;
  operatorNote: string;
  settlementReference: string | null;
  processingChannel: string | null;
  sourceType: 'reconciliation';
  sourceEventKey: string;
};

type AutoRepairAction =
  | 'deposit_mark_provider_pending'
  | 'deposit_mark_provider_succeeded'
  | 'deposit_credit'
  | 'deposit_mark_provider_failed'
  | 'deposit_reverse'
  | 'withdrawal_approve'
  | 'withdrawal_mark_provider_submitted'
  | 'withdrawal_mark_provider_processing'
  | 'withdrawal_reject'
  | 'withdrawal_pay'
  | 'withdrawal_reverse';

type AutoRepairOutcome = {
  actions: AutoRepairAction[];
  error: string | null;
};

const OPEN_ISSUE_STATUS = 'open';
const RESOLVED_ISSUE_STATUS = 'resolved';

const DEPOSIT_OPEN_STATUSES = [
  'requested',
  'provider_pending',
  'provider_succeeded',
] as const;
const WITHDRAWAL_OPEN_STATUSES = [
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing',
] as const;

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const toMetadataRecord = (
  value: unknown
): Record<string, unknown> | null => {
  const record = toRecord(value);
  return Object.keys(record).length > 0 ? record : null;
};

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const toMoneyEquals = (left: string | number | null | undefined, right: string) => {
  try {
    return new Decimal(left ?? 0).eq(new Decimal(right));
  } catch {
    return String(left ?? '') === right;
  }
};

const normalizeReference = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const normalizeLookupKey = (value: string | null | undefined) => {
  const normalized = normalizeReference(value);
  return normalized ? normalizePaymentAdapterKey(normalized) : null;
};

const toDate = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const isTimedOutNonTerminalOrder = (
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

const readActionResultStatus = (
  value: { status?: string | null } | null | undefined,
  fallback: string
) => readString(value?.status) ?? fallback;

const isRemoteSuccessLike = (remote: PaymentAdapterReconciliationOrder | null) =>
  remote !== null && (remote.status === 'success' || remote.status === 'paid');

const isRemoteFailureLike = (remote: PaymentAdapterReconciliationOrder | null) =>
  remote !== null && (remote.status === 'failed' || remote.status === 'rejected');

const isRemoteProcessingLike = (remote: PaymentAdapterReconciliationOrder | null) =>
  remote !== null && remote.status === 'processing';

const isRemoteApprovedLike = (remote: PaymentAdapterReconciliationOrder | null) =>
  remote !== null && remote.status === 'approved';

const getProviderConfigAdapterKey = (provider: PreparedPaymentProvider) =>
  readString(Reflect.get(provider.parsedConfig, 'reconciliationAdapter')) ??
  getConfiguredAdapter(provider) ??
  'manual_review';

const isReconciliationEnabled = (provider: PreparedPaymentProvider) =>
  Reflect.get(provider.parsedConfig, 'reconciliationEnabled') !== false;

const getProviderLookbackMinutes = (provider: PreparedPaymentProvider) => {
  const configured = Reflect.get(provider.parsedConfig, 'reconciliationLookbackMinutes');
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : getConfig().paymentReconciliationLookbackMinutes;
};

const getProviderTimeoutMinutes = (provider: PreparedPaymentProvider) => {
  const configured = Reflect.get(
    provider.parsedConfig,
    'reconciliationPendingTimeoutMinutes'
  );
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : getConfig().paymentReconciliationPendingTimeoutMinutes;
};

const getProviderOrderLimit = (provider: PreparedPaymentProvider) => {
  const configured = Reflect.get(provider.parsedConfig, 'reconciliationMaxOrders');
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : getConfig().paymentReconciliationMaxOrdersPerProvider;
};

const getSupportedFlows = (provider: PreparedPaymentProvider) =>
  (['deposit', 'withdrawal'] as const).filter((flow) =>
    providerSupportsFlow(provider, flow)
  );

const getMetadataReference = (metadata: Record<string, unknown> | null | undefined) => {
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

const getMetadataProviderId = (metadata: Record<string, unknown> | null | undefined) => {
  const record = toRecord(metadata);
  const raw =
    Reflect.get(record, 'paymentProviderId') ?? Reflect.get(record, 'providerId');
  const providerId = Number(raw);
  return Number.isFinite(providerId) && providerId > 0 ? providerId : null;
};

const buildReferenceMaps = async (
  flow: PaymentFlow,
  orderIds: number[]
): Promise<LatestReferenceMaps> => {
  if (orderIds.length === 0) {
    return {
      provider: new Map(),
      settlement: new Map(),
    };
  }

  const [providerRows, settlementRows] = await Promise.all([
    db
      .select({
        orderId: paymentProviderEvents.orderId,
        externalReference: paymentProviderEvents.externalReference,
        createdAt: paymentProviderEvents.createdAt,
      })
      .from(paymentProviderEvents)
      .where(
        and(
          eq(paymentProviderEvents.orderType, flow),
          inArray(paymentProviderEvents.orderId, orderIds),
          isNotNull(paymentProviderEvents.externalReference)
        )
      )
      .orderBy(desc(paymentProviderEvents.createdAt)),
    db
      .select({
        orderId: paymentSettlementEvents.orderId,
        settlementReference: paymentSettlementEvents.settlementReference,
        createdAt: paymentSettlementEvents.createdAt,
      })
      .from(paymentSettlementEvents)
      .where(
        and(
          eq(paymentSettlementEvents.orderType, flow),
          inArray(paymentSettlementEvents.orderId, orderIds),
          isNotNull(paymentSettlementEvents.settlementReference)
        )
      )
      .orderBy(desc(paymentSettlementEvents.createdAt)),
  ]);

  const provider = new Map<number, string>();
  const settlement = new Map<number, string>();

  for (const row of providerRows) {
    if (!provider.has(row.orderId) && row.externalReference) {
      provider.set(row.orderId, row.externalReference);
    }
  }
  for (const row of settlementRows) {
    if (!settlement.has(row.orderId) && row.settlementReference) {
      settlement.set(row.orderId, row.settlementReference);
    }
  }

  return { provider, settlement };
};

const mapDepositOrderRow = (
  row: {
    orderId: number;
    providerId: number | null;
    amount: string;
    status: string;
    referenceId: string | null;
    providerOrderId: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  refs: LatestReferenceMaps
) => {
  const metadata = toMetadataRecord(row.metadata);

  return {
    flow: 'deposit',
    orderId: row.orderId,
    providerId: row.providerId,
    amount: row.amount,
    status: row.status,
    providerReference:
      normalizeReference(row.referenceId) ??
      normalizeReference(row.providerOrderId) ??
      normalizeReference(getMetadataReference(metadata)) ??
      normalizeReference(refs.settlement.get(row.orderId)) ??
      normalizeReference(refs.provider.get(row.orderId)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata,
    sourceMetadata: metadata,
  } satisfies LocalOrderRow;
};

const mapWithdrawalOrderRow = (
  row: {
    orderId: number;
    providerId: number | null;
    amount: string;
    status: string;
    providerOrderId: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  refs: LatestReferenceMaps
) => {
  const metadata = toMetadataRecord(row.metadata);

  return {
    flow: 'withdrawal' as const,
    orderId: row.orderId,
    providerId: row.providerId ?? getMetadataProviderId(metadata),
    amount: row.amount,
    status: row.status,
    providerReference:
      normalizeReference(row.providerOrderId) ??
      normalizeReference(getMetadataReference(metadata)) ??
      normalizeReference(refs.settlement.get(row.orderId)) ??
      normalizeReference(refs.provider.get(row.orderId)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata,
    sourceMetadata: metadata,
  } satisfies LocalOrderRow;
};

const loadDepositOrders = async (
  providerId: number,
  since: Date,
  limit: number
): Promise<LocalOrderRow[]> => {
  const rows = await db
    .select({
      orderId: deposits.id,
      providerId: deposits.providerId,
      amount: deposits.amount,
      status: deposits.status,
      referenceId: deposits.referenceId,
      providerOrderId: deposits.providerOrderId,
      metadata: deposits.metadata,
      createdAt: deposits.createdAt,
      updatedAt: deposits.updatedAt,
    })
    .from(deposits)
    .where(
      and(
        eq(deposits.providerId, providerId),
        or(
          gte(deposits.createdAt, since),
          inArray(deposits.status, [...DEPOSIT_OPEN_STATUSES])
        )
      )
    )
    .orderBy(desc(deposits.updatedAt))
    .limit(limit);

  const refs = await buildReferenceMaps(
    'deposit',
    rows.map((row) => row.orderId)
  );

  return rows.map((row) => mapDepositOrderRow(row, refs));
};

const loadWithdrawalOrders = async (
  providerId: number,
  since: Date,
  limit: number
): Promise<LocalOrderRow[]> => {
  const rows = await db
    .select({
      orderId: withdrawals.id,
      providerId: withdrawals.providerId,
      amount: withdrawals.amount,
      status: withdrawals.status,
      providerOrderId: withdrawals.providerOrderId,
      metadata: withdrawals.metadata,
      createdAt: withdrawals.createdAt,
      updatedAt: withdrawals.updatedAt,
    })
    .from(withdrawals)
    .where(
      or(
        gte(withdrawals.createdAt, since),
        inArray(withdrawals.status, [...WITHDRAWAL_OPEN_STATUSES])
      )
    )
    .orderBy(desc(withdrawals.updatedAt))
    .limit(limit * 3);

  const refs = await buildReferenceMaps(
    'withdrawal',
    rows.map((row) => row.orderId)
  );

  return rows
    .map((row) => mapWithdrawalOrderRow(row, refs))
    .filter((row) => row.providerId === providerId)
    .slice(0, limit);
};

const loadLocalOrders = async (
  provider: PreparedPaymentProvider,
  since: Date
): Promise<LocalOrderRow[]> => {
  const limit = getProviderOrderLimit(provider);
  const flows = getSupportedFlows(provider);
  const results = await Promise.all(
    flows.map((flow) =>
      flow === 'deposit'
        ? loadDepositOrders(provider.id, since, limit)
        : loadWithdrawalOrders(provider.id, since, limit)
    )
  );

  return results.flat().sort((left, right) => {
    const rightTime = new Date(right.updatedAt).getTime();
    const leftTime = new Date(left.updatedAt).getTime();
    return rightTime - leftTime;
  });
};

const loadDepositOrderById = async (orderId: number) => {
  const [row] = await db
    .select({
      orderId: deposits.id,
      providerId: deposits.providerId,
      amount: deposits.amount,
      status: deposits.status,
      referenceId: deposits.referenceId,
      providerOrderId: deposits.providerOrderId,
      metadata: deposits.metadata,
      createdAt: deposits.createdAt,
      updatedAt: deposits.updatedAt,
    })
    .from(deposits)
    .where(eq(deposits.id, orderId))
    .limit(1);

  if (!row) {
    return null;
  }

  const refs = await buildReferenceMaps('deposit', [orderId]);
  return mapDepositOrderRow(row, refs);
};

const loadWithdrawalOrderById = async (orderId: number) => {
  const [row] = await db
    .select({
      orderId: withdrawals.id,
      providerId: withdrawals.providerId,
      amount: withdrawals.amount,
      status: withdrawals.status,
      providerOrderId: withdrawals.providerOrderId,
      metadata: withdrawals.metadata,
      createdAt: withdrawals.createdAt,
      updatedAt: withdrawals.updatedAt,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, orderId))
    .limit(1);

  if (!row) {
    return null;
  }

  const refs = await buildReferenceMaps('withdrawal', [orderId]);
  return mapWithdrawalOrderRow(row, refs);
};

const loadLocalOrderById = async (flow: PaymentFlow, orderId: number) =>
  flow === 'deposit'
    ? loadDepositOrderById(orderId)
    : loadWithdrawalOrderById(orderId);

const loadLedgerEntriesByOrder = async (flow: PaymentFlow, orderIds: number[]) => {
  if (orderIds.length === 0) {
    return new Map<number, Array<{ entryType: string; amount: string }>>();
  }

  const rows = await db
    .select({
      referenceId: ledgerEntries.referenceId,
      entryType: ledgerEntries.entryType,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.referenceType, flow),
        inArray(ledgerEntries.referenceId, orderIds)
      )
    );

  const map = new Map<number, Array<{ entryType: string; amount: string }>>();
  for (const row of rows) {
    if (typeof row.referenceId !== 'number') {
      continue;
    }

    const entries = map.get(row.referenceId) ?? [];
    entries.push({
      entryType: row.entryType,
      amount: row.amount,
    });
    map.set(row.referenceId, entries);
  }

  return map;
};

const buildDepositLedgerSummary = (
  order: LocalOrderRow,
  entries: Array<{ entryType: string; amount: string }>
): ReconciliationLedgerSummary => {
  const creditEntries = entries.filter((entry) => entry.entryType === 'deposit_credit');
  const reversedEntries = entries.filter((entry) => entry.entryType === 'deposit_reversed');
  const creditMatches =
    creditEntries.length === 1 && toMoneyEquals(creditEntries[0]?.amount, order.amount);

  if (order.status === 'credited') {
    return {
      status: creditMatches ? 'ok' : 'missing_credit',
      healthy: creditMatches,
      metadata: {
        expectedAmount: order.amount,
        creditEntryCount: creditEntries.length,
      },
    };
  }

  if (order.status === 'reversed') {
    const reversedAmount = new Decimal(order.amount).negated().toFixed(2);
    const reversalHealthy =
      (creditEntries.length === 0 && reversedEntries.length === 0) ||
      (creditEntries.length === 1 &&
        reversedEntries.length === 1 &&
        toMoneyEquals(creditEntries[0]?.amount, order.amount) &&
        toMoneyEquals(reversedEntries[0]?.amount, reversedAmount));

    return {
      status: reversalHealthy ? 'ok' : 'missing_reverse',
      healthy: reversalHealthy,
      metadata: {
        expectedAmount: order.amount,
        creditEntryCount: creditEntries.length,
        reversedEntryCount: reversedEntries.length,
      },
    };
  }

  const unexpectedSettlement = creditEntries.length > 0 || reversedEntries.length > 0;
  return {
    status: unexpectedSettlement ? 'unexpected_credit' : 'ok',
    healthy: !unexpectedSettlement,
    metadata: {
      expectedAmount: order.amount,
      creditEntryCount: creditEntries.length,
      reversedEntryCount: reversedEntries.length,
    },
  };
};

const buildWithdrawalLedgerSummary = (
  order: LocalOrderRow,
  entries: Array<{ entryType: string; amount: string }>
): ReconciliationLedgerSummary => {
  const requestEntries = entries.filter((entry) => entry.entryType === 'withdraw_request');
  const rejectedRefundEntries = entries.filter(
    (entry) => entry.entryType === 'withdraw_rejected_refund'
  );
  const reversedRefundEntries = entries.filter(
    (entry) => entry.entryType === 'withdraw_reversed_refund'
  );
  const legacyProviderFailedRefundEntries = entries.filter(
    (entry) => entry.entryType === 'withdraw_provider_failed_refund'
  );
  const paidEntries = entries.filter((entry) => entry.entryType === 'withdraw_paid');

  const requestHealthy =
    requestEntries.length === 1 &&
    toMoneyEquals(requestEntries[0]?.amount, new Decimal(order.amount).negated().toFixed(2));

  if (!requestHealthy) {
    return {
      status: 'missing_request',
      healthy: false,
      metadata: {
        requestEntryCount: requestEntries.length,
      },
    };
  }

  if (order.status === 'paid') {
    const paidHealthy =
      paidEntries.length === 1 &&
      toMoneyEquals(paidEntries[0]?.amount, new Decimal(order.amount).negated().toFixed(2)) &&
      rejectedRefundEntries.length === 0 &&
      reversedRefundEntries.length === 0 &&
      legacyProviderFailedRefundEntries.length === 0;
    return {
      status: paidHealthy ? 'ok' : 'missing_paid_entry',
      healthy: paidHealthy,
      metadata: {
        paidEntryCount: paidEntries.length,
        rejectedRefundEntryCount: rejectedRefundEntries.length,
        reversedRefundEntryCount: reversedRefundEntries.length,
        providerFailedRefundEntryCount: legacyProviderFailedRefundEntries.length,
      },
    };
  }

  if (order.status === 'rejected') {
    const refundHealthy =
      rejectedRefundEntries.length === 1 &&
      toMoneyEquals(rejectedRefundEntries[0]?.amount, order.amount) &&
      paidEntries.length === 0 &&
      reversedRefundEntries.length === 0 &&
      legacyProviderFailedRefundEntries.length === 0;
    return {
      status: refundHealthy ? 'ok' : 'missing_refund_entry',
      healthy: refundHealthy,
      metadata: {
        paidEntryCount: paidEntries.length,
        rejectedRefundEntryCount: rejectedRefundEntries.length,
        reversedRefundEntryCount: reversedRefundEntries.length,
        providerFailedRefundEntryCount: legacyProviderFailedRefundEntries.length,
      },
    };
  }

  if (order.status === 'reversed') {
    const refundHealthy =
      reversedRefundEntries.length === 1 &&
      toMoneyEquals(reversedRefundEntries[0]?.amount, order.amount) &&
      paidEntries.length <= 1 &&
      rejectedRefundEntries.length === 0 &&
      legacyProviderFailedRefundEntries.length === 0;
    return {
      status: refundHealthy ? 'ok' : 'missing_refund_entry',
      healthy: refundHealthy,
      metadata: {
        paidEntryCount: paidEntries.length,
        rejectedRefundEntryCount: rejectedRefundEntries.length,
        reversedRefundEntryCount: reversedRefundEntries.length,
        providerFailedRefundEntryCount: legacyProviderFailedRefundEntries.length,
      },
    };
  }

  const unexpectedSettlement =
    paidEntries.length > 0 ||
    rejectedRefundEntries.length > 0 ||
    reversedRefundEntries.length > 0 ||
    legacyProviderFailedRefundEntries.length > 0;
  return {
    status: unexpectedSettlement ? 'unexpected_settlement_entry' : 'ok',
    healthy: !unexpectedSettlement,
    metadata: {
      paidEntryCount: paidEntries.length,
      rejectedRefundEntryCount: rejectedRefundEntries.length,
      reversedRefundEntryCount: reversedRefundEntries.length,
      providerFailedRefundEntryCount: legacyProviderFailedRefundEntries.length,
    },
  };
};

const buildLedgerSummaryMap = async (orders: LocalOrderRow[]) => {
  const depositsById = orders.filter((order) => order.flow === 'deposit');
  const withdrawalsById = orders.filter((order) => order.flow === 'withdrawal');
  const [depositEntries, withdrawalEntries] = await Promise.all([
    loadLedgerEntriesByOrder(
      'deposit',
      depositsById.map((order) => order.orderId)
    ),
    loadLedgerEntriesByOrder(
      'withdrawal',
      withdrawalsById.map((order) => order.orderId)
    ),
  ]);

  const result = new Map<number, ReconciliationLedgerSummary>();

  for (const order of orders) {
    result.set(
      order.orderId,
      order.flow === 'deposit'
        ? buildDepositLedgerSummary(order, depositEntries.get(order.orderId) ?? [])
        : buildWithdrawalLedgerSummary(
            order,
            withdrawalEntries.get(order.orderId) ?? []
          )
    );
  }

  return result;
};

const loadLedgerSummaryForOrder = async (order: LocalOrderRow) => {
  const entriesByOrder = await loadLedgerEntriesByOrder(order.flow, [order.orderId]);
  const entries = entriesByOrder.get(order.orderId) ?? [];

  return order.flow === 'deposit'
    ? buildDepositLedgerSummary(order, entries)
    : buildWithdrawalLedgerSummary(order, entries);
};

const buildRemoteOrderMap = (orders: PaymentAdapterReconciliationOrder[]) => {
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

const buildReconciliationSettlementReference = (
  provider: PreparedPaymentProvider,
  order: LocalOrderRow,
  remote: PaymentAdapterReconciliationOrder | null
) =>
  normalizeReference(
    remote?.referenceId ?? remote?.providerOrderId ?? order.providerReference
  ) ?? `reconciliation-${provider.id}-${order.flow}-${order.orderId}`;

const buildReconciliationSourceEventKey = (
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

const readReconciliationProcessingChannel = (
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

const buildReconciliationReview = (params: {
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

const attemptDepositAutoRepair = async (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  timedOut: boolean;
}) => {
  const actions: AutoRepairAction[] = [];
  let currentStatus = params.order.status;
  const remote = params.remote;
  const baseNote = remote
    ? `Payment reconciliation synchronized the deposit with remote status ${remote.status}.`
    : 'Payment reconciliation closed the deposit after no remote order was found.';

  const callAction = async (
    action: AutoRepairAction,
    operation: () => Promise<{ status?: string | null } | null>
  ) => {
    const result = await operation();
    actions.push(action);
    currentStatus = readActionResultStatus(result, currentStatus);
  };

  if (remote !== null) {
    if (remote.amount && !toMoneyEquals(remote.amount, params.order.amount)) {
      return { actions, error: null } satisfies AutoRepairOutcome;
    }

    if (remote.status === 'pending' && currentStatus === 'requested') {
      await callAction('deposit_mark_provider_pending', () =>
        markDepositProviderPending(
          params.order.orderId,
          buildReconciliationReview({
            provider: params.provider,
            order: params.order,
            remote,
            note: baseNote,
          })
        )
      );
    }

    if (isRemoteSuccessLike(remote)) {
      if (currentStatus === 'requested') {
        await callAction('deposit_mark_provider_pending', () =>
          markDepositProviderPending(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }

      if (currentStatus === 'provider_pending' || currentStatus === 'provider_failed') {
        await callAction('deposit_mark_provider_succeeded', () =>
          markDepositProviderSucceeded(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }

      if (currentStatus === 'provider_succeeded') {
        await callAction('deposit_credit', () =>
          creditDeposit(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }
    }

    if (isRemoteFailureLike(remote)) {
      if (currentStatus === 'requested' || currentStatus === 'provider_pending') {
        await callAction('deposit_mark_provider_failed', () =>
          failDeposit(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      } else if (
        currentStatus === 'provider_succeeded' ||
        currentStatus === 'credited'
      ) {
        await callAction('deposit_reverse', () =>
          reverseDeposit(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }
    }

    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!params.timedOut) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!normalizeReference(params.order.providerReference)) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (currentStatus === 'requested' || currentStatus === 'provider_pending') {
    await callAction('deposit_mark_provider_failed', () =>
      failDeposit(
        params.order.orderId,
        buildReconciliationReview({
          provider: params.provider,
          order: params.order,
          remote: null,
          note: baseNote,
        })
      )
    );
  } else if (currentStatus === 'provider_succeeded') {
    await callAction('deposit_reverse', () =>
      reverseDeposit(
        params.order.orderId,
        buildReconciliationReview({
          provider: params.provider,
          order: params.order,
          remote: null,
          note: baseNote,
        })
      )
    );
  }

  return { actions, error: null } satisfies AutoRepairOutcome;
};

const attemptWithdrawalAutoRepair = async (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  timedOut: boolean;
}) => {
  const actions: AutoRepairAction[] = [];
  let currentStatus = params.order.status;
  const remote = params.remote;
  const baseNote = remote
    ? `Payment reconciliation synchronized the withdrawal with remote status ${remote.status}.`
    : 'Payment reconciliation reversed the withdrawal after no remote order was found.';

  const callAction = async (
    action: AutoRepairAction,
    operation: () => Promise<{ status?: string | null } | null>
  ) => {
    const result = await operation();
    actions.push(action);
    currentStatus = readActionResultStatus(result, currentStatus);
  };

  if (remote !== null) {
    if (remote.amount && !toMoneyEquals(remote.amount, params.order.amount)) {
      return { actions, error: null } satisfies AutoRepairOutcome;
    }

    if (isRemoteApprovedLike(remote) && currentStatus === 'requested') {
      await callAction('withdrawal_approve', () =>
        approveWithdrawal(
          params.order.orderId,
          buildReconciliationReview({
            provider: params.provider,
            order: params.order,
            remote,
            note: baseNote,
          })
        )
      );
    }

    if (isRemoteProcessingLike(remote) || isRemoteSuccessLike(remote)) {
      if (currentStatus === 'requested') {
        await callAction('withdrawal_approve', () =>
          approveWithdrawal(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }

      if (currentStatus === 'approved') {
        await callAction('withdrawal_mark_provider_submitted', () =>
          markWithdrawalProviderSubmitted(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }
    }

    if (isRemoteProcessingLike(remote) || isRemoteSuccessLike(remote)) {
      if (currentStatus === 'approved' || currentStatus === 'provider_submitted') {
        await callAction('withdrawal_mark_provider_processing', () =>
          markWithdrawalProviderProcessing(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }
    }

    if (isRemoteSuccessLike(remote) && currentStatus === 'provider_processing') {
      await callAction('withdrawal_pay', () =>
        payWithdrawal(
          params.order.orderId,
          buildReconciliationReview({
            provider: params.provider,
            order: params.order,
            remote,
            note: baseNote,
          })
        )
      );
    }

    if (isRemoteFailureLike(remote)) {
      if (currentStatus === 'requested' || currentStatus === 'approved') {
        await callAction('withdrawal_reject', () =>
          rejectWithdrawal(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      } else if (
        currentStatus === 'provider_submitted' ||
        currentStatus === 'provider_processing' ||
        currentStatus === 'provider_failed' ||
        currentStatus === 'paid'
      ) {
        await callAction('withdrawal_reverse', () =>
          reverseWithdrawal(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            })
          )
        );
      }
    }

    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!params.timedOut) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!normalizeReference(params.order.providerReference)) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (
    currentStatus === 'requested' ||
    currentStatus === 'approved' ||
    currentStatus === 'provider_submitted' ||
    currentStatus === 'provider_processing'
  ) {
    await callAction('withdrawal_reverse', () =>
      reverseWithdrawal(
        params.order.orderId,
        buildReconciliationReview({
          provider: params.provider,
          order: params.order,
          remote: null,
          note: baseNote,
        })
      )
    );
  }

  return { actions, error: null } satisfies AutoRepairOutcome;
};

const attemptAutoRepairForOrder = async (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  timeoutMs: number;
  now: Date;
}) => {
  const timedOut = isTimedOutNonTerminalOrder(
    params.order,
    params.now,
    params.timeoutMs
  );

  try {
    return params.order.flow === 'deposit'
      ? await attemptDepositAutoRepair({
          provider: params.provider,
          order: params.order,
          remote: params.remote,
          timedOut,
        })
      : await attemptWithdrawalAutoRepair({
          provider: params.provider,
          order: params.order,
          remote: params.remote,
          timedOut,
        });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'payment reconciliation auto repair failed';
    logger.error('payment reconciliation auto repair failed', {
      providerId: params.provider.id,
      flow: params.order.flow,
      orderId: params.order.orderId,
      remoteStatus: params.remote?.status ?? null,
      err: error,
    });

    return {
      actions: [],
      error: message,
    } satisfies AutoRepairOutcome;
  }
};

const upsertIssue = async (
  runId: number,
  providerId: number | null,
  finding: ReconciliationFinding
) => {
  const now = new Date();
  await db
    .insert(paymentReconciliationIssues)
    .values({
      runId,
      providerId,
      fingerprint: finding.fingerprint,
      flow: finding.flow,
      orderType: finding.orderType,
      orderId: finding.orderId,
      localStatus: finding.localStatus,
      remoteStatus: finding.remoteStatus,
      ledgerStatus: finding.ledgerStatus,
      localReference: finding.localReference,
      remoteReference: finding.remoteReference,
      issueType: finding.issueType,
      severity: finding.severity,
      requiresManualReview: finding.requiresManualReview,
      autoRecheckEligible: finding.autoRecheckEligible,
      status: OPEN_ISSUE_STATUS,
      metadata: finding.metadata,
      firstDetectedAt: now,
      lastDetectedAt: now,
      resolvedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: paymentReconciliationIssues.fingerprint,
      set: {
        runId,
        providerId,
        flow: finding.flow,
        orderType: finding.orderType,
        orderId: finding.orderId,
        localStatus: finding.localStatus,
        remoteStatus: finding.remoteStatus,
        ledgerStatus: finding.ledgerStatus,
        localReference: finding.localReference,
        remoteReference: finding.remoteReference,
        issueType: finding.issueType,
        severity: finding.severity,
        requiresManualReview: finding.requiresManualReview,
        autoRecheckEligible: finding.autoRecheckEligible,
        status: OPEN_ISSUE_STATUS,
        metadata: finding.metadata,
        lastDetectedAt: now,
        resolvedAt: null,
        updatedAt: now,
      },
    });
};

const resolveIssuesForOrder = async (order: LocalOrderRow, remoteReference?: string | null) => {
  await db
    .update(paymentReconciliationIssues)
    .set({
      status: RESOLVED_ISSUE_STATUS,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS),
        eq(paymentReconciliationIssues.orderType, order.flow),
        eq(paymentReconciliationIssues.orderId, order.orderId)
      )
    );

  const normalizedRemoteReference = normalizeReference(remoteReference);
  if (!normalizedRemoteReference) {
    return;
  }

  await db
    .update(paymentReconciliationIssues)
    .set({
      status: RESOLVED_ISSUE_STATUS,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS),
        eq(paymentReconciliationIssues.issueType, 'local_order_missing'),
        eq(paymentReconciliationIssues.remoteReference, normalizedRemoteReference)
      )
    );
};

const resolveProviderAdapterMissingIssues = async (providerId: number) => {
  await db
    .update(paymentReconciliationIssues)
    .set({
      status: RESOLVED_ISSUE_STATUS,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentReconciliationIssues.providerId, providerId),
        eq(paymentReconciliationIssues.issueType, 'provider_adapter_missing'),
        eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS)
      )
    );
};

const createRun = async (params: {
  providerId: number | null;
  trigger: ReconciliationRunTrigger;
  adapter: string | null;
  windowStartedAt: Date;
  windowEndedAt: Date;
}) => {
  const [created] = await db
    .insert(paymentReconciliationRuns)
    .values({
      providerId: params.providerId,
      trigger: params.trigger,
      status: 'running',
      adapter: params.adapter,
      windowStartedAt: params.windowStartedAt,
      windowEndedAt: params.windowEndedAt,
      startedAt: params.windowEndedAt,
      createdAt: params.windowEndedAt,
      updatedAt: params.windowEndedAt,
    })
    .returning();

  return created;
};

const finishRun = async (runId: number, status: ReconciliationRunStatus, summary: unknown) => {
  await db
    .update(paymentReconciliationRuns)
    .set({
      status,
      summary,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(paymentReconciliationRuns.id, runId));
};

export async function runProviderReconciliation(params: {
  provider: PreparedPaymentProvider;
  trigger: ReconciliationRunTrigger;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const provider = params.provider;
  const adapterKey = getProviderConfigAdapterKey(provider);
  const lookbackMinutes = getProviderLookbackMinutes(provider);
  const timeoutMinutes = getProviderTimeoutMinutes(provider);
  const windowStartedAt = new Date(now.getTime() - lookbackMinutes * 60_000);
  const run = await createRun({
    providerId: provider.id,
    trigger: params.trigger,
    adapter: adapterKey,
    windowStartedAt,
    windowEndedAt: now,
  });

  try {
    const flows = getSupportedFlows(provider);
    if (!isReconciliationEnabled(provider)) {
      await finishRun(run.id, 'skipped', {
        reason: 'provider_reconciliation_disabled',
      });
      return { runId: run.id, status: 'skipped' as const };
    }

    if (flows.length === 0) {
      await finishRun(run.id, 'skipped', {
        reason: 'provider_has_no_supported_flows',
      });
      return { runId: run.id, status: 'skipped' as const };
    }

    const adapter = getRegisteredPaymentAdapter(adapterKey);
    if (!adapter || !adapter.supportsReconciliation) {
      const finding = buildProviderAdapterMissingFinding({
        providerId: provider.id,
        flow: flows[0],
        adapterKey,
      });
      await upsertIssue(run.id, provider.id, finding);
      await finishRun(run.id, 'blocked', {
        reason: 'adapter_missing',
        adapterKey,
        openIssues: 1,
      });
      return { runId: run.id, status: 'blocked' as const };
    }

    await resolveProviderAdapterMissingIssues(provider.id);

    const localOrders = await loadLocalOrders(provider, windowStartedAt);
    const ledgerSummaries = await buildLedgerSummaryMap(localOrders);
    const localReferences = localOrders
      .map((order) => normalizeReference(order.providerReference))
      .filter((value): value is string => value !== null);
    const remoteOrders = await adapter.listOrdersForReconciliation({
      providerId: provider.id,
      config: provider.parsedConfig,
      flows,
      since: windowStartedAt,
      until: now,
      localReferences,
    });
    const remoteOrdersByReference = buildRemoteOrderMap(remoteOrders);

    const findings: ReconciliationFinding[] = [];
    const evaluatedOrders: LocalOrderRow[] = [];
    const matchedRemoteKeys = new Set<string>();
    const timeoutMs = timeoutMinutes * 60_000;
    const autoRepairActionCounts = new Map<AutoRepairAction, number>();
    let autoRepairAttemptedCount = 0;
    let autoRepairFailedCount = 0;

    for (const originalOrder of localOrders) {
      let order = originalOrder;
      const referenceKey = normalizeLookupKey(order.providerReference);
      const remote = referenceKey ? remoteOrdersByReference.get(referenceKey) ?? null : null;
      if (referenceKey && remote) {
        matchedRemoteKeys.add(referenceKey);
      }

      let ledger = ledgerSummaries.get(order.orderId) ?? {
        status: 'missing_ledger_snapshot',
        healthy: false,
      };

      const autoRepair = await attemptAutoRepairForOrder({
        provider,
        order,
        remote,
        timeoutMs,
        now,
      });
      if (autoRepair.actions.length > 0 || autoRepair.error) {
        autoRepairAttemptedCount += 1;
        if (autoRepair.error) {
          autoRepairFailedCount += 1;
        }
        for (const action of autoRepair.actions) {
          autoRepairActionCounts.set(
            action,
            (autoRepairActionCounts.get(action) ?? 0) + 1
          );
        }

        const refreshedOrder = await loadLocalOrderById(order.flow, order.orderId);
        if (refreshedOrder) {
          order = refreshedOrder;
          ledger = await loadLedgerSummaryForOrder(order);
        }
      }

      evaluatedOrders.push(order);

      const orderFindings = buildOrderFindings({
        providerId: provider.id,
        order,
        remote,
        ledger,
        now,
        timeoutMs,
      }).map((finding) =>
        autoRepair.actions.length === 0 && autoRepair.error === null
          ? finding
          : {
              ...finding,
              metadata: {
                ...finding.metadata,
                autoRepair: {
                  actions: autoRepair.actions,
                  error: autoRepair.error,
                },
              },
            }
      );

      await resolveIssuesForOrder(order, remote?.referenceId ?? remote?.providerOrderId);

      if (orderFindings.length === 0) {
        continue;
      }

      for (const finding of orderFindings) {
        findings.push(finding);
        await upsertIssue(run.id, provider.id, finding);
      }
    }

    for (const remote of remoteOrders) {
      const key = normalizeLookupKey(remote.referenceId ?? remote.providerOrderId);
      if (!key || matchedRemoteKeys.has(key)) {
        continue;
      }

      const finding = buildRemoteOnlyFinding({
        providerId: provider.id,
        remote,
      });
      findings.push(finding);
      await upsertIssue(run.id, provider.id, finding);
    }

    const summary = {
      providerId: provider.id,
      providerName: provider.name,
      adapterKey: adapter.key,
      flows,
      localOrderCount: localOrders.length,
      remoteOrderCount: remoteOrders.length,
      autoRepairAttemptedCount,
      autoRepairFailedCount,
      autoRepairActionCount: Array.from(autoRepairActionCounts.values()).reduce(
        (total, count) => total + count,
        0
      ),
      autoRepairActions: Object.fromEntries(autoRepairActionCounts),
      issueCount: findings.length,
      manualQueueCount: findings.filter((finding) => finding.requiresManualReview).length,
      timedOutCount: findings.filter(
        (finding) => finding.issueType === 'timed_out_non_terminal'
      ).length,
      orderStatuses: Object.fromEntries(
        evaluatedOrders.reduce<Map<string, number>>((counts, order) => {
          counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
          return counts;
        }, new Map())
      ),
    };

    await finishRun(run.id, 'completed', summary);
    logger.info('payment reconciliation run completed', summary);

    return {
      runId: run.id,
      status: 'completed' as const,
      summary,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'payment reconciliation failed';
    await finishRun(run.id, 'failed', {
      error: message,
    });
    logger.error('payment reconciliation run failed', {
      providerId: provider.id,
      err: error,
    });
    throw error;
  }
}

export async function runPaymentReconciliationCycle(params: {
  providerId?: number | null;
  trigger: ReconciliationRunTrigger;
  now?: Date;
}) {
  const providers = await listActiveProviders(db);
  const selectedProviders =
    typeof params.providerId === 'number'
      ? providers.filter((provider) => provider.id === params.providerId)
      : providers;

  const results = [];
  for (const provider of selectedProviders) {
    results.push(
      await runProviderReconciliation({
        provider,
        trigger: params.trigger,
        now: params.now,
      })
    );
  }

  return {
    providerCount: selectedProviders.length,
    results,
  };
}

export async function listPaymentReconciliationRuns(limit = 50) {
  return db
    .select({
      id: paymentReconciliationRuns.id,
      providerId: paymentReconciliationRuns.providerId,
      providerName: paymentProviders.name,
      trigger: paymentReconciliationRuns.trigger,
      status: paymentReconciliationRuns.status,
      adapter: paymentReconciliationRuns.adapter,
      summary: paymentReconciliationRuns.summary,
      startedAt: paymentReconciliationRuns.startedAt,
      completedAt: paymentReconciliationRuns.completedAt,
      createdAt: paymentReconciliationRuns.createdAt,
    })
    .from(paymentReconciliationRuns)
    .leftJoin(
      paymentProviders,
      eq(paymentProviders.id, paymentReconciliationRuns.providerId)
    )
    .orderBy(desc(paymentReconciliationRuns.id))
    .limit(limit);
}

export async function listPaymentReconciliationIssues(limit = 100) {
  return db
    .select()
    .from(paymentReconciliationIssues)
    .where(eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS))
    .orderBy(
      asc(paymentReconciliationIssues.status),
      desc(paymentReconciliationIssues.lastDetectedAt)
    )
    .limit(limit);
}
