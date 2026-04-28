import Decimal from 'decimal.js';
import type { PlayModeSnapshot } from "@reward/shared-types/play-mode";

import { toMoneyString } from '../../shared/money';
import type {
  DebitedDrawState,
  DrawConfigBundle,
  FairnessSeed,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

export const computeUpdatedPoolBalance = (
  selectionState: PreparedDrawSelection,
  drawState: DebitedDrawState,
  outcome: ResolvedDrawOutcome
) =>
  Decimal.max(
    selectionState.poolBalance.plus(drawState.drawCost).minus(outcome.rewardAmount),
    0
  );

export const buildDrawRecordMetadata = (params: {
  drawState: DebitedDrawState;
  selectionState: PreparedDrawSelection;
  outcome: ResolvedDrawOutcome;
  fairnessSeed: FairnessSeed;
  clientNonce: string;
  nonceSource: 'client' | 'server';
  probabilityControl: DrawConfigBundle['probabilityControl'];
  payoutControl: DrawConfigBundle['payoutControl'];
  poolSystem: DrawConfigBundle['poolSystem'];
  pityStreakAfter: number;
  playMode?: PlayModeSnapshot | null;
}) => {
  const {
    drawState,
    selectionState,
    outcome,
    fairnessSeed,
    clientNonce,
    nonceSource,
    probabilityControl,
    payoutControl,
    poolSystem,
    pityStreakAfter,
    playMode,
  } = params;

  const updatedPoolBalance = computeUpdatedPoolBalance(
    selectionState,
    drawState,
    outcome
  );

  return {
    updatedPoolBalance,
    metadata: {
      poolBalanceBefore: toMoneyString(selectionState.poolBalance),
      poolBalanceAfter: toMoneyString(updatedPoolBalance),
      effectivePoolBalance: toMoneyString(selectionState.effectivePoolBalance),
      poolNoiseApplied: selectionState.poolNoise.noiseApplied,
      userPoolBalanceBefore: toMoneyString(drawState.userPoolBefore),
      userPoolBalanceAfterDebit: toMoneyString(drawState.userPoolAfterDebit),
      userPoolBalanceAfterReward: toMoneyString(
        outcome.rewardAmount.gt(0)
          ? Decimal.max(drawState.userPoolAfterDebit.minus(outcome.rewardAmount), 0)
          : drawState.userPoolAfterDebit
      ),
      drawCostBase: toMoneyString(drawState.drawCostBase),
      drawCostEffective: toMoneyString(drawState.drawCost),
      drawCostClamped: drawState.drawCostClamped,
      randomPick: selectionState.selection?.randomPick ?? null,
      totalWeight: selectionState.selection?.totalWeight ?? null,
      eligiblePrizes: selectionState.jitteredEligible.map((item) => ({
        id: item.id,
        weight: item.weight,
        rewardAmount: toMoneyString(item.rewardAmount ?? 0),
        userPoolThreshold: item.userPoolThreshold,
        poolThreshold: item.poolThreshold,
      })),
      randomization: {
        weightJitterEnabled: selectionState.jitterEnabled,
        weightJitterRange: {
          min: selectionState.jitterMin,
          max: selectionState.jitterMax,
        },
        probabilityScale: selectionState.normalizedScale,
        jackpotProbabilityBoost: selectionState.jackpotBoostPct,
        selectionMode: 'cached_pool',
        selectionOrder: 'id_asc',
        jitteredWeights: selectionState.jitterMeta,
        expectedPayoutWeightSum: toMoneyString(selectionState.expectedPayout),
        expectedValueBase: toMoneyString(selectionState.expectedValueBase),
        expectedValueWithMiss: toMoneyString(selectionState.expectedValueWithMiss),
        targetExpectedValue: toMoneyString(selectionState.targetExpectedValue),
        missWeightBase: selectionState.missWeightBase,
        missWeight: selectionState.missWeight,
        pity: {
          enabled: probabilityControl.pityEnabled,
          threshold: Number(probabilityControl.pityThreshold ?? 0),
          boostPct: Number(probabilityControl.pityBoostPct ?? 0),
          maxBoostPct: Number(probabilityControl.pityMaxBoostPct ?? 0),
          streakBefore: drawState.pityStreakBefore,
          streakAfter: pityStreakAfter,
          boostApplied: selectionState.pityBoostApplied,
        },
      },
      fairness: {
        epoch: fairnessSeed.epoch,
        epochSeconds: fairnessSeed.epochSeconds,
        commitHash: fairnessSeed.commitHash,
        clientNonce,
        nonceSource,
        rngDigest: selectionState.rngDigest,
        totalWeight: selectionState.selection?.totalWeight ?? null,
        randomPick: selectionState.selection?.randomPick ?? null,
        algorithm: 'sha256(seed:nonce:totalWeight)%totalWeight+1',
      },
      playMode: playMode ?? null,
      payoutControl: {
        maxBigPerHour: toMoneyString(payoutControl.maxBigPerHour),
        maxBigPerDay: toMoneyString(payoutControl.maxBigPerDay),
        maxTotalPerHour: toMoneyString(payoutControl.maxTotalPerHour),
        cooldownSeconds: toMoneyString(payoutControl.cooldownSeconds),
      },
      payoutLimitReason: outcome.payoutLimitReason,
      poolSystem: {
        minReserve: toMoneyString(poolSystem.minReserve),
        maxPayoutRatio: toMoneyString(poolSystem.maxPayoutRatio),
      },
    },
  };
};
