import { z } from 'zod';

import { LimitedPageSizeSchema, MoneyLikeSchema, PositiveIntSchema } from './common';
import {
  DrawFairnessCommitSchema,
  DrawPrizePresentationSchema,
} from './draw';

export const saasEnvironmentValues = ['sandbox', 'live'] as const;
export const SaaSEnvironmentSchema = z.enum(saasEnvironmentValues);
export type SaaSEnvironment = z.infer<typeof SaaSEnvironmentSchema>;

export const saasResourceStatusValues = ['active', 'suspended', 'archived'] as const;
export const SaaSResourceStatusSchema = z.enum(saasResourceStatusValues);
export type SaaSResourceStatus = z.infer<typeof SaaSResourceStatusSchema>;

export const saasBillingPlanValues = ['starter', 'growth', 'enterprise'] as const;
export const SaaSBillingPlanSchema = z.enum(saasBillingPlanValues);
export type SaaSBillingPlan = z.infer<typeof SaaSBillingPlanSchema>;

export const saasBillingCollectionMethodValues = [
  'send_invoice',
  'charge_automatically',
] as const;
export const SaasBillingCollectionMethodSchema = z.enum(
  saasBillingCollectionMethodValues
);
export type SaasBillingCollectionMethod = z.infer<
  typeof SaasBillingCollectionMethodSchema
>;

export const saasTenantRoleValues = [
  'tenant_owner',
  'tenant_operator',
  'agent_manager',
  'agent_viewer',
] as const;
export const SaaSTenantRoleSchema = z.enum(saasTenantRoleValues);
export type SaaSTenantRole = z.infer<typeof SaaSTenantRoleSchema>;

export const saasTenantInviteStatusValues = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;
export const SaasTenantInviteStatusSchema = z.enum(saasTenantInviteStatusValues);
export type SaasTenantInviteStatus = z.infer<typeof SaasTenantInviteStatusSchema>;

export const saasTenantLinkTypeValues = ['agent_client'] as const;
export const SaasTenantLinkTypeSchema = z.enum(saasTenantLinkTypeValues);
export type SaasTenantLinkType = z.infer<typeof SaasTenantLinkTypeSchema>;

export const saasBillingRunStatusValues = [
  'draft',
  'synced',
  'finalized',
  'sent',
  'paid',
  'void',
  'uncollectible',
  'failed',
] as const;
export const SaasBillingRunStatusSchema = z.enum(saasBillingRunStatusValues);
export type SaasBillingRunStatus = z.infer<typeof SaasBillingRunStatusSchema>;

export const saasBillingTopUpStatusValues = [
  'pending',
  'synced',
  'failed',
] as const;
export const SaasBillingTopUpStatusSchema = z.enum(saasBillingTopUpStatusValues);
export type SaasBillingTopUpStatus = z.infer<typeof SaasBillingTopUpStatusSchema>;

export const saasStripeWebhookEventStatusValues = [
  'pending',
  'processing',
  'processed',
  'failed',
] as const;
export const SaasStripeWebhookEventStatusSchema = z.enum(
  saasStripeWebhookEventStatusValues
);
export type SaasStripeWebhookEventStatus = z.infer<
  typeof SaasStripeWebhookEventStatusSchema
>;

export const prizeEngineApiKeyScopeValues = [
  'catalog:read',
  'fairness:read',
  'draw:write',
  'ledger:read',
] as const;
export const PrizeEngineApiKeyScopeSchema = z.enum(prizeEngineApiKeyScopeValues);
export type PrizeEngineApiKeyScope = z.infer<typeof PrizeEngineApiKeyScopeSchema>;

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

export const SaasTenantSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  billingEmail: z.string().nullable(),
  status: SaaSResourceStatusSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
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
  currency: z.string(),
  isBillable: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SaasBillingAccount = z.infer<typeof SaasBillingAccountSchema>;

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
  eventType: PrizeEngineApiKeyScopeSchema,
  referenceType: z.string().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  units: z.number().int().positive(),
  amount: z.string(),
  currency: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});
export type SaasUsageEvent = z.infer<typeof SaasUsageEventSchema>;

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
  stripeCustomerId: z.string().nullable(),
  stripeInvoiceId: z.string().nullable(),
  stripeInvoiceStatus: z.string().nullable(),
  stripeHostedInvoiceUrl: z.string().nullable(),
  stripeInvoicePdf: z.string().nullable(),
  syncedAt: z.union([z.string(), z.date()]).nullable().optional(),
  finalizedAt: z.union([z.string(), z.date()]).nullable().optional(),
  sentAt: z.union([z.string(), z.date()]).nullable().optional(),
  paidAt: z.union([z.string(), z.date()]).nullable().optional(),
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
export type SaasStripeWebhookEvent = z.infer<typeof SaasStripeWebhookEventSchema>;

