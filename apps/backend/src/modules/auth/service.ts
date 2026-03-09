import { compare } from 'bcrypt-ts';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { admins } from '@reward/database';
import { getUserByEmail } from '../user/service';

export async function verifyCredentials(email: string, password: string) {
  const normalizedEmail = email.toLowerCase();
  const user = await getUserByEmail(normalizedEmail);
  if (!user) return null;

  const isValid = await compare(password, user.passwordHash);
  if (!isValid) return null;

  return user;
}

export async function verifyAdminCredentials(email: string, password: string) {
  const user = await verifyCredentials(email, password);
  if (!user) return null;

  const [admin] = await db
    .select()
    .from(admins)
    .where(and(eq(admins.userId, user.id), eq(admins.isActive, true)))
    .limit(1);

  if (!admin) return null;

  return { user, admin };
}
