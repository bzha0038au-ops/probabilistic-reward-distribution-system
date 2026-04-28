import { describe, expect, it } from 'vitest';

import { selectReward } from './prize-engine-selection';
import type { PrizeEngineSelectionContext } from './prize-engine-selection';

const makePrize = (
  overrides: Partial<PrizeEngineSelectionContext['prizeRows'][number]> = {},
) => ({
  id: 1,
  projectId: 99,
  name: 'Prize',
  stock: 10,
  weight: 1,
  rewardAmount: '5.00',
  isActive: true,
  deletedAt: null,
  metadata: null,
  ...overrides,
});

const makeContext = (
  overrides: Partial<PrizeEngineSelectionContext> = {},
): PrizeEngineSelectionContext => ({
  strategy: 'weighted_gacha',
  strategyParams: {},
  prizeRows: [makePrize()],
  missWeight: 0,
  fairnessSeed: 'seed-value',
  fairnessNonce: 'client:server',
  historyByPrizeId: new Map(),
  ...overrides,
});

describe('selectReward', () => {
  it('preserves weighted gacha compatibility by ignoring zero-weight prizes', () => {
    const result = selectReward(
      makeContext({
        prizeRows: [
          makePrize({ id: 1, weight: 0, rewardAmount: '50.00' }),
          makePrize({ id: 2, weight: 5, rewardAmount: '10.00' }),
        ],
      }),
    );

    expect(result.selection).toMatchObject({
      kind: 'prize',
      id: 2,
    });
    expect(result.fairness).toMatchObject({
      strategy: 'weighted_gacha',
      totalWeight: 5,
      selectedArmId: 2,
      selectedArmKind: 'prize',
    });
  });

  it('uses empirical mean reward for epsilon-greedy exploitation', () => {
    const result = selectReward(
      makeContext({
        strategy: 'epsilon_greedy',
        strategyParams: { epsilon: 0 },
        prizeRows: [
          makePrize({ id: 1, weight: 0, rewardAmount: '9.00' }),
          makePrize({ id: 2, weight: 0, rewardAmount: '2.00' }),
        ],
        historyByPrizeId: new Map([
          [1, { pulls: 4, totalRewardAmount: '8.00' }],
          [2, { pulls: 2, totalRewardAmount: '10.00' }],
        ]),
      }),
    );

    expect(result.selection).toMatchObject({
      kind: 'prize',
      id: 2,
    });
    expect(result.fairness).toMatchObject({
      strategy: 'epsilon_greedy',
      epsilon: 0,
      decision: 'exploit',
      selectedArmId: 2,
      selectedArmKind: 'prize',
      candidateCount: 2,
    });
  });

  it('explores uniformly across prizes and miss arms for epsilon-greedy', () => {
    const result = selectReward(
      makeContext({
        strategy: 'epsilon_greedy',
        strategyParams: { epsilon: 1 },
        prizeRows: [
          makePrize({ id: 1, rewardAmount: '9.00' }),
          makePrize({ id: 2, rewardAmount: '2.00' }),
        ],
        missWeight: 7,
      }),
    );

    expect(result.fairness).toMatchObject({
      strategy: 'epsilon_greedy',
      epsilon: 1,
      decision: 'explore',
      candidateCount: 3,
    });
    expect(result.fairness.selectionDigest).toBeTruthy();
    expect(result.selection).not.toBeNull();
  });

  it('adapts weighted-gacha candidate weights to behavior signals', () => {
    const prizeRows = [
      makePrize({ id: 1, rewardAmount: '1.00' }),
      makePrize({ id: 2, rewardAmount: '10.00' }),
    ];

    const neutral = selectReward(
      makeContext({
        prizeRows,
        missWeight: 10,
      }),
    );
    const behaviorAware = selectReward(
      makeContext({
        prizeRows,
        missWeight: 10,
        behavior: {
          actionType: 'checkout.completed',
          score: 1,
          novelty: 1,
          risk: 0,
        },
      }),
    );

    expect(neutral.fairness.totalWeight).toBe(12);
    expect(behaviorAware.fairness.totalWeight).toBe(10);
    expect(behaviorAware.fairness.totalWeight).not.toBe(
      neutral.fairness.totalWeight,
    );
  });

  it('rejects project strategies that are not implemented yet', () => {
    expect(() =>
      selectReward(
        makeContext({
          strategy: 'softmax',
        }),
      ),
    ).toThrow(/not implemented yet/i);
  });
});
