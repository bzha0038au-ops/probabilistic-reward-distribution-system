import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../../db';
import { drawRecords, prizes, transactions, users } from '@reward/database';
import { getPoolBalance, setPoolBalance } from '../system/service';
import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';

const { drawCost: DRAW_COST } = getConfig();

const toDecimalString = (value: number) => value.toFixed(2);

function pickByWeight<T extends { weight: number }>(items: T[]): T | null {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;

  const pick = Math.floor(Math.random() * totalWeight) + 1;
  let cursor = 0;

  for (const item of items) {
    cursor += item.weight;
    if (pick <= cursor) return item;
  }

  return items[items.length - 1] ?? null;
}

export async function executeDraw(userId: number) {
  return db.transaction(async (tx) => {
    const userResult = (await tx.execute(sql`
      SELECT id, balance
      FROM ${users}
      WHERE ${users.id} = ${userId}
      FOR UPDATE
    `)) as unknown as { rows: Array<{ id: number; balance: string | number }> };

    const user = userResult.rows?.[0];
    if (!user) {
      throw new Error('User not found.');
    }

    const balanceBefore = Number(user.balance ?? 0);
    if (balanceBefore < DRAW_COST) {
      throw new Error('Insufficient balance.');
    }

    const balanceAfter = balanceBefore - DRAW_COST;

    await tx
      .update(users)
      .set({
        balance: toDecimalString(balanceAfter),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await tx.insert(transactions).values({
      userId,
      type: 'debit_draw',
      amount: toDecimalString(-DRAW_COST),
      balanceBefore: toDecimalString(balanceBefore),
      balanceAfter: toDecimalString(balanceAfter),
      metadata: { reason: 'draw_cost' },
    });

    const poolBalance = await getPoolBalance(tx, 0, true);
    const eligible = await tx
      .select({
        id: prizes.id,
        weight: prizes.weight,
        stock: prizes.stock,
        isActive: prizes.isActive,
        poolThreshold: prizes.poolThreshold,
        rewardAmount: prizes.rewardAmount,
      })
      .from(prizes)
      .where(
        and(
          eq(prizes.isActive, true),
          isNull(prizes.deletedAt),
          gt(prizes.stock, 0),
          gt(prizes.weight, 0),
          lte(prizes.poolThreshold, toDecimalString(poolBalance))
        )
      );

    let status: 'miss' | 'won' | 'out_of_stock' = 'miss';
    let rewardAmount = 0;
    let prizeId: number | null = null;

    const candidate = pickByWeight(eligible);

    if (candidate) {
      const prizeResult = (await tx.execute(sql`
        SELECT id, stock, reward_amount, is_active
        FROM ${prizes}
        WHERE ${prizes.id} = ${candidate.id}
          AND ${prizes.deletedAt} IS NULL
        FOR UPDATE
      `)) as unknown as {
        rows: Array<{
          id: number;
          stock: number;
          reward_amount: string | number;
          is_active: boolean;
        }>;
      };

      const lockedPrize = prizeResult.rows?.[0];

      if (lockedPrize && lockedPrize.is_active && lockedPrize.stock > 0) {
        await tx.execute(sql`
          UPDATE ${prizes}
          SET stock = stock - 1, updated_at = NOW()
          WHERE ${prizes.id} = ${lockedPrize.id}
            AND ${prizes.deletedAt} IS NULL
        `);

        status = 'won';
        prizeId = lockedPrize.id;
        rewardAmount = Number(lockedPrize.reward_amount ?? 0);

        if (rewardAmount > 0) {
          const creditedBalance = balanceAfter + rewardAmount;

          await tx
            .update(users)
            .set({
              balance: toDecimalString(creditedBalance),
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          await tx.insert(transactions).values({
            userId,
            type: 'credit_reward',
            amount: toDecimalString(rewardAmount),
            balanceBefore: toDecimalString(balanceAfter),
            balanceAfter: toDecimalString(creditedBalance),
            referenceType: 'prize',
            referenceId: lockedPrize.id,
            metadata: { reason: 'draw_reward' },
          });
        }
      } else {
        status = 'out_of_stock';
      }
    }

    const updatedPoolBalance = Math.max(
      poolBalance + DRAW_COST - rewardAmount,
      0
    );
    await setPoolBalance(tx, updatedPoolBalance);

    const [record] = await tx
      .insert(drawRecords)
      .values({
        userId,
        prizeId,
        drawCost: toDecimalString(DRAW_COST),
        rewardAmount: toDecimalString(rewardAmount),
        status,
        metadata: { poolBalanceBefore: poolBalance },
      })
      .returning();

    logger.info('draw executed', {
      userId,
      status,
      prizeId,
      rewardAmount,
      drawCost: DRAW_COST,
      poolBalanceBefore: poolBalance,
      poolBalanceAfter: updatedPoolBalance,
    });

    return record;
  });
}
