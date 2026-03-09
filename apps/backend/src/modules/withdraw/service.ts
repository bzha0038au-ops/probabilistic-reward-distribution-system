import { desc, eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import { db } from '../../db';
import { ledgerEntries, userWallets, withdrawals } from '@reward/database';
import { getAntiAbuseConfig, getConfigDecimal, getPaymentConfig } from '../system/service';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { recordSuspiciousActivity } from '../risk/service';

const MAX_WITHDRAW_PER_DAY_KEY = 'anti_abuse.max_withdraw_per_day';

export async function listWithdrawals(userId: number, limit = 50) {
  return db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.id))
    .limit(limit);
}

export async function listWithdrawalsAdmin(limit = 50) {
  return db
    .select()
    .from(withdrawals)
    .orderBy(desc(withdrawals.id))
    .limit(limit);
}

export async function createWithdrawal(payload: {
  userId: number;
  amount: string;
  bankCardId?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const paymentConfig = await getPaymentConfig(tx);
    if (!paymentConfig.withdrawEnabled) {
      throw new Error('Withdrawals are currently disabled.');
    }

    await tx
      .insert(userWallets)
      .values({ userId: payload.userId })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT withdrawable_balance, locked_balance, wagered_amount
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${payload.userId}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{
      withdrawable_balance: string | number;
      locked_balance: string | number;
      wagered_amount: string | number;
    }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(payload.amount);
    const minAllowed = paymentConfig.minWithdrawAmount;
    const maxAllowed = paymentConfig.maxWithdrawAmount;
    const antiAbuse = await getAntiAbuseConfig(tx);

    if (amount.lte(0)) {
      throw new Error('Amount must be greater than 0.');
    }
    if (minAllowed.gt(0) && amount.lt(minAllowed)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_below_min',
          metadata: { amount: toMoneyString(amount), min: toMoneyString(minAllowed) },
        },
        tx
      );
      throw new Error('Amount below minimum withdrawal.');
    }
    if (maxAllowed.gt(0) && amount.gt(maxAllowed)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_above_max',
          metadata: { amount: toMoneyString(amount), max: toMoneyString(maxAllowed) },
        },
        tx
      );
      throw new Error('Amount exceeds maximum withdrawal.');
    }

    const maxPerDay = await getConfigDecimal(tx, MAX_WITHDRAW_PER_DAY_KEY, 0);
    if (maxPerDay.gt(0)) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ total = 0 }] = await tx
        .select({
          total: sql<number>`coalesce(sum(${withdrawals.amount}), 0)`,
        })
        .from(withdrawals)
        .where(
          sql`${withdrawals.userId} = ${payload.userId} AND ${withdrawals.createdAt} >= ${startOfDay}`
        );

      const totalToday = toDecimal(total ?? 0);
      if (totalToday.plus(amount).gt(maxPerDay)) {
        await recordSuspiciousActivity(
          {
            userId: payload.userId,
            reason: 'withdraw_daily_limit',
            metadata: {
              amount: toMoneyString(amount),
              totalToday: toMoneyString(totalToday),
              maxPerDay: toMoneyString(maxPerDay),
            },
          },
          tx
        );
        throw new Error('Daily withdrawal limit exceeded.');
      }
    }

    if (antiAbuse.minWagerBeforeWithdraw.gt(0)) {
      const wageredBefore = toDecimal(wallet.wagered_amount ?? 0);
      if (wageredBefore.lt(antiAbuse.minWagerBeforeWithdraw)) {
        await recordSuspiciousActivity(
          {
            userId: payload.userId,
            reason: 'withdraw_min_wager',
            metadata: {
              wagered: toMoneyString(wageredBefore),
              required: toMoneyString(antiAbuse.minWagerBeforeWithdraw),
            },
          },
          tx
        );
        throw new Error('Minimum wager requirement not met.');
      }
    }

    const withdrawableBefore = toDecimal(wallet.withdrawable_balance ?? 0);
    if (withdrawableBefore.lt(amount)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_insufficient_funds',
          metadata: {
            amount: toMoneyString(amount),
            withdrawable: toMoneyString(withdrawableBefore),
          },
        },
        tx
      );
      throw new Error('Insufficient withdrawable balance.');
    }

    const withdrawableAfter = withdrawableBefore.minus(amount);
    const lockedAfter = toDecimal(wallet.locked_balance ?? 0).plus(amount);

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(withdrawableAfter),
        lockedBalance: toMoneyString(lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, payload.userId));

    const [created] = await tx
      .insert(withdrawals)
      .values({
        userId: payload.userId,
        amount: toMoneyString(amount),
        status: 'pending',
        bankCardId: payload.bankCardId ?? null,
        metadata: payload.metadata ?? null,
      })
      .returning();

    await tx.insert(ledgerEntries).values({
      userId: payload.userId,
      entryType: 'withdraw_request',
      amount: toMoneyString(amount.negated()),
      balanceBefore: toMoneyString(withdrawableBefore),
      balanceAfter: toMoneyString(withdrawableAfter),
      referenceType: 'withdrawal',
      referenceId: created?.id ?? null,
      metadata: payload.metadata ?? null,
    });

    return created;
  });
}

