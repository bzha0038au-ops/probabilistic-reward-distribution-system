import { createHash } from "node:crypto";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  PrizeEngineBehaviorInput,
  SaasProjectStrategy,
} from "@reward/shared-types/saas";

import { badRequestError } from "../../shared/errors";
import { toDecimal } from "../../shared/money";
import { deriveRandomPick, pickByWeight } from "../draw/helpers";
import type {
  LockedPrizeRow,
  ProjectStrategyParams,
} from "./prize-engine-domain";
import { resolveProjectRiskWeightDecayAlpha } from "./prize-engine-domain";

const DEFAULT_EPSILON_GREEDY_EPSILON = 0.1;

export type PrizeEngineSelectionStats = {
  pulls: number;
  totalRewardAmount: string;
};

type PrizeEngineSelectionCandidate = {
  kind: "prize" | "miss";
  id: number;
  weight: number;
  rewardAmount: string;
  metadata: Record<string, unknown> | null;
  score: number;
  pulls: number;
  averageReward: number;
};

export type PrizeEngineSelectionContext = {
  strategy: SaasProjectStrategy;
  strategyParams: ProjectStrategyParams;
  prizeRows: LockedPrizeRow[];
  missWeight: number;
  fairnessSeed: string;
  fairnessNonce: string;
  historyByPrizeId: Map<number, PrizeEngineSelectionStats>;
  behavior?: PrizeEngineBehaviorInput;
  riskAdjustment?: {
    inputRisk: number;
    previousAccumulatedRisk: number;
    decayedAccumulatedRisk: number;
    effectiveRisk: number;
    riskStateHalfLifeSeconds: number;
  };
};

type PrizeEngineSelectionMetadata = {
  strategy: SaasProjectStrategy;
  rngDigest: string | null;
  totalWeight: number | null;
  randomPick: number | null;
  algorithm: string;
  epsilon?: number | null;
  decision?: "explore" | "exploit" | null;
  selectionDigest?: string | null;
  candidateCount?: number | null;
  selectedArmId?: number | null;
  selectedArmKind?: "prize" | "miss" | null;
  risk?: {
    inputRisk: number;
    previousAccumulatedRisk: number;
    decayedAccumulatedRisk: number;
    effectiveRisk: number;
    weightDecayAlpha: number;
    riskStateHalfLifeSeconds: number;
    weightMultiplier: number;
    basePrizeWeightTotal: number;
    adjustedPrizeWeightTotal: number;
  } | null;
};

export type PrizeEngineSelectionResult = {
  selection: PrizeEngineSelectionCandidate | null;
  fairness: PrizeEngineSelectionMetadata;
};

const deriveUniformValue = (seed: string, nonce: string, salt: string) => {
  const digest = createHash("sha256")
    .update(`${seed}:${nonce}:${salt}`)
    .digest();
  const raw = digest.readUInt32BE(0);
  return {
    value: raw / 0x100000000,
    digest: digest.toString("hex"),
  };
};

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clampUnitInterval = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
};

const roundRiskMetric = (value: number) =>
  Number(clampUnitInterval(value).toFixed(6));

const normalizeBehaviorSignal = (value: number | undefined, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.abs(parsed) > 1 ? parsed / 100 : parsed;
  return Math.min(Math.max(normalized, 0), 1);
};

const deriveBehaviorProfile = (behavior?: PrizeEngineBehaviorInput) => {
  if (!behavior) {
    return {
      score: 0,
      novelty: 0,
      risk: 0,
      rewardWeightMultiplier: 1,
      missWeightMultiplier: 1,
    };
  }

  const score = normalizeBehaviorSignal(behavior.score, 0);
  const novelty = normalizeBehaviorSignal(behavior.novelty, 0);
  const risk = normalizeBehaviorSignal(behavior.risk, 0);

  return {
    score,
    novelty,
    risk,
    rewardWeightMultiplier: Math.min(
      Math.max(0.55 + score * 0.8 + novelty * 0.15 - risk * 0.25, 0.1),
      2.5,
    ),
    missWeightMultiplier: Math.min(
      Math.max(1.35 - score * 0.55 - novelty * 0.2 + risk * 0.35, 0.1),
      2.5,
    ),
  };
};

const resolveCandidateScore = (candidate: {
  rewardAmount: string;
  metadata: Record<string, unknown> | null;
}) => {
  const metadataScore =
    toFiniteNumber(candidate.metadata?.strategyScore) ??
    toFiniteNumber(candidate.metadata?.score);
  return metadataScore ?? Number(toDecimal(candidate.rewardAmount));
};

const resolveAverageReward = (stats?: PrizeEngineSelectionStats) => {
  if (!stats || stats.pulls <= 0) {
    return 0;
  }

  return toDecimal(stats.totalRewardAmount).div(stats.pulls).toNumber();
};

const resolveExploitScore = (candidate: PrizeEngineSelectionCandidate) =>
  candidate.pulls > 0 ? candidate.averageReward : candidate.score;

