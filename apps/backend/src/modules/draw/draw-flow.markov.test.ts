import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTransaction } from '../../db';
import type {
  DrawStatus,
  MissCandidate,
  PreparedDrawSelection,
  PrizeCandidate,
} from './types';

const { getPoolBalance, getProbabilityPool, loadLockedPrize } = vi.hoisted(() => ({
  getPoolBalance: vi.fn(),
  getProbabilityPool: vi.fn(),
  loadLockedPrize: vi.fn(),
}));

vi.mock('../system/service', () => ({
  getPoolBalance,
}));

vi.mock('./pool-cache', () => ({
  getProbabilityPool,
}));

vi.mock('./queries', () => ({
  loadLockedPrize,
}));

import { prepareDrawSelection } from './selection';
import { resolvePayoutPolicy } from './payout-policy';
import { updateUserDrawState } from './record';

const mockedGetPoolBalance = vi.mocked(getPoolBalance);
const mockedGetProbabilityPool = vi.mocked(getProbabilityPool);
const mockedLoadLockedPrize = vi.mocked(loadLockedPrize);

const COLLAPSED_HIGH_PITY_STATE = 5;
const ANALYTIC_STATES = [0, 1, 2, 3, 4, 5, 6];

type ChainStatus = DrawStatus | 'won';

type OutcomeProfile = Record<ChainStatus, number>;

type AnalyzedState = {
  pityStreakBefore: number;
  missWeight: number;
  totalWeight: number;
  transitions: number[];
  outcomes: OutcomeProfile;
};

const makePrize = (overrides: Partial<(Awaited<ReturnType<typeof getProbabilityPool>>)[number]> = {}) => ({
  id: 1,
  weight: 100,
  rewardAmount: '1.00',
  poolThreshold: '0.00',
  userPoolThreshold: '0.00',
  ...overrides,
});

const probabilityPool = [
  makePrize(),
  makePrize({ id: 2, weight: 25, rewardAmount: '5.00' }),
];

const lockedPrizeRows = new Map([
  [
    1,
    {
      id: 1,
      stock: 1,
      reward_amount: '1.00',
      is_active: true,
      pool_threshold: '0.00',
      user_pool_threshold: '0.00',
      payout_budget: '0.00',
      payout_spent: '0.00',
      payout_period_days: 1,
      payout_period_started_at: null,
    },
  ],
  [
    2,
    {
      id: 2,
      stock: 1,
      reward_amount: '5.00',
      is_active: true,
      pool_threshold: '0.00',
      user_pool_threshold: '0.00',
      payout_budget: '0.00',
      payout_spent: '0.00',
      payout_period_days: 1,
      payout_period_started_at: null,
    },
  ],
]);

const makeSelectionParams = (pityStreakBefore: number, clientNonce: string) => ({
  tx: {} as DbTransaction,
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
    seed: 'markov-seed',
  },
  clientNonce,
});

const makePolicyParams = (selectionState: PreparedDrawSelection) => ({
  tx: {} as DbTransaction,
  userId: 123,
  selectionState,
  drawState: {
    drawCost: new Decimal(10),
    bonusBefore: new Decimal(0),
    userPoolAfterDebit: new Decimal(10),
  },
  economy: {
    houseBankroll: new Decimal(0),
    marketingBudget: new Decimal(0),
    bonusExpireDays: new Decimal(0),
  },
  poolSystem: {
    minReserve: new Decimal(0),
    maxPayoutRatio: new Decimal(0.05),
    noiseEnabled: false,
    noiseRange: { min: 0, max: 0 },
    epochSeconds: new Decimal(3600),
  },
  payoutControl: {
    maxBigPerHour: new Decimal(10),
    maxBigPerDay: new Decimal(10),
    maxTotalPerHour: new Decimal(0),
    cooldownSeconds: new Decimal(0),
  },
  now: new Date('2026-03-10T12:00:00.000Z'),
});

const makeUpdateTx = () => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    tx: { update } as unknown as DbTransaction,
    where,
    set,
    update,
  };
};

const outcomeKeys: ChainStatus[] = [
  'won',
  'miss',
  'payout_limited',
  'out_of_stock',
  'budget_exhausted',
];

const createEmptyOutcomeProfile = (): OutcomeProfile => ({
  won: 0,
  miss: 0,
  payout_limited: 0,
  out_of_stock: 0,
  budget_exhausted: 0,
});

const collectCandidates = (
  selectionState: PreparedDrawSelection
): Array<PrizeCandidate | MissCandidate> => {
  const items: Array<PrizeCandidate | MissCandidate> = [...selectionState.jitteredEligible];
  if (selectionState.missWeight > 0) {
    items.push({ id: -1, weight: selectionState.missWeight, __isMiss: true });
  }
  return items;
};

const resolveChainStatus = async (
  selectionState: PreparedDrawSelection
): Promise<ChainStatus> => {
  const result = await resolvePayoutPolicy(makePolicyParams(selectionState));
  if (result.terminal) {
    return result.outcome.status;
  }
  return 'won';
};

const projectNextState = async (
  pityStreakBefore: number,
  status: ChainStatus
) => {
  const { tx } = makeUpdateTx();
  const actualNextState = await updateUserDrawState({
    tx,
    user: {
      id: 123,
      user_pool_balance: '0.00',
      pity_streak: pityStreakBefore,
      last_draw_at: null,
      last_win_at: null,
      withdrawable_balance: '100.00',
      bonus_balance: '0.00',
      wagered_amount: '0.00',
    },
    status,
    pityStreakBefore,
    now: new Date('2026-03-10T12:00:00.000Z'),
  });

  return Math.min(actualNextState, COLLAPSED_HIGH_PITY_STATE);
};

