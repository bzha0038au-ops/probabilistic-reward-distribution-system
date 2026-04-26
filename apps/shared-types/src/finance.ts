import { z } from 'zod';

export const paymentChannelTypeValues = ['fiat', 'crypto'] as const;
export const PaymentChannelTypeSchema = z.enum(paymentChannelTypeValues);
export type PaymentChannelType = z.infer<typeof PaymentChannelTypeSchema>;

export const paymentAssetTypeValues = ['fiat', 'token'] as const;
export const PaymentAssetTypeSchema = z.enum(paymentAssetTypeValues);
export type PaymentAssetType = z.infer<typeof PaymentAssetTypeSchema>;

export const payoutMethodTypeValues = ['bank_account', 'crypto_address'] as const;
export const PayoutMethodTypeSchema = z.enum(payoutMethodTypeValues);
export type PayoutMethodType = z.infer<typeof PayoutMethodTypeSchema>;

export const payoutMethodStatusValues = ['active', 'inactive'] as const;
export const PayoutMethodStatusSchema = z.enum(payoutMethodStatusValues);
export type PayoutMethodStatus = z.infer<typeof PayoutMethodStatusSchema>;

// Deprecated alias kept for compatibility while `/bank-cards` remains available.
export const bankCardStatusValues = payoutMethodStatusValues;
export const BankCardStatusSchema = PayoutMethodStatusSchema;
export type BankCardStatus = PayoutMethodStatus;

export const depositStatusValues = [
  'requested',
  'provider_pending',
  'provider_succeeded',
  'credited',
  'provider_failed',
  'reversed',
] as const;
export const DepositStatusSchema = z.enum(depositStatusValues);
export type DepositStatus = z.infer<typeof DepositStatusSchema>;

export const withdrawalStatusValues = [
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing',
  'provider_failed',
  'paid',
  'rejected',
  'reversed',
] as const;
export const WithdrawalStatusSchema = z.enum(withdrawalStatusValues);
export type WithdrawalStatus = z.infer<typeof WithdrawalStatusSchema>;

export const financeManualFallbackStatusValues = [
  'requested',
  'provider_pending',
  'provider_succeeded',
  'credited',
  'provider_failed',
  'approved',
  'provider_submitted',
  'provider_processing',
  'paid',
  'rejected',
  'reversed',
] as const;
export const FinanceManualFallbackStatusSchema = z.enum(
  financeManualFallbackStatusValues
);
export type FinanceManualFallbackStatus = z.infer<
  typeof FinanceManualFallbackStatusSchema
>;

export const paymentFlowValues = ['deposit', 'withdrawal'] as const;
export const PaymentFlowSchema = z.enum(paymentFlowValues);
export type PaymentFlow = z.infer<typeof PaymentFlowSchema>;

export const paymentProcessingModeValues = ['manual', 'provider'] as const;
export const PaymentProcessingModeSchema = z.enum(paymentProcessingModeValues);
export type PaymentProcessingMode = z.infer<typeof PaymentProcessingModeSchema>;

export const paymentOrderStatusValues = [
  'pending',
  'processing',
  'approved',
  'success',
  'failed',
  'rejected',
  'paid',
] as const;
export const PaymentOrderStatusSchema = z.enum(paymentOrderStatusValues);
export type PaymentOrderStatus = z.infer<typeof PaymentOrderStatusSchema>;

export const paymentOperatingModeValues = ['manual_review', 'automated'] as const;
export const PaymentOperatingModeSchema = z.enum(paymentOperatingModeValues);
export type PaymentOperatingMode = z.infer<typeof PaymentOperatingModeSchema>;

export const paymentManualFallbackReasonValues = [
  'no_active_payment_provider',
  'manual_provider_review_required',
  'provider_execution_not_implemented',
  'manual_review_mode',
  'outside_automation_gray_scope',
  'risk_manual_review_required',
] as const;
export const PaymentManualFallbackReasonSchema = z.enum(
  paymentManualFallbackReasonValues
);
export type PaymentManualFallbackReason = z.infer<
  typeof PaymentManualFallbackReasonSchema
>;

export const paymentAutomationGapValues = [
  'outbound_gateway_execution',
  'payment_webhook_entrypoint',
  'payment_webhook_signature_verification',
  'idempotent_retry_handling',
  'automated_reconciliation',
  'compensation_and_recovery',
] as const;
export const PaymentAutomationGapSchema = z.enum(paymentAutomationGapValues);
export type PaymentAutomationGap = z.infer<typeof PaymentAutomationGapSchema>;

