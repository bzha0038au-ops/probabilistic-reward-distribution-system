import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTransaction } from '../../db';

vi.mock('./queries', () => ({
  loadLockedPrize: vi.fn(),
}));

import { loadLockedPrize } from './queries';
import { resolvePayoutPolicy } from './payout-policy';

const mockedLoadLockedPrize = vi.mocked(loadLockedPrize);

const makeTx = (rowsQueue: unknown[][] = []) =>
  ({
    select: vi.fn(() => ({
      from: () => ({
        where: () => {
          const rows = rowsQueue.shift() ?? [];
          return {
            limit: async () => rows,
            then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject),
          };
        },
      }),
    })),
  }) as unknown as DbTransaction;

const makeSelectionState = (overrides: Record<string, unknown> = {}) => ({
  poolBalance: new Decimal(20),
  poolNoise: { effective: new Decimal(20), noiseApplied: 0 },
  effectivePoolBalance: new Decimal(20),
  jitteredEligible: [],
  jitterMeta: [],
  normalizedScale: 1,
  jackpotBoostPct: 0,
  jitterEnabled: false,
  jitterMin: 0,
  jitterMax: 0,
  expectedPayout: new Decimal(5),
  expectedValueBase: new Decimal(5),
  expectedValueWithMiss: new Decimal(5),
  targetExpectedValue: new Decimal(0),
  missWeightBase: 0,
  missWeight: 0,
  pityBoostApplied: 0,
  maxReward: new Decimal(5),
  selection: {
    item: {
      id: 7,
      weight: 100,
      rewardAmount: '5.00',
      poolThreshold: '0.00',
      userPoolThreshold: '0.00',
    },
    randomPick: 1,
    totalWeight: 100,
  },
  rngDigest: 'digest',
  ...overrides,
});

const makeLockedPrize = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  stock: 1,
  reward_amount: '5.00',
  is_active: true,
  pool_threshold: '0.00',
  user_pool_threshold: '0.00',
  payout_budget: '0.00',
  payout_spent: '0.00',
  payout_period_days: 1,
  payout_period_started_at: null,
  ...overrides,
});

const makeParams = (overrides: Record<string, unknown> = {}) => ({
  tx: makeTx(),
  userId: 123,
  selectionState: makeSelectionState(),
  drawState: {
    drawCost: new Decimal(10),
    userPoolAfterDebit: new Decimal(10),
  },
  economy: {
    houseBankroll: new Decimal(0),
    marketingBudget: new Decimal(0),
    bonusExpireDays: new Decimal(0),
  },
  poolSystem: {
    minReserve: new Decimal(0),
    maxPayoutRatio: new Decimal(0),
    noiseEnabled: false,
    noiseRange: { min: 0, max: 0 },
    epochSeconds: new Decimal(3600),
  },
  payoutControl: {
    maxBigPerHour: new Decimal(1),
    maxBigPerDay: new Decimal(0),
    maxTotalPerHour: new Decimal(0),
    cooldownSeconds: new Decimal(0),
  },
  now: new Date('2026-03-10T12:00:00.000Z'),
  ...overrides,
});

describe('resolvePayoutPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns miss without loading prize data when the synthetic miss candidate is selected', async () => {
    const result = await resolvePayoutPolicy(
      makeParams({
        selectionState: makeSelectionState({
          selection: {
            item: { id: -1, weight: 80, __isMiss: true },
            randomPick: 50,
            totalWeight: 180,
          },
        }),
      })
    );

    expect(result.terminal).toBe(true);
    if (result.terminal) {
      expect(result.outcome.status).toBe('miss');
      expect(result.outcome.rewardAmount.eq(0)).toBe(true);
      expect(result.outcome.payoutLimitReason).toBeNull();
    }
    expect(mockedLoadLockedPrize).not.toHaveBeenCalled();
  });

  it('returns payout_limited with a cooldown reason when a recent win exists', async () => {
    mockedLoadLockedPrize.mockResolvedValue(makeLockedPrize());

    const result = await resolvePayoutPolicy(
      makeParams({
        tx: makeTx([[{ id: 99 }]]),
        payoutControl: {
          maxBigPerHour: new Decimal(1),
          maxBigPerDay: new Decimal(0),
          maxTotalPerHour: new Decimal(0),
          cooldownSeconds: new Decimal(60),
        },
      })
    );

    expect(result.terminal).toBe(true);
    if (result.terminal) {
      expect(result.outcome.status).toBe('payout_limited');
      expect(result.outcome.payoutLimitReason).toBe('payout_cooldown');
    }
  });

  it('returns payout_limited when big prize payouts are disabled', async () => {
    mockedLoadLockedPrize.mockResolvedValue(makeLockedPrize());

    const result = await resolvePayoutPolicy(
      makeParams({
        payoutControl: {
          maxBigPerHour: new Decimal(0),
          maxBigPerDay: new Decimal(0),
          maxTotalPerHour: new Decimal(0),
          cooldownSeconds: new Decimal(0),
        },
      })
    );

    expect(result.terminal).toBe(true);
    if (result.terminal) {
      expect(result.outcome.status).toBe('payout_limited');
      expect(result.outcome.payoutLimitReason).toBe('max_big_prize_disabled');
    }
  });

  it('returns a winning plan when the prize passes all payout guards', async () => {
    const lockedPrize = makeLockedPrize();
    mockedLoadLockedPrize.mockResolvedValue(lockedPrize);

    const result = await resolvePayoutPolicy(
      makeParams({
        selectionState: makeSelectionState({
          maxReward: new Decimal(10),
        }),
      })
    );

    expect(result.terminal).toBe(false);
    if (!result.terminal) {
      expect(result.plan.lockedPrize).toEqual(lockedPrize);
      expect(result.plan.rewardAmount.eq(5)).toBe(true);
      expect(result.plan.budgetEvaluation.available).toBe(true);
    }
  });
});