const analyzeState = async (pityStreakBefore: number): Promise<AnalyzedState> => {
  const selectionState = await prepareDrawSelection(
    makeSelectionParams(pityStreakBefore, `analysis-${pityStreakBefore}`)
  );
  const candidates = collectCandidates(selectionState);
  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  const transitions = new Array(COLLAPSED_HIGH_PITY_STATE + 1).fill(0);
  const outcomes = createEmptyOutcomeProfile();

  for (const candidate of candidates) {
    const probability = candidate.weight / totalWeight;
    const status = await resolveChainStatus({
      ...selectionState,
      selection: {
        item: candidate,
        randomPick: 1,
        totalWeight,
      },
    });
    const nextState = await projectNextState(pityStreakBefore, status);

    transitions[nextState] += probability;
    outcomes[status] += probability;
  }

  return {
    pityStreakBefore,
    missWeight: selectionState.missWeight,
    totalWeight,
    transitions,
    outcomes,
  };
};

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

const simulateFullDrawFlow = async (steps: number) => {
  const stateVisits = new Array(COLLAPSED_HIGH_PITY_STATE + 1).fill(0);
  const outcomes = createEmptyOutcomeProfile();
  let actualPityState = 0;

  for (let step = 0; step < steps; step += 1) {
    const currentBucket = Math.min(actualPityState, COLLAPSED_HIGH_PITY_STATE);
    stateVisits[currentBucket] += 1;

    const selectionState = await prepareDrawSelection(
      makeSelectionParams(actualPityState, `simulation-${step}`)
    );
    const status = await resolveChainStatus(selectionState);
    outcomes[status] += 1;

    const { tx } = makeUpdateTx();
    actualPityState = await updateUserDrawState({
      tx,
      user: {
        id: 123,
        user_pool_balance: '0.00',
        pity_streak: actualPityState,
        last_draw_at: null,
        last_win_at: null,
        withdrawable_balance: '100.00',
        bonus_balance: '0.00',
        wagered_amount: '0.00',
      },
      status,
      pityStreakBefore: actualPityState,
      now: new Date('2026-03-10T12:00:00.000Z'),
    });
  }

  return {
    stateDistribution: stateVisits.map((count) => count / steps),
    outcomeDistribution: Object.fromEntries(
      outcomeKeys.map((key) => [key, outcomes[key] / steps])
    ) as OutcomeProfile,
  };
};

describe('full draw flow Markov chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPoolBalance.mockResolvedValue(new Decimal(50));
    mockedGetProbabilityPool.mockResolvedValue(probabilityPool);
    mockedLoadLockedPrize.mockImplementation(async (_tx, prizeId) => lockedPrizeRows.get(prizeId) ?? null);
  });

  it('builds state transitions from selection, payout policy, and pity updates', async () => {
    const analyzedStates = await Promise.all(ANALYTIC_STATES.map((state) => analyzeState(state)));
    const collapsedStates = analyzedStates.slice(0, COLLAPSED_HIGH_PITY_STATE + 1);

    expect(collapsedStates.map((state) => state.missWeight)).toEqual([325, 325, 244, 163, 81, 0]);
    expect(collapsedStates[0].outcomes).toEqual({
      won: 100 / 450,
      miss: 325 / 450,
      payout_limited: 25 / 450,
      out_of_stock: 0,
      budget_exhausted: 0,
    });
    expect(collapsedStates[COLLAPSED_HIGH_PITY_STATE].outcomes).toEqual({
      won: 100 / 125,
      miss: 0,
      payout_limited: 25 / 125,
      out_of_stock: 0,
      budget_exhausted: 0,
    });
    expect(analyzedStates[5].outcomes).toEqual(analyzedStates[6].outcomes);
    expect(analyzedStates[5].transitions).toEqual(analyzedStates[6].transitions);

    for (const state of collapsedStates) {
      expect(state.transitions.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    }

    expect(collapsedStates[0].transitions).toEqual([
      100 / 450,
      350 / 450,
      0,
      0,
      0,
      0,
    ]);
    expect(collapsedStates[COLLAPSED_HIGH_PITY_STATE].transitions).toEqual([
      100 / 125,
      0,
      0,
      0,
      0,
      25 / 125,
    ]);
  });

  it('matches long-run simulation against the exact chain model', async () => {
    const analyzedStates = await Promise.all(ANALYTIC_STATES.map((state) => analyzeState(state)));
    const collapsedStates = analyzedStates.slice(0, COLLAPSED_HIGH_PITY_STATE + 1);
    const transitionMatrix = collapsedStates.map((state) => state.transitions);
    const stationary = getStationaryDistribution(transitionMatrix);
    const expectedOutcomes = createEmptyOutcomeProfile();

    for (let index = 0; index < collapsedStates.length; index += 1) {
      for (const key of outcomeKeys) {
        expectedOutcomes[key] += stationary[index] * collapsedStates[index].outcomes[key];
      }
    }

    const simulation = await simulateFullDrawFlow(10_000);

    expect(stationary.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(expectedOutcomes.won).toBeGreaterThan(collapsedStates[0].outcomes.won);
    expect(expectedOutcomes.payout_limited).toBeGreaterThan(0);
    expect(Math.abs(simulation.outcomeDistribution.won - expectedOutcomes.won)).toBeLessThan(
      0.01
    );
    expect(Math.abs(simulation.outcomeDistribution.miss - expectedOutcomes.miss)).toBeLessThan(
      0.01
    );
    expect(
      Math.abs(
        simulation.outcomeDistribution.payout_limited - expectedOutcomes.payout_limited
      )
    ).toBeLessThan(0.01);

    for (let index = 0; index < stationary.length; index += 1) {
      expect(Math.abs(simulation.stateDistribution[index] - stationary[index])).toBeLessThan(
        0.015
      );
    }
  });
});
