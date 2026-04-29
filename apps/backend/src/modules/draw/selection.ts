import Decimal from 'decimal.js';

import { type DbTransaction } from '../../db';
import { toDecimal } from '../../shared/money';
import { getPoolBalance } from '../system/service';
import { getProbabilityPool } from './pool-cache';
import {
  applyPoolNoise,
  applyWeightJitter,
  deriveRandomPick,
  normalizePct,
  pickByWeight,
} from './helpers';
import type {
  DrawConfigBundle,
  FairnessSeed,
  MissCandidate,
  PreparedDrawSelection,
  PrizeCandidate,
} from './types';

const normalizeRangeValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) > 1 ? value / 100 : value;
};

export const prepareDrawSelection = async (params: {
  tx: DbTransaction;
  drawState: { drawCost: Decimal; userPoolAfterDebit: Decimal; pityStreakBefore: number };
  poolSystem: DrawConfigBundle['poolSystem'];
  probabilityControl: DrawConfigBundle['probabilityControl'];
  randomization: DrawConfigBundle['randomization'];
  fairnessSeed: FairnessSeed;
  clientNonce: string;
}): Promise<PreparedDrawSelection> => {
  const {
    tx,
    drawState,
    poolSystem,
    probabilityControl,
    randomization,
    fairnessSeed,
    clientNonce,
  } = params;

  // Selection only needs a snapshot of the pool balance. Holding a house-account
  // row lock for the full draw transaction serializes unrelated draws and can
  // cause the integration concurrency cases to time out under load.
  const poolBalance = await getPoolBalance(tx);
  const poolNoise = applyPoolNoise(poolBalance, {
    noiseEnabled: poolSystem.noiseEnabled,
    noiseRange: poolSystem.noiseRange,
    epochSeconds: Number(poolSystem.epochSeconds ?? 0),
  });
  const effectivePoolBalance = poolNoise.effective;
  // 第一层：概率池缓存（只包含静态权重/阈值）
  const poolCandidates = await getProbabilityPool();
  const eligibleSorted = [...poolCandidates].sort((a, b) => a.id - b.id);
  const probabilityScale = Number(probabilityControl.probabilityScale ?? 1);
  const normalizedScale =
    Number.isFinite(probabilityScale) && probabilityScale > 0
      ? probabilityScale
      : 1;
  const maxReward = eligibleSorted.reduce(
    (max, item) => {
      const reward = toDecimal(item.rewardAmount ?? 0);
      return reward.gt(max) ? reward : max;
    },
    toDecimal(0)
  );
  const jackpotBoostPct = normalizePct(
    probabilityControl.jackpotProbabilityBoost
  );

  const scaledEligible = eligibleSorted.map((item) => {
    const baseWeight = Math.max(1, Math.round(item.weight * normalizedScale));
    const reward = toDecimal(item.rewardAmount ?? 0);
    const boostedWeight =
      jackpotBoostPct > 0 && reward.gt(0) && reward.eq(maxReward)
        ? Math.max(1, Math.round(baseWeight * (1 + jackpotBoostPct)))
        : baseWeight;
    return { ...item, weight: boostedWeight };
  });

  const probabilityRange = probabilityControl.weightJitterRange;
  const probabilityMin = normalizeRangeValue(probabilityRange.min);
  const probabilityMax = normalizeRangeValue(probabilityRange.max);
  const fallbackPct = Number(randomization.weightJitterPct ?? 0);
  const fallbackMin = normalizeRangeValue(-fallbackPct);
  const fallbackMax = normalizeRangeValue(fallbackPct);
  const jitterEnabled = probabilityControl.weightJitterEnabled
    ? true
    : randomization.weightJitterEnabled && fallbackPct > 0;
  const jitterMin = probabilityControl.weightJitterEnabled
    ? probabilityMin
    : fallbackMin;
  const jitterMax = probabilityControl.weightJitterEnabled
    ? probabilityMax
    : fallbackMax;

  const { items: jitteredEligible, jitterMeta } = applyWeightJitter(
    scaledEligible,
    {
      enabled: jitterEnabled,
      min: jitterMin,
      max: jitterMax,
      seed: fairnessSeed.seed,
      nonce: clientNonce,
    }
  );

  const expectedPayout = jitteredEligible.reduce(
    (total, item) =>
      total.plus(toDecimal(item.rewardAmount ?? 0).mul(item.weight)),
    toDecimal(0)
  );
  const totalWeightBase = jitteredEligible.reduce(
    (total, item) => total + item.weight,
    0
  );

  let targetExpectedValue = toDecimal(0);
  if (poolSystem.maxPayoutRatio.gt(0)) {
    targetExpectedValue = drawState.drawCost.mul(poolSystem.maxPayoutRatio);
  }

  let missWeightBase = 0;
  if (targetExpectedValue.gt(0) && expectedPayout.gt(0)) {
    const requiredTotalWeight = expectedPayout
      .div(targetExpectedValue)
      .toDecimalPlaces(0, Decimal.ROUND_CEIL);
    missWeightBase = Math.max(
      0,
      requiredTotalWeight.minus(totalWeightBase).toNumber()
    );
  }

  const pityThreshold = Number(probabilityControl.pityThreshold ?? 0);
  const pityBoostPct = normalizePct(probabilityControl.pityBoostPct);
  const pityMaxBoostPct = normalizePct(probabilityControl.pityMaxBoostPct);
  let pityBoostApplied = 0;
  if (
    probabilityControl.pityEnabled &&
    pityThreshold > 0 &&
    pityBoostPct > 0 &&
    drawState.pityStreakBefore >= pityThreshold
  ) {
    const steps = drawState.pityStreakBefore - pityThreshold + 1;
    pityBoostApplied = pityBoostPct * steps;
    if (pityMaxBoostPct > 0) {
      pityBoostApplied = Math.min(pityBoostApplied, pityMaxBoostPct);
    }
  }

  let missWeight = missWeightBase;
  if (missWeightBase > 0 && pityBoostApplied > 0) {
    missWeight = Math.max(0, Math.round(missWeightBase * (1 - pityBoostApplied)));
  }
  const totalWeightWithMiss = totalWeightBase + missWeight;
  const expectedValueBase =
    totalWeightBase > 0 ? expectedPayout.div(totalWeightBase) : toDecimal(0);
  const expectedValueWithMiss =
    totalWeightWithMiss > 0
      ? expectedPayout.div(totalWeightWithMiss)
      : toDecimal(0);

  const weightedCandidates: Array<PrizeCandidate | MissCandidate> =
    missWeight > 0
      ? [...jitteredEligible, { id: -1, weight: missWeight, __isMiss: true }]
      : [...jitteredEligible];

  let rngDigest: string | null = null;
  const selection = pickByWeight(weightedCandidates, (totalWeight) => {
    const { pick, digest } = deriveRandomPick(
      totalWeight,
      fairnessSeed.seed,
      clientNonce
    );
    rngDigest = digest;
    return pick;
  });

  return {
    poolBalance,
    poolNoise,
    effectivePoolBalance,
    jitteredEligible,
    jitterMeta,
    normalizedScale,
    jackpotBoostPct,
    jitterEnabled,
    jitterMin,
    jitterMax,
    expectedPayout,
    expectedValueBase,
    expectedValueWithMiss,
    targetExpectedValue,
    missWeightBase,
    missWeight,
    pityBoostApplied,
    maxReward,
    selection,
    rngDigest,
  };
};
