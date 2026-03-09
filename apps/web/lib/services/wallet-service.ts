import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { transactions, wallets } from '@/lib/schema';

export async function getWalletBalance(userId: number) {
  const [wallet] = await db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.userId, userId))
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
