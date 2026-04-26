import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../system/service', () => ({
  getPoolBalance: vi.fn(),
}));

vi.mock('./pool-cache', () => ({
  getProbabilityPool: vi.fn(),
}));

import { getPoolBalance } from '../system/service';
import { getProbabilityPool } from './pool-cache';
import { prepareDrawSelection } from './selection';

const mockedGetPoolBalance = vi.mocked(getPoolBalance);
const mockedGetProbabilityPool = vi.mocked(getProbabilityPool);

const makePrize = (overrides: Partial<Awaited<ReturnType<typeof getProbabilityPool>>[number]> = {}) => ({
  id: 1,
  weight: 10,
  rewardAmount: '1.00',
  poolThreshold: '0.00',
  userPoolThreshold: '0.00',
  ...overrides,
});

const makeParams = () => ({
  tx: {} as never,
  drawState: {
    drawCost: new Decimal(10),
    userPoolAfterDebit: new Decimal(20),
    pityStreakBefore: 0,
  },
  poolSystem: {
    minReserve: new Decimal(0),
    maxPayoutRatio: new Decimal(0),
    noiseEnabled: false,
    noiseRange: { min: 0, max: 0 },
    epochSeconds: new Decimal(3600),
  },
  probabilityControl: {
    weightJitterEnabled: false,
    weightJitterRange: { min: 0, max: 0 },
    probabilityScale: new Decimal(1),
    jackpotProbabilityBoost: new Decimal(0),
    pityEnabled: false,
    pityThreshold: new Decimal(0),
    pityBoostPct: new Decimal(0),
    pityMaxBoostPct: new Decimal(0),
  },
  randomization: {
    weightJitterEnabled: false,
    weightJitterPct: new Decimal(0),
  },
  fairnessSeed: {
    epoch: 1,
    epochSeconds: 3600,
    commitHash: 'commit-hash',
    seed: 'seed-value',
  },
  clientNonce: 'client-nonce',
});

describe('prepareDrawSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPoolBalance.mockResolvedValue(new Decimal(100));
  });

  it('applies probability scaling and jackpot boost to the highest reward prize', async () => {
    mockedGetProbabilityPool.mockResolvedValue([
      makePrize({ id: 1, weight: 10, rewardAmount: '1.00' }),
      makePrize({ id: 2, weight: 10, rewardAmount: '10.00' }),
    ]);

    const result = await prepareDrawSelection({
      ...makeParams(),
      probabilityControl: {
        ...makeParams().probabilityControl,
        probabilityScale: new Decimal(0.5),
        jackpotProbabilityBoost: new Decimal(50),
      },
    });

    expect(result.normalizedScale).toBe(0.5);
    expect(result.jackpotBoostPct).toBe(0.5);
    expect(result.jitteredEligible.map(({ id, weight }) => ({ id, weight }))).toEqual([
      { id: 1, weight: 5 },
      { id: 2, weight: 8 },
    ]);
    expect(result.maxReward.eq(10)).toBe(true);
  });

  it('reduces miss weight when pity is active', async () => {
    mockedGetProbabilityPool.mockResolvedValue([
      makePrize({ id: 7, weight: 100, rewardAmount: '5.00' }),
    ]);

    const result = await prepareDrawSelection({
      ...makeParams(),
      drawState: {
        drawCost: new Decimal(10),
        userPoolAfterDebit: new Decimal(20),
        pityStreakBefore: 3,
      },
      poolSystem: {
        ...makeParams().poolSystem,
        maxPayoutRatio: new Decimal(0.2),
      },
      probabilityControl: {
        ...makeParams().probabilityControl,
        pityEnabled: true,
        pityThreshold: new Decimal(2),
        pityBoostPct: new Decimal(25),
        pityMaxBoostPct: new Decimal(40),
      },
    });

    expect(result.targetExpectedValue.eq(2)).toBe(true);
    expect(result.missWeightBase).toBe(150);
    expect(result.pityBoostApplied).toBe(0.4);
    expect(result.missWeight).toBe(90);
    expect(result.selection?.totalWeight).toBe(190);
    expect(result.expectedValueWithMiss.eq(new Decimal(500).div(190))).toBe(true);
  });

  it('falls back to randomization jitter when probability jitter is disabled', async () => {
    mockedGetProbabilityPool.mockResolvedValue([
      makePrize({ id: 1, weight: 100 }),
      makePrize({ id: 2, weight: 80 }),
    ]);

    const params = {
      ...makeParams(),
      randomization: {
        weightJitterEnabled: true,
        weightJitterPct: new Decimal(20),
      },
    };

    const first = await prepareDrawSelection(params);
    const second = await prepareDrawSelection(params);

    expect(first.jitterEnabled).toBe(true);
    expect(first.jitterMin).toBe(-0.2);
    expect(first.jitterMax).toBe(0.2);
    expect(first.jitterMeta).toEqual(second.jitterMeta);
    expect(first.jitterMeta.every((item) => item.jitterDeltaPct >= -0.2)).toBe(true);
    expect(first.jitterMeta.every((item) => item.jitterDeltaPct <= 0.2)).toBe(true);
  });
});
