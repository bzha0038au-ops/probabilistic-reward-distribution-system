import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { adminPermissions } from '@reward/database';

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

  return created ?? null;
}
