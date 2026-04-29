import { randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  agentBlocklist,
  admins,
  saasApiKeys,
  saasBillingAccounts,
  saasBillingAccountVersions,
  saasProjectPrizes,
  saasProjects,
  saasRewardEnvelopes,
  saasTenants,
  saasTenantInvites,
  saasTenantLinks,
  saasTenantMemberships,
  users,
} from "@reward/database";
import { and, desc, eq, inArray, isNull, sql } from "@reward/database/orm";
import type {
  PrizeEngineApiKeyScope,
  SaasApiKey,
  SaasApiKeyCreate,
  SaasApiKeyIssue,
  SaasApiKeyRotate,
  SaasApiKeyRotation,
  SaasApiKeyRevoke,
  SaasAgentControlUpsert,
  SaasBillingAccountUpsert,
  SaasProjectCreate,
  SaasProjectPatch,
  SaasProjectPrizeCreate,
  SaasProjectPrizePatch,
  SaasRewardEnvelopeUpsert,
  SaasPortalTenantCreate,
  SaasPortalTenantRegistration,
  SaasTenantCreate,
  SaasTenantInviteAccept,
  SaasTenantInviteCreate,
  SaasTenantLinkCreate,
  SaasTenantMembershipCreate,
  SaasTenantProvisioning,
  SaasTenantRiskEnvelopePatch,
} from "@reward/shared-types/saas";

import { db, type DbTransaction } from "../../db";
import { sendSaasTenantInviteNotification } from "../auth/notification-service";
import { createSaasTenantRiskEnvelopeDraft as createSaasTenantRiskEnvelopeControlDraft } from "../control/service";
import {
  badRequestError,
  conflictError,
  forbiddenError,
  notFoundError,
  unauthorizedError,
} from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
import {
  type SaasAdminActor,
  assertProjectCapability,
  assertTenantCapability,
  resolveAccessibleTenantIds,
} from "./access";
import { getSaasStripeClient, isSaasStripeEnabled } from "./stripe";
import {
  DEFAULT_API_KEY_SCOPES,
  hashValue,
  normalizeProjectStrategyParams,
  resolveProjectApiRateLimit,
  resolveEpochSeconds,
  resolveProjectSelectionStrategy,
} from "./prize-engine-domain";
import { invalidateSaasProjectConfigCache } from "./project-config-cache";
import { invalidateRewardEnvelopeConfigCache } from "./reward-envelope";
import {
  attachBillingDecisionPricingMetadata,
  resolveBillingDecisionPricing,
} from "./billing";
import {
  normalizeMetadata,
  normalizeScopes,
  toSaasAdminActor,
  toSaasApiKey,
  toSaasBilling,
  toSaasAgentControl,
  toSaasInvite,
  toSaasMembership,
  toSaasProject,
  toSaasPrize,
  toSaasRewardEnvelope,
  toSaasTenant,
  toSaasTenantLink,
} from "./records";
export {
  createBillingRun,
  createBillingDispute,
  createBillingSetupSession,
  createBillingTopUp,
  createCustomerPortalSession,
  handleSaasStripeWebhook,
  refreshBillingRun,
  reviewBillingDispute,
  runSaasBillingAutomationCycle,
  runSaasStripeReconciliationCycle,
  runSaasStripeWebhookCompensationCycle,
  settleBillingRun,
  syncBillingRun,
  syncBillingTopUp,
} from "./billing-service";
export {
  getSaasTenantBillingInsights,
  runSaasBillingBudgetAlertCycle,
  updateSaasBillingBudgetPolicy,
} from "./billing-budget-service";
export {
  authenticateProjectApiKey,
  applyProjectAgentControl,
  createPrizeEngineDraw,
  createPrizeEngineReward,
  getPrizeEngineFairnessCommit,
  getPrizeEngineLedger,
  getPrizeEngineObservabilityDistribution,
  getPrizeEngineOverview,
  listPrizeEngineObservabilityDistributions,
  recordPrizeEngineUsageEvent,
  revealPrizeEngineFairnessSeed,
} from "./prize-engine-service";
export {
  createSaasOutboundWebhook,
  deleteSaasOutboundWebhook,
  runSaasOutboundWebhookDeliveryCycle,
  updateSaasOutboundWebhook,
} from "./outbound-webhook-service";
export {
  createSaasReportExportJob,
  listSaasReportExportJobs,
  loadSaasReportExportDownload,
  runSaasReportExportCycle,
} from "./report-export-service";
export { getSaasOverview } from "./overview-service";
export { getSaasTenantUsageDashboard } from "./usage-service";
export type { ProjectApiAuth } from "./prize-engine-domain";

const DEFAULT_SAAS_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_API_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_API_KEY_ROTATION_OVERLAP_MS = 60 * 60 * 1000;
const DEFAULT_SANDBOX_PROJECT_SLUG = "sandbox";
const DEFAULT_SANDBOX_PROJECT_NAME = "Sandbox";
const DEFAULT_SANDBOX_PROJECT_CURRENCY = "RWDT";
const DEFAULT_SANDBOX_PROJECT_PRIZE_POOL_BALANCE = "500.00";
const DEFAULT_SANDBOX_PROJECT_METADATA = {
  bootstrapSource: "tenant_signup",
  budgetEnvelope: "sandbox",
  helloRewardReady: true,
  sandboxCurrency: true,
} as const;
const DEFAULT_SANDBOX_BILLING_METADATA = {
  bootstrapSource: "tenant_signup",
  billingMode: "sandbox_only",
} as const;
const DEFAULT_SANDBOX_PRIZES = [
  {
    name: "Starter Credits",
    stock: 500,
    weight: 24,
    rewardAmount: "5.00",
  },
  {
    name: "Power Boost",
    stock: 250,
    weight: 8,
    rewardAmount: "15.00",
  },
  {
    name: "Lucky Crate",
    stock: 100,
    weight: 3,
    rewardAmount: "50.00",
  },
] as const;
const DEFAULT_SANDBOX_REWARD_ENVELOPES = [
  {
    scope: "project",
    window: "minute",
    onCapHitStrategy: "mute",
    budgetCap: "250.0000",
    expectedPayoutPerCall: "5.0000",
    varianceCap: "75.0000",
  },
  {
    scope: "project",
    window: "hour",
    onCapHitStrategy: "mute",
    budgetCap: "2,500.0000",
    expectedPayoutPerCall: "5.0000",
    varianceCap: "300.0000",
  },
  {
    scope: "tenant",
    window: "day",
    onCapHitStrategy: "reject",
    budgetCap: "10,000.0000",
    expectedPayoutPerCall: "5.0000",
    varianceCap: "750.0000",
  },
] as const;
const DEFAULT_PORTAL_STARTER_KEY_LABEL = "sandbox-starter";

type BootstrapTenantSandboxResult = SaasTenantProvisioning["bootstrap"] & {
  issuedSandboxKey: SaasApiKeyIssue | null;
};

const normalizeSandboxEnvelopeMoney = (value: string) =>
  value.replace(/,/g, "");

