import { z } from "zod";

import {
  LimitedPageSizeSchema,
  MoneyLikeSchema,
  PositiveIntSchema,
} from "./common";
import { DrawFairnessCommitSchema, DrawPrizePresentationSchema } from "./draw";

export const saasEnvironmentValues = ["sandbox", "live"] as const;
export const SaaSEnvironmentSchema = z.enum(saasEnvironmentValues);
export type SaaSEnvironment = z.infer<typeof SaaSEnvironmentSchema>;

export const saasResourceStatusValues = [
  "active",
  "suspended",
  "archived",
] as const;
export const SaaSResourceStatusSchema = z.enum(saasResourceStatusValues);
export type SaaSResourceStatus = z.infer<typeof SaaSResourceStatusSchema>;

export const saasProjectStrategyValues = [
  "weighted_gacha",
  "epsilon_greedy",
  "softmax",
  "thompson",
] as const;
export const SaasProjectStrategySchema = z.enum(saasProjectStrategyValues);
export type SaasProjectStrategy = z.infer<typeof SaasProjectStrategySchema>;

export const SaasProjectStrategyParamsSchema = z.record(
  z.string(),
  z.unknown(),
);
export type SaasProjectStrategyParams = z.infer<
  typeof SaasProjectStrategyParamsSchema
>;

export const saasBillingPlanValues = [
  "starter",
  "growth",
  "enterprise",
] as const;
export const SaaSBillingPlanSchema = z.enum(saasBillingPlanValues);
export type SaaSBillingPlan = z.infer<typeof SaaSBillingPlanSchema>;

export const saasBillingCollectionMethodValues = [
  "send_invoice",
  "charge_automatically",
] as const;
export const SaasBillingCollectionMethodSchema = z.enum(
  saasBillingCollectionMethodValues,
);
export type SaasBillingCollectionMethod = z.infer<
  typeof SaasBillingCollectionMethodSchema
>;

export const saasTenantRoleValues = [
  "tenant_owner",
  "tenant_operator",
  "agent_manager",
  "agent_viewer",
] as const;
export const SaaSTenantRoleSchema = z.enum(saasTenantRoleValues);
export type SaaSTenantRole = z.infer<typeof SaaSTenantRoleSchema>;

export const saasAgentControlModeValues = ["blocked", "throttled"] as const;
export const SaaSAgentControlModeSchema = z.enum(saasAgentControlModeValues);
export type SaaSAgentControlMode = z.infer<typeof SaaSAgentControlModeSchema>;

export const saasTenantInviteStatusValues = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export const SaasTenantInviteStatusSchema = z.enum(
  saasTenantInviteStatusValues,
);
export type SaasTenantInviteStatus = z.infer<
  typeof SaasTenantInviteStatusSchema
>;

export const saasTenantLinkTypeValues = ["agent_client"] as const;
export const SaasTenantLinkTypeSchema = z.enum(saasTenantLinkTypeValues);
export type SaasTenantLinkType = z.infer<typeof SaasTenantLinkTypeSchema>;

export const saasBillingRunStatusValues = [
  "draft",
  "synced",
  "finalized",
  "sent",
  "paid",
  "void",
  "uncollectible",
  "failed",
] as const;
export const SaasBillingRunStatusSchema = z.enum(saasBillingRunStatusValues);
export type SaasBillingRunStatus = z.infer<typeof SaasBillingRunStatusSchema>;

export const saasBillingRunExternalSyncStatusValues = [
  "idle",
  "processing",
  "succeeded",
  "failed",
] as const;
export const SaasBillingRunExternalSyncStatusSchema = z.enum(
  saasBillingRunExternalSyncStatusValues,
);
export type SaasBillingRunExternalSyncStatus = z.infer<
  typeof SaasBillingRunExternalSyncStatusSchema
>;

export const saasBillingRunExternalSyncActionValues = [
  "sync",
  "sync_and_finalize",
  "sync_and_send",
  "refresh",
  "settle",
  "reconciliation",
  "stripe_webhook",
] as const;
export const SaasBillingRunExternalSyncActionSchema = z.enum(
  saasBillingRunExternalSyncActionValues,
);
export type SaasBillingRunExternalSyncAction = z.infer<
  typeof SaasBillingRunExternalSyncActionSchema
>;

export const saasBillingRunExternalSyncStageValues = [
  "precondition",
  "invoice_lookup",
  "invoice_finalize",
  "invoice_send",
  "invoice_retrieve",
  "invoice_pay",
  "invoice_refresh",
  "invoice_reconcile",
  "invoice_webhook",
  "persist_invoice_state",
] as const;
export const SaasBillingRunExternalSyncStageSchema = z.enum(
  saasBillingRunExternalSyncStageValues,
);
export type SaasBillingRunExternalSyncStage = z.infer<
  typeof SaasBillingRunExternalSyncStageSchema
>;

export const saasBillingTopUpStatusValues = [
  "pending",
  "synced",
  "failed",
] as const;
export const SaasBillingTopUpStatusSchema = z.enum(
  saasBillingTopUpStatusValues,
);
export type SaasBillingTopUpStatus = z.infer<
  typeof SaasBillingTopUpStatusSchema
>;

export const saasBillingDisputeStatusValues = [
  "submitted",
  "under_review",
  "resolved",
  "rejected",
] as const;
export const SaasBillingDisputeStatusSchema = z.enum(
  saasBillingDisputeStatusValues,
);
export type SaasBillingDisputeStatus = z.infer<
  typeof SaasBillingDisputeStatusSchema
>;

export const saasBillingDisputeReasonValues = [
  "invoice_amount",
  "duplicate_charge",
  "service_quality",
  "other",
] as const;
export const SaasBillingDisputeReasonSchema = z.enum(
  saasBillingDisputeReasonValues,
);
export type SaasBillingDisputeReason = z.infer<
  typeof SaasBillingDisputeReasonSchema
>;

export const saasBillingDisputeResolutionValues = [
  "full_refund",
  "partial_refund",
  "reject",
] as const;
export const SaasBillingDisputeResolutionSchema = z.enum(
  saasBillingDisputeResolutionValues,
);
export type SaasBillingDisputeResolution = z.infer<
  typeof SaasBillingDisputeResolutionSchema
>;

export const saasStripeWebhookEventStatusValues = [
  "pending",
  "processing",
  "processed",
  "failed",
] as const;
export const SaasStripeWebhookEventStatusSchema = z.enum(
  saasStripeWebhookEventStatusValues,
);
export type SaasStripeWebhookEventStatus = z.infer<
  typeof SaasStripeWebhookEventStatusSchema
>;

export const saasDecisionTypeValues = ["reject", "mute", "payout"] as const;
export const SaasDecisionTypeSchema = z.enum(saasDecisionTypeValues);
export type SaasDecisionType = z.infer<typeof SaasDecisionTypeSchema>;

export const saasOutboundWebhookEventValues = ["reward.completed"] as const;
export const SaasOutboundWebhookEventSchema = z.enum(
  saasOutboundWebhookEventValues,
);
export type SaasOutboundWebhookEvent = z.infer<
  typeof SaasOutboundWebhookEventSchema
>;

export const saasOutboundWebhookDeliveryStatusValues = [
  "pending",
  "sending",
  "delivered",
  "failed",
] as const;
export const SaasOutboundWebhookDeliveryStatusSchema = z.enum(
  saasOutboundWebhookDeliveryStatusValues,
);
export type SaasOutboundWebhookDeliveryStatus = z.infer<
  typeof SaasOutboundWebhookDeliveryStatusSchema
>;

export const saasRewardEnvelopeWindowValues = [
  "minute",
  "hour",
  "day",
] as const;
export const SaasRewardEnvelopeWindowSchema = z.enum(
  saasRewardEnvelopeWindowValues,
);
export type SaasRewardEnvelopeWindow = z.infer<
  typeof SaasRewardEnvelopeWindowSchema
>;

export const saasRewardEnvelopeCapHitStrategyValues = [
  "reject",
  "mute",
] as const;
export const SaasRewardEnvelopeCapHitStrategySchema = z.enum(
  saasRewardEnvelopeCapHitStrategyValues,
);
export type SaasRewardEnvelopeCapHitStrategy = z.infer<
  typeof SaasRewardEnvelopeCapHitStrategySchema
