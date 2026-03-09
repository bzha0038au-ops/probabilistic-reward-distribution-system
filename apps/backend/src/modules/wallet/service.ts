import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { ledgerEntries, userWallets } from '@reward/database';
import { toMoneyString } from '../../shared/money';

export async function getWalletBalance(userId: number) {
  await db.insert(userWallets).values({ userId }).onConflictDoNothing();

  const [wallet] = await db
    .select({ balance: userWallets.withdrawableBalance })
    .from(userWallets)
    .where(eq(userWallets.userId, userId))
    .limit(1);

  return wallet?.balance ?? toMoneyString(0);
}

export async function getTransactionHistory(userId: number, limit = 50) {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.userId, userId))
    .orderBy(desc(ledgerEntries.id))
    .limit(limit);
}
