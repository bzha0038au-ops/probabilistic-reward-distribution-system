import { eq } from '@reward/database/orm';

import { db } from '../../db';
import { userWallets, users } from '@reward/database';
import { hashPassword } from '../auth/password';
import { revokeAuthSessions } from '../session/service';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreateUserWithWalletOptions = {
  afterCreate?: (tx: DbTransaction, user: typeof users.$inferSelect) => Promise<void>;
};

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ?? null;
}

export async function getUserById(userId: number) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function getUserByPhone(phone: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  return user ?? null;
}

export async function createUserWithWallet(
  email: string,
  password: string,
  options: CreateUserWithWalletOptions = {},
) {
  const passwordHash = hashPassword(password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        role: 'user',
        userPoolBalance: '0',
      })
      .returning();

    await tx.insert(userWallets).values({ userId: user.id }).onConflictDoNothing();
    if (options.afterCreate) {
      await options.afterCreate(tx, user);
    }

    return user;
  });
}

export async function updateUserPassword(userId: number, password: string) {
  const [updated] = await db
    .update(users)
    .set({
      passwordHash: hashPassword(password),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (updated) {
    await revokeAuthSessions({
      userId,
      kind: 'user',
      reason: 'password_changed',
      eventType: 'user_sessions_revoked_all',
      email: updated.email,
      metadata: { trigger: 'password_changed' },
    });
    await revokeAuthSessions({
      userId,
      kind: 'admin',
      reason: 'password_changed',
      eventType: 'admin_sessions_revoked_all',
      email: updated.email,
      metadata: { trigger: 'password_changed' },
    });
  }

  return updated ?? null;
}

export async function markUserEmailVerified(userId: number) {
  const [updated] = await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated ?? null;
}

export async function markUserPhoneVerified(userId: number, phone: string) {
  const [updated] = await db
    .update(users)
    .set({
      phone,
      phoneVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated ?? null;
}
