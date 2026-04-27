import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  or,
} from '@reward/database/orm';
import Decimal from 'decimal.js';

import { db } from '../../../db';
import {
  deposits,
  ledgerEntries,
  paymentProviderEvents,
  paymentSettlementEvents,
  withdrawals,
} from '@reward/database';
import { type ReconciliationLedgerSummary } from './findings';
import {
  DEPOSIT_OPEN_STATUSES,
  WITHDRAWAL_OPEN_STATUSES,
  getMetadataProviderId,
  getMetadataReference,
  getProviderOrderLimit,
  getSupportedFlows,
  normalizeReference,
  toMetadataRecord,
  toMoneyEquals,
  type LatestReferenceMaps,
  type LocalOrderRow,
} from './workflow';
import { type PreparedPaymentProvider } from '../service';
import type { PaymentFlow } from '../types';

const buildReferenceMaps = async (
  flow: PaymentFlow,
  orderIds: number[],
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
          isNotNull(paymentProviderEvents.externalReference),
        ),
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
          isNotNull(paymentSettlementEvents.settlementReference),
        ),
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
  refs: LatestReferenceMaps,
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
  refs: LatestReferenceMaps,
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
  limit: number,
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
          inArray(deposits.status, [...DEPOSIT_OPEN_STATUSES]),
        ),
      ),
    )
    .orderBy(desc(deposits.updatedAt))
    .limit(limit);

  const refs = await buildReferenceMaps(
    'deposit',
    rows.map((row) => row.orderId),
  );

  return rows.map((row) => mapDepositOrderRow(row, refs));
};

const loadWithdrawalOrders = async (
  providerId: number,
  since: Date,
  limit: number,
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
        inArray(withdrawals.status, [...WITHDRAWAL_OPEN_STATUSES]),
      ),
    )
    .orderBy(desc(withdrawals.updatedAt))
    .limit(limit * 3);

  const refs = await buildReferenceMaps(
    'withdrawal',
    rows.map((row) => row.orderId),
  );

  return rows
    .map((row) => mapWithdrawalOrderRow(row, refs))
    .filter((row) => row.providerId === providerId)
    .slice(0, limit);
};

export const loadLocalOrders = async (
  provider: PreparedPaymentProvider,
  since: Date,
): Promise<LocalOrderRow[]> => {
  const limit = getProviderOrderLimit(provider);
  const flows = getSupportedFlows(provider);
  const results = await Promise.all(
    flows.map((flow) =>
      flow === 'deposit'
        ? loadDepositOrders(provider.id, since, limit)
        : loadWithdrawalOrders(provider.id, since, limit),
    ),
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

export const loadLocalOrderById = async (flow: PaymentFlow, orderId: number) =>
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
        inArray(ledgerEntries.referenceId, orderIds),
      ),
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
  entries: Array<{ entryType: string; amount: string }>,
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
  entries: Array<{ entryType: string; amount: string }>,
): ReconciliationLedgerSummary => {
  const requestEntries = entries.filter((entry) => entry.entryType === 'withdraw_request');
  const rejectedRefundEntries = entries.filter(
    (entry) => entry.entryType === 'withdraw_rejected_refund',
  );
  const reversedRefundEntries = entries.filter(
    (entry) => entry.entryType === 'withdraw_reversed_refund',
  );
  const legacyProviderFailedRefundEntries = entries.filter(
    (entry) => entry.entryType === 'withdraw_provider_failed_refund',
  );
  const paidEntries = entries.filter((entry) => entry.entryType === 'withdraw_paid');

  const requestHealthy =
    requestEntries.length === 1 &&
    toMoneyEquals(
      requestEntries[0]?.amount,
      new Decimal(order.amount).negated().toFixed(2),
    );

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
      toMoneyEquals(
        paidEntries[0]?.amount,
        new Decimal(order.amount).negated().toFixed(2),
      ) &&
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

export const buildLedgerSummaryMap = async (orders: LocalOrderRow[]) => {
  const depositsById = orders.filter((order) => order.flow === 'deposit');
  const withdrawalsById = orders.filter((order) => order.flow === 'withdrawal');
  const [depositEntries, withdrawalEntries] = await Promise.all([
    loadLedgerEntriesByOrder(
      'deposit',
      depositsById.map((order) => order.orderId),
    ),
    loadLedgerEntriesByOrder(
      'withdrawal',
      withdrawalsById.map((order) => order.orderId),
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
            withdrawalEntries.get(order.orderId) ?? [],
          ),
    );
  }

  return result;
};

export const loadLedgerSummaryForOrder = async (order: LocalOrderRow) => {
  const entriesByOrder = await loadLedgerEntriesByOrder(order.flow, [order.orderId]);
  const entries = entriesByOrder.get(order.orderId) ?? [];

  return order.flow === 'deposit'
    ? buildDepositLedgerSummary(order, entries)
    : buildWithdrawalLedgerSummary(order, entries);
};