const resolveApiKeyExpiry = (
  value?: string,
  fallbackMs = DEFAULT_API_KEY_TTL_MS,
) => {
  const now = Date.now();
  const expiresAt = value ? new Date(value) : new Date(now + fallbackMs);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw badRequestError("Invalid API key expiry.", {
      code: API_ERROR_CODES.INVALID_API_KEY_EXPIRY,
    });
  }

  if (expiresAt.getTime() <= now) {
    throw badRequestError("API key expiry must be in the future.", {
      code: API_ERROR_CODES.API_KEY_EXPIRY_MUST_BE_IN_FUTURE,
    });
  }

  return expiresAt;
};

const resolveRotationOverlapEndsAt = (params: {
  currentExpiry: Date;
  overlapSeconds?: number;
}) => {
  const requestedMs =
    typeof params.overlapSeconds === "number"
      ? params.overlapSeconds * 1000
      : DEFAULT_API_KEY_ROTATION_OVERLAP_MS;
  const now = Date.now();
  const requestedEndsAt = new Date(now + Math.max(requestedMs, 0));
  return requestedEndsAt < params.currentExpiry
    ? requestedEndsAt
    : params.currentExpiry;
};

const normalizeSlug = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw badRequestError("Invalid slug.", {
      code: API_ERROR_CODES.INVALID_SLUG,
    });
  }

  return slug.slice(0, 64);
};

const resolveAvailableTenantSlug = async (
  executor: Pick<typeof db, "select"> | DbTransaction,
  source: string,
) => {
  const normalized = normalizeSlug(source);
  const [existing] = await executor
    .select({ id: saasTenants.id })
    .from(saasTenants)
    .where(eq(saasTenants.slug, normalized))
    .limit(1);

  if (!existing) {
    return normalized;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = randomBytes(2).toString("hex");
    const base = normalized.slice(0, Math.max(1, 64 - suffix.length - 1));
    const candidate = `${base}-${suffix}`;
    const [collision] = await executor
      .select({ id: saasTenants.id })
      .from(saasTenants)
      .where(eq(saasTenants.slug, candidate))
      .limit(1);

    if (!collision) {
      return candidate;
    }
  }

  throw conflictError("Failed to allocate tenant slug.");
};

const makeApiKey = (environment: "sandbox" | "live") => {
  const namespace = environment === "live" ? "pe_live" : "pe_test";
  const publicPart = randomBytes(6).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const keyPrefix = `${namespace}_${publicPart}`;
  return {
    plainKey: `${keyPrefix}_${secret}`,
    keyPrefix,
  };
};

const buildInviteUrl = (baseUrl: string, token: string) =>
  `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}invite=${encodeURIComponent(token)}`;

const normalizeTenantInviteEmail = (value: string) =>
  value.trim().toLowerCase();

const normalizeAgentId = (value: string) => {
  const agentId = value.trim();
  if (!agentId) {
    throw badRequestError("Agent id is required.", {
      code: API_ERROR_CODES.INVALID_AGENT_ID,
    });
  }

  if (agentId.length > 128) {
    throw badRequestError("Agent id is too long.", {
      code: API_ERROR_CODES.INVALID_AGENT_ID,
    });
  }

  return agentId;
};

const resolveAgentBudgetMultiplier = (payload: SaasAgentControlUpsert) => {
  if (payload.mode === "blocked") {
    return null;
  }

  const parsed = Number(payload.budgetMultiplier);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    throw badRequestError("Budget multiplier must be between 0 and 1.", {
      code: API_ERROR_CODES.INVALID_REQUEST,
    });
  }

  return new Decimal(parsed).toDecimalPlaces(4, Decimal.ROUND_DOWN).toFixed(4);
};

const normalizeRewardEnvelopeMoney = (
  value: SaasRewardEnvelopeUpsert["budgetCap"],
  field: string,
) => {
  try {
    const parsed =
      typeof value === "string" ? value.replace(/,/g, "").trim() : value;
    const normalized = new Decimal(parsed);
    if (!normalized.isFinite() || normalized.lt(0)) {
      throw new Error("out_of_range");
    }

    return normalized.toDecimalPlaces(4, Decimal.ROUND_DOWN).toFixed(4);
  } catch {
    throw badRequestError(`${field} must be a non-negative amount.`, {
      code: API_ERROR_CODES.INVALID_REQUEST,
    });
  }
};

const hasBillingAccountVersionChanged = (
  row: typeof saasBillingAccountVersions.$inferSelect | undefined,
  next: {
    planCode: SaasBillingAccountUpsert["planCode"];
    stripeCustomerId: string | null;
    collectionMethod: NonNullable<SaasBillingAccountUpsert["collectionMethod"]>;
    autoBillingEnabled: boolean;
    portalConfigurationId: string | null;
    baseMonthlyFee: string;
    drawFee: string;
    decisionPricing: {
      reject: string;
      mute: string;
      payout: string;
    };
    currency: string;
    isBillable: boolean;
    metadata: Record<string, unknown> | null;
  },
) => {
  if (!row) {
    return true;
  }

  return (
    row.planCode !== next.planCode ||
    row.stripeCustomerId !== next.stripeCustomerId ||
    row.collectionMethod !== next.collectionMethod ||
    Boolean(row.autoBillingEnabled) !== next.autoBillingEnabled ||
    row.portalConfigurationId !== next.portalConfigurationId ||
    toMoneyString(row.baseMonthlyFee) !== next.baseMonthlyFee ||
    new Decimal(row.drawFee).toFixed(4) !== next.drawFee ||
    JSON.stringify(resolveBillingDecisionPricing(row.metadata, row.drawFee)) !==
      JSON.stringify(next.decisionPricing) ||
    row.currency !== next.currency ||
    Boolean(row.isBillable) !== next.isBillable ||
    JSON.stringify(normalizeMetadata(row.metadata)) !==
      JSON.stringify(next.metadata)
  );
};

const createProjectApiKeyRecord = async (params: {
  tx: DbTransaction;
  project: typeof saasProjects.$inferSelect;
  label: string;
  scopes?: readonly PrizeEngineApiKeyScope[];
  createdByAdminId?: number | null;
  expiresAt?: string;
}) => {
  const { tx, project, label, scopes, createdByAdminId, expiresAt } = params;
  const { keyPrefix, plainKey } = makeApiKey(project.environment);
  const [created] = await tx
    .insert(saasApiKeys)
    .values({
      projectId: project.id,
      label: label.trim(),
      keyPrefix,
      keyHash: hashValue(plainKey),
      scopes: normalizeScopes(scopes ?? DEFAULT_API_KEY_SCOPES),
      createdByAdminId: createdByAdminId ?? null,
      expiresAt: resolveApiKeyExpiry(expiresAt),
    })
    .returning();

  if (!created) {
    throw conflictError("Failed to create API key.");
  }

  return toSaasApiKey(created, plainKey) as SaasApiKeyIssue;
};

