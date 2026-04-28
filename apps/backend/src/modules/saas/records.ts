import Decimal from "decimal.js";
import {
  agentBlocklist,
  saasApiKeys,
  saasAgents,
  saasBillingAccounts,
  saasBillingRuns,
  saasBillingTopUps,
  saasLedgerEntries,
  saasOutboundWebhookDeliveries,
  saasOutboundWebhooks,
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
  SaasAgent,
  SaasBillingAccount,
  SaasBillingRun,
  SaasBillingTopUp,
  SaasAgentControl,
  SaasOutboundWebhook,
  SaasOutboundWebhookDelivery,
  SaasOutboundWebhookEvent,
  SaasProject,
  SaasProjectPrize,
  SaasStripeWebhookEvent,
  SaasTenant,
  SaasTenantInvite,
  SaasTenantLink,
  SaasTenantMembership,
  SaasUsageEvent,
} from "@reward/shared-types/saas";
import {
  prizeEngineApiKeyScopeValues,
  saasOutboundWebhookEventValues,
} from "@reward/shared-types/saas";

import { toMoneyString } from "../../shared/money";
import type { SaasAdminActor } from "./access";
import {
  readBillingRunDecisionBreakdown,
  resolveBillingDecisionPricing,
} from "./billing";
import {
  DEFAULT_FAIRNESS_EPOCH_SECONDS,
  DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  DEFAULT_PROJECT_SELECTION_STRATEGY,
  normalizeProjectStrategyParams,
  resolveProjectSelectionStrategy,
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

export const normalizeMetadata = (
  value: unknown,
): Record<string, unknown> | null => {
  let current = value;

  while (typeof current === "string" && current.trim() !== "") {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }

  if (
    typeof current === "object" &&
    current !== null &&
    !Array.isArray(current)
  ) {
    return Object.fromEntries(Object.entries(current)) as Record<
      string,
      unknown
    >;
  }

  return null;
};

export const normalizeOutboundWebhookEvents = (
  value: unknown,
): SaasOutboundWebhookEvent[] => {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set(saasOutboundWebhookEventValues);
  return Array.from(
    new Set(
      source.filter(
        (event): event is SaasOutboundWebhookEvent =>
          typeof event === "string" &&
          allowed.has(event as SaasOutboundWebhookEvent),
      ),
    ),
  );
};

const maskApiKey = (keyPrefix: string, plainKey: string) =>
  `${keyPrefix}••••${plainKey.slice(-4)}`;

const maskWebhookSecret = (secret: string) =>
  secret.length <= 8
    ? `${secret.slice(0, 2)}••••`
    : `${secret.slice(0, 4)}••••${secret.slice(-4)}`;

export const toSaasTenant = (
  row: typeof saasTenants.$inferSelect,
): SaasTenant => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  billingEmail: row.billingEmail,
  status: row.status,
  riskEnvelope: {
    dailyBudgetCap: row.riskEnvelopeDailyBudgetCap
      ? toMoneyString(row.riskEnvelopeDailyBudgetCap)
      : null,
    maxSinglePayout: row.riskEnvelopeMaxSinglePayout
      ? toMoneyString(row.riskEnvelopeMaxSinglePayout)
      : null,
    varianceCap: row.riskEnvelopeVarianceCap
      ? toMoneyString(row.riskEnvelopeVarianceCap)
      : null,
    emergencyStop: Boolean(row.riskEnvelopeEmergencyStop),
  },
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
  strategy: resolveProjectSelectionStrategy(
    row.strategy ?? DEFAULT_PROJECT_SELECTION_STRATEGY,
  ),
  strategyParams: normalizeProjectStrategyParams(row.strategyParams),
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

export const toSaasAgent = (
  row: typeof saasAgents.$inferSelect,
): SaasAgent => ({
  id: row.id,
  projectId: row.projectId,
  agentId: row.externalId,
  groupId: row.groupId,
  ownerMetadata: normalizeMetadata(row.ownerMetadata),
  fingerprint: row.fingerprint,
  status: row.status,
  createdAt: row.createdAt,
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
  decisionPricing: resolveBillingDecisionPricing(row.metadata, row.drawFee),
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
  decisionBreakdown: readBillingRunDecisionBreakdown(row.metadata),
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

export const toSaasAgentControl = (
  row: typeof agentBlocklist.$inferSelect,
): SaasAgentControl => ({
  id: row.id,
  tenantId: row.tenantId,
  agentId: row.agentId,
  mode: row.mode,
  reason: row.reason,
  budgetMultiplier:
    row.budgetMultiplier === null
      ? null
      : new Decimal(row.budgetMultiplier).toNumber(),
  createdByAdminId: row.createdByAdminId,
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

export const toSaasOutboundWebhook = (
  row: typeof saasOutboundWebhooks.$inferSelect,
): SaasOutboundWebhook => ({
  id: row.id,
  projectId: row.projectId,
  url: row.url,
  secretPreview: maskWebhookSecret(row.secret),
  events: normalizeOutboundWebhookEvents(row.events),
  isActive: Boolean(row.isActive),
  lastDeliveredAt: row.lastDeliveredAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSaasOutboundWebhookDelivery = (
  row: typeof saasOutboundWebhookDeliveries.$inferSelect,
): SaasOutboundWebhookDelivery => ({
  id: row.id,
  webhookId: row.webhookId,
  projectId: row.projectId,
  drawRecordId: row.drawRecordId,
  eventType: row.eventType,
  eventId: row.eventId,
  status: row.status,
  attempts: Number(row.attempts ?? 0),
  lastHttpStatus: row.lastHttpStatus,
  lastError: row.lastError,
  lastResponseBody: row.lastResponseBody,
  nextAttemptAt: row.nextAttemptAt,
  deliveredAt: row.deliveredAt,
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
  environment: row.environment,
  entryType: row.entryType,
  amount: toMoneyString(row.amount),
  balanceBefore: toMoneyString(row.balanceBefore),
  balanceAfter: toMoneyString(row.balanceAfter),
  referenceType: row.referenceType,
  referenceId: row.referenceId,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt,
});

export const toSaasUsageEvent = (
  row: typeof saasUsageEvents.$inferSelect,
): SaasUsageEvent => ({
  id: row.id,
  tenantId: row.tenantId,
  projectId: row.projectId,
  apiKeyId: row.apiKeyId,
  billingRunId: row.billingRunId,
  playerId: row.playerId,
  environment: row.environment,
  eventType: row.eventType,
  decisionType: row.decisionType,
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
  accessScope: "global" | "membership" = "global",
): SaasAdminActor => (adminId ? { adminId, permissions, accessScope } : null);
