import { and, eq, isNull, sql } from '@reward/database/orm';
import Decimal from 'decimal.js';
import { ledgerEntries, prizes, userWallets, users } from '@reward/database';
import { type DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import type {
  DrawUserRow,
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
  user: DrawUserRow;
  prizeId: number;
  rewardAmount: WinningPrizePlan['rewardAmount'];
  bonusBefore: WinningPrizePlan['rewardAmount'];
  userPoolAfterDebit: WinningPrizePlan['rewardAmount'];
  now: Date;
}) => {
  const {
    tx,
    userId,
    user,
    prizeId,
    rewardAmount,
    bonusBefore,
    userPoolAfterDebit,
    now,
  } = params;

  if (rewardAmount.lte(0)) {
    return bonusBefore;
  }

  const bonusAfter = bonusBefore.plus(rewardAmount);
  const userPoolAfterReward = Decimal.max(
    userPoolAfterDebit.minus(rewardAmount),
    0
  );

  await tx
    .update(userWallets)
    .set({
      bonusBalance: toMoneyString(bonusAfter),
      updatedAt: now,
    })
    .where(eq(userWallets.userId, user.id));

  await tx
    .update(users)
    .set({
      userPoolBalance: toMoneyString(userPoolAfterReward),
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await tx.insert(ledgerEntries).values({
    userId,
    entryType: 'draw_reward',
    amount: toMoneyString(rewardAmount),
    balanceBefore: toMoneyString(bonusBefore),
    balanceAfter: toMoneyString(bonusAfter),
    referenceType: 'prize',
    referenceId: prizeId,
    metadata: { reason: 'draw_reward', balanceType: 'bonus' },
  });

  return bonusAfter;
};

export const persistWinningOutcome = async (params: {
  tx: DbTransaction;
  userId: number;
  user: DrawUserRow;
  plan: WinningPrizePlan;
  bonusBefore: WinningPrizePlan['rewardAmount'];
  userPoolAfterDebit: WinningPrizePlan['rewardAmount'];
  now: Date;
}): Promise<ResolvedDrawOutcome> => {
  const { tx, userId, user, plan, bonusBefore, userPoolAfterDebit, now } = params;

  await decrementPrizeStock({ tx, plan, now });
  const bonusAfterReward = await creditPrizeReward({
    tx,
    userId,
    user,
    prizeId: plan.lockedPrize.id,
    rewardAmount: plan.rewardAmount,
    bonusBefore,
    userPoolAfterDebit,
    now,
  });

  return {
    status: 'won',
    rewardAmount: plan.rewardAmount,
    prizeId: plan.lockedPrize.id,
    bonusAfterReward,
    payoutLimitReason: null,
  };
};