>;

export const saasRewardEnvelopeScopeValues = [
  "tenant",
  "project",
  "group",
  "agent",
] as const;
export const SaasRewardEnvelopeScopeSchema = z.enum(
  saasRewardEnvelopeScopeValues,
);
export type SaasRewardEnvelopeScope = z.infer<
  typeof SaasRewardEnvelopeScopeSchema
>;

export const saasRewardEnvelopeTriggerReasonValues = [
  "budget_cap",
  "variance_cap",
  "anti_exploit",
] as const;
export const SaasRewardEnvelopeTriggerReasonSchema = z.enum(
  saasRewardEnvelopeTriggerReasonValues,
);
export type SaasRewardEnvelopeTriggerReason = z.infer<
  typeof SaasRewardEnvelopeTriggerReasonSchema
>;

export const prizeEngineApiKeyScopeValues = [
  "catalog:read",
  "fairness:read",
  "reward:write",
  "draw:write",
  "ledger:read",
] as const;
export const PrizeEngineApiKeyScopeSchema = z.enum(
  prizeEngineApiKeyScopeValues,
);
export type PrizeEngineApiKeyScope = z.infer<
  typeof PrizeEngineApiKeyScopeSchema
>;

export const PrizeEngineApiKeyScopesSchema = z
  .array(PrizeEngineApiKeyScopeSchema)
  .min(1);

export const PrizeEngineApiRateLimitWindowSchema = z.object({
  limit: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.union([z.string(), z.date()]).nullable(),
  windowMs: z.number().int().positive(),
});
export type PrizeEngineApiRateLimitWindow = z.infer<
  typeof PrizeEngineApiRateLimitWindowSchema
>;

export const PrizeEngineApiRateLimitUsageSchema = z.object({
  burst: PrizeEngineApiRateLimitWindowSchema,
  hourly: PrizeEngineApiRateLimitWindowSchema,
  daily: PrizeEngineApiRateLimitWindowSchema,
});
export type PrizeEngineApiRateLimitUsage = z.infer<
  typeof PrizeEngineApiRateLimitUsageSchema
>;

export const PrizeEngineProjectApiRateLimitUsageSchema = z.object({
  activeKeyCount: z.number().int().nonnegative(),
  aggregate: PrizeEngineApiRateLimitUsageSchema,
});
export type PrizeEngineProjectApiRateLimitUsage = z.infer<
  typeof PrizeEngineProjectApiRateLimitUsageSchema
>;

export const SaasTenantRiskEnvelopeSchema = z.object({
  dailyBudgetCap: z.string().nullable(),
  maxSinglePayout: z.string().nullable(),
  varianceCap: z.string().nullable(),
  emergencyStop: z.boolean(),
});
export type SaasTenantRiskEnvelope = z.infer<
  typeof SaasTenantRiskEnvelopeSchema
>;

export const PrizeEngineScopedRiskEnvelopeInputSchema = z.object({
  maxDrawCount: PositiveIntSchema.optional().nullable(),
  dailyBudgetCap: MoneyLikeSchema.optional().nullable(),
  varianceCap: MoneyLikeSchema.optional().nullable(),
});
export type PrizeEngineScopedRiskEnvelopeInput = z.infer<
  typeof PrizeEngineScopedRiskEnvelopeInputSchema
>;

export const PrizeEngineRiskEnvelopeInputSchema = z.object({
  dailyBudgetCap: MoneyLikeSchema.optional().nullable(),
  maxSinglePayout: MoneyLikeSchema.optional().nullable(),
  varianceCap: MoneyLikeSchema.optional().nullable(),
  group: PrizeEngineScopedRiskEnvelopeInputSchema.optional(),
  agent: PrizeEngineScopedRiskEnvelopeInputSchema.optional(),
});
export type PrizeEngineRiskEnvelopeInput = z.infer<
  typeof PrizeEngineRiskEnvelopeInputSchema
>;

export const prizeEngineBudgetWindowValues = [
  "request",
  "session",
  "day",
  "campaign",
  "lifetime",
] as const;
export const PrizeEngineBudgetWindowSchema = z.enum(
  prizeEngineBudgetWindowValues,
);
export type PrizeEngineBudgetWindow = z.infer<
  typeof PrizeEngineBudgetWindowSchema
>;

export const PrizeEngineBudgetInputSchema = z.object({
  amount: MoneyLikeSchema.optional().nullable(),
  remaining: MoneyLikeSchema.optional().nullable(),
  currency: z.string().min(3).max(16).optional().nullable(),
  window: PrizeEngineBudgetWindowSchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PrizeEngineBudgetInput = z.infer<
  typeof PrizeEngineBudgetInputSchema
>;

export const PrizeEngineAgentSignalInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(191).optional().nullable(),
  requestSignature: z.string().min(1).max(512).optional().nullable(),
  fingerprint: z.string().min(1).max(255).optional().nullable(),
  behaviorTemplate: z.string().min(1).max(255).optional().nullable(),
  correlationGroup: z.string().min(1).max(191).optional().nullable(),
  occurredAt: z.union([z.string().datetime(), z.date()]).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PrizeEngineAgentSignalInput = z.infer<
  typeof PrizeEngineAgentSignalInputSchema
>;

export const SaasTenantSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  billingEmail: z.string().nullable(),
  status: SaaSResourceStatusSchema,
  riskEnvelope: SaasTenantRiskEnvelopeSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  onboardedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasTenant = z.infer<typeof SaasTenantSchema>;

export const SaasProjectSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  slug: z.string(),
  name: z.string(),
  environment: SaaSEnvironmentSchema,
  status: SaaSResourceStatusSchema,
  currency: z.string(),
  drawCost: z.string(),
  prizePoolBalance: z.string(),
  strategy: SaasProjectStrategySchema,
  strategyParams: SaasProjectStrategyParamsSchema,
  fairnessEpochSeconds: z.number().int().positive(),
  maxDrawCount: z.number().int().positive(),
  missWeight: z.number().int().nonnegative(),
  apiRateLimitBurst: z.number().int().positive(),
  apiRateLimitHourly: z.number().int().positive(),
  apiRateLimitDaily: z.number().int().positive(),
  apiRateLimitUsage: PrizeEngineProjectApiRateLimitUsageSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasProject = z.infer<typeof SaasProjectSchema>;

export const SaasProjectPrizeSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  name: z.string(),
  stock: z.number().int().nonnegative(),
  weight: z.number().int().positive(),
  rewardAmount: z.string(),
  isActive: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  deletedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasProjectPrize = z.infer<typeof SaasProjectPrizeSchema>;

export const SaasAgentSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  agentId: z.string(),
  groupId: z.string().nullable().optional(),
  ownerMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  fingerprint: z.string().nullable().optional(),
  status: SaaSResourceStatusSchema,
  createdAt: z.union([z.string(), z.date()]),
});
export type SaasAgent = z.infer<typeof SaasAgentSchema>;

export const SaasRewardEnvelopeSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  projectId: z.number().int().nullable(),
  window: SaasRewardEnvelopeWindowSchema,
  onCapHitStrategy: SaasRewardEnvelopeCapHitStrategySchema,
  budgetCap: z.string(),
  expectedPayoutPerCall: z.string(),
  varianceCap: z.string(),
  currentConsumed: z.string(),
  currentCallCount: z.number().int().nonnegative(),
  currentWindowStartedAt: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasRewardEnvelope = z.infer<typeof SaasRewardEnvelopeSchema>;

export const SaasPlayerSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  externalPlayerId: z.string(),
  displayName: z.string().nullable(),
  balance: z.string(),
  pityStreak: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasPlayer = z.infer<typeof SaasPlayerSchema>;

export const SaasBillingDecisionPricingSchema = z.object({
  reject: z.string(),
  mute: z.string(),
  payout: z.string(),
});
export type SaasBillingDecisionPricing = z.infer<
  typeof SaasBillingDecisionPricingSchema
>;

const DateLikeSchema = z.union([z.string(), z.date()]);