const bootstrapTenantSandbox = async (
  tx: DbTransaction,
  tenant: typeof saasTenants.$inferSelect,
  options?: {
    starterKey?: {
      label: string;
      scopes?: readonly PrizeEngineApiKeyScope[];
      createdByAdminId?: number | null;
      expiresAt?: string;
    };
  },
): Promise<BootstrapTenantSandboxResult> => {
  const now = new Date();
  const [billingAccount] = await tx
    .insert(saasBillingAccounts)
    .values({
      tenantId: tenant.id,
      planCode: "starter",
      stripeCustomerId: null,
      collectionMethod: "send_invoice",
      autoBillingEnabled: false,
      portalConfigurationId: null,
      baseMonthlyFee: "0.00",
      drawFee: "0.0000",
      currency: "USD",
      isBillable: false,
      metadata: DEFAULT_SANDBOX_BILLING_METADATA,
      updatedAt: now,
    })
    .returning();

  if (!billingAccount) {
    throw conflictError("Failed to create tenant billing account.", {
      code: API_ERROR_CODES.FAILED_TO_SAVE_BILLING_ACCOUNT,
    });
  }

  await tx.insert(saasBillingAccountVersions).values({
    tenantId: tenant.id,
    billingAccountId: billingAccount.id,
    planCode: billingAccount.planCode,
    stripeCustomerId: billingAccount.stripeCustomerId,
    collectionMethod: billingAccount.collectionMethod,
    autoBillingEnabled: Boolean(billingAccount.autoBillingEnabled),
    portalConfigurationId: billingAccount.portalConfigurationId,
    baseMonthlyFee: toMoneyString(billingAccount.baseMonthlyFee),
    drawFee: new Decimal(billingAccount.drawFee).toFixed(4),
    currency: billingAccount.currency,
    isBillable: false,
    metadata: normalizeMetadata(billingAccount.metadata),
    effectiveAt: now,
    createdByAdminId: null,
    createdAt: now,
  });

  const rateLimits = resolveProjectApiRateLimit({});
  const [sandboxProject] = await tx
    .insert(saasProjects)
    .values({
      tenantId: tenant.id,
      slug: DEFAULT_SANDBOX_PROJECT_SLUG,
      name: DEFAULT_SANDBOX_PROJECT_NAME,
      environment: "sandbox",
      status: tenant.status,
      currency: DEFAULT_SANDBOX_PROJECT_CURRENCY,
      drawCost: "0.00",
      prizePoolBalance: DEFAULT_SANDBOX_PROJECT_PRIZE_POOL_BALANCE,
      strategy: resolveProjectSelectionStrategy(undefined),
      strategyParams: normalizeProjectStrategyParams(undefined),
      fairnessEpochSeconds: resolveEpochSeconds(undefined),
      maxDrawCount: 1,
      missWeight: 0,
      ...rateLimits,
      metadata: DEFAULT_SANDBOX_PROJECT_METADATA,
    })
    .returning();

  if (!sandboxProject) {
    throw conflictError("Failed to create sandbox project.");
  }

  const sandboxPrizes =
    DEFAULT_SANDBOX_PRIZES.length > 0
      ? await tx
          .insert(saasProjectPrizes)
          .values(
            DEFAULT_SANDBOX_PRIZES.map((prize) => ({
              projectId: sandboxProject.id,
              name: prize.name,
              stock: prize.stock,
              weight: prize.weight,
              rewardAmount: prize.rewardAmount,
              isActive: true,
              metadata: {
                bootstrapSource: "tenant_signup",
                sandboxFixture: true,
              },
            })),
          )
          .returning()
      : [];
  const sandboxRewardEnvelopes =
    DEFAULT_SANDBOX_REWARD_ENVELOPES.length > 0
      ? await tx
          .insert(saasRewardEnvelopes)
          .values(
            DEFAULT_SANDBOX_REWARD_ENVELOPES.map((envelope) => ({
              tenantId: tenant.id,
              projectId:
                envelope.scope === "project" ? sandboxProject.id : null,
              window: envelope.window,
              onCapHitStrategy: envelope.onCapHitStrategy,
              budgetCap: normalizeSandboxEnvelopeMoney(envelope.budgetCap),
              expectedPayoutPerCall: normalizeSandboxEnvelopeMoney(
                envelope.expectedPayoutPerCall,
              ),
              varianceCap: normalizeSandboxEnvelopeMoney(envelope.varianceCap),
              currentConsumed: "0.0000",
              currentCallCount: 0,
              currentWindowStartedAt: now,
            })),
          )
          .returning()
      : [];
  const issuedSandboxKey = options?.starterKey
    ? await createProjectApiKeyRecord({
        tx,
        project: sandboxProject,
        label: options.starterKey.label,
        scopes: options.starterKey.scopes,
        createdByAdminId: options.starterKey.createdByAdminId,
        expiresAt: options.starterKey.expiresAt,
      })
    : null;

  return {
    sandboxProject: toSaasProject(sandboxProject),
    sandboxPrizes: sandboxPrizes.map(toSaasPrize),
    sandboxRewardEnvelopes: sandboxRewardEnvelopes.map(toSaasRewardEnvelope),
    billingAccount: toSaasBilling(billingAccount),
    issuedSandboxKey,
  };
};

const createTenantWithBootstrap = async (
  tx: DbTransaction,
  payload: {
    slug: string;
    name: string;
    billingEmail?: string | null;
    status?: SaasTenantCreate["status"];
    metadata?: Record<string, unknown> | null;
  },
  options?: Parameters<typeof bootstrapTenantSandbox>[2],
) => {
  const [created] = await tx
    .insert(saasTenants)
    .values({
      slug: payload.slug,
      name: payload.name.trim(),
      billingEmail: payload.billingEmail ?? null,
      status: payload.status ?? "active",
      metadata: payload.metadata ?? null,
    })
    .returning();

  if (!created) {
    throw conflictError("Failed to create tenant.");
  }

  return {
    tenant: created,
    bootstrap: await bootstrapTenantSandbox(tx, created, options),
  };
};

export async function createSaasTenant(
  payload: SaasTenantCreate,
): Promise<SaasTenantProvisioning> {
  return db.transaction(async (tx) => {
    const { tenant, bootstrap } = await createTenantWithBootstrap(tx, {
      slug: normalizeSlug(payload.slug),
      name: payload.name,
      billingEmail: payload.billingEmail ?? null,
      status: payload.status,
      metadata: normalizeMetadata(payload.metadata),
    });
    return {
      ...toSaasTenant(tenant),
      bootstrap: {
        sandboxProject: bootstrap.sandboxProject,
        sandboxPrizes: bootstrap.sandboxPrizes,
        sandboxRewardEnvelopes: bootstrap.sandboxRewardEnvelopes,
        billingAccount: bootstrap.billingAccount,
      },
    };
  });
}