const compareCandidates = (
  left: PrizeEngineSelectionCandidate,
  right: PrizeEngineSelectionCandidate,
) => {
  const exploitDiff = resolveExploitScore(right) - resolveExploitScore(left);
  if (exploitDiff !== 0) {
    return exploitDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  if (left.kind !== right.kind) {
    return left.kind === "prize" ? -1 : 1;
  }

  const weightDiff = right.weight - left.weight;
  if (weightDiff !== 0) {
    return weightDiff;
  }

  return left.id - right.id;
};

const buildCandidates = (
  context: PrizeEngineSelectionContext,
  options?: {
    includeMiss?: boolean;
    requirePositiveWeight?: boolean;
  },
) => {
  const behavior = deriveBehaviorProfile(context.behavior);
  const availablePrizeRows = context.prizeRows.filter(
    (row) => Number(row.stock ?? 0) > 0,
  );
  const maxRewardAmount = availablePrizeRows.reduce((currentMax, row) => {
    const reward = Number(toDecimal(row.rewardAmount));
    return reward > currentMax ? reward : currentMax;
  }, 0);
  const includeMiss = options?.includeMiss ?? true;
  const requirePositiveWeight = options?.requirePositiveWeight ?? false;
  const prizeCandidates = context.prizeRows
    .filter((row) => Number(row.stock ?? 0) > 0)
    .filter((row) => !requirePositiveWeight || Number(row.weight ?? 0) > 0)
    .map((row) => {
      const stats = context.historyByPrizeId.get(row.id);
      const rewardAmount = Number(toDecimal(row.rewardAmount));
      const rewardTier =
        maxRewardAmount > 0
          ? Math.min(Math.max(rewardAmount / maxRewardAmount, 0), 1)
          : 0;
      const behaviorWeightMultiplier = Math.min(
        Math.max(
          behavior.rewardWeightMultiplier *
            (1 +
              rewardTier *
                (behavior.score * 0.45 +
                  behavior.novelty * 0.2 -
                  behavior.risk * 0.2)),
          0.1,
        ),
        3,
      );
      return {
        kind: "prize" as const,
        id: row.id,
        weight: Math.max(
          requirePositiveWeight ? 1 : 0,
          Math.round(Number(row.weight ?? 0) * behaviorWeightMultiplier),
        ),
        rewardAmount: row.rewardAmount,
        metadata: row.metadata,
        score:
          resolveCandidateScore(row) *
          (1 +
            behavior.score * 0.6 +
            behavior.novelty * 0.2 -
            behavior.risk * 0.2),
        pulls: stats?.pulls ?? 0,
        averageReward: resolveAverageReward(stats),
      };
    });

  if (!includeMiss || context.missWeight <= 0) {
    return prizeCandidates;
  }

  return [
    ...prizeCandidates,
    {
      kind: "miss" as const,
      id: 0,
      weight: Math.max(
        1,
        Math.round(context.missWeight * behavior.missWeightMultiplier),
      ),
      rewardAmount: "0",
      metadata: null,
      score: 0,
      pulls: 0,
      averageReward: 0,
    },
  ];
};

const applyRiskAdjustment = (context: PrizeEngineSelectionContext) => {
  const inputRisk = clampUnitInterval(context.riskAdjustment?.inputRisk ?? 0);
  const previousAccumulatedRisk = clampUnitInterval(
    context.riskAdjustment?.previousAccumulatedRisk ?? 0,
  );
  const decayedAccumulatedRisk = clampUnitInterval(
    context.riskAdjustment?.decayedAccumulatedRisk ?? 0,
  );
  const effectiveRisk = clampUnitInterval(
    context.riskAdjustment?.effectiveRisk ?? 0,
  );
  const weightDecayAlpha = resolveProjectRiskWeightDecayAlpha(
    context.strategyParams,
  );
  const weightMultiplier =
    effectiveRisk > 0 && weightDecayAlpha > 0
      ? Math.exp(-weightDecayAlpha * effectiveRisk)
      : 1;
  const adjustedPrizeRows = context.prizeRows.map((row) => ({
    ...row,
    weight: Math.max(0, Math.round(Number(row.weight ?? 0) * weightMultiplier)),
  }));
  const basePrizeWeightTotal = context.prizeRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.weight ?? 0)),
    0,
  );
  const adjustedPrizeWeightTotal = adjustedPrizeRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.weight ?? 0)),
    0,
  );

  return {
    context: {
      ...context,
      prizeRows: adjustedPrizeRows,
    },
    riskMetadata: context.riskAdjustment
      ? {
          inputRisk: roundRiskMetric(inputRisk),
          previousAccumulatedRisk: roundRiskMetric(previousAccumulatedRisk),
          decayedAccumulatedRisk: roundRiskMetric(decayedAccumulatedRisk),
          effectiveRisk: roundRiskMetric(effectiveRisk),
          weightDecayAlpha: Number(weightDecayAlpha.toFixed(6)),
          riskStateHalfLifeSeconds:
            context.riskAdjustment.riskStateHalfLifeSeconds,
          weightMultiplier: Number(
            Math.min(1, Math.max(0, weightMultiplier)).toFixed(6),
          ),
          basePrizeWeightTotal,
          adjustedPrizeWeightTotal,
        }
      : null,
  };
};

