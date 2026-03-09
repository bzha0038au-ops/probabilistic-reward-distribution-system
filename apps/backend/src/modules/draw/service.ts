import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { randomInt } from 'node:crypto';

import { db } from '../../db';
import { drawRecords, prizes, transactions, users } from '@reward/database';
import { getDrawCost, getPoolBalance, setPoolBalance } from '../system/service';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';

type WeightedPick<T> = {
  item: T;
  randomPick: number;
  totalWeight: number;
};

export function pickByWeight<T extends { weight: number }>(
  items: T[],
  rng: (totalWeight: number) => number = (totalWeight) =>
    randomInt(1, totalWeight + 1)
): WeightedPick<T> | null {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;

  const pick = rng(totalWeight);
  let cursor = 0;

  for (const item of items) {
    cursor += item.weight;
    if (pick <= cursor) {
      return { item, randomPick: pick, totalWeight };
    }
  }

  const fallback = items[items.length - 1];
  return fallback ? { item: fallback, randomPick: pick, totalWeight } : null;
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

    const drawCost = await getDrawCost(tx);
    const balanceBefore = toDecimal(user.balance ?? 0);
    if (balanceBefore.lt(drawCost)) {
      throw new Error('Insufficient balance.');
    }

    const balanceAfter = balanceBefore.minus(drawCost);

    await tx
      .update(users)
      .set({
        balance: toMoneyString(balanceAfter),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await tx.insert(transactions).values({
      userId,
      type: 'debit_draw',
      amount: toMoneyString(drawCost.negated()),
      balanceBefore: toMoneyString(balanceBefore),
      balanceAfter: toMoneyString(balanceAfter),
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
          lte(prizes.poolThreshold, toMoneyString(poolBalance))
        )
      );

    let status: 'miss' | 'won' | 'out_of_stock' = 'miss';
    let rewardAmount = toDecimal(0);
    let prizeId: number | null = null;

    const selection = pickByWeight(eligible);

    if (selection) {
      const { item: candidate, randomPick, totalWeight } = selection;
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
        rewardAmount = toDecimal(lockedPrize.reward_amount ?? 0);

        if (rewardAmount.gt(0)) {
          const creditedBalance = balanceAfter.plus(rewardAmount);

          await tx
            .update(users)
            .set({
              balance: toMoneyString(creditedBalance),
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          await tx.insert(transactions).values({
            userId,
            type: 'credit_reward',
            amount: toMoneyString(rewardAmount),
            balanceBefore: toMoneyString(balanceAfter),
            balanceAfter: toMoneyString(creditedBalance),
            referenceType: 'prize',
            referenceId: lockedPrize.id,
            metadata: { reason: 'draw_reward' },
          });
        }
      } else {
        status = 'out_of_stock';
      }
    }

    const updatedPoolBalance = Decimal.max(
      poolBalance.plus(drawCost).minus(rewardAmount),
      0
    );
    await setPoolBalance(tx, updatedPoolBalance);

    const [record] = await tx
      .insert(drawRecords)
      .values({
        userId,
        prizeId,
        drawCost: toMoneyString(drawCost),
        rewardAmount: toMoneyString(rewardAmount),
        status,
        metadata: {
          poolBalanceBefore: toMoneyString(poolBalance),
          randomPick: selection?.randomPick ?? null,
          totalWeight: selection?.totalWeight ?? null,
          eligiblePrizes: eligible.map((item) => ({
            id: item.id,
            weight: item.weight,
          })),
        },
      })
      .returning();

    logger.info('draw executed', {
      userId,
      status,
      prizeId,
      rewardAmount: toMoneyString(rewardAmount),
      drawCost: toMoneyString(drawCost),
      poolBalanceBefore: toMoneyString(poolBalance),
      poolBalanceAfter: toMoneyString(updatedPoolBalance),
    });

    return record;
  });
}