export async function approveWithdrawal(withdrawalId: number) {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT id, status
      FROM ${withdrawals}
      WHERE ${withdrawals.id} = ${withdrawalId}
      FOR UPDATE
    `);

    const row = readSqlRows<{ id: number; status: string }>(result)[0];
    if (!row) return null;
    if (row.status !== 'pending') return row;

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    return updated ?? row;
  });
}

export async function rejectWithdrawal(withdrawalId: number) {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT id, user_id, amount, status
      FROM ${withdrawals}
      WHERE ${withdrawals.id} = ${withdrawalId}
      FOR UPDATE
    `);

    const row = readSqlRows<{
      id: number;
      user_id: number;
      amount: string | number;
      status: string;
    }>(result)[0];
    if (!row) return null;
    if (row.status !== 'pending') return row;

    await tx
      .insert(userWallets)
      .values({ userId: row.user_id })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT withdrawable_balance, locked_balance
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${row.user_id}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{
      withdrawable_balance: string | number;
      locked_balance: string | number;
    }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(row.amount ?? 0);
    const withdrawableBefore = toDecimal(wallet.withdrawable_balance ?? 0);
    const lockedBefore = toDecimal(wallet.locked_balance ?? 0);
    const withdrawableAfter = withdrawableBefore.plus(amount);
    const lockedAfter = Decimal.max(lockedBefore.minus(amount), 0);

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(withdrawableAfter),
        lockedBalance: toMoneyString(lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, row.user_id));

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    await tx.insert(ledgerEntries).values({
      userId: row.user_id,
      entryType: 'withdraw_rejected_refund',
      amount: toMoneyString(amount),
      balanceBefore: toMoneyString(withdrawableBefore),
      balanceAfter: toMoneyString(withdrawableAfter),
      referenceType: 'withdrawal',
      referenceId: row.id,
      metadata: { status: 'rejected' },
    });

    return updated ?? row;
  });
}

export async function payWithdrawal(withdrawalId: number) {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT id, user_id, amount, status
      FROM ${withdrawals}
      WHERE ${withdrawals.id} = ${withdrawalId}
      FOR UPDATE
    `);

    const row = readSqlRows<{
      id: number;
      user_id: number;
      amount: string | number;
      status: string;
    }>(result)[0];
    if (!row) return null;
    if (row.status !== 'pending' && row.status !== 'approved') return row;

    await tx
      .insert(userWallets)
      .values({ userId: row.user_id })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT locked_balance
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${row.user_id}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{ locked_balance: string | number }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(row.amount ?? 0);
    const lockedBefore = toDecimal(wallet.locked_balance ?? 0);
    if (lockedBefore.lt(amount)) {
      throw new Error('Locked balance is insufficient.');
    }

    const lockedAfter = lockedBefore.minus(amount);

    await tx
      .update(userWallets)
      .set({
        lockedBalance: toMoneyString(lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, row.user_id));

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    await tx.insert(ledgerEntries).values({
      userId: row.user_id,
      entryType: 'withdraw_paid',
      amount: toMoneyString(amount.negated()),
      balanceBefore: toMoneyString(lockedBefore),
      balanceAfter: toMoneyString(lockedAfter),
      referenceType: 'withdrawal',
      referenceId: row.id,
      metadata: { status: 'paid', balanceType: 'locked' },
    });

    return updated ?? row;
  });
}
