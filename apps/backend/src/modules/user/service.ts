import { eq } from 'drizzle-orm';
import { genSaltSync, hashSync } from 'bcrypt-ts';

import { db } from '../../db';
import { users } from '@reward/database';

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ?? null;
}

export async function createUserWithWallet(email: string, password: string) {
  const passwordHash = hashSync(password, genSaltSync(10));

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        role: 'user',
        balance: '0',
      })
      .returning();

    return user;
  });
}