export const SaasTenantCreateSchema = z.object({
  slug: z.string().min(2).max(64),
  name: z.string().min(1).max(160),
  billingEmail: z.string().email().optional().nullable(),
  status: SaaSResourceStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantCreate = z.infer<typeof SaasTenantCreateSchema>;

export const SaasProjectCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  slug: z.string().min(2).max(64),
  name: z.string().min(1).max(160),
  environment: SaaSEnvironmentSchema,
  status: SaaSResourceStatusSchema.optional(),
  currency: z.string().min(3).max(16).optional(),
  drawCost: MoneyLikeSchema.optional(),
  prizePoolBalance: MoneyLikeSchema.optional(),
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
export type SaasProjectPrizeCreate = z.infer<typeof SaasProjectPrizeCreateSchema>;

export const SaasProjectPrizePatchSchema = SaasProjectPrizeCreateSchema.partial();
export type SaasProjectPrizePatch = z.infer<typeof SaasProjectPrizePatchSchema>;

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
  overlapSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
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
  currency: z.string().min(3).max(16),
  isBillable: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasBillingAccountUpsert = z.infer<typeof SaasBillingAccountUpsertSchema>;

export const SaasTenantMembershipCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  adminEmail: z.string().email(),
  role: SaaSTenantRoleSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantMembershipCreate = z.infer<typeof SaasTenantMembershipCreateSchema>;

export const SaasTenantInviteCreateSchema = z.object({
  tenantId: PositiveIntSchema,
  email: z.string().email(),
  role: SaaSTenantRoleSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantInviteCreate = z.infer<typeof SaasTenantInviteCreateSchema>;

export const SaasTenantInviteAcceptSchema = z.object({
  token: z.string().min(16).max(512),
});
export type SaasTenantInviteAccept = z.infer<typeof SaasTenantInviteAcceptSchema>;

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
export type SaasBillingTopUpCreate = z.infer<typeof SaasBillingTopUpCreateSchema>;

export const SaasTenantLinkCreateSchema = z.object({
  parentTenantId: PositiveIntSchema,
  childTenantId: PositiveIntSchema,
  linkType: SaasTenantLinkTypeSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SaasTenantLinkCreate = z.infer<typeof SaasTenantLinkCreateSchema>;

export const SaasCustomerPortalSessionSchema = z.object({
  url: z.string().url(),
});
export type SaasCustomerPortalSession = z.infer<typeof SaasCustomerPortalSessionSchema>;

export const SaasBillingSetupSessionSchema = z.object({
  url: z.string().url(),
});
export type SaasBillingSetupSession = z.infer<typeof SaasBillingSetupSessionSchema>;

export const PrizeEnginePlayerInputSchema = z.object({
  playerId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(160).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PrizeEnginePlayerInput = z.infer<typeof PrizeEnginePlayerInputSchema>;

export const PrizeEngineDrawRequestSchema = z.object({
  player: PrizeEnginePlayerInputSchema,
  clientNonce: z.string().min(1).max(128).optional().nullable(),
});
export type PrizeEngineDrawRequest = z.infer<typeof PrizeEngineDrawRequestSchema>;

export const PrizeEngineLedgerQuerySchema = z.object({
  playerId: z.string().min(1).max(128),
  limit: LimitedPageSizeSchema.optional(),
});
export type PrizeEngineLedgerQuery = z.infer<typeof PrizeEngineLedgerQuerySchema>;

export const PrizeEngineLedgerEntrySchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  playerId: z.number().int(),
  entryType: z.string(),
  amount: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});
export type PrizeEngineLedgerEntry = z.infer<typeof PrizeEngineLedgerEntrySchema>;

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
    fairnessEpochSeconds: true,
    maxDrawCount: true,
    missWeight: true,
  }),
  fairness: DrawFairnessCommitSchema,
  prizes: z.array(DrawPrizePresentationSchema),
  featuredPrizes: z.array(DrawPrizePresentationSchema),
});
export type PrizeEngineOverview = z.infer<typeof PrizeEngineOverviewSchema>;

export const PrizeEngineDrawResultSchema = z.object({
  id: z.number().int(),
  playerId: z.number().int(),
  prizeId: z.number().int().nullable(),
  drawCost: z.string(),
  rewardAmount: z.string(),
  status: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  fairness: z
    .object({
      epoch: z.number().int().optional(),
      epochSeconds: z.number().int().optional(),
      commitHash: z.string().optional(),
      clientNonce: z.string().nullable().optional(),
      serverNonce: z.string().nullable().optional(),
      nonceSource: z.enum(['client', 'server']).optional(),
      rngDigest: z.string().nullable().optional(),
      totalWeight: z.number().nullable().optional(),
      randomPick: z.number().nullable().optional(),
      algorithm: z.string().optional(),
    })
    .nullable(),
  prize: DrawPrizePresentationSchema.nullable().optional(),
});
export type PrizeEngineDrawResult = z.infer<typeof PrizeEngineDrawResultSchema>;

export const PrizeEngineDrawResponseSchema = z.object({
  player: SaasPlayerSchema,
  result: PrizeEngineDrawResultSchema,
});
export type PrizeEngineDrawResponse = z.infer<typeof PrizeEngineDrawResponseSchema>;

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
    })
  ),
  projects: z.array(SaasProjectSchema),
  projectPrizes: z.array(SaasProjectPrizeSchema),
  apiKeys: z.array(SaasApiKeySchema),
  billingRuns: z.array(SaasBillingRunSchema),
  topUps: z.array(SaasBillingTopUpSchema),
  invites: z.array(SaasTenantInviteSchema),
  tenantLinks: z.array(SaasTenantLinkSchema),
  webhookEvents: z.array(SaasStripeWebhookEventSchema),
  recentUsage: z.array(SaasUsageEventSchema),
});
export type SaasOverview = z.infer<typeof SaasOverviewSchema>;
