import { and, desc, eq } from '@reward/database/orm';

import { db } from '../../db';
import { adminPermissions, admins } from '@reward/database';
import { revokeAuthSessions } from '../session/service';
import {
  adminPermissionsRequireMfa,
  type AdminPermissionKey,
  hasAdminPermission,
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
    const [admin] = await db
      .select({ userId: admins.userId })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1);

    if (admin) {
      await revokeAuthSessions({
        userId: admin.userId,
        kind: 'admin',
        reason: 'admin_permission_changed',
        eventType: 'admin_sessions_revoked_all',
        metadata: {
          adminId,
          permissionKey,
        },
      });
    }
  }

  return created ?? null;
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

export const canAdminAccess = (
  admin: Pick<AdminAccessProfile, 'permissions'>,
  permission: AdminPermissionKey
) => hasAdminPermission(admin.permissions, permission);