export async function createPortalSaasTenant(
  payload: SaasPortalTenantCreate,
  portalUser: {
    adminId: number;
    email: string;
  },
): Promise<SaasPortalTenantRegistration> {
  return db.transaction(async (tx) => {
    const resolvedSlug = await resolveAvailableTenantSlug(
      tx,
      payload.slug?.trim() || payload.name,
    );
    const { tenant, bootstrap } = await createTenantWithBootstrap(
      tx,
      {
        slug: resolvedSlug,
        name: payload.name,
        billingEmail: payload.billingEmail?.trim() || portalUser.email,
        status: "active",
        metadata: {
          createdBy: "portal_self_serve",
          createdByAdminId: portalUser.adminId,
        },
      },
      {
        starterKey: {
          label: `${resolvedSlug}-${DEFAULT_PORTAL_STARTER_KEY_LABEL}`,
          scopes: DEFAULT_API_KEY_SCOPES,
          createdByAdminId: portalUser.adminId,
        },
      },
    );

    const [membership] = await tx
      .insert(saasTenantMemberships)
      .values({
        tenantId: tenant.id,
        adminId: portalUser.adminId,
        role: "tenant_owner",
        createdByAdminId: portalUser.adminId,
        metadata: {
          source: "portal_self_serve",
        },
      })
      .returning();

    if (!membership || !bootstrap.issuedSandboxKey) {
      throw conflictError("Failed to finish tenant onboarding.");
    }

    return {
      tenant: {
        ...toSaasTenant(tenant),
        bootstrap: {
          sandboxProject: bootstrap.sandboxProject,
          sandboxPrizes: bootstrap.sandboxPrizes,
          sandboxRewardEnvelopes: bootstrap.sandboxRewardEnvelopes,
          billingAccount: bootstrap.billingAccount,
        },
      },
      membership: toSaasMembership({
        ...membership,
        adminEmail: portalUser.email,
        adminDisplayName: null,
      }),
      issuedKey: bootstrap.issuedSandboxKey,
    };
  });
}

export async function createSaasTenantRiskEnvelopeDraft(
  payload: SaasTenantRiskEnvelopePatch,
  adminId: number,
  permissions?: string[],
  reason?: string | null,
) {
  await assertTenantCapability(
    toSaasAdminActor(adminId, permissions),
    payload.tenantId,
    "billing:write",
  );

  return createSaasTenantRiskEnvelopeControlDraft({
    adminId,
    riskEnvelope: payload,
    reason,
  });
}