const selectWeightedGacha = (
  context: PrizeEngineSelectionContext,
): PrizeEngineSelectionResult => {
  const weightedCandidates = buildCandidates(context, {
    includeMiss: true,
    requirePositiveWeight: true,
  });
  const totalWeight = weightedCandidates.reduce(
    (sum, item) => sum + item.weight,
    0,
  );
  const pickSeed =
    totalWeight > 0
      ? deriveRandomPick(
          totalWeight,
          context.fairnessSeed,
          context.fairnessNonce,
        )
      : null;
  const selection =
    totalWeight > 0 && pickSeed
      ? pickByWeight(weightedCandidates, () => pickSeed.pick)
      : null;

  return {
    selection: selection?.item ?? null,
    fairness: {
      strategy: "weighted_gacha",
      rngDigest: pickSeed?.digest ?? null,
      totalWeight: totalWeight > 0 ? totalWeight : null,
      randomPick: pickSeed?.pick ?? null,
      selectedArmId: selection?.item.id ?? null,
      selectedArmKind: selection?.item.kind ?? null,
      algorithm: "sha256(seed:nonce:totalWeight)%totalWeight+1",
    },
  };
};

const resolveEpsilon = (params: ProjectStrategyParams) => {
  const parsed = toFiniteNumber(params.epsilon);
  if (parsed === null || parsed < 0 || parsed > 1) {
    return DEFAULT_EPSILON_GREEDY_EPSILON;
  }

  return parsed;
};

const selectEpsilonGreedy = (
  context: PrizeEngineSelectionContext,
): PrizeEngineSelectionResult => {
  const epsilon = resolveEpsilon(context.strategyParams);
  const candidates = buildCandidates(context, {
    includeMiss: true,
    requirePositiveWeight: false,
  });

  if (candidates.length === 0) {
    return {
      selection: null,
      fairness: {
        strategy: "epsilon_greedy",
        rngDigest: null,
        totalWeight: null,
        randomPick: null,
        epsilon,
        decision: null,
        selectionDigest: null,
        candidateCount: 0,
        selectedArmId: null,
        selectedArmKind: null,
        algorithm:
          "epsilon-greedy(explore=uniform, exploit=highest_empirical_mean_reward)",
      },
    };
  }

  const decisionRng = deriveUniformValue(
    context.fairnessSeed,
    context.fairnessNonce,
    "epsilon-decision",
  );
  const shouldExplore = decisionRng.value < epsilon;
  const ranked = [...candidates].sort(compareCandidates);

  let selectionCandidate: PrizeEngineSelectionCandidate | null =
    ranked[0] ?? null;
  let selectionDigest: string | null = null;

  if (shouldExplore) {
    const selectionRng = deriveUniformValue(
      context.fairnessSeed,
      context.fairnessNonce,
      "epsilon-selection",
    );
    selectionDigest = selectionRng.digest;
    const selectedIndex = Math.min(
      Math.floor(selectionRng.value * candidates.length),
      candidates.length - 1,
    );
    selectionCandidate = candidates[selectedIndex] ?? null;
  }

  return {
    selection: selectionCandidate,
    fairness: {
      strategy: "epsilon_greedy",
      rngDigest: decisionRng.digest,
      totalWeight: null,
      randomPick: null,
      epsilon,
      decision: shouldExplore ? "explore" : "exploit",
      selectionDigest,
      candidateCount: candidates.length,
      selectedArmId: selectionCandidate?.id ?? null,
      selectedArmKind: selectionCandidate?.kind ?? null,
      algorithm:
        "epsilon-greedy(explore=uniform, exploit=highest_empirical_mean_reward)",
    },
  };
};

export const selectReward = (
  context: PrizeEngineSelectionContext,
): PrizeEngineSelectionResult => {
  const riskAdjusted = applyRiskAdjustment(context);

  let result: PrizeEngineSelectionResult;
  switch (riskAdjusted.context.strategy) {
    case "weighted_gacha":
      result = selectWeightedGacha(riskAdjusted.context);
      break;
    case "epsilon_greedy":
      result = selectEpsilonGreedy(riskAdjusted.context);
      break;
    case "softmax":
    case "thompson":
      throw badRequestError(
        `Project strategy "${riskAdjusted.context.strategy}" is not implemented yet.`,
        {
          code: API_ERROR_CODES.INVALID_REQUEST,
        },
      );
  }

  return {
    ...result,
    fairness: {
      ...result.fairness,
      ...(riskAdjusted.riskMetadata ? { risk: riskAdjusted.riskMetadata } : {}),
    },
  };
};
