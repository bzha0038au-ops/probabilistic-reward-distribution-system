import {
  agentBlocklist,
  admins,
  saasApiKeys,
  saasBillingAccounts,
  saasBillingDisputes,
  saasBillingRuns,
  saasBillingTopUps,
  saasOutboundWebhookDeliveries,
  saasOutboundWebhooks,
  saasPlayers,
  saasProjectPrizes,
  saasProjects,
  saasStripeWebhookEvents,
  saasTenants,
  saasTenantInvites,
  saasTenantLinks,
  saasTenantMemberships,
  saasUsageEvents,
  users,
} from "@reward/database";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from "@reward/database/orm";
import {
  defaultSaasOverviewUiCopy,
  type SaasApiKey,
  type SaasOverview,
  type SaasOverviewUiCopy,
} from "@reward/shared-types/saas";

import { db } from "../../db";
import { resolveExperimentConfig } from "../experiments/service";
import { type SaasAdminActor, resolveAccessibleTenantIds } from "./access";
import {
  BILLING_LIVE_ENVIRONMENT,
  BILLING_REWARD_EVENT_TYPES,
} from "./billing";
import {
  toSaasApiKey,
  toSaasBilling,
  toSaasBillingDispute,
  toSaasBillingRun,
  toSaasBillingTopUp,
  toSaasInvite,
  toSaasMembership,
  toSaasAgentControl,
  toSaasOutboundWebhook,
  toSaasOutboundWebhookDelivery,
  toSaasProject,
  toSaasPrize,
  toSaasStripeWebhookEvent,
  toSaasTenant,
  toSaasTenantLink,
  toSaasUsageEvent,
} from "./records";
import {
  peekPrizeEngineApiRateLimitUsage,
  summarizePrizeEngineProjectRateLimitUsage,
} from "./prize-engine-rate-limit";
import { listPrizeEngineObservabilityDistributions } from "./prize-engine-service";
import { SAAS_STATUS_REQUEST_REFERENCE_TYPE } from "../saas-status/constants";

const SAAS_PORTAL_OVERVIEW_COPY_EXPERIMENT_KEY = "saas-portal-overview-copy";

const buildDefaultSaasOverviewUiCopy = (): SaasOverviewUiCopy => ({
  overview: {
    sandbox: { ...defaultSaasOverviewUiCopy.overview.sandbox },
    snippet: { ...defaultSaasOverviewUiCopy.overview.snippet },
  },
});

const resolveSaasOverviewUiCopy = async (
  viewerUserId?: number,
): Promise<SaasOverviewUiCopy> => {
  const baseCopy = buildDefaultSaasOverviewUiCopy();
  if (!viewerUserId) {
    return baseCopy;
  }

  return (
    await resolveExperimentConfig({
      userId: viewerUserId,
      config: {
        ...baseCopy,
        experiment: {
          expKey: SAAS_PORTAL_OVERVIEW_COPY_EXPERIMENT_KEY,
        },
      },
    })
  ).config;
};