export async function createSaasProject(
  payload: SaasProjectCreate,
  actor?: SaasAdminActor,
) {
  await assertTenantCapability(
    actor ?? null,
    payload.tenantId,
    "project:write",
  );

  const [tenant] = await db
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.id, payload.tenantId))
    .limit(1);

  if (!tenant) {
    throw notFoundError("Tenant not found.", {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  const [created] = await db
    .insert(saasProjects)
    .values({
      tenantId: payload.tenantId,
      slug: normalizeSlug(payload.slug),
      name: payload.name.trim(),
      environment: payload.environment,
      status: payload.status ?? "active",
      currency: (payload.currency ?? "USD").trim().toUpperCase(),
      drawCost: toMoneyString(payload.drawCost ?? 0),
      prizePoolBalance: toMoneyString(payload.prizePoolBalance ?? 0),
      strategy: resolveProjectSelectionStrategy(payload.strategy),
      strategyParams: normalizeProjectStrategyParams(payload.strategyParams),
      fairnessEpochSeconds: resolveEpochSeconds(payload.fairnessEpochSeconds),
      maxDrawCount: Math.min(
        Math.max(Number(payload.maxDrawCount ?? 1), 1),
        100,
      ),
      missWeight: Math.max(0, Number(payload.missWeight ?? 0)),
      ...resolveProjectApiRateLimit(payload),
      metadata: normalizeMetadata(payload.metadata),
    })
    .returning();

  await invalidateSaasProjectConfigCache({
    projectId: created.id,
    environment: created.environment,
  });
  return toSaasProject(created);
}

export async function updateSaasProject(
  projectId: number,
  payload: SaasProjectPatch,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "project:write");

  const [updated] = await db
    .update(saasProjects)
    .set({
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.currency !== undefined
        ? { currency: payload.currency.trim().toUpperCase() }
        : {}),
      ...(payload.drawCost !== undefined
        ? { drawCost: toMoneyString(payload.drawCost) }
        : {}),
      ...(payload.prizePoolBalance !== undefined
        ? { prizePoolBalance: toMoneyString(payload.prizePoolBalance) }
        : {}),
      ...(payload.strategy !== undefined
        ? { strategy: resolveProjectSelectionStrategy(payload.strategy) }
        : {}),
      ...(payload.strategyParams !== undefined
        ? {
            strategyParams: normalizeProjectStrategyParams(
              payload.strategyParams,
            ),
          }
        : {}),
      ...(payload.fairnessEpochSeconds !== undefined
        ? {
            fairnessEpochSeconds: resolveEpochSeconds(
              payload.fairnessEpochSeconds,
            ),
          }
        : {}),
      ...(payload.maxDrawCount !== undefined
        ? {
            maxDrawCount: Math.min(
              Math.max(Number(payload.maxDrawCount), 1),
              100,
            ),
          }
        : {}),
      ...(payload.missWeight !== undefined
        ? { missWeight: Math.max(0, Number(payload.missWeight)) }
        : {}),
      ...(payload.apiRateLimitBurst !== undefined
        ? {
            apiRateLimitBurst:
              resolveProjectApiRateLimit(payload).apiRateLimitBurst,
          }
        : {}),
      ...(payload.apiRateLimitHourly !== undefined
        ? {
            apiRateLimitHourly:
              resolveProjectApiRateLimit(payload).apiRateLimitHourly,
          }
        : {}),
      ...(payload.apiRateLimitDaily !== undefined
        ? {
            apiRateLimitDaily:
              resolveProjectApiRateLimit(payload).apiRateLimitDaily,
          }
        : {}),
      ...(payload.metadata !== undefined
        ? { metadata: normalizeMetadata(payload.metadata) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(saasProjects.id, projectId))
    .returning();

  if (!updated) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  await invalidateSaasProjectConfigCache({
    projectId: updated.id,
    environment: updated.environment,
  });
  return toSaasProject(updated);
}

const upsertRewardEnvelopeForScope = async (
  target:
    | {
        scope: "tenant";
        tenantId: number;
      }
    | {
        scope: "project";
        projectId: number;
      },
  payload: SaasRewardEnvelopeUpsert,
  actor?: SaasAdminActor,
) => {
  if (target.scope === "tenant") {
    await assertTenantCapability(actor ?? null, target.tenantId, "project:write");
  } else {
    await assertProjectCapability(actor ?? null, target.projectId, "project:write");
  }

  const budgetCap = normalizeRewardEnvelopeMoney(payload.budgetCap, "Budget cap");
  const expectedPayoutPerCall = normalizeRewardEnvelopeMoney(
    payload.expectedPayoutPerCall,
    "Expected payout per call",
  );
  const varianceCap = normalizeRewardEnvelopeMoney(
    payload.varianceCap,
    "Variance cap",
  );

  const saved = await db.transaction(async (tx) => {
    const now = new Date();
    let resolvedTenantId: number;
    let resolvedProjectId: number | null;

    if (target.scope === "tenant") {
      const [tenant] = await tx
        .select({
          id: saasTenants.id,
        })
        .from(saasTenants)
        .where(eq(saasTenants.id, target.tenantId))
        .limit(1);

      if (!tenant) {
        throw notFoundError("Tenant not found.", {
          code: API_ERROR_CODES.TENANT_NOT_FOUND,
        });
      }

      resolvedTenantId = tenant.id;
      resolvedProjectId = null;
    } else {
      const [project] = await tx
        .select({
          id: saasProjects.id,
          tenantId: saasProjects.tenantId,
        })
        .from(saasProjects)
        .where(eq(saasProjects.id, target.projectId))
        .limit(1);

      if (!project) {
        throw notFoundError("Project not found.", {
          code: API_ERROR_CODES.PROJECT_NOT_FOUND,
        });
      }

      resolvedTenantId = project.tenantId;
      resolvedProjectId = project.id;
    }

    const predicate =
      resolvedProjectId === null
        ? and(
            eq(saasRewardEnvelopes.tenantId, resolvedTenantId),
            isNull(saasRewardEnvelopes.projectId),
            eq(saasRewardEnvelopes.window, payload.window),
          )
        : and(
            eq(saasRewardEnvelopes.tenantId, resolvedTenantId),
            eq(saasRewardEnvelopes.projectId, resolvedProjectId),
            eq(saasRewardEnvelopes.window, payload.window),
          );

    const [existing] = await tx
      .select()
      .from(saasRewardEnvelopes)
      .where(predicate)
      .orderBy(desc(saasRewardEnvelopes.id))
      .limit(1);

    const [persisted] = existing
      ? await tx
          .update(saasRewardEnvelopes)
          .set({
            onCapHitStrategy: payload.onCapHitStrategy,
            budgetCap,
            expectedPayoutPerCall,
            varianceCap,
            updatedAt: now,
          })
          .where(eq(saasRewardEnvelopes.id, existing.id))
          .returning()
      : await tx
          .insert(saasRewardEnvelopes)
          .values({
            tenantId: resolvedTenantId,
            projectId: resolvedProjectId,
            window: payload.window,
            onCapHitStrategy: payload.onCapHitStrategy,
            budgetCap,
            expectedPayoutPerCall,
            varianceCap,
            currentConsumed: "0.0000",
            currentCallCount: 0,
            currentWindowStartedAt: now,
            updatedAt: now,
          })
          .returning();

    if (!persisted) {
      throw conflictError("Failed to save reward envelope.", {
        code: API_ERROR_CODES.INVALID_REQUEST,
      });
    }

    return {
      tenantId: resolvedTenantId,
      projectId: resolvedProjectId,
      envelope: persisted,
    };
  });

  await invalidateRewardEnvelopeConfigCache({
    tenantId: saved.tenantId,
    projectId: saved.projectId,
  });

  return toSaasRewardEnvelope(saved.envelope);
};

export async function upsertTenantRewardEnvelope(
  tenantId: number,
  payload: SaasRewardEnvelopeUpsert,
  actor?: SaasAdminActor,
) {
  return upsertRewardEnvelopeForScope(
    {
      scope: "tenant",
      tenantId,
    },
    payload,
    actor,
  );
}

export async function upsertProjectRewardEnvelope(
  projectId: number,
  payload: SaasRewardEnvelopeUpsert,
  actor?: SaasAdminActor,
) {
  return upsertRewardEnvelopeForScope(
    {
      scope: "project",
      projectId,
    },
    payload,
    actor,
  );
}

export async function upsertSaasBillingAccount(
  payload: SaasBillingAccountUpsert,
  actor?: SaasAdminActor,
) {
  await assertTenantCapability(
    actor ?? null,
    payload.tenantId,
    "billing:write",
  );

  const [tenant] = await db
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.id, payload.tenantId))
    .limit(1);

  if (!tenant) {
    throw notFoundError("Tenant not found.", {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  const [existing] = await db
    .select()
    .from(saasBillingAccounts)
    .where(eq(saasBillingAccounts.tenantId, payload.tenantId))
    .limit(1);

  let stripeCustomerId =
    payload.stripeCustomerId ?? existing?.stripeCustomerId ?? null;
  if (!stripeCustomerId && tenant.billingEmail && isSaasStripeEnabled()) {
    const customer = await getSaasStripeClient().customers.create({
      email: tenant.billingEmail,
      name: tenant.name,
      metadata: {
        saasTenantId: String(tenant.id),
        saasTenantSlug: tenant.slug,
      },
    });
    stripeCustomerId = customer.id;
  }

  const now = new Date();
  const existingMetadata = normalizeMetadata(existing?.metadata);
  const incomingMetadata = normalizeMetadata(payload.metadata);
  const metadata = attachBillingDecisionPricingMetadata(
    payload.metadata === undefined
      ? existingMetadata
      : {
          ...(existingMetadata ?? {}),
          ...(incomingMetadata ?? {}),
        },
    payload.decisionPricing,
  );
  const decisionPricing = resolveBillingDecisionPricing(
    metadata,
    payload.drawFee,
  );
  const values = {
    tenantId: payload.tenantId,
    planCode: payload.planCode,
    stripeCustomerId,
    collectionMethod:
      payload.collectionMethod ?? existing?.collectionMethod ?? "send_invoice",
    autoBillingEnabled:
      payload.autoBillingEnabled ?? existing?.autoBillingEnabled ?? false,
    portalConfigurationId:
      payload.portalConfigurationId ?? existing?.portalConfigurationId ?? null,
    baseMonthlyFee: toMoneyString(payload.baseMonthlyFee),
    drawFee: new Decimal(payload.drawFee).toFixed(4),
    currency: payload.currency.trim().toUpperCase(),
    isBillable: payload.isBillable ?? true,
    metadata,
    updatedAt: now,
  };

  const saved = await db.transaction(async (tx) => {
    const [persisted] = existing
      ? await tx
          .update(saasBillingAccounts)
          .set(values)
          .where(
            and(
              eq(saasBillingAccounts.id, existing.id),
              eq(saasBillingAccounts.tenantId, payload.tenantId),
            ),
          )
          .returning()
      : await tx.insert(saasBillingAccounts).values(values).returning();

    if (!persisted) {
      return null;
    }

    const [latestVersion] = await tx
      .select()
      .from(saasBillingAccountVersions)
      .where(eq(saasBillingAccountVersions.billingAccountId, persisted.id))
      .orderBy(
        desc(saasBillingAccountVersions.effectiveAt),
        desc(saasBillingAccountVersions.id),
      )
      .limit(1);

    if (
      hasBillingAccountVersionChanged(latestVersion, {
        planCode: persisted.planCode,
        stripeCustomerId: persisted.stripeCustomerId,
        collectionMethod: persisted.collectionMethod,
        autoBillingEnabled: Boolean(persisted.autoBillingEnabled),
        portalConfigurationId: persisted.portalConfigurationId,
        baseMonthlyFee: toMoneyString(persisted.baseMonthlyFee),
        drawFee: new Decimal(persisted.drawFee).toFixed(4),
        decisionPricing,
        currency: persisted.currency,
        isBillable: Boolean(persisted.isBillable),
        metadata: normalizeMetadata(persisted.metadata),
      })
    ) {
      await tx.insert(saasBillingAccountVersions).values({
        tenantId: persisted.tenantId,
        billingAccountId: persisted.id,
        planCode: persisted.planCode,
        stripeCustomerId: persisted.stripeCustomerId,
        collectionMethod: persisted.collectionMethod,
        autoBillingEnabled: Boolean(persisted.autoBillingEnabled),
        portalConfigurationId: persisted.portalConfigurationId,
        baseMonthlyFee: toMoneyString(persisted.baseMonthlyFee),
        drawFee: new Decimal(persisted.drawFee).toFixed(4),
        currency: persisted.currency,
        isBillable: Boolean(persisted.isBillable),
        metadata: normalizeMetadata(persisted.metadata),
        effectiveAt: now,
        createdByAdminId: actor?.adminId ?? null,
        createdAt: now,
      });
    }

    return persisted;
  });

  if (!saved) {
    throw conflictError("Failed to save billing account.", {
      code: API_ERROR_CODES.FAILED_TO_SAVE_BILLING_ACCOUNT,
    });
  }

  return toSaasBilling(saved);
}

export async function createProjectApiKey(
  payload: SaasApiKeyCreate,
  adminId?: number | null,
  permissions?: string[],
  accessScope: "global" | "membership" = "global",
) {
  await assertProjectCapability(
    toSaasAdminActor(adminId ?? null, permissions, accessScope),
    payload.projectId,
    "key:write",
  );

  const [project] = await db
    .select()
    .from(saasProjects)
    .where(eq(saasProjects.id, payload.projectId))
    .limit(1);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  const { keyPrefix, plainKey } = makeApiKey(project.environment);
  const expiresAt = resolveApiKeyExpiry(payload.expiresAt);
  const [created] = await db
    .insert(saasApiKeys)
    .values({
      projectId: payload.projectId,
      label: payload.label.trim(),
      keyPrefix,
      keyHash: hashValue(plainKey),
      scopes: normalizeScopes(payload.scopes ?? DEFAULT_API_KEY_SCOPES),
      createdByAdminId: adminId ?? null,
      expiresAt,
    })
    .returning();

  return toSaasApiKey(created, plainKey) as SaasApiKeyIssue;
}

export async function rotateProjectApiKey(
  projectId: number,
  keyId: number,
  payload: SaasApiKeyRotate,
  adminId?: number | null,
  permissions?: string[],
  accessScope: "global" | "membership" = "global",
) {
  await assertProjectCapability(
    toSaasAdminActor(adminId ?? null, permissions, accessScope),
    projectId,
    "key:write",
  );

  const [project] = await db
    .select()
    .from(saasProjects)
    .where(eq(saasProjects.id, projectId))
    .limit(1);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(saasApiKeys)
      .where(
        and(eq(saasApiKeys.id, keyId), eq(saasApiKeys.projectId, projectId)),
      )
      .limit(1);

    if (!current) {
      throw notFoundError("API key not found.", {
        code: API_ERROR_CODES.API_KEY_NOT_FOUND,
      });
    }

    if (current.revokedAt) {
      throw conflictError("API key has already been revoked.", {
        code: API_ERROR_CODES.API_KEY_ALREADY_REVOKED,
      });
    }

    if (current.expiresAt <= new Date()) {
      throw conflictError("API key has already expired.", {
        code: API_ERROR_CODES.API_KEY_ALREADY_EXPIRED,
      });
    }

    if (current.rotatedToApiKeyId) {
      throw conflictError("API key has already been rotated.", {
        code: API_ERROR_CODES.API_KEY_ALREADY_ROTATED,
      });
    }

    const nextScopes = normalizeScopes(payload.scopes ?? current.scopes);
    const nextExpiresAt = resolveApiKeyExpiry(payload.expiresAt);
    const overlapEndsAt = resolveRotationOverlapEndsAt({
      currentExpiry: current.expiresAt,
      overlapSeconds: payload.overlapSeconds,
    });
    const { keyPrefix, plainKey } = makeApiKey(project.environment);

    const [issued] = await tx
      .insert(saasApiKeys)
      .values({
        projectId,
        label: payload.label?.trim() || current.label,
        keyPrefix,
        keyHash: hashValue(plainKey),
        scopes: nextScopes,
        createdByAdminId: adminId ?? null,
        expiresAt: nextExpiresAt,
        rotatedFromApiKeyId: current.id,
      })
      .returning();

    const [previousKey] = await tx
      .update(saasApiKeys)
      .set({
        expiresAt: overlapEndsAt,
        rotatedToApiKeyId: issued.id,
      })
      .where(
        and(
          eq(saasApiKeys.id, current.id),
          eq(saasApiKeys.projectId, projectId),
          isNull(saasApiKeys.revokedAt),
          isNull(saasApiKeys.rotatedToApiKeyId),
        ),
      )
      .returning();

    if (!previousKey) {
      throw conflictError("API key rotation could not be finalized.", {
        code: API_ERROR_CODES.API_KEY_ROTATION_FINALIZATION_FAILED,
      });
    }

    return {
      previousKey: toSaasApiKey(previousKey) as SaasApiKey,
      issuedKey: toSaasApiKey(issued, plainKey) as SaasApiKeyIssue,
      overlapEndsAt,
      reason: payload.reason?.trim() || null,
    } satisfies SaasApiKeyRotation;
  });

  return result;
}

export async function revokeProjectApiKey(
  projectId: number,
  keyId: number,
  payload: SaasApiKeyRevoke,
  adminId?: number | null,
  permissions?: string[],
  accessScope: "global" | "membership" = "global",
) {
  await assertProjectCapability(
    toSaasAdminActor(adminId ?? null, permissions, accessScope),
    projectId,
    "key:write",
  );

  const [revoked] = await db
    .update(saasApiKeys)
    .set({
      revokedAt: new Date(),
      revokedByAdminId: adminId ?? null,
      revokeReason: payload.reason?.trim() || null,
    })
    .where(
      and(
        eq(saasApiKeys.id, keyId),
        eq(saasApiKeys.projectId, projectId),
        isNull(saasApiKeys.revokedAt),
      ),
    )
    .returning();

  if (!revoked) {
    throw notFoundError("API key not found.", {
      code: API_ERROR_CODES.API_KEY_NOT_FOUND,
    });
  }

  return toSaasApiKey(revoked) as SaasApiKey;
}

export async function createSaasTenantMembership(
  payload: SaasTenantMembershipCreate,
  adminId?: number | null,
  permissions?: string[],
) {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    payload.tenantId,
    "tenant:members:write",
  );

  const [targetAdmin] = await db
    .select({
      adminId: admins.id,
      adminDisplayName: admins.displayName,
      adminEmail: users.email,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(
      and(
        eq(users.email, payload.adminEmail.trim()),
        eq(admins.isActive, true),
      ),
    )
    .limit(1);

  if (!targetAdmin) {
    throw notFoundError("Admin user not found for this email.", {
      code: API_ERROR_CODES.ADMIN_USER_NOT_FOUND_FOR_EMAIL,
    });
  }

  const [membership] = await db
    .insert(saasTenantMemberships)
    .values({
      tenantId: payload.tenantId,
      adminId: targetAdmin.adminId,
      role: payload.role,
      createdByAdminId: adminId ?? null,
      metadata: normalizeMetadata(payload.metadata),
    })
    .onConflictDoUpdate({
      target: [saasTenantMemberships.tenantId, saasTenantMemberships.adminId],
      set: {
        role: payload.role,
        metadata: normalizeMetadata(payload.metadata),
        updatedAt: new Date(),
      },
    })
    .returning();

  return toSaasMembership({
    ...membership,
    adminEmail: targetAdmin.adminEmail,
    adminDisplayName: targetAdmin.adminDisplayName,
  });
}

export async function deleteSaasTenantMembership(
  tenantId: number,
  membershipId: number,
  adminId?: number | null,
  permissions?: string[],
) {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    tenantId,
    "tenant:members:write",
  );

  const [membership] = await db
    .select()
    .from(saasTenantMemberships)
    .where(
      and(
        eq(saasTenantMemberships.id, membershipId),
        eq(saasTenantMemberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw notFoundError("Tenant membership not found.", {
      code: API_ERROR_CODES.TENANT_MEMBERSHIP_NOT_FOUND,
    });
  }

  if (membership.role === "tenant_owner") {
    const [ownerCountRow] = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(saasTenantMemberships)
      .where(
        and(
          eq(saasTenantMemberships.tenantId, tenantId),
          eq(saasTenantMemberships.role, "tenant_owner"),
        ),
      );

    if (Number(ownerCountRow?.total ?? 0) <= 1) {
      throw badRequestError("Tenant must retain at least one owner.", {
        code: API_ERROR_CODES.TENANT_OWNER_REQUIRED,
      });
    }
  }

  const [deleted] = await db
    .delete(saasTenantMemberships)
    .where(
      and(
        eq(saasTenantMemberships.id, membershipId),
        eq(saasTenantMemberships.tenantId, tenantId),
      ),
    )
    .returning();

  if (!deleted) {
    throw notFoundError("Tenant membership not found.", {
      code: API_ERROR_CODES.TENANT_MEMBERSHIP_NOT_FOUND,
    });
  }

  return toSaasMembership(deleted);
}

export async function createSaasTenantInvite(
  payload: SaasTenantInviteCreate,
  options: {
    adminId?: number | null;
    permissions?: string[];
    inviteBaseUrl: string;
    invitedByLabel?: string | null;
  },
) {
  await assertTenantCapability(
    toSaasAdminActor(options.adminId ?? null, options.permissions),
    payload.tenantId,
    "tenant:members:write",
  );

  const [tenant] = await db
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.id, payload.tenantId))
    .limit(1);

  if (!tenant) {
    throw notFoundError("Tenant not found.", {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  const email = normalizeTenantInviteEmail(payload.email);
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashValue(token);
  const expiresAt = new Date(Date.now() + DEFAULT_SAAS_INVITE_TTL_MS);

  const [invite] = await db
    .insert(saasTenantInvites)
    .values({
      tenantId: payload.tenantId,
      email,
      role: payload.role,
      tokenHash,
      status: "pending",
      createdByAdminId: options.adminId ?? null,
      expiresAt,
      metadata: normalizeMetadata(payload.metadata),
    })
    .returning();

  const inviteUrl = buildInviteUrl(options.inviteBaseUrl, token);
  await sendSaasTenantInviteNotification({
    email,
    inviteUrl,
    tenantName: tenant.name,
    role: payload.role,
    invitedBy: options.invitedByLabel ?? null,
    expiresAt,
  });

  return {
    invite: toSaasInvite(invite),
    inviteUrl,
  };
}

export async function revokeSaasTenantInvite(
  tenantId: number,
  inviteId: number,
  adminId?: number | null,
  permissions?: string[],
) {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    tenantId,
    "tenant:members:write",
  );

  const [invite] = await db
    .update(saasTenantInvites)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saasTenantInvites.id, inviteId),
        eq(saasTenantInvites.tenantId, tenantId),
        eq(saasTenantInvites.status, "pending"),
      ),
    )
    .returning();

  if (!invite) {
    throw notFoundError("Tenant invite not found.", {
      code: API_ERROR_CODES.TENANT_INVITE_NOT_FOUND,
    });
  }

  return toSaasInvite(invite);
}

export async function acceptSaasTenantInvite(
  payload: SaasTenantInviteAccept,
  adminId?: number | null,
) {
  if (!adminId) {
    throw unauthorizedError("Admin authentication is required.", {
      code: API_ERROR_CODES.ADMIN_AUTHENTICATION_REQUIRED,
    });
  }

  const [admin] = await db
    .select({
      adminId: admins.id,
      adminDisplayName: admins.displayName,
      adminEmail: users.email,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(and(eq(admins.id, adminId), eq(admins.isActive, true)))
    .limit(1);

  if (!admin) {
    throw unauthorizedError("Admin session is no longer active.", {
      code: API_ERROR_CODES.ADMIN_SESSION_NO_LONGER_ACTIVE,
    });
  }

  const tokenHash = hashValue(payload.token.trim());
  const [invite] = await db
    .select()
    .from(saasTenantInvites)
    .where(eq(saasTenantInvites.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    throw notFoundError("Invitation not found.", {
      code: API_ERROR_CODES.INVITATION_NOT_FOUND,
    });
  }

  if (invite.status !== "pending") {
    throw badRequestError("Invitation is no longer pending.", {
      code: API_ERROR_CODES.INVITATION_NOT_PENDING,
    });
  }

  if (invite.expiresAt <= new Date()) {
    await db
      .update(saasTenantInvites)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasTenantInvites.id, invite.id),
          eq(saasTenantInvites.tenantId, invite.tenantId),
          eq(saasTenantInvites.tokenHash, tokenHash),
          eq(saasTenantInvites.status, "pending"),
        ),
      );
    throw badRequestError("Invitation has expired.", {
      code: API_ERROR_CODES.INVITATION_EXPIRED,
    });
  }

  if (normalizeTenantInviteEmail(admin.adminEmail) !== invite.email) {
    throw forbiddenError(
      "Invitation email does not match your admin account.",
      {
        code: API_ERROR_CODES.INVITATION_EMAIL_MISMATCH,
      },
    );
  }

  const membership = await db.transaction(async (tx) => {
    const [savedMembership] = await tx
      .insert(saasTenantMemberships)
      .values({
        tenantId: invite.tenantId,
        adminId: admin.adminId,
        role: invite.role,
        createdByAdminId: invite.createdByAdminId,
        metadata: normalizeMetadata(invite.metadata),
      })
      .onConflictDoUpdate({
        target: [saasTenantMemberships.tenantId, saasTenantMemberships.adminId],
        set: {
          role: invite.role,
          metadata: normalizeMetadata(invite.metadata),
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx
      .update(saasTenantInvites)
      .set({
        status: "accepted",
        acceptedByAdminId: admin.adminId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasTenantInvites.id, invite.id),
          eq(saasTenantInvites.tenantId, invite.tenantId),
          eq(saasTenantInvites.tokenHash, tokenHash),
          eq(saasTenantInvites.status, "pending"),
        ),
      );

    return savedMembership;
  });

  if (!membership) {
    throw conflictError("Failed to accept invitation.", {
      code: API_ERROR_CODES.FAILED_TO_ACCEPT_INVITATION,
    });
  }

  return toSaasMembership({
    ...membership,
    adminEmail: admin.adminEmail,
    adminDisplayName: admin.adminDisplayName,
  });
}

export async function createSaasTenantLink(
  payload: SaasTenantLinkCreate,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  await assertTenantCapability(
    actor,
    payload.parentTenantId,
    "tenant:members:write",
  );
  await assertTenantCapability(actor, payload.childTenantId, "tenant:read");

  if (payload.parentTenantId === payload.childTenantId) {
    throw badRequestError("Tenant cannot be linked to itself.", {
      code: API_ERROR_CODES.TENANT_CANNOT_LINK_TO_ITSELF,
    });
  }

  const [link] = await db
    .insert(saasTenantLinks)
    .values({
      parentTenantId: payload.parentTenantId,
      childTenantId: payload.childTenantId,
      linkType: payload.linkType ?? "agent_client",
      createdByAdminId: adminId ?? null,
      metadata: normalizeMetadata(payload.metadata),
    })
    .onConflictDoUpdate({
      target: [
        saasTenantLinks.parentTenantId,
        saasTenantLinks.childTenantId,
        saasTenantLinks.linkType,
      ],
      set: {
        metadata: normalizeMetadata(payload.metadata),
        updatedAt: new Date(),
      },
    })
    .returning();

  return toSaasTenantLink(link);
}

export async function deleteSaasTenantLink(
  linkId: number,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  const accessibleTenantIds = await resolveAccessibleTenantIds(actor);
  const [existing] = await db
    .select()
    .from(saasTenantLinks)
    .where(
      accessibleTenantIds && accessibleTenantIds.length > 0
        ? and(
            eq(saasTenantLinks.id, linkId),
            inArray(saasTenantLinks.parentTenantId, accessibleTenantIds),
          )
        : eq(saasTenantLinks.id, linkId),
    )
    .limit(1);

  if (!existing) {
    throw notFoundError("Tenant link not found.", {
      code: API_ERROR_CODES.TENANT_LINK_NOT_FOUND,
    });
  }

  await assertTenantCapability(
    actor,
    existing.parentTenantId,
    "tenant:members:write",
  );

  const [deleted] = await db
    .delete(saasTenantLinks)
    .where(
      and(
        eq(saasTenantLinks.id, linkId),
        eq(saasTenantLinks.parentTenantId, existing.parentTenantId),
        eq(saasTenantLinks.childTenantId, existing.childTenantId),
        eq(saasTenantLinks.linkType, existing.linkType),
      ),
    )
    .returning();

  if (!deleted) {
    throw notFoundError("Tenant link not found.", {
      code: API_ERROR_CODES.TENANT_LINK_NOT_FOUND,
    });
  }

  return toSaasTenantLink(deleted);
}

export async function upsertSaasAgentControl(
  payload: SaasAgentControlUpsert,
  adminId?: number | null,
  permissions?: string[],
) {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    payload.tenantId,
    "agent:control:write",
  );

  const [saved] = await db
    .insert(agentBlocklist)
    .values({
      tenantId: payload.tenantId,
      agentId: normalizeAgentId(payload.agentId),
      mode: payload.mode,
      reason: payload.reason.trim(),
      budgetMultiplier: resolveAgentBudgetMultiplier(payload),
      createdByAdminId: adminId ?? null,
    })
    .onConflictDoUpdate({
      target: [agentBlocklist.tenantId, agentBlocklist.agentId],
      set: {
        mode: payload.mode,
        reason: payload.reason.trim(),
        budgetMultiplier: resolveAgentBudgetMultiplier(payload),
        updatedAt: new Date(),
      },
    })
    .returning();

  return toSaasAgentControl(saved);
}

export async function deleteSaasAgentControl(
  tenantId: number,
  controlId: number,
  adminId?: number | null,
  permissions?: string[],
) {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    tenantId,
    "agent:control:write",
  );

  const [deleted] = await db
    .delete(agentBlocklist)
    .where(
      and(
        eq(agentBlocklist.id, controlId),
        eq(agentBlocklist.tenantId, tenantId),
      ),
    )
    .returning();

  if (!deleted) {
    throw notFoundError("Agent control not found.", {
      code: API_ERROR_CODES.AGENT_CONTROL_NOT_FOUND,
    });
  }

  return toSaasAgentControl(deleted);
}

export async function listProjectPrizes(
  projectId: number,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "tenant:read");

  const rows = await db
    .select()
    .from(saasProjectPrizes)
    .where(
      and(
        eq(saasProjectPrizes.projectId, projectId),
        isNull(saasProjectPrizes.deletedAt),
      ),
    )
    .orderBy(desc(saasProjectPrizes.id));

  return rows.map(toSaasPrize);
}

