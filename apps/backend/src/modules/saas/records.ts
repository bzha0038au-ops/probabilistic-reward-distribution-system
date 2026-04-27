import Decimal from "decimal.js";
import {
  saasApiKeys,
  saasBillingAccounts,
  saasBillingRuns,
  saasBillingTopUps,
  saasLedgerEntries,
  saasProjectPrizes,
  saasProjects,
  saasStripeWebhookEvents,
  saasTenants,
  saasTenantInvites,
  saasTenantLinks,
  saasTenantMemberships,
  saasUsageEvents,
} from "@reward/database";
import type {
  PrizeEngineApiKeyScope,
  PrizeEngineApiRateLimitUsage,
  PrizeEngineLedgerEntry,
  PrizeEngineProjectApiRateLimitUsage,
  SaasApiKey,
  SaasApiKeyIssue,
  SaasBillingAccount,
  SaasBillingRun,
  SaasBillingTopUp,
  SaasProject,
  SaasProjectPrize,
  SaasStripeWebhookEvent,
  SaasTenant,
  SaasTenantInvite,
  SaasTenantLink,
  SaasTenantMembership,
} from "@reward/shared-types/saas";
import { prizeEngineApiKeyScopeValues } from "@reward/shared-types/saas";

import { toMoneyString } from "../../shared/money";
import type { SaasAdminActor } from "./access";
import {
  DEFAULT_FAIRNESS_EPOCH_SECONDS,
  DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
} from "./prize-engine-domain";

export const normalizeScopes = (value: unknown): PrizeEngineApiKeyScope[] => {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set(prizeEngineApiKeyScopeValues);
  return Array.from(
    new Set(
      source.filter(
        (scope): scope is PrizeEngineApiKeyScope =>
          typeof scope === "string" &&
          allowed.has(scope as PrizeEngineApiKeyScope),
      ),
    ),
  );
};

export const normalizeMetadata = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (Object.fromEntries(Object.entries(value)) as Record<string, unknown>)
    : null;

const maskApiKey = (keyPrefix: string, plainKey: string) =>
  `${keyPrefix}••••${plainKey.slice(-4)}`;

