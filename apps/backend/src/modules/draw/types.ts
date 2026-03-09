import Decimal from 'decimal.js';
import { z } from 'zod';
import type {
  getDrawSystemConfig,
  getEconomyConfig,
  getPayoutControlConfig,
  getPoolSystemConfig,
  getProbabilityControlConfig,
  getRandomizationConfig,
} from '../system/service';
import type { ensureFairnessSeed } from '../fairness/service';

export type WeightedPick<T> = {
  item: T;
  randomPick: number;
  totalWeight: number;
};

export type PrizeCandidate = {
  id: number;
  weight: number;
  rewardAmount: string | number;
  poolThreshold: string | number;
  userPoolThreshold: string | number;
};

export type BudgetEvaluation = {
  available: boolean;
  shouldReset: boolean;
  budget: Decimal;
  spent: Decimal;
  remaining: Decimal;
  periodDays: number;
};

export type BudgetSource = {
  rewardAmount: string | number;
  payoutBudget: string | number;
  payoutSpent: string | number;
  payoutPeriodDays: number;
  payoutPeriodStartedAt: Date | string | null;
};

export type DrawOptions = {
  clientNonce?: string | null;
};

export type DrawConfigBundle = {
  drawSystem: Awaited<ReturnType<typeof getDrawSystemConfig>>;
  economy: Awaited<ReturnType<typeof getEconomyConfig>>;
  poolSystem: Awaited<ReturnType<typeof getPoolSystemConfig>>;
  payoutControl: Awaited<ReturnType<typeof getPayoutControlConfig>>;
  probabilityControl: Awaited<ReturnType<typeof getProbabilityControlConfig>>;
  randomization: Awaited<ReturnType<typeof getRandomizationConfig>>;
};

export type DebitedDrawState = {
  drawCostBase: Decimal;
  drawCost: Decimal;
  drawCostClamped: boolean;
  walletAfterDebit: Decimal;
  userPoolBefore: Decimal;
  userPoolAfterDebit: Decimal;
  bonusBefore: Decimal;
  wageredAfter: Decimal;
  pityStreakBefore: number;
};

export type FairnessSeed = Awaited<ReturnType<typeof ensureFairnessSeed>>;

export type MissCandidate = {
  id: -1;
  weight: number;
  __isMiss: true;
};

export type DrawStatus =
  | 'miss'
  | 'won'
  | 'out_of_stock'
  | 'budget_exhausted'
  | 'payout_limited';

export type JitterMeta = {
  id: number;
  baseWeight: number;
  jitteredWeight: number;
  jitterDeltaPct: number;
};

export type PreparedDrawSelection = {
  poolBalance: Decimal;
  poolNoise: { effective: Decimal; noiseApplied: number };
  effectivePoolBalance: Decimal;
  jitteredEligible: PrizeCandidate[];
  jitterMeta: JitterMeta[];
  normalizedScale: number;
  jackpotBoostPct: number;
  jitterEnabled: boolean;
  jitterMin: number;
  jitterMax: number;
  expectedPayout: Decimal;
  expectedValueBase: Decimal;
  expectedValueWithMiss: Decimal;
  targetExpectedValue: Decimal;
  missWeightBase: number;
  missWeight: number;
  pityBoostApplied: number;
  maxReward: Decimal;
  selection: WeightedPick<PrizeCandidate | MissCandidate> | null;
  rngDigest: string | null;
};

export type ResolvedDrawOutcome = {
  status: DrawStatus;
  rewardAmount: Decimal;
  prizeId: number | null;
  bonusAfterReward: Decimal;
  payoutLimitReason: string | null;
};

export const DrawUserRowSchema = z.object({
  id: z.number().int().positive(),
  user_pool_balance: z.union([z.string(), z.number()]),
  pity_streak: z.number().int(),
  last_draw_at: z.union([z.string(), z.date()]).nullable(),
  last_win_at: z.union([z.string(), z.date()]).nullable(),
  withdrawable_balance: z.union([z.string(), z.number()]),
  bonus_balance: z.union([z.string(), z.number()]),
  wagered_amount: z.union([z.string(), z.number()]),
});

export type DrawUserRow = z.infer<typeof DrawUserRowSchema>;

export const LockedPrizeRowSchema = z.object({
  id: z.number().int().positive(),
  stock: z.number().int(),
  reward_amount: z.union([z.string(), z.number()]),
  is_active: z.boolean(),
  pool_threshold: z.union([z.string(), z.number()]),
  user_pool_threshold: z.union([z.string(), z.number()]),
  payout_budget: z.union([z.string(), z.number()]),
  payout_spent: z.union([z.string(), z.number()]),
  payout_period_days: z.number().int(),
  payout_period_started_at: z.union([z.string(), z.date()]).nullable(),
});

export type LockedPrizeRow = z.infer<typeof LockedPrizeRowSchema>;

export type WinningPrizePlan = {
  lockedPrize: LockedPrizeRow;
  rewardAmount: Decimal;
  budgetEvaluation: BudgetEvaluation;
};

export type OutcomePolicyDecision =
  | {
      terminal: true;
      outcome: ResolvedDrawOutcome;
    }
  | {
      terminal: false;
      plan: WinningPrizePlan;
    };
