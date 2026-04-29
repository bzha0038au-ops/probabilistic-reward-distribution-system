import Decimal from 'decimal.js';
import { and, eq, gte, sql } from '@reward/database/orm';

import { drawRecords } from '@reward/database';
import { type DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { evaluateBudget } from './helpers';
import { loadLockedPrize } from './queries';
import type {
  DrawConfigBundle,
  OutcomePolicyDecision,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

const buildOutcome = (
  status: ResolvedDrawOutcome['status'],
  payoutLimitReason: string | null = null
): ResolvedDrawOutcome => ({
  status,
  rewardAmount: toDecimal(0),
  prizeId: null,
  payoutLimitReason,
});

const resolvePayoutLimitReason = async (params: {
  tx: DbTransaction;
  userId: number;
  candidateReward: Decimal;
  maxReward: Decimal;
  payoutControl: DrawConfigBundle['payoutControl'];
  now: Date;
}) => {
  const { tx, userId, candidateReward, maxReward, payoutControl, now } = params;
  let payoutLimitReason: string | null = null;

  if (candidateReward.lte(0)) {
    return payoutLimitReason;
  }

  if (payoutControl.cooldownSeconds.gt(0)) {
    const cooldownSince = new Date(
      now.getTime() - Number(payoutControl.cooldownSeconds) * 1000
    );
    const [recentWin] = await tx
      .select({ id: drawRecords.id })
      .from(drawRecords)
      .where(
        and(
          eq(drawRecords.userId, userId),
          eq(drawRecords.status, 'won'),
          gte(drawRecords.createdAt, cooldownSince)
        )
      )
      .limit(1);
    if (recentWin) {
      payoutLimitReason = 'payout_cooldown';
    }
  }

  if (!payoutLimitReason && payoutControl.maxTotalPerHour.gt(0)) {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const [{ total = 0 }] = await tx
      .select({
        total: sql<number>`coalesce(sum(${drawRecords.rewardAmount}), 0)`,
      })
      .from(drawRecords)
      .where(
        and(eq(drawRecords.status, 'won'), gte(drawRecords.createdAt, since))
      );
    const totalAmount = toDecimal(total ?? 0);
    if (totalAmount.plus(candidateReward).gt(payoutControl.maxTotalPerHour)) {
      payoutLimitReason = 'max_total_payout_per_hour';
    }
  }

  const isBigPrize = maxReward.gt(0) && candidateReward.gte(maxReward);
  if (!payoutLimitReason && isBigPrize) {
    if (payoutControl.maxBigPerHour.lte(0)) {
      payoutLimitReason = 'max_big_prize_disabled';
    } else {
      const since = new Date(now.getTime() - 60 * 60 * 1000);
      const [{ count = 0 }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(drawRecords)
        .where(
          and(
            eq(drawRecords.status, 'won'),
            gte(drawRecords.createdAt, since),
            gte(drawRecords.rewardAmount, toMoneyString(maxReward))
          )
        );
      if (Number(count ?? 0) >= Number(payoutControl.maxBigPerHour)) {
        payoutLimitReason = 'max_big_prize_per_hour';
      }
    }

    if (!payoutLimitReason && payoutControl.maxBigPerDay.gt(0)) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const [{ count = 0 }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(drawRecords)
        .where(
          and(
            eq(drawRecords.status, 'won'),
            gte(drawRecords.createdAt, startOfDay),
            gte(drawRecords.rewardAmount, toMoneyString(maxReward))
          )
        );
      if (Number(count ?? 0) >= Number(payoutControl.maxBigPerDay)) {
        payoutLimitReason = 'max_big_prize_per_day';
      }
    }
  }

  return payoutLimitReason;
};

export const resolvePayoutPolicy = async (params: {
  tx: DbTransaction;
  userId: number;
  selectionState: PreparedDrawSelection;
  drawState: {
    drawCost: Decimal;
    userPoolAfterDebit: Decimal;
  };
  economy: DrawConfigBundle['economy'];
  poolSystem: DrawConfigBundle['poolSystem'];
  payoutControl: DrawConfigBundle['payoutControl'];
  now: Date;
}): Promise<OutcomePolicyDecision> => {
  const {
    tx,
    userId,
    selectionState,
    drawState,
    economy,
    poolSystem,
    payoutControl,
    now,
  } = params;

  const selection = selectionState.selection;
  if (!selection) {
    return {
      terminal: true,
      outcome: buildOutcome('miss'),
    };
  }

  const candidate = selection.item;
  if ('__isMiss' in candidate) {
    return {
      terminal: true,
      outcome: buildOutcome('miss'),
    };
  }

  // 第二层：资格验证（库存、阈值、预算、风控）
  const lockedPrize = await loadLockedPrize(tx, candidate.id);
  if (!lockedPrize || !lockedPrize.is_active || lockedPrize.stock <= 0) {
    return {
      terminal: true,
      outcome: buildOutcome('out_of_stock'),
    };
  }

  const poolGate = toDecimal(lockedPrize.pool_threshold ?? 0);
  const userPoolGate = toDecimal(lockedPrize.user_pool_threshold ?? 0);
  const budgetEvaluation = evaluateBudget(
    {
      rewardAmount: lockedPrize.reward_amount,
      payoutBudget: lockedPrize.payout_budget,
      payoutSpent: lockedPrize.payout_spent,
      payoutPeriodDays: lockedPrize.payout_period_days,
      payoutPeriodStartedAt: lockedPrize.payout_period_started_at,
    },
    now
  );

  if (
    selectionState.effectivePoolBalance.lt(poolGate) ||
    drawState.userPoolAfterDebit.lt(userPoolGate)
  ) {
    return {
      terminal: true,
      outcome: buildOutcome('miss'),
    };
  }

  if (!budgetEvaluation.available) {
    return {
      terminal: true,
      outcome: buildOutcome('budget_exhausted'),
    };
  }

  const candidateReward = toDecimal(lockedPrize.reward_amount ?? 0);
  const updatedPoolBalanceCandidate = Decimal.max(
    selectionState.poolBalance.plus(drawState.drawCost).minus(candidateReward),
    0
  );

  if (
    poolSystem.minReserve.gt(0) &&
    updatedPoolBalanceCandidate.lt(poolSystem.minReserve)
  ) {
    return {
      terminal: true,
      outcome: buildOutcome('payout_limited'),
    };
  }

  if (economy.houseBankroll.gt(0) && candidateReward.gt(economy.houseBankroll)) {
    return {
      terminal: true,
      outcome: buildOutcome('payout_limited'),
    };
  }

  if (
    poolSystem.maxPayoutRatio.gt(0) &&
    candidateReward.gt(selectionState.poolBalance.mul(poolSystem.maxPayoutRatio))
  ) {
    return {
      terminal: true,
      outcome: buildOutcome('payout_limited'),
    };
  }

  const payoutLimitReason = await resolvePayoutLimitReason({
    tx,
    userId,
    candidateReward,
    maxReward: selectionState.maxReward,
    payoutControl,
    now,
  });

  if (payoutLimitReason) {
    return {
      terminal: true,
      outcome: buildOutcome('payout_limited', payoutLimitReason),
    };
  }

  return {
    terminal: false,
    plan: {
      lockedPrize,
      rewardAmount: candidateReward,
      budgetEvaluation,
    },
  };
};
