import { eq, sql } from '@reward/database/orm';
import Decimal from 'decimal.js';

import { db } from '../../db';
import { ledgerEntries, userWallets } from '@reward/database';
import type { DbClient, DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';

type DbExecutor = DbClient | DbTransaction;

export async function grantBonus(
  payload: {
    userId: number;
    amount: string | number;
    entryType: string;
    referenceType?: string | null;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
  },
  executor: DbExecutor = db
) {
  const run = async (tx: DbExecutor) => {
    const walletResult = await tx.execute(sql`
      SELECT user_id,
             bonus_balance
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${payload.userId}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{
      user_id: number;
      bonus_balance: string | number;
    }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(payload.amount);
    if (amount.lte(0)) {
      throw new Error('Bonus amount must be greater than 0.');
    }

    const bonusBefore = toDecimal(wallet.bonus_balance ?? 0);
    const bonusAfter = bonusBefore.plus(amount);

    await tx
      .update(userWallets)
      .set({
        bonusBalance: toMoneyString(bonusAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, wallet.user_id));

    await tx.insert(ledgerEntries).values({
      userId: wallet.user_id,
      entryType: payload.entryType,
      amount: toMoneyString(amount),
      balanceBefore: toMoneyString(bonusBefore),
      balanceAfter: toMoneyString(bonusAfter),
      referenceType: payload.referenceType ?? null,
      referenceId: payload.referenceId ?? null,
      metadata: payload.metadata ?? null,
    });

    return {
      userId: wallet.user_id,
      bonusBefore: toMoneyString(bonusBefore),
      bonusAfter: toMoneyString(bonusAfter),
    };
  };

  if (executor === db) {
    return db.transaction(async (tx) => run(tx));
  }
  return run(executor);
}

export async function releaseBonusManual(payload: {
  userId: number;
  amount?: string | number | null;
}) {
  return db.transaction(async (tx) => {
    const walletResult = await tx.execute(sql`
      SELECT user_id,
             withdrawable_balance,
             bonus_balance
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${payload.userId}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{
      user_id: number;
      withdrawable_balance: string | number;
      bonus_balance: string | number;
    }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const bonusBefore = toDecimal(wallet.bonus_balance ?? 0);
    if (bonusBefore.lte(0)) {
      throw new Error('No bonus balance to release.');
    }

    let releaseAmount =
      payload.amount !== undefined && payload.amount !== null
        ? toDecimal(payload.amount)
        : bonusBefore;

    if (releaseAmount.lte(0)) {
      throw new Error('Release amount must be greater than 0.');
    }

    if (releaseAmount.gt(bonusBefore)) {
      releaseAmount = bonusBefore;
    }

    const withdrawableBefore = toDecimal(wallet.withdrawable_balance ?? 0);
    const withdrawableAfter = withdrawableBefore.plus(releaseAmount);
    const bonusAfter = Decimal.max(bonusBefore.minus(releaseAmount), 0);

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(withdrawableAfter),
        bonusBalance: toMoneyString(bonusAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, wallet.user_id));

    await tx.insert(ledgerEntries).values({
      userId: wallet.user_id,
      entryType: 'bonus_release_manual',
      amount: toMoneyString(releaseAmount),
      balanceBefore: toMoneyString(bonusBefore),
      balanceAfter: toMoneyString(bonusAfter),
      referenceType: 'bonus_release',
      metadata: { reason: 'manual_release', balanceType: 'bonus' },
    });

    return {
      userId: wallet.user_id,
      released: toMoneyString(releaseAmount),
      bonusBefore: toMoneyString(bonusBefore),
      bonusAfter: toMoneyString(bonusAfter),
      withdrawableAfter: toMoneyString(withdrawableAfter),
    };
  });
}