export const SaasBillingBudgetAlertStateSchema = z.object({
  month: z.string().nullable(),
  thresholdAlertedAt: DateLikeSchema.nullable().optional(),
  forecast7dAlertedAt: DateLikeSchema.nullable().optional(),
  forecast30dAlertedAt: DateLikeSchema.nullable().optional(),
  hardCapReachedAt: DateLikeSchema.nullable().optional(),
  hardCapAlertedAt: DateLikeSchema.nullable().optional(),
});
export type SaasBillingBudgetAlertState = z.infer<
  typeof SaasBillingBudgetAlertStateSchema
>;

export const SaasBillingBudgetPolicySchema = z.object({
  monthlyBudget: z.string().nullable(),
  alertThresholdPct: z.number().positive().max(100).nullable(),
  hardCap: z.string().nullable(),
  alertEmailEnabled: z.boolean(),
  alertWebhookUrl: z.string().url().nullable(),
  alertWebhookConfigured: z.boolean(),
  state: SaasBillingBudgetAlertStateSchema,
});
export type SaasBillingBudgetPolicy = z.infer<
  typeof SaasBillingBudgetPolicySchema
>;

export const SaasBillingDecisionPricingInputSchema = z.object({
  reject: MoneyLikeSchema,
  mute: MoneyLikeSchema,
  payout: MoneyLikeSchema,
});
export type SaasBillingDecisionPricingInput = z.infer<
  typeof SaasBillingDecisionPricingInputSchema
>;

export const SaasBillingDecisionBreakdownSchema = z.object({
  decisionType: SaasDecisionTypeSchema,
  units: z.number().int().nonnegative(),
  unitAmount: z.string(),
  totalAmount: z.string(),
});
export type SaasBillingDecisionBreakdown = z.infer<
  typeof SaasBillingDecisionBreakdownSchema
>;

export const SaasBillingAccountSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  planCode: SaaSBillingPlanSchema,
  stripeCustomerId: z.string().nullable(),
  collectionMethod: SaasBillingCollectionMethodSchema,
  autoBillingEnabled: z.boolean(),
  portalConfigurationId: z.string().nullable(),
  baseMonthlyFee: z.string(),
  drawFee: z.string(),
  decisionPricing: SaasBillingDecisionPricingSchema,
  budgetPolicy: SaasBillingBudgetPolicySchema,
  currency: z.string(),
  isBillable: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasBillingAccount = z.infer<typeof SaasBillingAccountSchema>;

export const SaasTenantBootstrapSchema = z.object({
  sandboxProject: SaasProjectSchema,
  sandboxPrizes: z.array(SaasProjectPrizeSchema),
  sandboxRewardEnvelopes: z.array(SaasRewardEnvelopeSchema),
  billingAccount: SaasBillingAccountSchema,
});
export type SaasTenantBootstrap = z.infer<typeof SaasTenantBootstrapSchema>;

export const SaasTenantProvisioningSchema = SaasTenantSchema.extend({
  bootstrap: SaasTenantBootstrapSchema,
});
export type SaasTenantProvisioning = z.infer<
  typeof SaasTenantProvisioningSchema
>;

export const SaasTenantMembershipSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  adminId: z.number().int(),
  adminEmail: z.string().email().nullable().optional(),
  adminDisplayName: z.string().nullable().optional(),
  role: SaaSTenantRoleSchema,
  createdByAdminId: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasTenantMembership = z.infer<typeof SaasTenantMembershipSchema>;

export const SaasApiKeySchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  label: z.string(),
  keyPrefix: z.string(),
  maskedKey: z.string(),
  scopes: PrizeEngineApiKeyScopesSchema,
  apiRateLimitUsage: PrizeEngineApiRateLimitUsageSchema.optional(),
  createdByAdminId: z.number().int().nullable(),
  lastUsedAt: z.union([z.string(), z.date()]).nullable().optional(),
  expiresAt: z.union([z.string(), z.date()]),
  rotatedFromApiKeyId: z.number().int().nullable().optional(),
  rotatedToApiKeyId: z.number().int().nullable().optional(),
  revokedByAdminId: z.number().int().nullable().optional(),
  revokeReason: z.string().nullable().optional(),
  revokedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});
export type SaasApiKey = z.infer<typeof SaasApiKeySchema>;

export const SaasApiKeyIssueSchema = SaasApiKeySchema.extend({
  apiKey: z.string(),
});
export type SaasApiKeyIssue = z.infer<typeof SaasApiKeyIssueSchema>;

export const SaasUsageEventSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  projectId: z.number().int(),
  apiKeyId: z.number().int(),
  billingRunId: z.number().int().nullable().optional(),
  playerId: z.number().int().nullable(),
  environment: SaaSEnvironmentSchema,
  eventType: PrizeEngineApiKeyScopeSchema,
  decisionType: SaasDecisionTypeSchema.nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  units: z.number().int().positive(),
  amount: z.string(),
  currency: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});
export type SaasUsageEvent = z.infer<typeof SaasUsageEventSchema>;

export const saasReportExportResourceValues = [
  "saas_usage_events",
  "saas_ledger_entries",
  "agent_risk_state",
] as const;
export const SaasReportExportResourceSchema = z.enum(
  saasReportExportResourceValues,
);
export type SaasReportExportResource = z.infer<
  typeof SaasReportExportResourceSchema
>;

export const saasReportExportFormatValues = ["csv", "json"] as const;
export const SaasReportExportFormatSchema = z.enum(
  saasReportExportFormatValues,
);
export type SaasReportExportFormat = z.infer<
  typeof SaasReportExportFormatSchema
>;

export const saasReportExportStatusValues = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export const SaasReportExportStatusSchema = z.enum(
  saasReportExportStatusValues,
);
export type SaasReportExportStatus = z.infer<
  typeof SaasReportExportStatusSchema
>;

const MAX_SAAS_REPORT_EXPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export const SaasReportExportCreateSchema = z
  .object({
    projectId: PositiveIntSchema.optional().nullable(),
    resource: SaasReportExportResourceSchema,
    format: SaasReportExportFormatSchema,
    fromAt: z.union([z.string().datetime(), z.date()]),
    toAt: z.union([z.string().datetime(), z.date()]),
  })
  .superRefine((value, ctx) => {
    const fromAt = new Date(value.fromAt);
    const toAt = new Date(value.toAt);

    if (Number.isNaN(fromAt.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid report export start time.",
        path: ["fromAt"],
      });
      return;
    }

    if (Number.isNaN(toAt.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid report export end time.",
        path: ["toAt"],
      });
      return;
    }

    if (fromAt > toAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Report export start time must be before the end time.",
        path: ["fromAt"],
      });
    }

    if (toAt.getTime() - fromAt.getTime() > MAX_SAAS_REPORT_EXPORT_RANGE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Report export time range is too large.",
        path: ["toAt"],
      });
    }
  });
export type SaasReportExportCreate = z.infer<
  typeof SaasReportExportCreateSchema
>;

export const SaasReportExportListQuerySchema = z.object({
  limit: LimitedPageSizeSchema.optional(),
});
export type SaasReportExportListQuery = z.infer<
  typeof SaasReportExportListQuerySchema
>;

export const SaasReportExportJobSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  projectId: z.number().int().nullable(),
  createdByAdminId: z.number().int().nullable(),
  resource: SaasReportExportResourceSchema,
  format: SaasReportExportFormatSchema,
  status: SaasReportExportStatusSchema,
  rowCount: z.number().int().nonnegative().nullable(),
  contentType: z.string().nullable(),
  fileName: z.string().nullable(),
  fromAt: z.union([z.string(), z.date()]),
  toAt: z.union([z.string(), z.date()]),
  lastError: z.string().nullable(),
  completedAt: z.union([z.string(), z.date()]).nullable().optional(),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
  downloadUrl: z.string().url().nullable().optional(),
  downloadUrlExpiresAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasReportExportJob = z.infer<typeof SaasReportExportJobSchema>;

export const SaasTenantUsageProjectSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  environment: SaaSEnvironmentSchema,
  status: SaaSResourceStatusSchema,
});
export type SaasTenantUsageProject = z.infer<
  typeof SaasTenantUsageProjectSchema