export async function getSaasOverview(
  actor?: SaasAdminActor,
  options?: {
    viewerUserId?: number;
  },
): Promise<SaasOverview> {
  const uiCopy = await resolveSaasOverviewUiCopy(options?.viewerUserId);
  const accessibleTenantIds = await resolveAccessibleTenantIds(actor ?? null);
  if (accessibleTenantIds !== null && accessibleTenantIds.length === 0) {
    return {
      summary: {
        tenantCount: 0,
        projectCount: 0,
        apiKeyCount: 0,
        playerCount: 0,
        drawCount30d: 0,
        billableTenantCount: 0,
      },
      memberships: [],
      tenants: [],
      projects: [],
      projectObservability: [],
      projectPrizes: [],
      apiKeys: [],
      billingRuns: [],
      topUps: [],
      disputes: [],
      invites: [],
      tenantLinks: [],
      agentControls: [],
      webhookEvents: [],
      outboundWebhooks: [],
      outboundDeliveries: [],
      recentUsage: [],
      uiCopy,
    };
  }

  const tenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasTenants.id, accessibleTenantIds)
      : undefined;
  const projectFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasProjects.tenantId, accessibleTenantIds)
      : undefined;
  const billingFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasBillingAccounts.tenantId, accessibleTenantIds)
      : undefined;
  const runTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasBillingRuns.tenantId, accessibleTenantIds)
      : undefined;
  const topUpTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasBillingTopUps.tenantId, accessibleTenantIds)
      : undefined;
  const disputeTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasBillingDisputes.tenantId, accessibleTenantIds)
      : undefined;
  const usageTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasUsageEvents.tenantId, accessibleTenantIds)
      : undefined;
  const membershipTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasTenantMemberships.tenantId, accessibleTenantIds)
      : undefined;
  const inviteTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasTenantInvites.tenantId, accessibleTenantIds)
      : undefined;
  const tenantLinkFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? or(
          inArray(saasTenantLinks.parentTenantId, accessibleTenantIds),
          inArray(saasTenantLinks.childTenantId, accessibleTenantIds),
        )
      : undefined;
  const agentControlFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(agentBlocklist.tenantId, accessibleTenantIds)
      : undefined;
  const webhookTenantFilter =
    accessibleTenantIds && accessibleTenantIds.length > 0
      ? inArray(saasStripeWebhookEvents.tenantId, accessibleTenantIds)
      : undefined;

  const [
    tenants,
    projects,
    billingRows,
    memberships,
    billingRuns,
    topUps,
    disputes,
    invites,
    tenantLinks,
    agentControls,
    webhookEvents,
    recentUsageRows,
    playerCounts,
    drawCounts,
  ] = await Promise.all([
    tenantFilter
      ? db
          .select()
          .from(saasTenants)
          .where(tenantFilter)
          .orderBy(desc(saasTenants.id))
      : db.select().from(saasTenants).orderBy(desc(saasTenants.id)),
    projectFilter
      ? db
          .select()
          .from(saasProjects)
          .where(projectFilter)
          .orderBy(desc(saasProjects.id))
      : db.select().from(saasProjects).orderBy(desc(saasProjects.id)),
    billingFilter
      ? db
          .select()
          .from(saasBillingAccounts)
          .where(billingFilter)
          .orderBy(desc(saasBillingAccounts.id))
      : db
          .select()
          .from(saasBillingAccounts)
          .orderBy(desc(saasBillingAccounts.id)),
    membershipTenantFilter
      ? db
          .select({
            id: saasTenantMemberships.id,
            tenantId: saasTenantMemberships.tenantId,
            adminId: saasTenantMemberships.adminId,
            adminEmail: users.email,
            adminDisplayName: admins.displayName,
            role: saasTenantMemberships.role,
            createdByAdminId: saasTenantMemberships.createdByAdminId,
            metadata: saasTenantMemberships.metadata,
            createdAt: saasTenantMemberships.createdAt,
            updatedAt: saasTenantMemberships.updatedAt,
          })
          .from(saasTenantMemberships)
          .innerJoin(admins, eq(saasTenantMemberships.adminId, admins.id))
          .innerJoin(users, eq(admins.userId, users.id))
          .where(membershipTenantFilter)
          .orderBy(desc(saasTenantMemberships.id))
      : db
          .select({
            id: saasTenantMemberships.id,
            tenantId: saasTenantMemberships.tenantId,
            adminId: saasTenantMemberships.adminId,
            adminEmail: users.email,
            adminDisplayName: admins.displayName,
            role: saasTenantMemberships.role,
            createdByAdminId: saasTenantMemberships.createdByAdminId,
            metadata: saasTenantMemberships.metadata,
            createdAt: saasTenantMemberships.createdAt,
            updatedAt: saasTenantMemberships.updatedAt,
          })
          .from(saasTenantMemberships)
          .innerJoin(admins, eq(saasTenantMemberships.adminId, admins.id))
          .innerJoin(users, eq(admins.userId, users.id))
          .orderBy(desc(saasTenantMemberships.id)),
    runTenantFilter
      ? db
          .select()
          .from(saasBillingRuns)
          .where(runTenantFilter)
          .orderBy(desc(saasBillingRuns.id))
          .limit(20)
      : db
          .select()
          .from(saasBillingRuns)
          .orderBy(desc(saasBillingRuns.id))
          .limit(20),
    topUpTenantFilter
      ? db
          .select()
          .from(saasBillingTopUps)
          .where(topUpTenantFilter)
          .orderBy(desc(saasBillingTopUps.id))
          .limit(20)
      : db
          .select()
          .from(saasBillingTopUps)
          .orderBy(desc(saasBillingTopUps.id))
          .limit(20),
    disputeTenantFilter
      ? db
          .select()
          .from(saasBillingDisputes)
          .where(disputeTenantFilter)
          .orderBy(desc(saasBillingDisputes.id))
          .limit(50)
      : db
          .select()
          .from(saasBillingDisputes)
          .orderBy(desc(saasBillingDisputes.id))
          .limit(50),
    inviteTenantFilter
      ? db
          .select()
          .from(saasTenantInvites)
          .where(inviteTenantFilter)
          .orderBy(desc(saasTenantInvites.id))
      : db.select().from(saasTenantInvites).orderBy(desc(saasTenantInvites.id)),
    tenantLinkFilter
      ? db
          .select()
          .from(saasTenantLinks)
          .where(tenantLinkFilter)
          .orderBy(desc(saasTenantLinks.id))
      : db.select().from(saasTenantLinks).orderBy(desc(saasTenantLinks.id)),
    agentControlFilter
      ? db
          .select()
          .from(agentBlocklist)
          .where(agentControlFilter)
          .orderBy(desc(agentBlocklist.updatedAt), desc(agentBlocklist.id))
      : db
          .select()
          .from(agentBlocklist)
          .orderBy(desc(agentBlocklist.updatedAt), desc(agentBlocklist.id)),
    webhookTenantFilter
      ? db
          .select()
          .from(saasStripeWebhookEvents)
          .where(webhookTenantFilter)
          .orderBy(desc(saasStripeWebhookEvents.id))
          .limit(20)
      : db
          .select()
          .from(saasStripeWebhookEvents)
          .orderBy(desc(saasStripeWebhookEvents.id))
          .limit(20),
    usageTenantFilter
      ? db
          .select()
          .from(saasUsageEvents)
          .where(
            and(
              usageTenantFilter,
              sql`${saasUsageEvents.referenceType} is distinct from ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}`,
            ),
          )
          .orderBy(desc(saasUsageEvents.createdAt), desc(saasUsageEvents.id))
          .limit(20)
      : db
          .select()
          .from(saasUsageEvents)
          .where(
            sql`${saasUsageEvents.referenceType} is distinct from ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}`,
          )
          .orderBy(desc(saasUsageEvents.createdAt), desc(saasUsageEvents.id))
          .limit(20),
    projectFilter
      ? db
          .select({
            projectId: saasPlayers.projectId,
            total: sql<number>`count(*)`,
          })
          .from(saasPlayers)
          .innerJoin(saasProjects, eq(saasPlayers.projectId, saasProjects.id))
          .where(projectFilter)
          .groupBy(saasPlayers.projectId)
      : db
          .select({
            projectId: saasPlayers.projectId,
            total: sql<number>`count(*)`,
          })
          .from(saasPlayers)
          .groupBy(saasPlayers.projectId),
    usageTenantFilter
      ? db
          .select({
            tenantId: saasUsageEvents.tenantId,
            total: sql<number>`count(*)`,
          })
          .from(saasUsageEvents)
          .where(
            and(
              usageTenantFilter,
              eq(saasUsageEvents.environment, BILLING_LIVE_ENVIRONMENT),
              inArray(saasUsageEvents.eventType, BILLING_REWARD_EVENT_TYPES),
              sql`${saasUsageEvents.referenceType} is distinct from ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}`,
              gte(
                saasUsageEvents.createdAt,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ),
            ),
          )
          .groupBy(saasUsageEvents.tenantId)
      : db
          .select({
            tenantId: saasUsageEvents.tenantId,
            total: sql<number>`count(*)`,
          })
          .from(saasUsageEvents)
          .where(
            and(
              eq(saasUsageEvents.environment, BILLING_LIVE_ENVIRONMENT),
              inArray(saasUsageEvents.eventType, BILLING_REWARD_EVENT_TYPES),
              sql`${saasUsageEvents.referenceType} is distinct from ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}`,
              gte(
                saasUsageEvents.createdAt,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ),
            ),
          )
          .groupBy(saasUsageEvents.tenantId),
  ]);

  const projectIds = projects.map((project) => project.id);
  const projectIdFilter =
    projectIds.length > 0
      ? inArray(saasProjectPrizes.projectId, projectIds)
      : null;
  const apiKeyProjectFilter =
    projectIds.length > 0 ? inArray(saasApiKeys.projectId, projectIds) : null;
  const outboundWebhookProjectFilter =
    projectIds.length > 0
      ? inArray(saasOutboundWebhooks.projectId, projectIds)
      : null;
  const outboundDeliveryProjectFilter =
    projectIds.length > 0
      ? inArray(saasOutboundWebhookDeliveries.projectId, projectIds)
      : null;

  const [
    projectPrizes,
    apiKeys,
    outboundWebhooks,
    outboundDeliveries,
    projectObservability,
  ] = await Promise.all([
    projectIdFilter
      ? db
          .select()
          .from(saasProjectPrizes)
          .where(and(projectIdFilter, isNull(saasProjectPrizes.deletedAt)))
          .orderBy(desc(saasProjectPrizes.id))
      : Promise.resolve([]),
    apiKeyProjectFilter
      ? db
          .select()
          .from(saasApiKeys)
          .where(apiKeyProjectFilter)
          .orderBy(desc(saasApiKeys.id))
      : Promise.resolve([]),
    outboundWebhookProjectFilter
      ? db
          .select()
          .from(saasOutboundWebhooks)
          .where(outboundWebhookProjectFilter)
          .orderBy(desc(saasOutboundWebhooks.id))
      : Promise.resolve([]),
    outboundDeliveryProjectFilter
      ? db
          .select()
          .from(saasOutboundWebhookDeliveries)
          .where(outboundDeliveryProjectFilter)
          .orderBy(desc(saasOutboundWebhookDeliveries.id))
          .limit(20)
      : Promise.resolve([]),
    listPrizeEngineObservabilityDistributions(projectIds, { days: 30 }),
  ]);

  const billingByTenant = new Map(
    billingRows.map((row) => [row.tenantId, row] as const),
  );
  const playerCountByProject = new Map(
    playerCounts.map((row) => [row.projectId, Number(row.total ?? 0)] as const),
  );
  const drawCountByTenant = new Map(
    drawCounts.map((row) => [row.tenantId, Number(row.total ?? 0)] as const),
  );

  const projectCountByTenant = new Map<number, number>();
  const apiKeyCountByProject = new Map<number, number>();
  const apiKeyCountByTenant = new Map<number, number>();
  const playerCountByTenant = new Map<number, number>();

  for (const project of projects) {
    projectCountByTenant.set(
      project.tenantId,
      (projectCountByTenant.get(project.tenantId) ?? 0) + 1,
    );
    playerCountByTenant.set(
      project.tenantId,
      (playerCountByTenant.get(project.tenantId) ?? 0) +
        (playerCountByProject.get(project.id) ?? 0),
    );
  }

  const projectTenantMap = new Map(
    projects.map((project) => [project.id, project.tenantId] as const),
  );
  const projectById = new Map(
    projects.map((project) => [project.id, project] as const),
  );
  for (const apiKey of apiKeys) {
    apiKeyCountByProject.set(
      apiKey.projectId,
      (apiKeyCountByProject.get(apiKey.projectId) ?? 0) + 1,
    );
    const tenantId = projectTenantMap.get(apiKey.projectId);
    if (tenantId) {
      apiKeyCountByTenant.set(
        tenantId,
        (apiKeyCountByTenant.get(tenantId) ?? 0) + 1,
      );
    }
  }

  const activeApiKeyIdsByProject = new Map<number, number[]>();
  for (const apiKey of apiKeys) {
    if (apiKey.revokedAt) {
      continue;
    }

    const projectApiKeyIds =
      activeApiKeyIdsByProject.get(apiKey.projectId) ?? [];
    projectApiKeyIds.push(apiKey.id);
    activeApiKeyIdsByProject.set(apiKey.projectId, projectApiKeyIds);
  }

  const [projectRateLimitUsageEntries, apiKeyRateLimitUsageEntries] =
    await Promise.all([
      Promise.all(
        projects.map(
          async (project) =>
            [
              project.id,
              await summarizePrizeEngineProjectRateLimitUsage(
                project,
                activeApiKeyIdsByProject.get(project.id) ?? [],
              ),
            ] as const,
        ),
      ),
      Promise.all(
        apiKeys
          .filter((apiKey) => !apiKey.revokedAt)
          .map(
            async (apiKey) =>
              [
                apiKey.id,
                await peekPrizeEngineApiRateLimitUsage(
                  apiKey.id,
                  projectById.get(apiKey.projectId) ?? {
                    apiRateLimitBurst: 120,
                    apiRateLimitHourly: 3600,
                    apiRateLimitDaily: 86400,
                  },
                ),
              ] as const,
          ),
      ),
    ]);

  const projectRateLimitUsageByProject = new Map(projectRateLimitUsageEntries);
  const apiKeyRateLimitUsageByKey = new Map(apiKeyRateLimitUsageEntries);

  return {
    summary: {
      tenantCount: tenants.length,
      projectCount: projects.length,
      apiKeyCount: apiKeys.length,
      playerCount: [...playerCountByProject.values()].reduce(
        (sum, value) => sum + value,
        0,
      ),
      drawCount30d: [...drawCountByTenant.values()].reduce(
        (sum, value) => sum + value,
        0,
      ),
      billableTenantCount: billingRows.filter((row) => row.isBillable).length,
    },
    memberships: memberships.map(toSaasMembership),
    tenants: tenants.map((tenant) => ({
      tenant: toSaasTenant(tenant),
      billing: billingByTenant.has(tenant.id)
        ? toSaasBilling(billingByTenant.get(tenant.id)!)
        : null,
      projectCount: projectCountByTenant.get(tenant.id) ?? 0,
      apiKeyCount: apiKeyCountByTenant.get(tenant.id) ?? 0,
      playerCount: playerCountByTenant.get(tenant.id) ?? 0,
      drawCount30d: drawCountByTenant.get(tenant.id) ?? 0,
    })),
    projects: projects.map((project) =>
      toSaasProject(project, projectRateLimitUsageByProject.get(project.id)),
    ),
    projectObservability,
    projectPrizes: projectPrizes.map(toSaasPrize),
    apiKeys: apiKeys.map(
      (row) =>
        toSaasApiKey(
          row,
          undefined,
          apiKeyRateLimitUsageByKey.get(row.id),
        ) as SaasApiKey,
    ),
    billingRuns: billingRuns.map(toSaasBillingRun),
    topUps: topUps.map(toSaasBillingTopUp),
    disputes: disputes.map(toSaasBillingDispute),
    invites: invites.map(toSaasInvite),
    tenantLinks: tenantLinks.map(toSaasTenantLink),
    agentControls: agentControls.map(toSaasAgentControl),
    webhookEvents: webhookEvents.map(toSaasStripeWebhookEvent),
    outboundWebhooks: outboundWebhooks.map(toSaasOutboundWebhook),
    outboundDeliveries: outboundDeliveries.map(toSaasOutboundWebhookDelivery),
    recentUsage: recentUsageRows.map(toSaasUsageEvent),
    uiCopy,
  };
}
