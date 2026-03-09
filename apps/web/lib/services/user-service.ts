import { eq } from 'drizzle-orm';
import { genSaltSync, hashSync } from 'bcrypt-ts';

import { db } from '@/lib/db';
import { users, wallets } from '@/lib/schema';

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
      })
      .returning();

    await tx.insert(wallets).values({
      userId: user.id,
      balance: '0',
    });

    return user;
  });
}
