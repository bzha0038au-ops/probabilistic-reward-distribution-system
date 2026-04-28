import { and, asc, desc, eq, inArray } from '@reward/database/orm';

import { db } from '../../db';
import { adminPermissions, admins, users } from '@reward/database';
import { badRequestError, notFoundError } from '../../shared/errors';
import { revokeAuthSessions } from '../session/service';
import {
  adminPermissionsRequireMfa,
  type AdminPermissionKey,
  hasAdminPermission,
  isManagedAdminScopeKey,
  MANAGED_ADMIN_SCOPE_KEYS,
} from './definitions';

export type AdminAccessProfile = {
  adminId: number;
  userId: number;
  displayName: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecretCiphertext: string | null;
  rawPermissions: string[];
  permissions: string[];
  requiresMfa: boolean;
};

export type AdminPermissionScopeAssignment = {
  adminId: number;
  userId: number;
  email: string;
  displayName: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  managedScopes: string[];
  legacyPermissions: string[];
};

export type AdminPermissionScopeSyncResult = {
  admin: AdminPermissionScopeAssignment;
  addedScopes: string[];
  removedScopes: string[];
};

const MANAGED_SCOPE_ORDER = new Map(
  MANAGED_ADMIN_SCOPE_KEYS.map((scopeKey, index) => [scopeKey, index] as const)
);

const dedupePermissionKeys = (permissionKeys: Iterable<string>) =>
  [...new Set([...permissionKeys].map((permissionKey) => permissionKey.trim()))].filter(
    (permissionKey): permissionKey is string => permissionKey.length > 0
  );

