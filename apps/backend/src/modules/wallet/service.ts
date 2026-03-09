import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { transactions, users } from '@reward/database';

export async function getWalletBalance(userId: number) {
  const [wallet] = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return wallet?.balance ?? '0';
}

export async function getTransactionHistory(userId: number, limit = 50) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.id))
    .limit(limit);
}
