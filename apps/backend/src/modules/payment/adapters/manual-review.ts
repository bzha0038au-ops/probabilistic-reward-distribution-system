import { internalInvariantError } from '../../../shared/errors';

import type { PaymentFlow, PaymentOrderStatus } from '../types';
import {
  normalizePaymentAdapterKey,
  type PaymentAdapter,
  type PaymentAdapterConfig,
  type PaymentAdapterCreateOrderResult,
  type PaymentAdapterMapStatusInput,
  type PaymentAdapterOrderSnapshot,
  type PaymentAdapterReconciliationOrder,
  type PaymentAdapterWebhookResult,
} from './contract';

const unsupportedManualOperation = (operation: string): never => {
  throw internalInvariantError(
    `Payment adapter "manual_review" does not support ${operation}; finance execution must stay on manual review.`
  );
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const toRecordArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item)
      )
    : [];

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readDate = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const getReconciliationOrderRecords = (config: PaymentAdapterConfig) => {
  const normalized = toRecord(config);
  const nested = toRecord(Reflect.get(normalized, 'reconciliationSnapshot'));

  return toRecordArray(
    Reflect.get(normalized, 'reconciliationOrders') ??
      Reflect.get(nested, 'orders') ??
      []
  );
};

const mapManualReviewStatus = ({
  flow,
  providerStatus,
}: PaymentAdapterMapStatusInput): PaymentOrderStatus => {
  const status = normalizePaymentAdapterKey(providerStatus);

  if (flow === 'deposit') {
    if (status === 'success' || status === 'succeeded' || status === 'paid') {
      return 'success';
    }
    if (status === 'failed' || status === 'fail') {
      return 'failed';
    }

    return 'pending';
  }

  if (status === 'approved') {
    return 'approved';
  }
  if (status === 'paid' || status === 'success' || status === 'succeeded') {
    return 'paid';
  }
  if (status === 'rejected' || status === 'failed') {
    return 'rejected';
  }

  return 'pending';
};

export const manualReviewPaymentAdapter: PaymentAdapter = {
  key: 'manual_review',
  displayName: 'Manual Review',
  supportedFlows: ['deposit', 'withdrawal'],
  supportsAutomation: false,
  supportsReconciliation: true,
  async createDepositOrder(): Promise<PaymentAdapterCreateOrderResult> {
    return unsupportedManualOperation('createDepositOrder');
  },
  async createWithdrawal(): Promise<PaymentAdapterCreateOrderResult> {
    return unsupportedManualOperation('createWithdrawal');
  },
  async queryOrder(): Promise<PaymentAdapterOrderSnapshot> {
    return unsupportedManualOperation('queryOrder');
  },
  async handleWebhook(): Promise<PaymentAdapterWebhookResult> {
    return unsupportedManualOperation('handleWebhook');
  },
  async verifySignature() {
    return false;
  },
  buildIdempotencyKey(input) {
    return [
      'manual_review',
      input.flow,
      input.providerId ?? 'no_provider',
      input.internalOrderId,
      normalizePaymentAdapterKey(input.operation),
    ].join(':');
  },
  async listOrdersForReconciliation(input) {
    const flowFilter = new Set(input.flows);
    const localReferences = new Set(
      (input.localReferences ?? []).map((item) => normalizePaymentAdapterKey(item))
    );

    const orders: PaymentAdapterReconciliationOrder[] = [];
    for (const item of getReconciliationOrderRecords(input.config)) {
      const flowValue = readString(Reflect.get(item, 'flow'));
      if (!flowValue) {
        continue;
      }

      const flow = normalizePaymentAdapterKey(flowValue) as PaymentFlow;
      if (!flowFilter.has(flow)) {
        continue;
      }

      const referenceId =
        readString(Reflect.get(item, 'referenceId')) ??
        readString(Reflect.get(item, 'reference')) ??
        null;
      const providerOrderId = readString(Reflect.get(item, 'providerOrderId'));
      const rawStatus =
        readString(Reflect.get(item, 'rawStatus')) ??
        readString(Reflect.get(item, 'status')) ??
        'pending';
      const updatedAtValue = readString(Reflect.get(item, 'updatedAt'));
      const updatedAt = readDate(updatedAtValue);

      if (
        updatedAt &&
        (updatedAt.getTime() < input.since.getTime() ||
          updatedAt.getTime() > input.until.getTime())
      ) {
        continue;
      }

      if (
        localReferences.size > 0 &&
        referenceId &&
        !localReferences.has(normalizePaymentAdapterKey(referenceId))
      ) {
        const includeUnmatched = Reflect.get(item, 'includeWhenUnmatched') === true;
        if (!includeUnmatched) {
          continue;
        }
      }

      if (referenceId === null && providerOrderId === null) {
        continue;
      }

      orders.push({
        flow,
        providerOrderId,
        referenceId,
        status: mapManualReviewStatus({
          flow,
          providerStatus: rawStatus,
        }),
        rawStatus,
        amount: readString(Reflect.get(item, 'amount')),
        metadata: {
          ...toRecord(Reflect.get(item, 'metadata')),
          source: 'manual_review_reconciliation_snapshot',
        },
        updatedAt: updatedAtValue,
      });
    }

    return orders;
  },
  mapProviderStatusToInternalStatus(input) {
    return mapManualReviewStatus(input);
  },
};