const splitPermissionKeys = (permissionKeys: Iterable<string>) => {
  const uniquePermissions = dedupePermissionKeys(permissionKeys);

  const managedScopes = uniquePermissions
    .filter(isManagedAdminScopeKey)
    .sort(
      (left, right) =>
        (MANAGED_SCOPE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (MANAGED_SCOPE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
    );

  const legacyPermissions = uniquePermissions
    .filter((permissionKey) => !isManagedAdminScopeKey(permissionKey))
    .sort((left, right) => left.localeCompare(right));

  return {
    managedScopes,
    legacyPermissions,
  };
};

const revokeAdminPermissionSessions = async (
  adminId: number,
  metadata: Record<string, unknown>
) => {
  const [admin] = await db
    .select({ userId: admins.userId })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);

  if (!admin) {
    return;
  }

  await revokeAuthSessions({
    userId: admin.userId,
    kind: 'admin',
    reason: 'admin_permission_changed',
    eventType: 'admin_sessions_revoked_all',
    metadata: {
      adminId,
      ...metadata,
    },
  });
};

export async function listAdminPermissions(adminId: number) {
  return db
    .select()
    .from(adminPermissions)
    .where(eq(adminPermissions.adminId, adminId))
    .orderBy(desc(adminPermissions.id));
}

export async function grantAdminPermission(adminId: number, permissionKey: string) {
  const [created] = await db
    .insert(adminPermissions)
    .values({ adminId, permissionKey })
    .onConflictDoNothing()
    .returning();

  if (created) {
    await revokeAdminPermissionSessions(adminId, {
      permissionKey,
      operation: 'grant',
    });
  }

  return created ?? null;
}

export async function revokeAdminPermission(adminId: number, permissionKey: string) {
  const [removed] = await db
    .delete(adminPermissions)
    .where(
      and(
        eq(adminPermissions.adminId, adminId),
        eq(adminPermissions.permissionKey, permissionKey)
      )
    )
    .returning();

  if (removed) {
    await revokeAdminPermissionSessions(adminId, {
      permissionKey,
      operation: 'revoke',
    });
  }

  return removed ?? null;
}

export async function listAdminPermissionScopeAssignments() {
  const adminRows = await db
    .select({
      adminId: admins.id,
      userId: admins.userId,
      email: users.email,
      displayName: admins.displayName,
      isActive: admins.isActive,
      mfaEnabled: admins.mfaEnabled,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(eq(admins.isActive, true))
    .orderBy(asc(users.email), asc(admins.id));

  if (adminRows.length === 0) {
    return [] as AdminPermissionScopeAssignment[];
  }

  const permissionRows = await db
    .select({
      adminId: adminPermissions.adminId,
      permissionKey: adminPermissions.permissionKey,
    })
    .from(adminPermissions)
    .where(
      inArray(
        adminPermissions.adminId,
        adminRows.map((row) => row.adminId)
      )
    )
    .orderBy(desc(adminPermissions.id));

  const permissionsByAdminId = new Map<number, string[]>();
  for (const permissionRow of permissionRows) {
    const scopedPermissions =
      permissionsByAdminId.get(permissionRow.adminId) ?? [];
    scopedPermissions.push(permissionRow.permissionKey);
    permissionsByAdminId.set(permissionRow.adminId, scopedPermissions);
  }

  return adminRows.map((adminRow) => {
    const { managedScopes, legacyPermissions } = splitPermissionKeys(
      permissionsByAdminId.get(adminRow.adminId) ?? []
    );

    return {
      ...adminRow,
      managedScopes,
      legacyPermissions,
    } satisfies AdminPermissionScopeAssignment;
  });
}

export async function getAdminPermissionScopeAssignment(adminId: number) {
  const [adminRow] = await db
    .select({
      adminId: admins.id,
      userId: admins.userId,
      email: users.email,
      displayName: admins.displayName,
      isActive: admins.isActive,
      mfaEnabled: admins.mfaEnabled,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(and(eq(admins.id, adminId), eq(admins.isActive, true)))
    .limit(1);

  if (!adminRow) {
    return null;
  }

  const permissions = await listAdminPermissions(adminId);
  const { managedScopes, legacyPermissions } = splitPermissionKeys(
    permissions.map((permission) => permission.permissionKey)
  );

  return {
    ...adminRow,
    managedScopes,
    legacyPermissions,
  } satisfies AdminPermissionScopeAssignment;
}

export async function syncManagedAdminPermissionScopes(
  adminId: number,
  scopeKeys: Iterable<string>
) {
  const normalizedScopeKeys = dedupePermissionKeys(scopeKeys);
  const invalidScopeKeys = normalizedScopeKeys.filter(
    (scopeKey) => !isManagedAdminScopeKey(scopeKey)
  );
  if (invalidScopeKeys.length > 0) {
    throw badRequestError('Invalid admin scope selection.', {
      details: invalidScopeKeys.map((scopeKey) => `scopeKeys ${scopeKey} is invalid`),
    });
  }

  const currentAssignment = await getAdminPermissionScopeAssignment(adminId);
  if (!currentAssignment) {
    throw notFoundError('Admin user not found.');
  }

  const { managedScopes: nextManagedScopes } =
    splitPermissionKeys(normalizedScopeKeys);
  const nextManagedScopeSet = new Set(nextManagedScopes);
  const currentManagedScopeSet = new Set(currentAssignment.managedScopes);

  const addedScopes = nextManagedScopes.filter(
    (scopeKey) => !currentManagedScopeSet.has(scopeKey)
  );
  const removedScopes = currentAssignment.managedScopes.filter(
    (scopeKey) => !nextManagedScopeSet.has(scopeKey)
  );

  if (addedScopes.length === 0 && removedScopes.length === 0) {
    return {
      admin: currentAssignment,
      addedScopes,
      removedScopes,
    } satisfies AdminPermissionScopeSyncResult;
  }

  await db.transaction(async (tx) => {
    if (removedScopes.length > 0) {
      await tx
        .delete(adminPermissions)
        .where(
          and(
            eq(adminPermissions.adminId, adminId),
            inArray(adminPermissions.permissionKey, removedScopes)
          )
        );
    }

    if (addedScopes.length > 0) {
      await tx
        .insert(adminPermissions)
        .values(
          addedScopes.map((scopeKey) => ({
            adminId,
            permissionKey: scopeKey,
          }))
        )
        .onConflictDoNothing();
    }
  });

  await revokeAdminPermissionSessions(adminId, {
    operation: 'sync_managed_scopes',
    addedScopes,
    removedScopes,
    managedScopes: nextManagedScopes,
  });

  const updatedAssignment = await getAdminPermissionScopeAssignment(adminId);
  if (!updatedAssignment) {
    throw notFoundError('Admin user not found.');
  }

  return {
    admin: updatedAssignment,
    addedScopes,
    removedScopes,
  } satisfies AdminPermissionScopeSyncResult;
}

export async function getAdminAccessProfileByUserId(userId: number) {
  const [admin] = await db
    .select({
      adminId: admins.id,
      userId: admins.userId,
      displayName: admins.displayName,
      isActive: admins.isActive,
      mfaEnabled: admins.mfaEnabled,
      mfaSecretCiphertext: admins.mfaSecretCiphertext,
    })
    .from(admins)
    .where(and(eq(admins.userId, userId), eq(admins.isActive, true)))
    .limit(1);

  if (!admin) {
    return null;
  }

  const permissions = await listAdminPermissions(admin.adminId);
  const rawPermissions = permissions.map((permission) => permission.permissionKey);
  const effectivePermissions = [...new Set(rawPermissions)];

  return {
    ...admin,
    rawPermissions,
    permissions: effectivePermissions,
    requiresMfa: adminPermissionsRequireMfa(effectivePermissions),
  } satisfies AdminAccessProfile;
}

export async function ensurePortalAdminAccessProfile(params: {
  userId: number;
  email: string;
  displayName?: string | null;
}) {
  const existing = await getAdminAccessProfileByUserId(params.userId);
  if (existing) {
    return existing;
  }

  const displayName = (params.displayName?.trim() || params.email).slice(0, 160);

  await db
    .insert(admins)
    .values({
      userId: params.userId,
      displayName,
      isActive: true,
    })
    .onConflictDoNothing();

  return getAdminAccessProfileByUserId(params.userId);
}

export const canAdminAccess = (
  admin: Pick<AdminAccessProfile, 'permissions'>,
  permission: AdminPermissionKey
) => hasAdminPermission(admin.permissions, permission);