export async function createProjectPrize(
  projectId: number,
  payload: SaasProjectPrizeCreate,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "prize:write");

  const [created] = await db
    .insert(saasProjectPrizes)
    .values({
      projectId,
      name: payload.name.trim(),
      stock: Number(payload.stock ?? 0),
      weight: Number(payload.weight ?? 1),
      rewardAmount: toMoneyString(payload.rewardAmount),
      isActive: payload.isActive ?? true,
      metadata: normalizeMetadata(payload.metadata),
    })
    .returning();

  return toSaasPrize(created);
}

export async function updateProjectPrize(
  projectId: number,
  prizeId: number,
  payload: SaasProjectPrizePatch,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "prize:write");

  const [updated] = await db
    .update(saasProjectPrizes)
    .set({
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.stock !== undefined ? { stock: Number(payload.stock) } : {}),
      ...(payload.weight !== undefined
        ? { weight: Number(payload.weight) }
        : {}),
      ...(payload.rewardAmount !== undefined
        ? { rewardAmount: toMoneyString(payload.rewardAmount) }
        : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(payload.metadata !== undefined
        ? { metadata: normalizeMetadata(payload.metadata) }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saasProjectPrizes.id, prizeId),
        eq(saasProjectPrizes.projectId, projectId),
        isNull(saasProjectPrizes.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw notFoundError("Project prize not found.", {
      code: API_ERROR_CODES.PROJECT_PRIZE_NOT_FOUND,
    });
  }

  return toSaasPrize(updated);
}

export async function deleteProjectPrize(
  projectId: number,
  prizeId: number,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "prize:write");

  const [deleted] = await db
    .update(saasProjectPrizes)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saasProjectPrizes.id, prizeId),
        eq(saasProjectPrizes.projectId, projectId),
        isNull(saasProjectPrizes.deletedAt),
      ),
    )
    .returning();

  if (!deleted) {
    throw notFoundError("Project prize not found.", {
      code: API_ERROR_CODES.PROJECT_PRIZE_NOT_FOUND,
    });
  }

  return toSaasPrize(deleted);
}
