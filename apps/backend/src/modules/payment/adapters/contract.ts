import type { PaymentFlow, PaymentOrderStatus } from '../types';

export type PaymentAdapterConfig = Record<string, unknown>;

type PaymentAdapterContext = {
  providerId: number | null;
  providerName?: string | null;
  flow: PaymentFlow;
  config: PaymentAdapterConfig;
};

export type PaymentAdapterConfigurationValidationInput = {
  providerId: number | null;
  providerName?: string | null;
  config: PaymentAdapterConfig;
};

export type PaymentAdapterCreateDepositOrderInput = PaymentAdapterContext & {
  internalOrderId: number;
  userId: number;
  amount: string;
  idempotencyKey?: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentAdapterCreateWithdrawalInput = PaymentAdapterContext & {
  internalOrderId: number;
  userId: number;
  amount: string;
  idempotencyKey?: string;
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
  providerName?: string | null;
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
  validateConfiguration?(
    input: PaymentAdapterConfigurationValidationInput
  ): void | Promise<void>;
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
