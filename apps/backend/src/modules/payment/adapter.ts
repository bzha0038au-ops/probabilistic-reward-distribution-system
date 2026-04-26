import type { PaymentFlow, PaymentOrderStatus } from './types';

export type PaymentAdapterConfig = Record<string, unknown>;

type PaymentAdapterContext = {
  providerId: number | null;
  flow: PaymentFlow;
  config: PaymentAdapterConfig;
};

export type PaymentAdapterCreateDepositOrderInput = PaymentAdapterContext & {
  internalOrderId: number;
  userId: number;
  amount: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentAdapterCreateWithdrawalInput = PaymentAdapterContext & {
  internalOrderId: number;
  userId: number;
  amount: string;
  payoutMethodId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentAdapterQueryOrderInput = PaymentAdapterContext & {
  internalOrderId: number;
  providerOrderId?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentAdapterListReconciliationOrdersInput = {
  providerId: number | null;
  config: PaymentAdapterConfig;
  flows: PaymentFlow[];
  since: Date;
  until: Date;
  localReferences?: string[];
};

export type PaymentAdapterWebhookInput = PaymentAdapterContext & {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  payload: unknown;
};

export type PaymentAdapterVerifySignatureInput = PaymentAdapterContext & {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  payload: unknown;
};

export type PaymentAdapterBuildIdempotencyKeyInput = {
  flow: PaymentFlow;
  internalOrderId: number;
  providerId: number | null;
  operation: string;
};

export type PaymentAdapterMapStatusInput = {
  flow: PaymentFlow;
  providerStatus: string;
  rawStatus?: unknown;
};

export type PaymentAdapterCreateOrderResult = {
  providerOrderId: string | null;
  redirectUrl?: string | null;
  status: PaymentOrderStatus;
  rawStatus?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentAdapterOrderSnapshot = {
  internalOrderId: number;
  providerOrderId: string | null;
  status: PaymentOrderStatus;
  rawStatus?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentAdapterReconciliationOrder = {
  flow: PaymentFlow;
  providerOrderId: string | null;
  referenceId: string | null;
  status: PaymentOrderStatus;
  rawStatus?: string | null;
  amount?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

export type PaymentAdapterWebhookResult = {
  accepted: boolean;
  internalOrderId?: number | null;
  providerOrderId?: string | null;
  status?: PaymentOrderStatus | null;
  metadata?: Record<string, unknown> | null;
};

export interface PaymentAdapter {
  key: string;
  displayName: string;
  supportedFlows: PaymentFlow[];
  supportsAutomation: boolean;
  supportsReconciliation: boolean;
  createDepositOrder(
    input: PaymentAdapterCreateDepositOrderInput
  ): Promise<PaymentAdapterCreateOrderResult>;
  createWithdrawal(
    input: PaymentAdapterCreateWithdrawalInput
  ): Promise<PaymentAdapterCreateOrderResult>;
  queryOrder(input: PaymentAdapterQueryOrderInput): Promise<PaymentAdapterOrderSnapshot>;
  handleWebhook(input: PaymentAdapterWebhookInput): Promise<PaymentAdapterWebhookResult>;
  verifySignature(input: PaymentAdapterVerifySignatureInput): Promise<boolean>;
  buildIdempotencyKey(input: PaymentAdapterBuildIdempotencyKeyInput): string;
  listOrdersForReconciliation(
    input: PaymentAdapterListReconciliationOrdersInput
  ): Promise<PaymentAdapterReconciliationOrder[]>;
  mapProviderStatusToInternalStatus(
    input: PaymentAdapterMapStatusInput
  ): PaymentOrderStatus;
}

export const normalizePaymentAdapterKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const unsupportedManualOperation = (operation: string): never => {
  throw new Error(
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

const manualReviewPaymentAdapter: PaymentAdapter = {
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

const PAYMENT_ADAPTER_REGISTRY = new Map<string, PaymentAdapter>(
  [manualReviewPaymentAdapter].map((adapter) => [adapter.key, adapter])
);

export const listRegisteredPaymentAdapterKeys = () =>
  Array.from(PAYMENT_ADAPTER_REGISTRY.keys()).sort();

export const listAutomatedPaymentAdapterKeys = () =>
  Array.from(PAYMENT_ADAPTER_REGISTRY.values())
    .filter((adapter) => adapter.supportsAutomation)
    .map((adapter) => adapter.key)
    .sort();

export const getRegisteredPaymentAdapter = (key: string | null | undefined) => {
  const normalized = key ? normalizePaymentAdapterKey(key) : '';
  if (normalized === '') {
    return null;
  }

  return PAYMENT_ADAPTER_REGISTRY.get(normalized) ?? null;
};

export const paymentAdapterSupportsFlow = (
  adapter: PaymentAdapter,
  flow: PaymentFlow
) => adapter.supportedFlows.includes(flow);
