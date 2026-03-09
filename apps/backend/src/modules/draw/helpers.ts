import Decimal from 'decimal.js';
import { createHash, randomInt } from 'node:crypto';

import { toDecimal } from '../../shared/money';
import type { BudgetEvaluation, BudgetSource, WeightedPick } from './types';

const toDate = (value: Date | string | null | undefined, fallback: Date) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed;
};

export const evaluateBudget = (
  prize: BudgetSource,
  now: Date
): BudgetEvaluation => {
  const budget = toDecimal(prize.payoutBudget ?? 0);
  const rewardAmount = toDecimal(prize.rewardAmount ?? 0);
  const periodDays = Math.max(1, Number(prize.payoutPeriodDays ?? 1));

  if (budget.lte(0)) {
    return {
      available: true,
      shouldReset: false,
      budget,
      spent: toDecimal(prize.payoutSpent ?? 0),
      remaining: budget,
      periodDays,
    };
  }

  const periodStart = toDate(prize.payoutPeriodStartedAt, now);
  const periodMs = periodDays * 24 * 60 * 60 * 1000;
  const expired = now.getTime() - periodStart.getTime() >= periodMs;
  const spent = expired ? toDecimal(0) : toDecimal(prize.payoutSpent ?? 0);
  const remaining = budget.minus(spent);
  const available = remaining.gte(rewardAmount);

  return {
    available,
    shouldReset: expired,
    budget,
    spent,
    remaining,
    periodDays,
  };
};

const randomFloat = (min: number, max: number) => {
  if (max <= min) return min;
  const scale = 1_000_000;
  const fraction = randomInt(0, scale + 1) / scale;
  return min + (max - min) * fraction;
};

const seededFloat = (
  seed: string,
  nonce: string,
  salt: string | number,
  min: number,
  max: number
) => {
  if (max <= min) return min;
  const payload = `${seed}:${nonce}:${salt}`;
  const hash = createHash('sha256').update(payload).digest();
  const raw = hash.readUInt32BE(0);
  const fraction = raw / 0xffffffff;
  return min + (max - min) * fraction;
};

export const normalizePct = (value: Decimal.Value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return num > 1 ? num / 100 : num;
};

export const applyPoolNoise = (
  poolBalance: Decimal,
  config: {
    noiseEnabled: boolean;
    noiseRange: { min: number; max: number };
    epochSeconds?: number;
  }
) => {
  if (!config.noiseEnabled) {
    return { effective: poolBalance, noiseApplied: 0 };
  }
  const min = config.noiseRange.min ?? 0;
  const max = config.noiseRange.max ?? 0;
  if (min === 0 && max === 0) {
    return { effective: poolBalance, noiseApplied: 0 };
  }
  let delta = randomFloat(min, max);
  if (config.epochSeconds && config.epochSeconds > 0) {
    const epoch = Math.floor(Date.now() / (config.epochSeconds * 1000));
    const hash = createHash('sha256').update(String(epoch)).digest();
    const raw = hash.readUInt32BE(0);
    const fraction = raw / 0xffffffff;
    delta = min + (max - min) * fraction;
  }
  const effective = Decimal.max(poolBalance.plus(delta), 0);
  return { effective, noiseApplied: delta };
};

export const deriveRandomPick = (
  totalWeight: number,
  seed: string,
  clientNonce: string
) => {
  const payload = `${seed}:${clientNonce}:${totalWeight}`;
  const hash = createHash('sha256').update(payload).digest();
  const value = hash.readUInt32BE(0);
  const pick = (value % totalWeight) + 1;
  return { pick, digest: hash.toString('hex') };
};

export const applyWeightJitter = <T extends { id: number; weight: number }>(
  items: T[],
  config: {
    enabled: boolean;
    min: number;
    max: number;
    seed?: string;
    nonce?: string;
  }
) => {
  if (!config.enabled || (config.min === 0 && config.max === 0)) {
    return {
      items,
      jitterMeta: items.map((item) => ({
        id: item.id,
        baseWeight: item.weight,
        jitteredWeight: item.weight,
        jitterDeltaPct: 0,
      })),
    };
  }

  const jitteredItems = items.map((item) => {
    const delta =
      config.seed && config.nonce
        ? seededFloat(config.seed, config.nonce, item.id, config.min, config.max)
        : randomFloat(config.min, config.max);
    const jitteredWeight = Math.max(1, Math.round(item.weight * (1 + delta)));
    return {
      ...item,
      weight: jitteredWeight,
      __jitterDeltaPct: delta,
      __baseWeight: item.weight,
    };
  });

  return {
    items: jitteredItems.map((item) => {
      const {
        __jitterDeltaPct,
        __baseWeight,
        ...rest
      } = item;
      void __jitterDeltaPct;
      void __baseWeight;
      return rest;
    }),
    jitterMeta: jitteredItems.map((item) => ({
      id: item.id,
      baseWeight: item.__baseWeight,
      jitteredWeight: item.weight,
      jitterDeltaPct: item.__jitterDeltaPct,
    })),
  };
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