>;

export const SaasUsageMinuteBucketSchema = z.object({
  minuteStart: z.union([z.string(), z.date()]),
  requestCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  antiExploitBlockedCount: z.number().int().nonnegative(),
  qps: z.number().nonnegative(),
  antiExploitRatePct: z.number().nonnegative(),
});
export type SaasUsageMinuteBucket = z.infer<typeof SaasUsageMinuteBucketSchema>;

export const SaasUsagePayoutHistogramBucketSchema = z.object({
  label: z.string(),
  minAmount: z.string(),
  maxAmount: z.string().nullable(),
  count: z.number().int().nonnegative(),
});
export type SaasUsagePayoutHistogramBucket = z.infer<
  typeof SaasUsagePayoutHistogramBucketSchema
>;

export const SaasUsageAlertThresholdsSchema = z.object({
  maxMinuteQps: z.number().nonnegative(),
  maxSinglePayoutAmount: z.string(),
  maxAntiExploitRatePct: z.number().nonnegative(),
});
export type SaasUsageAlertThresholds = z.infer<
  typeof SaasUsageAlertThresholdsSchema
>;

export const SaasUsageAlertStateSchema = z.object({
  active: z.boolean(),
  threshold: z.number().nonnegative(),
  current: z.number().nonnegative(),
});
export type SaasUsageAlertState = z.infer<typeof SaasUsageAlertStateSchema>;

export const SaasUsagePayoutAlertStateSchema = z.object({
  active: z.boolean(),
  threshold: z.string(),
  current: z.string(),
});
export type SaasUsagePayoutAlertState = z.infer<
  typeof SaasUsagePayoutAlertStateSchema
>;

export const SaasTenantUsageDashboardSchema = z.object({
  tenant: SaasTenantSchema,
  projects: z.array(SaasTenantUsageProjectSchema),
  windows: z.object({
    realtimeMinutes: z.number().int().positive(),
    payoutHistogramHours: z.number().int().positive(),
  }),
  summary: z.object({
    totalRequests: z.number().int().nonnegative(),
    successfulRequests: z.number().int().nonnegative(),
    antiExploitBlockedRequests: z.number().int().nonnegative(),
    antiExploitRatePct: z.number().nonnegative(),
    totalPayoutAmount: z.string(),
    payoutCount: z.number().int().nonnegative(),
    maxMinuteQps: z.number().nonnegative(),
    maxSinglePayoutAmount: z.string(),
    lastRequestAt: z.union([z.string(), z.date()]).nullable(),
  }),
  thresholds: SaasUsageAlertThresholdsSchema,
  alerts: z.object({
    qps: SaasUsageAlertStateSchema,
    payout: SaasUsagePayoutAlertStateSchema,
    antiExploit: SaasUsageAlertStateSchema,
  }),
  minuteQps: z.array(SaasUsageMinuteBucketSchema),
  payoutHistogram: z.array(SaasUsagePayoutHistogramBucketSchema),
});
export type SaasTenantUsageDashboard = z.infer<
  typeof SaasTenantUsageDashboardSchema
>;

export const SaasBillingRunExternalSyncSchema = z.object({
  status: SaasBillingRunExternalSyncStatusSchema,
  action: SaasBillingRunExternalSyncActionSchema.nullable(),
  stage: SaasBillingRunExternalSyncStageSchema.nullable(),
  error: z.string().nullable(),
  recoveryPath: z.string().nullable(),
  observedInvoiceStatus: z.string().nullable(),
  eventType: z.string().nullable(),
  attemptedAt: z.union([z.string(), z.date()]).nullable().optional(),
  completedAt: z.union([z.string(), z.date()]).nullable().optional(),
});
export type SaasBillingRunExternalSync = z.infer<
  typeof SaasBillingRunExternalSyncSchema
>;

export const SaasBillingRunSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  billingAccountId: z.number().int().nullable(),
  status: SaasBillingRunStatusSchema,
  periodStart: z.union([z.string(), z.date()]),
  periodEnd: z.union([z.string(), z.date()]),
  currency: z.string(),
  baseFeeAmount: z.string(),
  usageFeeAmount: z.string(),
  creditAppliedAmount: z.string(),
  totalAmount: z.string(),
  drawCount: z.number().int().nonnegative(),
  decisionBreakdown: z.array(SaasBillingDecisionBreakdownSchema),
  stripeCustomerId: z.string().nullable(),
  stripeInvoiceId: z.string().nullable(),
  stripeInvoiceStatus: z.string().nullable(),
  stripeHostedInvoiceUrl: z.string().nullable(),
  stripeInvoicePdf: z.string().nullable(),
  syncedAt: z.union([z.string(), z.date()]).nullable().optional(),
  finalizedAt: z.union([z.string(), z.date()]).nullable().optional(),
  sentAt: z.union([z.string(), z.date()]).nullable().optional(),
  paidAt: z.union([z.string(), z.date()]).nullable().optional(),
  externalSync: SaasBillingRunExternalSyncSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdByAdminId: z.number().int().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasBillingRun = z.infer<typeof SaasBillingRunSchema>;

