import { createHash } from "node:crypto";
import type { DrawPrizePresentation } from "@reward/shared-types/draw";
import {
  saasProjectStrategyValues,
  type PrizeEngineApiKeyScope,
  type SaasBillingBudgetPolicy,
  type SaaSAgentControlMode,
  type SaasBillingDecisionPricing,
  type SaasProjectStrategy,
} from "@reward/shared-types/saas";
import { toDecimal, toMoneyString } from "../../shared/money";

const FEATURED_PRIZE_COUNT = 4;
export const DEFAULT_FAIRNESS_EPOCH_SECONDS = 3600;
export const DEFAULT_PROJECT_API_RATE_LIMIT_BURST = 120;
export const DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY = 3600;
export const DEFAULT_PROJECT_API_RATE_LIMIT_DAILY = 86400;
export const DEFAULT_PROJECT_SELECTION_STRATEGY: SaasProjectStrategy =
  "weighted_gacha";
export const DEFAULT_PROJECT_RISK_WEIGHT_DECAY_ALPHA = 0;
export const DEFAULT_PROJECT_RISK_STATE_HALF_LIFE_SECONDS = 6 * 60 * 60;
export const PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS = 60 * 1000;
export const PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS = 60 * 60 * 1000;
export const PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PRIZE_ENGINE_REWARD_WRITE_SCOPE: PrizeEngineApiKeyScope =
  "reward:write";
export const PRIZE_ENGINE_LEGACY_DRAW_WRITE_SCOPE: PrizeEngineApiKeyScope =
  "draw:write";
export const PRIZE_ENGINE_WRITE_SCOPE_ALIASES: PrizeEngineApiKeyScope[] = [
  PRIZE_ENGINE_REWARD_WRITE_SCOPE,
  PRIZE_ENGINE_LEGACY_DRAW_WRITE_SCOPE,
];

export const DEFAULT_API_KEY_SCOPES: PrizeEngineApiKeyScope[] = [
  "catalog:read",
  "fairness:read",
  PRIZE_ENGINE_REWARD_WRITE_SCOPE,
  "ledger:read",
];

const PROJECT_SELECTION_STRATEGIES = new Set(saasProjectStrategyValues);

export type ProjectStrategyParams = Record<string, unknown>;

export type ProjectAgentPolicy = {
  agentId: string;
  mode: SaaSAgentControlMode;
  reason: string;
  budgetMultiplier: number | null;
};

export type ProjectApiAuth = {
  tenantId: number;
  tenantName: string;
  tenantMetadata: Record<string, unknown> | null;
  projectId: number;
  projectSlug: string;
  projectName: string;
  projectMetadata: Record<string, unknown> | null;
  environment: "sandbox" | "live";
  currency: string;
  apiKeyId: number;
  scopes: PrizeEngineApiKeyScope[];
  drawFee: string;
  baseMonthlyFee: string;
  decisionPricing: SaasBillingDecisionPricing;
  billingBudgetPolicy: SaasBillingBudgetPolicy;
  billingCurrency: string;
  apiRateLimitBurst: number;
  apiRateLimitHourly: number;
  apiRateLimitDaily: number;
  agentId: string | null;
  agentPolicy: ProjectAgentPolicy | null;
};

export type LockedProjectRow = {
  id: number;
  tenantId: number;
  slug: string;
  name: string;
  environment: "sandbox" | "live";
  status: "active" | "suspended" | "archived";
  currency: string;
  drawCost: string;
  prizePoolBalance: string;
  strategy: SaasProjectStrategy;
  strategyParams: ProjectStrategyParams;
  fairnessEpochSeconds: number;
  maxDrawCount: number;
  missWeight: number;
  apiRateLimitBurst: number;
  apiRateLimitHourly: number;
  apiRateLimitDaily: number;
  metadata: Record<string, unknown> | null;
};

export type LockedPlayerRow = {
  id: number;
  projectId: number;
  externalPlayerId: string;
  displayName: string | null;
  balance: string;
  pityStreak: number;
  metadata: Record<string, unknown> | null;
};

export type LockedAgentRow = {
  id: number;
  projectId: number;
  agentId: string;
  groupId: string | null;
  ownerMetadata: Record<string, unknown> | null;
  fingerprint: string | null;
  status: "active" | "suspended" | "archived";
  createdAt: Date;
};

export type LockedPrizeRow = {
  id: number;
  projectId: number;
  name: string;
  stock: number;
  weight: number;
  rewardAmount: string;
  isActive: boolean;
  deletedAt: Date | null;
  metadata: Record<string, unknown> | null;
};