export const toSaasTenant = (
  row: typeof saasTenants.$inferSelect,
): SaasTenant => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  billingEmail: row.billingEmail,
  status: row.status,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasProject = (
  row: typeof saasProjects.$inferSelect,
  apiRateLimitUsage?: PrizeEngineProjectApiRateLimitUsage,
): SaasProject => ({
  id: row.id,
  tenantId: row.tenantId,
  slug: row.slug,
  name: row.name,
  environment: row.environment,
  status: row.status,
  currency: row.currency,
  drawCost: toMoneyString(row.drawCost),
  prizePoolBalance: toMoneyString(row.prizePoolBalance),
  fairnessEpochSeconds: Number(
    row.fairnessEpochSeconds ?? DEFAULT_FAIRNESS_EPOCH_SECONDS,
  ),
  maxDrawCount: Number(row.maxDrawCount ?? 1),
  missWeight: Number(row.missWeight ?? 0),
  apiRateLimitBurst: Number(
    row.apiRateLimitBurst ?? DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  ),
  apiRateLimitHourly: Number(
    row.apiRateLimitHourly ?? DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  ),
  apiRateLimitDaily: Number(
    row.apiRateLimitDaily ?? DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  ),
  ...(apiRateLimitUsage ? { apiRateLimitUsage } : {}),
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasPrize = (
  row: typeof saasProjectPrizes.$inferSelect,
): SaasProjectPrize => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  stock: Number(row.stock ?? 0),
  weight: Number(row.weight ?? 1),
  rewardAmount: toMoneyString(row.rewardAmount),
  isActive: Boolean(row.isActive),
  metadata: normalizeMetadata(row.metadata),
  deletedAt: row.deletedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasBilling = (
  row: typeof saasBillingAccounts.$inferSelect,
): SaasBillingAccount => ({
  id: row.id,
  tenantId: row.tenantId,
  planCode: row.planCode,
  stripeCustomerId: row.stripeCustomerId,
  collectionMethod: row.collectionMethod,
  autoBillingEnabled: Boolean(row.autoBillingEnabled),
  portalConfigurationId: row.portalConfigurationId,
  baseMonthlyFee: toMoneyString(row.baseMonthlyFee),
  drawFee: new Decimal(row.drawFee).toFixed(4),
  currency: row.currency,
  isBillable: Boolean(row.isBillable),
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasMembership = (
  row: typeof saasTenantMemberships.$inferSelect & {
    adminEmail?: string | null;
    adminDisplayName?: string | null;
  },
): SaasTenantMembership => ({
  id: row.id,
  tenantId: row.tenantId,
  adminId: row.adminId,
  adminEmail: row.adminEmail ?? null,
  adminDisplayName: row.adminDisplayName ?? null,
  role: row.role,
  createdByAdminId: row.createdByAdminId,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasBillingRun = (
  row: typeof saasBillingRuns.$inferSelect,
): SaasBillingRun => ({
  id: row.id,
  tenantId: row.tenantId,
  billingAccountId: row.billingAccountId,
  status: row.status,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  currency: row.currency,
  baseFeeAmount: toMoneyString(row.baseFeeAmount),
  usageFeeAmount: toMoneyString(row.usageFeeAmount),
  creditAppliedAmount: toMoneyString(row.creditAppliedAmount),
  totalAmount: toMoneyString(row.totalAmount),
  drawCount: Number(row.drawCount ?? 0),
  stripeCustomerId: row.stripeCustomerId,
  stripeInvoiceId: row.stripeInvoiceId,
  stripeInvoiceStatus: row.stripeInvoiceStatus,
  stripeHostedInvoiceUrl: row.stripeHostedInvoiceUrl,
  stripeInvoicePdf: row.stripeInvoicePdf,
  syncedAt: row.syncedAt,
  finalizedAt: row.finalizedAt,
  sentAt: row.sentAt,
  paidAt: row.paidAt,
  metadata: normalizeMetadata(row.metadata),
  createdByAdminId: row.createdByAdminId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasBillingTopUp = (
  row: typeof saasBillingTopUps.$inferSelect,
): SaasBillingTopUp => ({
  id: row.id,
  tenantId: row.tenantId,
  billingAccountId: row.billingAccountId,
  amount: toMoneyString(row.amount),
  currency: row.currency,
  note: row.note,
  status: row.status,
  stripeCustomerId: row.stripeCustomerId,
  stripeBalanceTransactionId: row.stripeBalanceTransactionId,
  syncedAt: row.syncedAt,
  metadata: normalizeMetadata(row.metadata),
  createdByAdminId: row.createdByAdminId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasInvite = (
  row: typeof saasTenantInvites.$inferSelect,
): SaasTenantInvite => ({
  id: row.id,
  tenantId: row.tenantId,
  email: row.email,
  role: row.role,
  status: row.status,
  createdByAdminId: row.createdByAdminId,
  acceptedByAdminId: row.acceptedByAdminId,
  expiresAt: row.expiresAt,
  acceptedAt: row.acceptedAt,
  revokedAt: row.revokedAt,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasTenantLink = (
  row: typeof saasTenantLinks.$inferSelect,
): SaasTenantLink => ({
  id: row.id,
  parentTenantId: row.parentTenantId,
  childTenantId: row.childTenantId,
  linkType: row.linkType,
  createdByAdminId: row.createdByAdminId,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasStripeWebhookEvent = (
  row: typeof saasStripeWebhookEvents.$inferSelect,
): SaasStripeWebhookEvent => ({
  id: row.id,
  tenantId: row.tenantId,
  billingRunId: row.billingRunId,
  eventId: row.eventId,
  eventType: row.eventType,
  status: row.status,
  attempts: Number(row.attempts ?? 0),
  lastError: row.lastError,
  processedAt: row.processedAt,
  nextAttemptAt: row.nextAttemptAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasApiKey = (
  row: typeof saasApiKeys.$inferSelect,
  plainKey?: string,
  apiRateLimitUsage?: PrizeEngineApiRateLimitUsage,
): SaasApiKeyIssue | SaasApiKey => {
  const base = {
    id: row.id,
    projectId: row.projectId,
    label: row.label,
    keyPrefix: row.keyPrefix,
    maskedKey: plainKey
      ? maskApiKey(row.keyPrefix, plainKey)
      : `${row.keyPrefix}••••`,
    scopes: normalizeScopes(row.scopes),
    ...(apiRateLimitUsage ? { apiRateLimitUsage } : {}),
    createdByAdminId: row.createdByAdminId,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    rotatedFromApiKeyId: row.rotatedFromApiKeyId,
    rotatedToApiKeyId: row.rotatedToApiKeyId,
    revokedByAdminId: row.revokedByAdminId,
    revokeReason: row.revokeReason,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };

  if (!plainKey) {
    return base;
  }

  return {
    ...base,
    apiKey: plainKey,
  };
};

export const toPrizeEngineLedgerEntry = (
  row: typeof saasLedgerEntries.$inferSelect,
): PrizeEngineLedgerEntry => ({
  id: row.id,
  projectId: row.projectId,
  playerId: row.playerId,
  entryType: row.entryType,
  amount: toMoneyString(row.amount),
  balanceBefore: toMoneyString(row.balanceBefore),
  balanceAfter: toMoneyString(row.balanceAfter),
  referenceType: row.referenceType,
  referenceId: row.referenceId,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
});

export const toSaasUsageEvent = (row: typeof saasUsageEvents.$inferSelect) => ({
  id: row.id,
  tenantId: row.tenantId,
  projectId: row.projectId,
  apiKeyId: row.apiKeyId,
  billingRunId: row.billingRunId,
  playerId: row.playerId,
  eventType: row.eventType,
  referenceType: row.referenceType,
  referenceId: row.referenceId,
  units: row.units,
  amount: toMoneyString(row.amount),
  currency: row.currency,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
});

export const toSaasAdminActor = (
  adminId?: number | null,
  permissions?: string[],
): SaasAdminActor => (adminId ? { adminId, permissions } : null);
