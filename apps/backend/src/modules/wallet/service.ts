import { desc, eq, sql } from '@reward/database/orm';

import { db } from '../../db';
import { ledgerEntries, userWallets } from '@reward/database';
import { toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';

type WalletBalanceRow = {
  balance: string | number | null;
};

export async function getWalletBalance(userId: number) {
  const result = await db.execute(sql`
    WITH ensured_wallet AS (
      INSERT INTO ${userWallets} ("user_id")
      VALUES (${userId})
      ON CONFLICT ("user_id") DO NOTHING
      RETURNING 1
    )
    SELECT ${userWallets.withdrawableBalance} AS balance
    FROM ${userWallets}
    WHERE ${userWallets.userId} = ${userId}
    LIMIT 1
  `);
  const [wallet] = readSqlRows<WalletBalanceRow>(result);

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