export const financeReviewActionValues = [
  'deposit_requested',
  'deposit_mark_provider_pending',
  'deposit_mark_provider_succeeded',
  'deposit_credit',
  'deposit_mark_provider_failed',
  'deposit_reverse',
  'withdrawal_requested',
  'withdrawal_approve',
  'withdrawal_mark_provider_submitted',
  'withdrawal_mark_provider_processing',
  'withdrawal_pay',
  'withdrawal_mark_provider_failed',
  'withdrawal_reject',
  'withdrawal_reverse',
  'system_timeout_cleanup',
  'system_compensation',
] as const;
export const FinanceReviewActionSchema = z.enum(financeReviewActionValues);
export type FinanceReviewAction = z.infer<typeof FinanceReviewActionSchema>;

export const FinanceReviewStageSchema = z.enum(['maker', 'checker', 'system']);
export type FinanceReviewStage = z.infer<typeof FinanceReviewStageSchema>;

const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();
const DateLikeSchema = z.union([z.string(), z.date()]);

export const PayoutMethodRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  methodType: PayoutMethodTypeSchema,
  channelType: PaymentChannelTypeSchema,
  assetType: PaymentAssetTypeSchema,
  assetCode: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  isDefault: z.boolean(),
  status: PayoutMethodStatusSchema,
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type PayoutMethodRecord = z.infer<typeof PayoutMethodRecordSchema>;

export const FiatPayoutMethodRecordSchema = z.object({
  payoutMethodId: z.number().int(),
  accountName: z.string(),
  bankName: z.string().nullable(),
  accountNoMasked: z.string().nullable().optional(),
  routingCode: z.string().nullable().optional(),
  providerCode: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  accountLast4: z.string().nullable().optional(),
});
export type FiatPayoutMethodRecord = z.infer<typeof FiatPayoutMethodRecordSchema>;

export const BankCardRecordSchema = PayoutMethodRecordSchema.extend({
  cardholderName: z.string(),
  bankName: z.string().nullable(),
  brand: z.string().nullable(),
  last4: z.string().nullable(),
});
export type BankCardRecord = z.infer<typeof BankCardRecordSchema>;

export const DepositRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  amount: z.string(),
  providerId: z.number().int().nullable().optional(),
  channelType: PaymentChannelTypeSchema,
  assetType: PaymentAssetTypeSchema,
  assetCode: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  status: DepositStatusSchema,
  referenceId: z.string().nullable().optional(),
  providerOrderId: z.string().nullable().optional(),
  submittedTxHash: z.string().nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type DepositRecord = z.infer<typeof DepositRecordSchema>;

export const WithdrawalRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  providerId: z.number().int().nullable().optional(),
  payoutMethodId: z.number().int().nullable().optional(),
  bankCardId: z.number().int().nullable().optional(),
  amount: z.string(),
  channelType: PaymentChannelTypeSchema,
  assetType: PaymentAssetTypeSchema,
  assetCode: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  status: WithdrawalStatusSchema,
  providerOrderId: z.string().nullable().optional(),
  submittedTxHash: z.string().nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type WithdrawalRecord = z.infer<typeof WithdrawalRecordSchema>;

