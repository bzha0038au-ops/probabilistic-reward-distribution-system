import { randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  admins,
  saasApiKeys,
  saasBillingAccounts,
  saasBillingAccountVersions,
  saasProjectPrizes,
  saasProjects,
  saasTenants,
  saasTenantInvites,
  saasTenantLinks,
  saasTenantMemberships,
  users,
} from "@reward/database";
import { and, desc, eq, inArray, isNull, sql } from "@reward/database/orm";
import type {
  SaasApiKey,
  SaasApiKeyCreate,
  SaasApiKeyIssue,
  SaasApiKeyRotate,
  SaasApiKeyRotation,
  SaasApiKeyRevoke,
  SaasBillingAccountUpsert,
  SaasProjectCreate,
  SaasProjectPatch,
  SaasProjectPrizeCreate,
  SaasProjectPrizePatch,
  SaasTenantCreate,
  SaasTenantInviteAccept,
  SaasTenantInviteCreate,
  SaasTenantLinkCreate,
  SaasTenantMembershipCreate,
} from "@reward/shared-types/saas";

import { db } from "../../db";
import { sendSaasTenantInviteNotification } from "../auth/notification-service";
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
  resolveProjectApiRateLimit,
  resolveEpochSeconds,
} from "./prize-engine-domain";
import {
  normalizeMetadata,
  normalizeScopes,
  toSaasAdminActor,
  toSaasApiKey,
  toSaasBilling,
  toSaasInvite,
  toSaasMembership,
  toSaasProject,
  toSaasPrize,
  toSaasTenant,
  toSaasTenantLink,
} from "./records";
export {
  createBillingRun,
  createBillingSetupSession,
  createBillingTopUp,
  createCustomerPortalSession,
  handleSaasStripeWebhook,
  refreshBillingRun,
  runSaasBillingAutomationCycle,
  runSaasStripeReconciliationCycle,
  runSaasStripeWebhookCompensationCycle,
  settleBillingRun,
  syncBillingRun,
  syncBillingTopUp,
} from "./billing-service";
export {
  authenticateProjectApiKey,
  createPrizeEngineDraw,
  getPrizeEngineFairnessCommit,
  getPrizeEngineLedger,
  getPrizeEngineOverview,
  revealPrizeEngineFairnessSeed,
} from "./prize-engine-service";
export { getSaasOverview } from "./overview-service";
export type { ProjectApiAuth } from "./prize-engine-domain";

const DEFAULT_SAAS_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_API_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_API_KEY_ROTATION_OVERLAP_MS = 60 * 60 * 1000;

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
    row.currency !== next.currency ||
    Boolean(row.isBillable) !== next.isBillable ||
    JSON.stringify(normalizeMetadata(row.metadata)) !==
      JSON.stringify(next.metadata)
  );
};

export async function createSaasTenant(payload: SaasTenantCreate) {
  const [created] = await db
    .insert(saasTenants)
    .values({
      slug: normalizeSlug(payload.slug),
      name: payload.name.trim(),
      billingEmail: payload.billingEmail ?? null,
      status: payload.status ?? "active",
      metadata: normalizeMetadata(payload.metadata),
    })
    .returning();

  return toSaasTenant(created);
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

  return toSaasProject(updated);
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
  const metadata = normalizeMetadata(payload.metadata);
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
) {
  await assertProjectCapability(
    toSaasAdminActor(adminId ?? null, permissions),
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
) {
  await assertProjectCapability(
    toSaasAdminActor(adminId ?? null, permissions),
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
) {
  await assertProjectCapability(
    toSaasAdminActor(adminId ?? null, permissions),
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
    throw forbiddenError("Invitation email does not match your admin account.", {
      code: API_ERROR_CODES.INVITATION_EMAIL_MISMATCH,
    });
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
