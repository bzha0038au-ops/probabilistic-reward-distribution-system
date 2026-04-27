import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  admins,
  saasProjects,
  saasTenantMemberships,
  users,
} from "@reward/database";
import { and, eq, inArray } from "@reward/database/orm";
import type { SaaSTenantRole } from "@reward/shared-types/saas";

import { db } from "../../db";
import { forbiddenError, notFoundError } from "../../shared/errors";

export type SaasAdminActor = {
  adminId: number;
  permissions?: string[];
} | null;

export type SaasTenantCapability =
  | "tenant:read"
  | "tenant:members:write"
  | "project:write"
  | "prize:write"
  | "key:write"
  | "billing:write"
  | "billing:settle";

const ROLE_CAPABILITIES: Record<
  SaaSTenantRole,
  readonly SaasTenantCapability[]
> = {
  tenant_owner: [
    "tenant:read",
    "tenant:members:write",
    "project:write",
    "prize:write",
    "key:write",
    "billing:write",
    "billing:settle",
  ],
  tenant_operator: ["tenant:read", "project:write", "prize:write", "key:write"],
  agent_manager: [
    "tenant:read",
    "prize:write",
    "key:write",
    "billing:write",
    "billing:settle",
  ],
  agent_viewer: ["tenant:read"],
};

export type SaasTenantMembershipAccess = {
  id: number;
  tenantId: number;
  adminId: number;
  adminEmail: string | null;
  adminDisplayName: string | null;
  role: SaaSTenantRole;
  createdByAdminId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

const normalizeMetadata = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (Object.fromEntries(Object.entries(value)) as Record<string, unknown>)
    : null;

export async function listAdminTenantMemberships(actor: SaasAdminActor) {
  if (!actor?.adminId) {
    return [] as SaasTenantMembershipAccess[];
  }

  const rows = await db
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
    .where(eq(saasTenantMemberships.adminId, actor.adminId));

  return rows.map((row) => ({
    ...row,
    role: row.role as SaaSTenantRole,
    metadata: normalizeMetadata(row.metadata),
  }));
}

export async function resolveAccessibleTenantIds(actor: SaasAdminActor) {
  const memberships = await listAdminTenantMemberships(actor);
  if (memberships.length === 0) {
    return null;
  }

  return [...new Set(memberships.map((membership) => membership.tenantId))];
}

export async function resolveAccessibleProjectIds(
  actor: SaasAdminActor,
  projectIds: number[],
) {
  if (projectIds.length === 0) {
    return [] as number[];
  }

  const accessibleTenantIds = await resolveAccessibleTenantIds(actor);
  if (!accessibleTenantIds || accessibleTenantIds.length === 0) {
    return projectIds;
  }

  const rows = await db
    .select({
      id: saasProjects.id,
    })
    .from(saasProjects)
    .where(
      and(
        inArray(saasProjects.id, projectIds),
        inArray(saasProjects.tenantId, accessibleTenantIds),
      ),
    );

  return rows.map((row) => row.id);
}

export async function assertTenantCapability(
  actor: SaasAdminActor,
  tenantId: number,
  capability: SaasTenantCapability,
) {
  const memberships = await listAdminTenantMemberships(actor);
  if (memberships.length === 0) {
    return null;
  }

  const membership = memberships.find((item) => item.tenantId === tenantId);
  if (!membership) {
    throw forbiddenError("You do not have access to this SaaS tenant.", {
      code: API_ERROR_CODES.SAAS_TENANT_ACCESS_FORBIDDEN,
    });
  }

  const capabilities = ROLE_CAPABILITIES[membership.role] ?? [];
  if (!capabilities.includes(capability)) {
    throw forbiddenError(
      "Your SaaS tenant role does not allow this operation.",
      {
        code: API_ERROR_CODES.SAAS_TENANT_ROLE_FORBIDDEN,
      },
    );
  }

  return membership;
}

export async function assertProjectCapability(
  actor: SaasAdminActor,
  projectId: number,
  capability: Exclude<SaasTenantCapability, "tenant:members:write">,
) {
  const [project] = await db
    .select({
      id: saasProjects.id,
      tenantId: saasProjects.tenantId,
    })
    .from(saasProjects)
    .where(eq(saasProjects.id, projectId))
    .limit(1);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  await assertTenantCapability(actor, project.tenantId, capability);
  return project;
}