export const FiatDepositEventRecordSchema = z.object({
  id: z.number().int(),
  depositId: z.number().int(),
  providerTradeNo: z.string().nullable().optional(),
  clientReference: z.string().nullable().optional(),
  webhookId: z.string().nullable().optional(),
  rawPayload: MetadataSchema,
  signatureVerified: z.boolean(),
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type FiatDepositEventRecord = z.infer<typeof FiatDepositEventRecordSchema>;

export const FiatWithdrawEventRecordSchema = z.object({
  id: z.number().int(),
  withdrawalId: z.number().int(),
  providerPayoutNo: z.string().nullable().optional(),
  settlementReference: z.string().nullable().optional(),
  rawPayload: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type FiatWithdrawEventRecord = z.infer<
  typeof FiatWithdrawEventRecordSchema
>;

export const CryptoDepositChannelRecordSchema = z.object({
  id: z.number().int(),
  providerId: z.number().int().nullable().optional(),
  chain: z.string(),
  network: z.string(),
  token: z.string(),
  receiveAddress: z.string(),
  qrCodeUrl: z.string().nullable().optional(),
  memoRequired: z.boolean(),
  memoValue: z.string().nullable().optional(),
  minConfirmations: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type CryptoDepositChannelRecord = z.infer<
  typeof CryptoDepositChannelRecordSchema
>;

export const CryptoWithdrawAddressRecordSchema = z.object({
  payoutMethodId: z.number().int(),
  chain: z.string(),
  network: z.string(),
  token: z.string(),
  address: z.string(),
  label: z.string().nullable().optional(),
});
export type CryptoWithdrawAddressRecord = z.infer<
  typeof CryptoWithdrawAddressRecordSchema
>;

export const CryptoWithdrawAddressViewRecordSchema =
  PayoutMethodRecordSchema.extend({
    payoutMethodId: z.number().int(),
    chain: z.string(),
    network: z.string(),
    token: z.string(),
    address: z.string(),
    label: z.string().nullable().optional(),
  });
export type CryptoWithdrawAddressViewRecord = z.infer<
  typeof CryptoWithdrawAddressViewRecordSchema
>;

export const CryptoChainTransactionRecordSchema = z.object({
  id: z.number().int(),
  txHash: z.string(),
  direction: z.enum(['deposit', 'withdrawal']),
  chain: z.string(),
  network: z.string(),
  token: z.string(),
  fromAddress: z.string().nullable().optional(),
  toAddress: z.string().nullable().optional(),
  amount: z.string(),
  confirmations: z.number().int().nonnegative(),
  rawPayload: MetadataSchema,
  consumedByDepositId: z.number().int().nullable().optional(),
  consumedByWithdrawalId: z.number().int().nullable().optional(),
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type CryptoChainTransactionRecord = z.infer<
  typeof CryptoChainTransactionRecordSchema
>;

export const CryptoReviewEventRecordSchema = z.object({
  id: z.number().int(),
  targetType: z.string(),
  targetId: z.number().int(),
  action: z.string(),
  reviewerAdminId: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
});
export type CryptoReviewEventRecord = z.infer<
  typeof CryptoReviewEventRecordSchema
>;

export const LedgerEntryRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  houseAccountId: z.number().int().nullable(),
  entryType: z.string(),
  amount: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.number().int().nullable(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
});
export type LedgerEntryRecord = z.infer<typeof LedgerEntryRecordSchema>;

export const PaymentProviderConfigViolationSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
});
export type PaymentProviderConfigViolation = z.infer<
  typeof PaymentProviderConfigViolationSchema
>;

export const PaymentProviderConfigGovernanceSchema = z.object({
  adminEditableFields: z.array(z.string()),
  secretReferenceContainer: z.string(),
  secretReferenceFields: z.array(z.string()),
  secretStorageRequirement: z.string(),
  plaintextSecretStorageForbidden: z.boolean(),
});
export type PaymentProviderConfigGovernance = z.infer<
  typeof PaymentProviderConfigGovernanceSchema
>;

export const PaymentProviderConfigIssueSchema = z.object({
  providerId: z.number().int(),
  providerName: z.string(),
  issues: z.array(PaymentProviderConfigViolationSchema),
});
export type PaymentProviderConfigIssue = z.infer<
  typeof PaymentProviderConfigIssueSchema
>;

export const PaymentCapabilitySummarySchema = z.object({
  operatingMode: PaymentOperatingModeSchema,
  automatedExecutionEnabled: z.boolean(),
  automatedExecutionReady: z.boolean(),
  registeredAdapterKeys: z.array(z.string()).optional(),
  implementedAutomatedAdapters: z.array(z.string()),
  missingCapabilities: z.array(PaymentAutomationGapSchema),
});
export type PaymentCapabilitySummary = z.infer<
  typeof PaymentCapabilitySummarySchema
>;

export const PaymentCapabilityOverviewSchema =
  PaymentCapabilitySummarySchema.extend({
    activeProviderCount: z.number().int().nonnegative(),
    configuredProviderAdapters: z.array(z.string()),
    activeProviderFlows: z.record(PaymentFlowSchema, z.boolean()),
    providerConfigGovernance: PaymentProviderConfigGovernanceSchema,
    providerConfigIssues: z.array(PaymentProviderConfigIssueSchema),
  });
export type PaymentCapabilityOverview = z.infer<
  typeof PaymentCapabilityOverviewSchema
>;
