import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  PrizeEngineRewardEnvelopeTrigger,
  SaasRewardEnvelopeWindow,
} from "@reward/shared-types/saas";

import { conflictError } from "../../shared/errors";

const DEFAULT_CONSTRAINT_WINDOW_SECONDS = 60 * 60;

type ConstraintScope = "group" | "agent";

type ConstraintKind = "draw" | "budget" | "variance";

type ConstraintNode = Record<string, unknown>;

export type PrizeEngineConstraintLimit = {
  maxDrawCount: number | null;
  maxRewardBudget: Decimal | null;
  maxPositiveVariance: Decimal | null;
};

export type PrizeEngineConstraintConfig = {
  evaluationWindowSeconds: number;
  group: PrizeEngineConstraintLimit;
  agent: PrizeEngineConstraintLimit;
};

export type PrizeEngineConstraintStats = {
  drawCount: number;
  distinctPlayerCount: number;
  rewardAmount: Decimal;
  expectedRewardAmount: Decimal;
  positiveVariance: Decimal;
  containsCurrentPlayer: boolean;
};

const toNode = (value: unknown): ConstraintNode | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ConstraintNode)
    : null;

const readValue = (node: ConstraintNode | null, keys: string[]) => {
  if (!node) {
    return undefined;
  }

  for (const key of keys) {
    if (key in node) {
      return node[key];
    }
  }

  return undefined;
};

const readPositiveInt = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
  }

  return null;
};

const readPositiveDecimal = (value: unknown) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    return null;
  }

  try {
    const normalized = new Decimal(value as Decimal.Value);
    return normalized.gt(0) ? normalized : null;
  } catch {
    return null;
  }
};

const resolveLimit = (value: unknown): PrizeEngineConstraintLimit => {
  const node = toNode(value);

  return {
    maxDrawCount: readPositiveInt(
      readValue(node, ["maxDrawCount", "max_draw_count"]),
    ),
    maxRewardBudget: readPositiveDecimal(
      readValue(node, ["maxRewardBudget", "max_reward_budget"]),
    ),
    maxPositiveVariance: readPositiveDecimal(
      readValue(node, ["maxPositiveVariance", "max_positive_variance"]),
    ),
  };
};

const resolveScopedRiskEnvelopeLimit = (
  value: unknown,
): PrizeEngineConstraintLimit => {
  const node = toNode(value);

  return {
    maxDrawCount: readPositiveInt(
      readValue(node, ["maxDrawCount", "max_draw_count"]),
    ),
    maxRewardBudget: readPositiveDecimal(
      readValue(node, [
        "dailyBudgetCap",
        "daily_budget_cap",
        "maxRewardBudget",
        "max_reward_budget",
      ]),
    ),
    maxPositiveVariance: readPositiveDecimal(
      readValue(node, [
        "varianceCap",
        "variance_cap",
        "maxPositiveVariance",
        "max_positive_variance",
      ]),
    ),
  };
};

const mergeLimitValue = <T>(
  base: T | null,
  overlay: T | null,
  resolve: (left: T, right: T) => T,
) => {
  if (base === null) {
    return overlay;
  }

  if (overlay === null) {
    return base;
  }

  return resolve(base, overlay);
};

const mergeLimit = (
  base: PrizeEngineConstraintLimit,
  overlay: PrizeEngineConstraintLimit,
): PrizeEngineConstraintLimit => ({
  maxDrawCount: mergeLimitValue(
    base.maxDrawCount,
    overlay.maxDrawCount,
    Math.min,
  ),
  maxRewardBudget: mergeLimitValue(
    base.maxRewardBudget,
    overlay.maxRewardBudget,
    Decimal.min,
  ),
  maxPositiveVariance: mergeLimitValue(
    base.maxPositiveVariance,
    overlay.maxPositiveVariance,
    Decimal.min,
  ),
});

export const resolvePrizeEngineGroupId = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const resolvePrizeEngineConstraintConfig = (
  metadata: unknown,
): PrizeEngineConstraintConfig => {
  const root = toNode(metadata);
  const configNode = toNode(
    readValue(root, ["prizeEngineConstraints", "prize_engine_constraints"]),
  );

  return {
    evaluationWindowSeconds:
      readPositiveInt(
        readValue(configNode, [
          "evaluationWindowSeconds",
          "evaluation_window_seconds",
        ]),
      ) ?? DEFAULT_CONSTRAINT_WINDOW_SECONDS,
    group: resolveLimit(readValue(configNode, ["group"])),
    agent: resolveLimit(readValue(configNode, ["agent"])),
  };
};