export type FairnessSeedRow = {
  epoch: number;
  epochSeconds: number;
  commitHash: string;
  seed: string;
};

type PublicPrizeRow = {
  id: number;
  name: string;
  stock: number;
  weight: number;
  rewardAmount: string;
};

export const hashValue = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const currentEpoch = (epochSeconds: number) =>
  Math.floor(Date.now() / (epochSeconds * 1000));

export const resolveEpochSeconds = (value: number | null | undefined) => {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_FAIRNESS_EPOCH_SECONDS;
};

export const resolveProjectSelectionStrategy = (
  value: unknown,
): SaasProjectStrategy =>
  typeof value === "string" &&
  PROJECT_SELECTION_STRATEGIES.has(value as SaasProjectStrategy)
    ? (value as SaasProjectStrategy)
    : DEFAULT_PROJECT_SELECTION_STRATEGY;

export const normalizeProjectStrategyParams = (
  value: unknown,
): ProjectStrategyParams => {
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeProjectStrategyParams(parsed);
    } catch {
      return {};
    }
  }

  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (Object.fromEntries(Object.entries(value)) as ProjectStrategyParams)
    : {};
};

const resolveStrategyNumber = (
  params: ProjectStrategyParams,
  keys: string[],
) => {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

export const resolveProjectRiskWeightDecayAlpha = (
  params: ProjectStrategyParams,
) => {
  const parsed = resolveStrategyNumber(params, [
    "riskWeightDecayAlpha",
    "riskDecayAlpha",
  ]);

  return parsed !== null && parsed >= 0
    ? parsed
    : DEFAULT_PROJECT_RISK_WEIGHT_DECAY_ALPHA;
};

export const resolveProjectRiskStateHalfLifeSeconds = (
  params: ProjectStrategyParams,
) => {
  const parsed = resolveStrategyNumber(params, [
    "riskStateHalfLifeSeconds",
    "riskDecayHalfLifeSeconds",
    "riskHalfLifeSeconds",
  ]);
  const normalized = Math.floor(parsed ?? 0);

  return Number.isFinite(normalized) && normalized > 0
    ? normalized
    : DEFAULT_PROJECT_RISK_STATE_HALF_LIFE_SECONDS;
};

const resolvePositiveRateLimit = (
  value: number | null | undefined,
  fallback: number,
) => {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const resolveProjectApiRateLimit = (value: {
  apiRateLimitBurst?: number | null;
  apiRateLimitHourly?: number | null;
  apiRateLimitDaily?: number | null;
}) => ({
  apiRateLimitBurst: resolvePositiveRateLimit(
    value.apiRateLimitBurst,
    DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  ),
  apiRateLimitHourly: resolvePositiveRateLimit(
    value.apiRateLimitHourly,
    DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  ),
  apiRateLimitDaily: resolvePositiveRateLimit(
    value.apiRateLimitDaily,
    DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  ),
});

const rankPrizeRows = (rows: PublicPrizeRow[]) =>
  [...rows].sort((left, right) => {
    const rewardDiff = toDecimal(right.rewardAmount).cmp(
      toDecimal(left.rewardAmount),
    );
    if (rewardDiff !== 0) {
      return rewardDiff;
    }

    const weightDiff = Number(left.weight ?? 0) - Number(right.weight ?? 0);
    if (weightDiff !== 0) {
      return weightDiff;
    }

    return left.id - right.id;
  });

const resolveDisplayRarity = (index: number, total: number) => {
  if (index === 0) return "legendary" as const;
  const epicCutoff = Math.max(2, Math.ceil(total * 0.3));
  if (index < epicCutoff) return "epic" as const;
  const rareCutoff = Math.max(epicCutoff + 1, Math.ceil(total * 0.65));
  if (index < rareCutoff) return "rare" as const;
  return "common" as const;
};

export const buildPrizePresentations = (rows: PublicPrizeRow[]) => {
  const ranked = rankPrizeRows(rows);
  const featuredIds = new Set(
    ranked.slice(0, FEATURED_PRIZE_COUNT).map((row) => row.id),
  );

  return ranked.map((row, index): DrawPrizePresentation => {
    const stock = Math.max(0, Number(row.stock ?? 0));
    const stockState: DrawPrizePresentation["stockState"] =
      stock <= 0 ? "sold_out" : stock <= 3 ? "low" : "available";
    return {
      id: row.id,
      name: row.name,
      rewardAmount: toMoneyString(row.rewardAmount),
      displayRarity: resolveDisplayRarity(index, ranked.length),
      stock,
      stockState,
      isFeatured: featuredIds.has(row.id),
    };
  });
};
