import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPoolBalance, getProbabilityPool } = vi.hoisted(() => ({
  getPoolBalance: vi.fn(async () => new Decimal(50)),
  getProbabilityPool: vi.fn(async () => [
    {
      id: 1,
      weight: 100,
      rewardAmount: '1.00',
      poolThreshold: '0',
      userPoolThreshold: '0',
    },
  ]),
}));

vi.mock('../system/service', () => ({
  getPoolBalance,
}));

vi.mock('./pool-cache', () => ({
  getProbabilityPool,
}));

import { prepareDrawSelection } from './selection';

type MarkovState = {
  pityStreakBefore: number;
  missWeight: number;
  winProbability: number;
};

const makeParams = (
  pityStreakBefore: number
): Parameters<typeof prepareDrawSelection>[0] => ({
  tx: {} as never,
  drawState: {
    drawCost: new Decimal(10),
    userPoolAfterDebit: new Decimal(10),
    pityStreakBefore,
  },
  poolSystem: {
    minReserve: new Decimal(0),
    maxPayoutRatio: new Decimal(0.05),
    noiseEnabled: false,
    noiseRange: { min: 0, max: 0 },
    epochSeconds: new Decimal(3600),
  },
  probabilityControl: {
    weightJitterEnabled: false,
    weightJitterRange: { min: 0, max: 0 },
    probabilityScale: new Decimal(1),
    jackpotProbabilityBoost: new Decimal(0),
    pityEnabled: true,
    pityThreshold: new Decimal(2),
    pityBoostPct: new Decimal(25),
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
  clientNonce: `markov-${pityStreakBefore}`,
});

const loadState = async (pityStreakBefore: number): Promise<MarkovState> => {
  const selectionState = await prepareDrawSelection(makeParams(pityStreakBefore));
  const prizeWeight = selectionState.jitteredEligible.reduce(
    (sum, item) => sum + item.weight,
    0
  );
  const totalWeight = prizeWeight + selectionState.missWeight;

  return {
    pityStreakBefore,
    missWeight: selectionState.missWeight,
    winProbability: totalWeight > 0 ? prizeWeight / totalWeight : 0,
  };
};

const buildTransitionMatrix = (states: MarkovState[]) =>
  states.map((state, index) => {
    const row = new Array(states.length).fill(0);
    row[0] = state.winProbability;

    if (index < states.length - 1) {
      row[index + 1] = 1 - state.winProbability;
    } else {
      row[index] = 1 - state.winProbability;
    }

    return row;
  });

const multiplyVector = (vector: number[], matrix: number[][]) =>
  matrix[0].map((_, column) =>
    vector.reduce((sum, value, row) => sum + value * matrix[row][column], 0)
  );

const getStationaryDistribution = (matrix: number[][]) => {
  let distribution = new Array(matrix.length).fill(0);
  distribution[0] = 1;

  for (let step = 0; step < 10_000; step += 1) {
    const next = multiplyVector(distribution, matrix);
    const delta = next.reduce(
      (sum, value, index) => sum + Math.abs(value - distribution[index]),
      0
    );
    distribution = next;
    if (delta < 1e-12) {
      break;
    }
  }

  return distribution;
};

const createDeterministicRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const simulateChain = (matrix: number[][], steps: number) => {
  const random = createDeterministicRandom(0x5eed1234);
  const visits = new Array(matrix.length).fill(0);
  let currentState = 0;
  let wins = 0;

  for (let step = 0; step < steps; step += 1) {
    visits[currentState] += 1;

    const threshold = random();
    const row = matrix[currentState];
    let cumulative = 0;
    let nextState = row.length - 1;

    for (let index = 0; index < row.length; index += 1) {
      cumulative += row[index];
      if (threshold <= cumulative) {
        nextState = index;
        break;
      }
    }

    if (nextState === 0) {
      wins += 1;
    }

    currentState = nextState;
  }

  return {
    distribution: visits.map((count) => count / steps),
    winRate: wins / steps,
  };
};

describe('prepareDrawSelection Markov chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPoolBalance.mockResolvedValue(new Decimal(50));
    getProbabilityPool.mockResolvedValue([
      {
        id: 1,
        weight: 100,
        rewardAmount: '1.00',
        poolThreshold: '0',
        userPoolThreshold: '0',
      },
    ]);
  });

  it('builds a finite pity chain with a guaranteed win state', async () => {
    const states = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((pityStreakBefore) => loadState(pityStreakBefore))
    );

    expect(states.map((state) => state.missWeight)).toEqual([100, 100, 75, 50, 25, 0]);
    expect(states[0].winProbability).toBeCloseTo(0.5, 12);
    expect(states[2].winProbability).toBeCloseTo(100 / 175, 12);
    expect(states[3].winProbability).toBeCloseTo(100 / 150, 12);
    expect(states[4].winProbability).toBeCloseTo(0.8, 12);
    expect(states[5].winProbability).toBe(1);

    const matrix = buildTransitionMatrix(states);
    for (const row of matrix) {
      expect(row.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    }
    expect(matrix[5]).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('predicts a higher steady-state win rate than the no-pity baseline', async () => {
    const states = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((pityStreakBefore) => loadState(pityStreakBefore))
    );
    const matrix = buildTransitionMatrix(states);
    const stationary = getStationaryDistribution(matrix);
    const stationaryWinRate = stationary.reduce(
      (sum, probability, index) => sum + probability * states[index].winProbability,
      0
    );
    const simulation = simulateChain(matrix, 200_000);

    expect(states[0].winProbability).toBeCloseTo(0.5, 12);
    expect(stationaryWinRate).toBeGreaterThan(states[0].winProbability);
    expect(stationaryWinRate).toBeCloseTo(10 / 19, 12);
    expect(stationary.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(simulation.winRate).toBeCloseTo(stationaryWinRate, 2);

    for (let index = 0; index < stationary.length; index += 1) {
      expect(simulation.distribution[index]).toBeCloseTo(stationary[index], 2);
    }
  });
});