export const applyPrizeEngineRiskEnvelope = (
  config: PrizeEngineConstraintConfig,
  riskEnvelope: unknown,
): PrizeEngineConstraintConfig => {
  const node = toNode(riskEnvelope);
  const groupLimit = resolveScopedRiskEnvelopeLimit(readValue(node, ["group"]));
  const agentLimit = resolveScopedRiskEnvelopeLimit(readValue(node, ["agent"]));

  if (
    !hasPrizeEngineConstraintLimit(groupLimit) &&
    !hasPrizeEngineConstraintLimit(agentLimit)
  ) {
    return config;
  }

  return {
    ...config,
    group: mergeLimit(config.group, groupLimit),
    agent: mergeLimit(config.agent, agentLimit),
  };
};

export const hasPrizeEngineConstraintLimit = (
  limit: PrizeEngineConstraintLimit,
) =>
  limit.maxDrawCount !== null ||
  limit.maxRewardBudget !== null ||
  limit.maxPositiveVariance !== null;

export const computePositiveVariance = (
  rewardAmount: Decimal,
  expectedRewardAmount: Decimal,
) => Decimal.max(rewardAmount.minus(expectedRewardAmount), 0);

export const resolvePrizeEngineConstraintWindow = (
  windowSeconds: number,
): SaasRewardEnvelopeWindow => {
  if (windowSeconds <= 60) {
    return "minute";
  }

  if (windowSeconds <= 60 * 60) {
    return "hour";
  }

  return "day";
};

export const buildPrizeEngineEnvelopeTrigger = (params: {
  scope: "group" | "agent";
  windowSeconds: number;
  reason: "budget_cap" | "variance_cap" | "anti_exploit";
}): PrizeEngineRewardEnvelopeTrigger => ({
  scope: params.scope,
  window: resolvePrizeEngineConstraintWindow(params.windowSeconds),
  reason: params.reason,
  strategy: "mute",
});

const buildConstraintCode = (
  scope: ConstraintScope,
  kind: ConstraintKind,
) => {
  if (scope === "group") {
    if (kind === "draw") {
      return API_ERROR_CODES.PROJECT_GROUP_DRAW_LIMIT_REACHED;
    }
    if (kind === "budget") {
      return API_ERROR_CODES.PROJECT_GROUP_BUDGET_EXHAUSTED;
    }
    return API_ERROR_CODES.PROJECT_GROUP_VARIANCE_LIMIT_REACHED;
  }

  if (kind === "draw") {
    return API_ERROR_CODES.PROJECT_PLAYER_DRAW_LIMIT_REACHED;
  }
  if (kind === "budget") {
    return API_ERROR_CODES.PROJECT_PLAYER_BUDGET_EXHAUSTED;
  }
  return API_ERROR_CODES.PROJECT_PLAYER_VARIANCE_LIMIT_REACHED;
};

const buildConstraintMessage = (
  scope: ConstraintScope,
  kind: ConstraintKind,
) => {
  const subject = scope === "group" ? "Agent group" : "Agent";
  if (kind === "draw") {
    return `${subject} draw limit reached for the active constraint window.`;
  }
  if (kind === "budget") {
    return `${subject} reward budget exhausted for the active constraint window.`;
  }
  return `${subject} positive variance limit reached for the active constraint window.`;
};

export const assertPrizeEngineConstraint = (params: {
  scope: ConstraintScope;
  scopeId: string;
  windowSeconds: number;
  limit: PrizeEngineConstraintLimit;
  stats: PrizeEngineConstraintStats;
}) => {
  const { scope, scopeId, windowSeconds, limit, stats } = params;

  if (
    limit.maxDrawCount !== null &&
    stats.drawCount + 1 > limit.maxDrawCount
  ) {
    throw conflictError(buildConstraintMessage(scope, "draw"), {
      code: buildConstraintCode(scope, "draw"),
      details: [
        `scopeId=${scopeId}`,
        `windowSeconds=${windowSeconds}`,
        `drawCount=${stats.drawCount}`,
        `maxDrawCount=${limit.maxDrawCount}`,
      ],
    });
  }

  if (
    limit.maxRewardBudget !== null &&
    stats.rewardAmount.gte(limit.maxRewardBudget)
  ) {
    throw conflictError(buildConstraintMessage(scope, "budget"), {
      code: buildConstraintCode(scope, "budget"),
      details: [
        `scopeId=${scopeId}`,
        `windowSeconds=${windowSeconds}`,
        `rewardAmount=${stats.rewardAmount.toFixed(2)}`,
        `maxRewardBudget=${limit.maxRewardBudget.toFixed(2)}`,
      ],
    });
  }

  if (
    limit.maxPositiveVariance !== null &&
    stats.positiveVariance.gte(limit.maxPositiveVariance)
  ) {
    throw conflictError(buildConstraintMessage(scope, "variance"), {
      code: buildConstraintCode(scope, "variance"),
      details: [
        `scopeId=${scopeId}`,
        `windowSeconds=${windowSeconds}`,
        `positiveVariance=${stats.positiveVariance.toFixed(4)}`,
        `maxPositiveVariance=${limit.maxPositiveVariance.toFixed(4)}`,
      ],
    });
  }
};
