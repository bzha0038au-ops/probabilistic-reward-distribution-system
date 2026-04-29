import { desc, eq, sql } from '@reward/database/orm';

import { db } from '../../db';
import { ledgerEntries, userWallets } from '@reward/database';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { listUserAssetBalances } from '../economy/service';

type WalletBalanceRow = {
  withdrawableBalance: string | number | null;
  bonusBalance: string | number | null;
  lockedBalance: string | number | null;
};

export async function getWalletBalance(userId: number) {
  const result = await db.execute(sql`
    WITH ensured_wallet AS (
      INSERT INTO ${userWallets} ("user_id")
      VALUES (${userId})
      ON CONFLICT ("user_id") DO NOTHING
      RETURNING 1
    )
    SELECT
      ${userWallets.withdrawableBalance} AS "withdrawableBalance",
      ${userWallets.bonusBalance} AS "bonusBalance",
      ${userWallets.lockedBalance} AS "lockedBalance"
    FROM ${userWallets}
    WHERE ${userWallets.userId} = ${userId}
    LIMIT 1
  `);
  const [wallet] = readSqlRows<WalletBalanceRow>(result);

  const withdrawableBalance = toMoneyString(wallet?.withdrawableBalance ?? 0);
  const bonusBalance = toMoneyString(wallet?.bonusBalance ?? 0);
  const lockedBalance = toMoneyString(wallet?.lockedBalance ?? 0);

  return {
    withdrawableBalance,
    bonusBalance,
    lockedBalance,
    totalBalance: toMoneyString(
      toDecimal(withdrawableBalance)
        .plus(bonusBalance)
        .plus(lockedBalance),
    ),
  };
}

export async function getWalletOverview(userId: number) {
  const [balance, assets] = await Promise.all([
    getWalletBalance(userId),
    listUserAssetBalances(userId),
  ]);

  return {
    balance,
    assets: assets.map((asset) => ({
      userId: asset.userId,
      assetCode: asset.assetCode,
      availableBalance: toMoneyString(asset.availableBalance ?? 0),
      lockedBalance: toMoneyString(asset.lockedBalance ?? 0),
      lifetimeEarned: toMoneyString(asset.lifetimeEarned ?? 0),
      lifetimeSpent: toMoneyString(asset.lifetimeSpent ?? 0),
      createdAt: asset.createdAt ?? null,
      updatedAt: asset.updatedAt ?? null,
    })),
    legacy: balance,
  };
}

export async function getTransactionHistory(userId: number, limit = 50) {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.userId, userId))
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(limit);
}
