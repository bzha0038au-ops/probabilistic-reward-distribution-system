import { and, eq, isNull, sql } from '@reward/database/orm';
import Decimal from 'decimal.js';
import { prizes, users } from '@reward/database';
import { type DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { creditAsset } from '../economy/service';
import type {
  ResolvedDrawOutcome,
  WinningPrizePlan,
} from './types';

const decrementPrizeStock = async (params: {
  tx: DbTransaction;
  plan: WinningPrizePlan;
  now: Date;
}) => {
  const { tx, plan, now } = params;
  const shouldTrackBudget = plan.budgetEvaluation.budget.gt(0);
  if (shouldTrackBudget || plan.rewardAmount.gt(0)) {
    const spentBase = plan.budgetEvaluation.shouldReset
      ? toDecimal(0)
      : plan.budgetEvaluation.spent;
    const spentAfter = spentBase.plus(plan.rewardAmount);

    const updates: Record<string, unknown> = {
      stock: sql`${prizes.stock} - 1`,
      updatedAt: now,
    };

    if (shouldTrackBudget) {
      updates.payoutSpent = toMoneyString(spentAfter);
      if (plan.budgetEvaluation.shouldReset) {
        updates.payoutPeriodStartedAt = now;
      }
    }

    await tx
      .update(prizes)
      .set(updates)
      .where(and(eq(prizes.id, plan.lockedPrize.id), isNull(prizes.deletedAt)));
    return;
  }

  await tx
    .update(prizes)
    .set({
      stock: sql`${prizes.stock} - 1`,
      updatedAt: now,
    })
    .where(and(eq(prizes.id, plan.lockedPrize.id), isNull(prizes.deletedAt)));
};

const creditPrizeReward = async (params: {
  tx: DbTransaction;
  userId: number;
  prizeId: number;
  rewardAmount: WinningPrizePlan['rewardAmount'];
  userPoolAfterDebit: WinningPrizePlan['rewardAmount'];
  now: Date;
}) => {
  const {
    tx,
    userId,
    prizeId,
    rewardAmount,
    userPoolAfterDebit,
    now,
  } = params;

  if (rewardAmount.lte(0)) {
    return;
  }

  const userPoolAfterReward = Decimal.max(
    userPoolAfterDebit.minus(rewardAmount),
    0
  );

  await creditAsset(
    {
      userId,
      assetCode: 'B_LUCK',
      amount: rewardAmount,
      entryType: 'draw_reward',
      referenceType: 'prize',
      referenceId: prizeId,
      audit: {
        sourceApp: 'backend.draw',
        metadata: {
          reason: 'draw_reward',
        },
      },
    },
    tx
  );

  await tx
    .update(users)
    .set({
      userPoolBalance: toMoneyString(userPoolAfterReward),
      updatedAt: now,
    })
    .where(eq(users.id, userId));
};

export const persistWinningOutcome = async (params: {
  tx: DbTransaction;
  userId: number;
  plan: WinningPrizePlan;
  userPoolAfterDebit: WinningPrizePlan['rewardAmount'];
  now: Date;
}): Promise<ResolvedDrawOutcome> => {
  const { tx, userId, plan, userPoolAfterDebit, now } = params;

  await decrementPrizeStock({ tx, plan, now });
  await creditPrizeReward({
    tx,
    userId,
    prizeId: plan.lockedPrize.id,
    rewardAmount: plan.rewardAmount,
    userPoolAfterDebit,
    now,
  });

  return {
    status: 'won',
    rewardAmount: plan.rewardAmount,
    prizeId: plan.lockedPrize.id,
    payoutLimitReason: null,
  };
};