export const SaasBillingTopUpSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  billingAccountId: z.number().int().nullable(),
  amount: z.string(),
  currency: z.string(),
  note: z.string().nullable(),
  status: SaasBillingTopUpStatusSchema,
  stripeCustomerId: z.string().nullable(),
  stripeBalanceTransactionId: z.string().nullable(),
  syncedAt: z.union([z.string(), z.date()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdByAdminId: z.number().int().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasBillingTopUp = z.infer<typeof SaasBillingTopUpSchema>;

export const SaasBillingDisputeSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  billingRunId: z.number().int(),
  billingAccountId: z.number().int().nullable(),
  status: SaasBillingDisputeStatusSchema,
  reason: SaasBillingDisputeReasonSchema,
  summary: z.string(),
  description: z.string(),
  requestedRefundAmount: z.string(),
  approvedRefundAmount: z.string().nullable().optional(),
  currency: z.string(),
  resolutionType: SaasBillingDisputeResolutionSchema.nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
  stripeCreditNoteId: z.string().nullable().optional(),
  stripeCreditNoteStatus: z.string().nullable().optional(),
  stripeCreditNotePdf: z.string().nullable().optional(),
  createdByAdminId: z.number().int().nullable(),
  resolvedByAdminId: z.number().int().nullable().optional(),
  resolvedAt: z.union([z.string(), z.date()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasBillingDispute = z.infer<typeof SaasBillingDisputeSchema>;

export const SaasBillingDailyReportPointSchema = z.object({
  date: DateLikeSchema,
  usageAmount: z.string(),
  totalAmount: z.string(),
});
export type SaasBillingDailyReportPoint = z.infer<
  typeof SaasBillingDailyReportPointSchema
>;

export const SaasBillingForecastScenarioSchema = z.object({
  trailingDays: z.number().int().positive(),
  dailyRunRate: z.string(),
  projectedUsageAmount: z.string(),
  projectedTotalAmount: z.string(),
  exceedsBudget: z.boolean(),
});
export type SaasBillingForecastScenario = z.infer<
  typeof SaasBillingForecastScenarioSchema
>;

export const SaasTenantBillingInsightsSchema = z.object({
  tenantId: z.number().int(),
  currency: z.string(),
  window: z.object({
    monthStart: DateLikeSchema,
    monthEnd: DateLikeSchema,
    generatedAt: DateLikeSchema,
    daysElapsed: z.number().int().positive(),
    daysRemaining: z.number().int().nonnegative(),
  }),
  budgetPolicy: SaasBillingBudgetPolicySchema,
  summary: z.object({
    baseMonthlyFee: z.string(),
    currentUsageAmount: z.string(),
    currentTotalAmount: z.string(),
    trailing7dUsageAmount: z.string(),
    trailing30dUsageAmount: z.string(),
    monthlyBudget: z.string().nullable(),
    budgetThresholdAmount: z.string().nullable(),
    hardCap: z.string().nullable(),
    remainingBudgetAmount: z.string().nullable(),
    remainingHardCapAmount: z.string().nullable(),
    thresholdBreached: z.boolean(),
    hardCapReached: z.boolean(),
  }),
  forecasts: z.object({
    trailing7d: SaasBillingForecastScenarioSchema,
    trailing30d: SaasBillingForecastScenarioSchema,
  }),
  alerts: z.object({
    thresholdExceeded: z.boolean(),
    forecast7dExceeded: z.boolean(),
    forecast30dExceeded: z.boolean(),
    hardCapReached: z.boolean(),
  }),
  dailyReport: z.array(SaasBillingDailyReportPointSchema),
});
export type SaasTenantBillingInsights = z.infer<
  typeof SaasTenantBillingInsightsSchema
>;

export const SaasTenantInviteSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  email: z.string().email(),
  role: SaaSTenantRoleSchema,
  status: SaasTenantInviteStatusSchema,
  createdByAdminId: z.number().int().nullable(),
  acceptedByAdminId: z.number().int().nullable(),
  expiresAt: z.union([z.string(), z.date()]),
  acceptedAt: z.union([z.string(), z.date()]).nullable().optional(),
  revokedAt: z.union([z.string(), z.date()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasTenantInvite = z.infer<typeof SaasTenantInviteSchema>;

export const SaasTenantLinkSchema = z.object({
  id: z.number().int(),
  parentTenantId: z.number().int(),
  childTenantId: z.number().int(),
  linkType: SaasTenantLinkTypeSchema,
  createdByAdminId: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasTenantLink = z.infer<typeof SaasTenantLinkSchema>;

export const SaasAgentControlSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int(),
  agentId: z.string(),
  mode: SaaSAgentControlModeSchema,
  reason: z.string(),
  budgetMultiplier: z.number().positive().max(1).nullable(),
  createdByAdminId: z.number().int().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasAgentControl = z.infer<typeof SaasAgentControlSchema>;

export const SaasStripeWebhookEventSchema = z.object({
  id: z.number().int(),
  tenantId: z.number().int().nullable(),
  billingRunId: z.number().int().nullable(),
  eventId: z.string(),
  eventType: z.string(),
  status: SaasStripeWebhookEventStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  processedAt: z.union([z.string(), z.date()]).nullable().optional(),
  nextAttemptAt: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasStripeWebhookEvent = z.infer<
  typeof SaasStripeWebhookEventSchema
>;

export const SaasOutboundWebhookSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  url: z.string().url(),
  secretPreview: z.string(),
  events: z.array(SaasOutboundWebhookEventSchema).min(1),
  isActive: z.boolean(),
  lastDeliveredAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasOutboundWebhook = z.infer<typeof SaasOutboundWebhookSchema>;

export const SaasOutboundWebhookDeliverySchema = z.object({
  id: z.number().int(),
  webhookId: z.number().int(),
  projectId: z.number().int(),
  drawRecordId: z.number().int().nullable().optional(),
  eventType: SaasOutboundWebhookEventSchema,
  eventId: z.string(),
  status: SaasOutboundWebhookDeliveryStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastHttpStatus: z.number().int().nullable().optional(),
  lastError: z.string().nullable().optional(),
  lastResponseBody: z.string().nullable().optional(),
  nextAttemptAt: z.union([z.string(), z.date()]),
  deliveredAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasOutboundWebhookDelivery = z.infer<
  typeof SaasOutboundWebhookDeliverySchema
>;

export const SaasTenantCreateSchema = z.object({
  slug: z.string().min(2).max(64),
  name: z.string().min(1).max(160),
  billingEmail: z.string().email().optional().nullable(),
  status: SaaSResourceStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantCreate = z.infer<typeof SaasTenantCreateSchema>;

export const SaasPortalTenantCreateSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(2).max(64).optional(),
  billingEmail: z.string().email().optional().nullable(),
});
export type SaasPortalTenantCreate = z.infer<
  typeof SaasPortalTenantCreateSchema
>;

export const SaasTenantRiskEnvelopePatchSchema = z.object({
  tenantId: PositiveIntSchema,
  dailyBudgetCap: MoneyLikeSchema.optional().nullable(),
  maxSinglePayout: MoneyLikeSchema.optional().nullable(),
  varianceCap: MoneyLikeSchema.optional().nullable(),
  emergencyStop: z.boolean().optional(),
});
export type SaasTenantRiskEnvelopePatch = z.infer<
  typeof SaasTenantRiskEnvelopePatchSchema
>;

export const SaasProjectCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  slug: z.string().min(2).max(64),
  name: z.string().min(1).max(160),
  environment: SaaSEnvironmentSchema,
  status: SaaSResourceStatusSchema.optional(),
  currency: z.string().min(3).max(16).optional(),
  drawCost: MoneyLikeSchema.optional(),
  prizePoolBalance: MoneyLikeSchema.optional(),
  strategy: SaasProjectStrategySchema.optional(),
  strategyParams: SaasProjectStrategyParamsSchema.optional(),
  fairnessEpochSeconds: z.number().int().positive().optional(),
  maxDrawCount: z.number().int().positive().max(100).optional(),
  missWeight: z.number().int().min(0).max(1_000_000).optional(),
  apiRateLimitBurst: PositiveIntSchema.optional(),
  apiRateLimitHourly: PositiveIntSchema.optional(),
  apiRateLimitDaily: PositiveIntSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasProjectCreate = z.infer<typeof SaasProjectCreateSchema>;

export const SaasProjectPatchSchema = SaasProjectCreateSchema.omit({
  tenantId: true,
  slug: true,
  environment: true,
}).extend({
  name: z.string().min(1).max(160).optional(),
  status: SaaSResourceStatusSchema.optional(),
});
export type SaasProjectPatch = z.infer<typeof SaasProjectPatchSchema>;

export const SaasProjectPrizeCreateSchema = z.object({
  name: z.string().min(1).max(160),
  stock: z.number().int().min(0).optional(),
  weight: z.number().int().positive().optional(),
  rewardAmount: MoneyLikeSchema,
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasProjectPrizeCreate = z.infer<
  typeof SaasProjectPrizeCreateSchema
>;

export const SaasProjectPrizePatchSchema =
  SaasProjectPrizeCreateSchema.partial();
export type SaasProjectPrizePatch = z.infer<typeof SaasProjectPrizePatchSchema>;

export const SaasRewardEnvelopeUpsertSchema = z.object({
  window: SaasRewardEnvelopeWindowSchema,
  onCapHitStrategy: SaasRewardEnvelopeCapHitStrategySchema,
  budgetCap: MoneyLikeSchema,
  expectedPayoutPerCall: MoneyLikeSchema,
  varianceCap: MoneyLikeSchema,
});
export type SaasRewardEnvelopeUpsert = z.infer<
  typeof SaasRewardEnvelopeUpsertSchema
>;

export const SaasApiKeyCreateSchema = z.object({
  projectId: PositiveIntSchema,
  label: z.string().min(1).max(120),
  scopes: PrizeEngineApiKeyScopesSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});
export type SaasApiKeyCreate = z.infer<typeof SaasApiKeyCreateSchema>;

export const SaasApiKeyRotateSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  scopes: PrizeEngineApiKeyScopesSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  overlapSeconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60)
    .optional(),
  reason: z.string().min(1).max(255).optional().nullable(),
});
export type SaasApiKeyRotate = z.infer<typeof SaasApiKeyRotateSchema>;

export const SaasBillingAccountUpsertSchema = z.object({
  tenantId: PositiveIntSchema,
  planCode: SaaSBillingPlanSchema,
  stripeCustomerId: z.string().max(128).optional().nullable(),
  collectionMethod: SaasBillingCollectionMethodSchema.optional(),
  autoBillingEnabled: z.boolean().optional(),
  portalConfigurationId: z.string().max(128).optional().nullable(),
  baseMonthlyFee: MoneyLikeSchema,
  drawFee: MoneyLikeSchema,
  decisionPricing: SaasBillingDecisionPricingInputSchema.optional(),
  currency: z.string().min(3).max(16),
  isBillable: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasBillingAccountUpsert = z.infer<
  typeof SaasBillingAccountUpsertSchema
>;

export const SaasBillingBudgetPolicyPatchSchema = z.object({
  tenantId: PositiveIntSchema,
  monthlyBudget: MoneyLikeSchema.optional().nullable(),
  alertThresholdPct: z.number().positive().max(100).optional().nullable(),
  hardCap: MoneyLikeSchema.optional().nullable(),
  alertEmailEnabled: z.boolean().optional(),
  alertWebhookUrl: z.string().url().max(2048).optional().nullable(),
  alertWebhookSecret: z.string().min(8).max(255).optional().nullable(),
  clearAlertWebhook: z.boolean().optional(),
});
export type SaasBillingBudgetPolicyPatch = z.infer<
  typeof SaasBillingBudgetPolicyPatchSchema
>;

export const SaasTenantMembershipCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  adminEmail: z.string().email(),
  role: SaaSTenantRoleSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantMembershipCreate = z.infer<
  typeof SaasTenantMembershipCreateSchema
>;

export const SaasTenantInviteCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  email: z.string().email(),
  role: SaaSTenantRoleSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantInviteCreate = z.infer<
  typeof SaasTenantInviteCreateSchema
>;

export const SaasTenantInviteAcceptSchema = z.object({
  token: z.string().min(16).max(512),
});
export type SaasTenantInviteAccept = z.infer<
  typeof SaasTenantInviteAcceptSchema
>;

export const SaasApiKeyRevokeSchema = z.object({
  reason: z.string().min(1).max(255).optional().nullable(),
});
export type SaasApiKeyRevoke = z.infer<typeof SaasApiKeyRevokeSchema>;

export const SaasApiKeyRotationSchema = z.object({
  previousKey: SaasApiKeySchema,
  issuedKey: SaasApiKeyIssueSchema,
  overlapEndsAt: z.union([z.string(), z.date()]),
  reason: z.string().nullable().optional(),
});
export type SaasApiKeyRotation = z.infer<typeof SaasApiKeyRotationSchema>;

export const SaasPortalTenantRegistrationSchema = z.object({
  tenant: SaasTenantProvisioningSchema,
  membership: SaasTenantMembershipSchema,
  issuedKey: SaasApiKeyIssueSchema,
});
export type SaasPortalTenantRegistration = z.infer<
  typeof SaasPortalTenantRegistrationSchema
>;

export const SaasTenantInviteDeliverySchema = z.object({
  invite: SaasTenantInviteSchema,
  inviteUrl: z.string().url(),
});
export type SaasTenantInviteDelivery = z.infer<
  typeof SaasTenantInviteDeliverySchema
>;

export const SaasBillingRunCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  finalize: z.boolean().optional(),
  sendInvoice: z.boolean().optional(),
});
export type SaasBillingRunCreate = z.infer<typeof SaasBillingRunCreateSchema>;

export const SaasBillingRunSettleSchema = z.object({
  paidOutOfBand: z.boolean().optional(),
});
export type SaasBillingRunSettle = z.infer<typeof SaasBillingRunSettleSchema>;

export const SaasBillingRunSyncSchema = z.object({
  finalize: z.boolean().optional(),
  sendInvoice: z.boolean().optional(),
});
export type SaasBillingRunSync = z.infer<typeof SaasBillingRunSyncSchema>;

export const SaasBillingTopUpCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  amount: MoneyLikeSchema,
  currency: z.string().min(3).max(16),
  note: z.string().max(255).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasBillingTopUpCreate = z.infer<
  typeof SaasBillingTopUpCreateSchema
>;

export const SaasBillingDisputeCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  billingRunId: PositiveIntSchema,
  reason: SaasBillingDisputeReasonSchema,
  summary: z.string().min(1).max(160),
  description: z.string().min(1).max(4000),
  requestedRefundAmount: MoneyLikeSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasBillingDisputeCreate = z.infer<
  typeof SaasBillingDisputeCreateSchema
>;

export const SaasBillingDisputeReviewSchema = z.object({
  resolutionType: SaasBillingDisputeResolutionSchema,
  approvedRefundAmount: MoneyLikeSchema.optional(),
  resolutionNotes: z.string().max(4000).optional().nullable(),
});
export type SaasBillingDisputeReview = z.infer<
  typeof SaasBillingDisputeReviewSchema
>;

export const SaasTenantLinkCreateSchema = z.object({
  parentTenantId: PositiveIntSchema,
  childTenantId: PositiveIntSchema,
  linkType: SaasTenantLinkTypeSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantLinkCreate = z.infer<typeof SaasTenantLinkCreateSchema>;

export const SaasAgentControlUpsertSchema = z
  .object({
    tenantId: PositiveIntSchema,
    agentId: z.string().min(1).max(128),
    mode: SaaSAgentControlModeSchema,
    reason: z.string().min(1).max(255),
    budgetMultiplier: z.number().positive().max(1).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "throttled") {
      if (typeof value.budgetMultiplier !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Budget multiplier is required for throttled agent controls.",
          path: ["budgetMultiplier"],
        });
        return;
      }

      if (value.budgetMultiplier >= 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Budget multiplier must be below 1 for throttled agent controls.",
          path: ["budgetMultiplier"],
        });
      }
    }
  });
export type SaasAgentControlUpsert = z.infer<
  typeof SaasAgentControlUpsertSchema
>;

export const SaasCustomerPortalSessionSchema = z.object({
  url: z.string().url(),
});
export type SaasCustomerPortalSession = z.infer<
  typeof SaasCustomerPortalSessionSchema
>;

export const SaasBillingSetupSessionSchema = z.object({
  url: z.string().url(),
});
export type SaasBillingSetupSession = z.infer<
  typeof SaasBillingSetupSessionSchema
>;

export const SaasOutboundWebhookCreateSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().min(8).max(255),
  events: z.array(SaasOutboundWebhookEventSchema).min(1).max(8),
  isActive: z.boolean().optional(),
});
export type SaasOutboundWebhookCreate = z.infer<
  typeof SaasOutboundWebhookCreateSchema
>;

export const SaasOutboundWebhookPatchSchema =
  SaasOutboundWebhookCreateSchema.partial();
export type SaasOutboundWebhookPatch = z.infer<
  typeof SaasOutboundWebhookPatchSchema
>;

export const PrizeEnginePlayerInputSchema = z.object({
  playerId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(160).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PrizeEnginePlayerInput = z.infer<
  typeof PrizeEnginePlayerInputSchema
>;

export const PrizeEngineAgentInputSchema = z.object({
  agentId: z.string().min(1).max(128),
  groupId: z.string().min(1).max(128).optional().nullable(),
  ownerMetadata: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  fingerprint: z.string().min(1).max(255).optional().nullable(),
  status: SaaSResourceStatusSchema.optional(),
});
export type PrizeEngineAgentInput = z.infer<typeof PrizeEngineAgentInputSchema>;

export const PrizeEngineBehaviorInputSchema = z.object({
  actionType: z.string().min(1).max(128),
  score: z.number().finite(),
  novelty: z.number().finite().optional(),
  risk: z.number().finite().min(0).max(1).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  signals: z.record(z.string(), z.unknown()).optional(),
});
export type PrizeEngineBehaviorInput = z.infer<
  typeof PrizeEngineBehaviorInputSchema
>;

export const PrizeEngineRewardAgentRequestSchema = z.object({
  agentId: z.string().min(1).max(128),
  groupId: z.string().min(1).max(128).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PrizeEngineRewardAgentRequest = z.infer<
  typeof PrizeEngineRewardAgentRequestSchema
>;

export const PrizeEngineRewardContextSchema = z.object({
  agent: PrizeEngineAgentInputSchema,
  behavior: PrizeEngineBehaviorInputSchema,
  riskEnvelope: PrizeEngineRiskEnvelopeInputSchema.optional(),
  budget: PrizeEngineBudgetInputSchema.optional(),
});
export type PrizeEngineRewardContext = z.infer<
  typeof PrizeEngineRewardContextSchema
>;

export const PrizeEngineRewardRequestSchema = z.object({
  environment: SaaSEnvironmentSchema.optional(),
  agent: PrizeEngineRewardAgentRequestSchema,
  behavior: PrizeEngineBehaviorInputSchema,
  riskEnvelope: PrizeEngineRiskEnvelopeInputSchema.optional(),
  budget: PrizeEngineBudgetInputSchema.optional(),
  idempotencyKey: z.string().min(1).max(128),
  clientNonce: z.string().min(1).max(128).optional().nullable(),
});
export type PrizeEngineRewardRequest = z.infer<
  typeof PrizeEngineRewardRequestSchema
>;

export const PrizeEngineDrawRequestSchema = z
  .object({
    environment: SaaSEnvironmentSchema.optional(),
    player: PrizeEnginePlayerInputSchema,
    clientNonce: z.string().min(1).max(128).optional().nullable(),
    risk: z.number().finite().min(0).max(1).optional(),
    groupId: z.string().min(1).max(128).optional().nullable(),
    group_id: z.string().min(1).max(128).optional().nullable(),
    agent: PrizeEngineAgentSignalInputSchema.optional(),
    riskEnvelope: PrizeEngineRiskEnvelopeInputSchema.optional(),
    rewardContext: PrizeEngineRewardContextSchema.optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .transform(
    ({ group_id, groupId, agent, idempotencyKey, rewardContext, ...rest }) => ({
      ...rest,
      agent,
      idempotencyKey: idempotencyKey ?? agent?.idempotencyKey ?? undefined,
      rewardContext,
      groupId: groupId ?? group_id ?? agent?.correlationGroup ?? null,
    }),
  );
export type PrizeEngineDrawRequest = z.infer<
  typeof PrizeEngineDrawRequestSchema
>;

export const PrizeEngineRiskAdjustmentMetadataSchema = z.object({
  inputRisk: z.number().min(0).max(1),
  previousAccumulatedRisk: z.number().min(0).max(1),
  decayedAccumulatedRisk: z.number().min(0).max(1),
  effectiveRisk: z.number().min(0).max(1),
  weightDecayAlpha: z.number().nonnegative(),
  riskStateHalfLifeSeconds: z.number().int().positive(),
  weightMultiplier: z.number().min(0).max(1),
  basePrizeWeightTotal: z.number().int().nonnegative(),
  adjustedPrizeWeightTotal: z.number().int().nonnegative(),
});
export type PrizeEngineRiskAdjustmentMetadata = z.infer<
  typeof PrizeEngineRiskAdjustmentMetadataSchema
>;

export const PrizeEngineEnvironmentQuerySchema = z.object({
  environment: SaaSEnvironmentSchema,
});
export type PrizeEngineEnvironmentQuery = z.infer<
  typeof PrizeEngineEnvironmentQuerySchema
>;

export const PrizeEngineFairnessRevealQuerySchema =
  PrizeEngineEnvironmentQuerySchema.extend({
    epoch: z.preprocess((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : value;
    }, z.number().int().nonnegative()),
  });
export type PrizeEngineFairnessRevealQuery = z.infer<
  typeof PrizeEngineFairnessRevealQuerySchema
>;

export const PrizeEngineLedgerQuerySchema =
  PrizeEngineEnvironmentQuerySchema.extend({
    playerId: z.string().min(1).max(128),
    limit: LimitedPageSizeSchema.optional(),
  });
export type PrizeEngineLedgerQuery = z.infer<
  typeof PrizeEngineLedgerQuerySchema
>;

export const PrizeEngineLedgerEntrySchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  playerId: z.number().int(),
  environment: SaaSEnvironmentSchema,
  entryType: z.string(),
  amount: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});
export type PrizeEngineLedgerEntry = z.infer<
  typeof PrizeEngineLedgerEntrySchema
>;

export const PrizeEngineLedgerResponseSchema = z.object({
  agent: SaasAgentSchema,
  player: SaasPlayerSchema,
  entries: z.array(PrizeEngineLedgerEntrySchema),
});
export type PrizeEngineLedgerResponse = z.infer<
  typeof PrizeEngineLedgerResponseSchema
>;

export const PrizeEngineObservabilityDistributionQuerySchema =
  PrizeEngineEnvironmentQuerySchema.extend({
    days: z.coerce.number().int().min(1).max(90).optional(),
  });
export type PrizeEngineObservabilityDistributionQuery = z.infer<
  typeof PrizeEngineObservabilityDistributionQuerySchema
>;

export const prizeEngineObservabilityBucketKindValues = [
  "prize",
  "miss",
  "retired_prize",
] as const;
export const PrizeEngineObservabilityBucketKindSchema = z.enum(
  prizeEngineObservabilityBucketKindValues,
);
export type PrizeEngineObservabilityBucketKind = z.infer<
  typeof PrizeEngineObservabilityBucketKindSchema
>;

export const prizeEngineObservabilityBaselineValues = [
  "current_catalog",
] as const;
export const PrizeEngineObservabilityBaselineSchema = z.enum(
  prizeEngineObservabilityBaselineValues,
);
export type PrizeEngineObservabilityBaseline = z.infer<
  typeof PrizeEngineObservabilityBaselineSchema
>;

export const PrizeEngineObservabilityDistributionBucketSchema = z.object({
  bucketKey: z.string(),
  kind: PrizeEngineObservabilityBucketKindSchema,
  prizeId: z.number().int().nullable(),
  label: z.string(),
  configuredWeight: z.number().int().nonnegative(),
  configuredRewardAmount: z.string().nullable(),
  expectedProbability: z.number().min(0).max(1),
  actualDrawCount: z.number().int().nonnegative(),
  actualProbability: z.number().min(0).max(1),
  actualRewardAmount: z.string(),
  probabilityDrift: z.number(),
  expectedPayoutRateContribution: z.number(),
  actualPayoutRateContribution: z.number(),
});
export type PrizeEngineObservabilityDistributionBucket = z.infer<
  typeof PrizeEngineObservabilityDistributionBucketSchema
>;

export const PrizeEngineObservabilitySummarySchema = z.object({
  totalDrawCount: z.number().int().nonnegative(),
  uniquePlayerCount: z.number().int().nonnegative(),
  winCount: z.number().int().nonnegative(),
  missCount: z.number().int().nonnegative(),
  hitRate: z.number().min(0).max(1),
  expectedHitRate: z.number().min(0).max(1),
  hitRateDrift: z.number(),
  actualDrawCostAmount: z.string(),
  actualRewardAmount: z.string(),
  expectedRewardAmount: z.string(),
  actualPayoutRate: z.number(),
  expectedPayoutRate: z.number(),
  payoutRateDrift: z.number(),
});
export type PrizeEngineObservabilitySummary = z.infer<
  typeof PrizeEngineObservabilitySummarySchema
>;

export const PrizeEngineProjectObservabilitySchema = z.object({
  project: SaasProjectSchema.pick({
    id: true,
    tenantId: true,
    slug: true,
    name: true,
    environment: true,
    status: true,
    currency: true,
    drawCost: true,
    prizePoolBalance: true,
    fairnessEpochSeconds: true,
    maxDrawCount: true,
    missWeight: true,
  }),
  window: z.object({
    days: z.number().int().positive(),
    startedAt: z.union([z.string(), z.date()]),
    endedAt: z.union([z.string(), z.date()]),
    baseline: PrizeEngineObservabilityBaselineSchema,
  }),
  summary: PrizeEngineObservabilitySummarySchema,
  distribution: z.array(PrizeEngineObservabilityDistributionBucketSchema),
});
export type PrizeEngineProjectObservability = z.infer<
  typeof PrizeEngineProjectObservabilitySchema
>;

export const PrizeEngineOverviewSchema = z.object({
  project: SaasProjectSchema.pick({
    id: true,
    tenantId: true,
    slug: true,
    name: true,
    environment: true,
    status: true,
    currency: true,
    drawCost: true,
    prizePoolBalance: true,
    strategy: true,
    strategyParams: true,
    fairnessEpochSeconds: true,
    maxDrawCount: true,
    missWeight: true,
  }),
  fairness: DrawFairnessCommitSchema,
  prizes: z.array(DrawPrizePresentationSchema),
  featuredPrizes: z.array(DrawPrizePresentationSchema),
});
export type PrizeEngineOverview = z.infer<typeof PrizeEngineOverviewSchema>;

export const PrizeEngineRewardEnvelopeTriggerSchema = z.object({
  scope: SaasRewardEnvelopeScopeSchema,
  window: SaasRewardEnvelopeWindowSchema,
  reason: SaasRewardEnvelopeTriggerReasonSchema,
  strategy: SaasRewardEnvelopeCapHitStrategySchema,
});
export type PrizeEngineRewardEnvelopeTrigger = z.infer<
  typeof PrizeEngineRewardEnvelopeTriggerSchema
>;

export const PrizeEngineRewardEnvelopeOutcomeSchema = z.object({
  mode: z.enum(["normal", "mute"]),
  triggered: z.array(PrizeEngineRewardEnvelopeTriggerSchema),
});
export type PrizeEngineRewardEnvelopeOutcome = z.infer<
  typeof PrizeEngineRewardEnvelopeOutcomeSchema
>;

export const PrizeEngineDrawResultSchema = z.object({
  id: z.number().int(),
  playerId: z.number().int(),
  prizeId: z.number().int().nullable(),
  drawCost: z.string(),
  rewardAmount: z.string(),
  status: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  selectionStrategy: z.string().optional(),
  fairness: z
    .object({
      epoch: z.number().int().optional(),
      epochSeconds: z.number().int().optional(),
      commitHash: z.string().optional(),
      clientNonce: z.string().nullable().optional(),
      serverNonce: z.string().nullable().optional(),
      nonceSource: z.enum(["client", "server"]).optional(),
      rngDigest: z.string().nullable().optional(),
      totalWeight: z.number().nullable().optional(),
      randomPick: z.number().nullable().optional(),
      strategy: SaasProjectStrategySchema.optional(),
      epsilon: z.number().min(0).max(1).nullable().optional(),
      decision: z.enum(["explore", "exploit"]).nullable().optional(),
      selectionDigest: z.string().nullable().optional(),
      candidateCount: z.number().int().nonnegative().nullable().optional(),
      selectedArmId: z.number().int().nullable().optional(),
      selectedArmKind: z.enum(["prize", "miss"]).nullable().optional(),
      risk: PrizeEngineRiskAdjustmentMetadataSchema.nullable().optional(),
      algorithm: z.string().optional(),
    })
    .nullable(),
  prize: DrawPrizePresentationSchema.nullable().optional(),
  envelope: PrizeEngineRewardEnvelopeOutcomeSchema.optional(),
});
export type PrizeEngineDrawResult = z.infer<typeof PrizeEngineDrawResultSchema>;

export const PrizeEngineLegacyRouteMetadataSchema = z.object({
  route: z.literal("/v1/engine/draws"),
  mode: z.literal("legacy_gacha"),
  deprecated: z.literal(true),
  sunsetAt: z.union([z.string(), z.date()]),
});
export type PrizeEngineLegacyRouteMetadata = z.infer<
  typeof PrizeEngineLegacyRouteMetadataSchema
>;

export const PrizeEngineDrawResponseSchema = z.object({
  agent: SaasAgentSchema,
  player: SaasPlayerSchema,
  result: PrizeEngineDrawResultSchema,
  legacy: PrizeEngineLegacyRouteMetadataSchema.optional(),
});
export type PrizeEngineDrawResponse = z.infer<
  typeof PrizeEngineDrawResponseSchema
>;

export const PrizeEngineRewardResponseSchema =
  PrizeEngineDrawResponseSchema.extend({
    behavior: PrizeEngineBehaviorInputSchema,
    riskEnvelope: PrizeEngineRiskEnvelopeInputSchema.optional(),
    budget: PrizeEngineBudgetInputSchema.optional(),
    idempotencyKey: z.string().min(1).max(128),
    replayed: z.boolean(),
    legacy: PrizeEngineLegacyRouteMetadataSchema.optional(),
  });
export type PrizeEngineRewardResponse = z.infer<
  typeof PrizeEngineRewardResponseSchema
>;

export const SaasOverviewSandboxUiCopySchema = z
  .object({
    badgePrimary: z.string().min(1).max(64),
    badgeSecondary: z.string().min(1).max(64),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(4_000),
    focusActionLabel: z.string().min(1).max(64),
    issueStarterKeyLabel: z.string().min(1).max(64),
    copySnippetLabel: z.string().min(1).max(64),
    latestSecretMessage: z.string().min(1).max(4_000),
    placeholderSecretMessage: z.string().min(1).max(4_000),
    emptyStateMessage: z.string().min(1).max(4_000),
  })
  .strict();
export type SaasOverviewSandboxUiCopy = z.infer<
  typeof SaasOverviewSandboxUiCopySchema
>;

export const SaasOverviewSnippetUiCopySchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(4_000),
  })
  .strict();
export type SaasOverviewSnippetUiCopy = z.infer<
  typeof SaasOverviewSnippetUiCopySchema
>;

export const SaasOverviewUiCopySchema = z
  .object({
    overview: z
      .object({
        sandbox: SaasOverviewSandboxUiCopySchema,
        snippet: SaasOverviewSnippetUiCopySchema,
      })
      .strict(),
  })
  .strict();
export type SaasOverviewUiCopy = z.infer<typeof SaasOverviewUiCopySchema>;

export const defaultSaasOverviewUiCopy: SaasOverviewUiCopy = {
  overview: {
    sandbox: {
      badgePrimary: "D2 sandbox",
      badgeSecondary: "zero-friction onboarding",
      title: "Sandbox is already provisioned",
      description:
        "New tenants land with a sandbox project, seeded sample prizes, test reward envelopes, and a copy-ready SDK path. This route keeps the first successful integration within one screen.",
      focusActionLabel: "Focus sandbox project",
      issueStarterKeyLabel: "Issue starter key",
      copySnippetLabel: "Copy SDK snippet",
      latestSecretMessage:
        "A fresh sandbox secret is in memory from this session, so the snippet on the right is genuinely copy-and-run.",
      placeholderSecretMessage:
        "Issue a starter key first if you want the snippet on the right to include a fresh secret instead of the placeholder token.",
      emptyStateMessage:
        "No sandbox project is visible for the selected tenant yet.",
    },
    snippet: {
      title: "Copy-and-run hello-reward",
      description:
        "Uses the provisioned sandbox environment and a tenant-specific key so new operators can verify the path immediately.",
    },
  },
};

export const SaasOverviewSchema = z.object({
  summary: z.object({
    tenantCount: z.number().int().nonnegative(),
    projectCount: z.number().int().nonnegative(),
    apiKeyCount: z.number().int().nonnegative(),
    playerCount: z.number().int().nonnegative(),
    drawCount30d: z.number().int().nonnegative(),
    billableTenantCount: z.number().int().nonnegative(),
  }),
  memberships: z.array(SaasTenantMembershipSchema),
  tenants: z.array(
    z.object({
      tenant: SaasTenantSchema,
      billing: SaasBillingAccountSchema.nullable(),
      projectCount: z.number().int().nonnegative(),
      apiKeyCount: z.number().int().nonnegative(),
      playerCount: z.number().int().nonnegative(),
      drawCount30d: z.number().int().nonnegative(),
    }),
  ),
  projects: z.array(SaasProjectSchema),
  projectObservability: z.array(PrizeEngineProjectObservabilitySchema),
  projectPrizes: z.array(SaasProjectPrizeSchema),
  apiKeys: z.array(SaasApiKeySchema),
  billingRuns: z.array(SaasBillingRunSchema),
  topUps: z.array(SaasBillingTopUpSchema),
  disputes: z.array(SaasBillingDisputeSchema),
  invites: z.array(SaasTenantInviteSchema),
  tenantLinks: z.array(SaasTenantLinkSchema),
  agentControls: z.array(SaasAgentControlSchema),
  webhookEvents: z.array(SaasStripeWebhookEventSchema),
  outboundWebhooks: z.array(SaasOutboundWebhookSchema),
  outboundDeliveries: z.array(SaasOutboundWebhookDeliverySchema),
  recentUsage: z.array(SaasUsageEventSchema),
  uiCopy: SaasOverviewUiCopySchema,
});
export type SaasOverview = z.infer<typeof SaasOverviewSchema>;
