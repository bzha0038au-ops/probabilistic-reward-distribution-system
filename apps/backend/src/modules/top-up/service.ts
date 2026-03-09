import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import { deposits, ledgerEntries, userWallets } from '@reward/database';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { getPaymentConfig } from '../system/service';

export async function listTopUps(userId: number, limit = 50) {
  return db
    .select()
    .from(deposits)
    .where(eq(deposits.userId, userId))
    .orderBy(desc(deposits.id))
    .limit(limit);
}

export async function listDeposits(limit = 50) {
  return db
    .select()
    .from(deposits)
    .orderBy(desc(deposits.id))
    .limit(limit);
}

export async function createTopUp(payload: {
  userId: number;
  amount: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const paymentConfig = await getPaymentConfig(db);
  if (!paymentConfig.depositEnabled) {
    throw new Error('Deposits are currently disabled.');
  }

  const amount = toDecimal(payload.amount);
  if (amount.lte(0)) {
    throw new Error('Amount must be greater than 0.');
  }
  if (paymentConfig.minDepositAmount.gt(0) && amount.lt(paymentConfig.minDepositAmount)) {
    throw new Error('Amount below minimum deposit.');
  }
  if (paymentConfig.maxDepositAmount.gt(0) && amount.gt(paymentConfig.maxDepositAmount)) {
    throw new Error('Amount exceeds maximum deposit.');
  }

  const [created] = await db
    .insert(deposits)
    .values({
      userId: payload.userId,
      amount: toMoneyString(amount),
      status: 'pending',
      referenceId: payload.referenceId ?? null,
      metadata: payload.metadata ?? null,
    })
    .returning();

  return created;
}

export async function approveDeposit(depositId: number) {
  return db.transaction(async (tx) => {
    const depositResult = await tx.execute(sql`
      SELECT id, user_id, amount, status
      FROM ${deposits}
      WHERE ${deposits.id} = ${depositId}
      FOR UPDATE
    `);

    const deposit = readSqlRows<{
      id: number;
      user_id: number;
      amount: string | number;
      status: string;
    }>(depositResult)[0];
    if (!deposit) return null;
    if (deposit.status !== 'pending') return deposit;

    await tx
      .insert(userWallets)
      .values({ userId: deposit.user_id })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT withdrawable_balance
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${deposit.user_id}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{ withdrawable_balance: string | number }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(deposit.amount ?? 0);
    const before = toDecimal(wallet.withdrawable_balance ?? 0);
    const after = before.plus(amount);

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(after),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, deposit.user_id));

    const [updated] = await tx
      .update(deposits)
      .set({ status: 'success', updatedAt: new Date() })
      .where(eq(deposits.id, deposit.id))
      .returning();

    await tx.insert(ledgerEntries).values({
      userId: deposit.user_id,
      entryType: 'deposit',
      amount: toMoneyString(amount),
      balanceBefore: toMoneyString(before),
      balanceAfter: toMoneyString(after),
      referenceType: 'deposit',
      referenceId: deposit.id,
      metadata: { status: 'success' },
    });

    return updated ?? deposit;
  });
}

export async function failDeposit(depositId: number) {
  return db.transaction(async (tx) => {
    const depositResult = await tx.execute(sql`
      SELECT id, status
      FROM ${deposits}
      WHERE ${deposits.id} = ${depositId}
      FOR UPDATE
    `);

    const deposit = readSqlRows<{ id: number; status: string }>(depositResult)[0];
    if (!deposit) return null;
    if (deposit.status !== 'pending') return deposit;

    const [updated] = await tx
      .update(deposits)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(deposits.id, deposit.id))
      .returning();

    return updated ?? deposit;
  });
}
