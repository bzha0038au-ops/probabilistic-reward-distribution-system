import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import type { DbTransaction } from '../../db';

vi.mock('../../db', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock('../system/service', () => ({
  getBonusReleaseConfig: vi.fn(),
  getDrawCost: vi.fn(),
  getDrawSystemConfig: vi.fn(),
  getEconomyConfig: vi.fn(),
  getPayoutControlConfig: vi.fn(),
  getPoolSystemConfig: vi.fn(),
  getProbabilityControlConfig: vi.fn(),
  getRandomizationConfig: vi.fn(),
}));

vi.mock('../fairness/service', () => ({
  ensureFairnessSeed: vi.fn(),
}));

vi.mock('../../shared/logger', () => ({
  logger: {
    info: vi.fn(),
  },
}));

vi.mock('./outcome', () => ({
  resolveDrawOutcome: vi.fn(),
}));

vi.mock('./queries', () => ({
  loadLockedDrawUser: vi.fn(),
}));

vi.mock('./record', () => ({
  applyHouseDrawEntries: vi.fn(),
  createDrawRecord: vi.fn(),
  updateUserDrawState: vi.fn(),
}));

vi.mock('./selection', () => ({
  prepareDrawSelection: vi.fn(),
}));

import {
  executeDrawInTransaction,
  type ExecuteDrawDependencies,
} from './execute-draw';
import type {
  DebitedDrawState,
  DrawConfigBundle,
  DrawUserRow,
  FairnessSeed,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

const makeTx = (userId = 123) =>
  ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: userId }],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
      }),
    }),
  }) as unknown as DbTransaction;

const makeDrawUser = (): DrawUserRow => ({
  id: 123,
  user_pool_balance: '0.00',
  pity_streak: 0,
  last_draw_at: null,
  last_win_at: null,
  withdrawable_balance: '100.00',
  bonus_balance: '0.00',
  wagered_amount: '0.00',
});

const makeConfig = (): DrawConfigBundle => ({
  drawSystem: {
    drawEnabled: true,
    minDrawCost: new Decimal(0),
    maxDrawCost: new Decimal(0),
    maxDrawPerRequest: new Decimal(1),
    maxDrawPerDay: new Decimal(0),
    cooldownSeconds: new Decimal(0),
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
    maxBigPerHour: new Decimal(0),
    maxBigPerDay: new Decimal(0),
    maxTotalPerHour: new Decimal(0),
    cooldownSeconds: new Decimal(0),
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
});

const makeFairnessSeed = (): FairnessSeed => ({
  epoch: 1,
  epochSeconds: 3600,
  commitHash: 'commit-hash',
  seed: 'seed-value',
});

const makeDrawState = (): DebitedDrawState => ({
  drawCostBase: new Decimal(10),
  drawCost: new Decimal(10),
  drawCostClamped: false,
  walletAfterDebit: new Decimal(90),
  userPoolBefore: new Decimal(0),
  userPoolAfterDebit: new Decimal(10),
  bonusBefore: new Decimal(0),
  wageredAfter: new Decimal(10),
  pityStreakBefore: 0,
});

const makeSelectionState = (): PreparedDrawSelection => ({
  poolBalance: new Decimal(25),
  poolNoise: { effective: new Decimal(25), noiseApplied: 0 },
  effectivePoolBalance: new Decimal(25),
  jitteredEligible: [
    {
      id: 7,
      weight: 100,
      rewardAmount: '5.00',
      poolThreshold: '0.00',
      userPoolThreshold: '0.00',
    },
  ],
  jitterMeta: [],
  normalizedScale: 1,
  jackpotBoostPct: 0,
  jitterEnabled: false,
  jitterMin: 0,
  jitterMax: 0,
  expectedPayout: new Decimal(5),
  expectedValueBase: new Decimal(0.5),
  expectedValueWithMiss: new Decimal(0.5),
  targetExpectedValue: new Decimal(0.5),
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
    randomPick: 10,
    totalWeight: 100,
  },
  rngDigest: 'rng-digest',
});

const makeOutcome = (): ResolvedDrawOutcome => ({
  status: 'won',
  rewardAmount: new Decimal(5),
  prizeId: 7,
  bonusAfterReward: new Decimal(5),
  payoutLimitReason: null,
});

describe('executeDrawInTransaction', () => {
  it('orchestrates the happy path with injectable dependencies', async () => {
    const tx = makeTx();
    const now = new Date('2026-03-10T12:00:00.000Z');
    const user = makeDrawUser();
    const config = makeConfig();
    const fairnessSeed = makeFairnessSeed();
    const drawState = makeDrawState();
    const selectionState = makeSelectionState();
    const outcome = makeOutcome();
    const record = {
      id: 99,
      userId: 123,
      prizeId: 7,
      drawCost: '10.00',
      rewardAmount: '5.00',
      status: 'won' as const,
      createdAt: now,
      metadata: {},
    };

    const deps: Partial<ExecuteDrawDependencies> = {
      now: vi.fn(() => now),
      loadDrawConfig: vi.fn(async () => config),
      ensureFairnessSeed: vi.fn(async () => fairnessSeed),
      resolveClientNonce: vi.fn(() => ({
        clientNonce: 'client-nonce',
        nonceSource: 'client' as const,
      })),
      loadLockedDrawUser: vi.fn(async () => user),
      enforceDrawGuards: vi.fn(async () => undefined),
      debitDrawCost: vi.fn(async () => drawState),
      prepareDrawSelection: vi.fn(async () => selectionState),
      resolveDrawOutcome: vi.fn(async () => outcome),
      applyHouseDrawEntries: vi.fn(async () => undefined),
      applyAutoBonusRelease: vi.fn(async () => outcome.bonusAfterReward),
      updateUserDrawState: vi.fn(async () => 0),
      createDrawRecord: vi.fn(async () => ({
        record,
        updatedPoolBalance: new Decimal(30),
      })),
      logDrawExecution: vi.fn(),
    };

    const result = await executeDrawInTransaction(
      tx,
      123,
      { clientNonce: 'user-supplied' },
      deps
    );

    expect(result).toEqual(record);
    expect(deps.ensureFairnessSeed).toHaveBeenCalledWith(tx, 3600);
    expect(deps.enforceDrawGuards).toHaveBeenCalledWith(
      tx,
      123,
      config.drawSystem,
      now
    );
    expect(deps.prepareDrawSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        drawState,
        fairnessSeed,
        clientNonce: 'client-nonce',
      })
    );
    expect(deps.resolveDrawOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        userId: 123,
        user,
        drawState,
        selectionState,
        now,
      })
    );
    expect(deps.createDrawRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        userId: 123,
        fairnessSeed,
        clientNonce: 'client-nonce',
        nonceSource: 'client',
        pityStreakAfter: 0,
      })
    );
    expect(deps.logDrawExecution).toHaveBeenCalledWith({
      userId: 123,
      status: 'won',
      prizeId: 7,
      rewardAmount: '5.00',
      drawCost: '10.00',
      poolBalanceBefore: '25.00',
      poolBalanceAfter: '30.00',
    });
  });

  it('fails before config loading when the locked draw user is missing', async () => {
    const tx = makeTx();
    const loadDrawConfig = vi.fn();

    await expect(
      executeDrawInTransaction(tx, 123, undefined, {
        loadLockedDrawUser: vi.fn(async () => null),
        loadDrawConfig,
      })
    ).rejects.toThrow('User not found.');

    expect(loadDrawConfig).not.toHaveBeenCalled();
  });

  it('stops the flow when draw guards reject the request', async () => {
    const tx = makeTx();
    const debitDrawCost = vi.fn();

    await expect(
      executeDrawInTransaction(tx, 123, undefined, {
        now: () => new Date('2026-03-10T12:00:00.000Z'),
        loadLockedDrawUser: vi.fn(async () => makeDrawUser()),
        loadDrawConfig: vi.fn(async () => makeConfig()),
        ensureFairnessSeed: vi.fn(async () => makeFairnessSeed()),
        resolveClientNonce: vi.fn(() => ({
          clientNonce: 'server-nonce',
          nonceSource: 'server' as const,
        })),
        enforceDrawGuards: vi.fn(async () => {
          throw new Error('Draw cooldown active.');
        }),
        debitDrawCost,
      })
    ).rejects.toThrow('Draw cooldown active.');

    expect(debitDrawCost).not.toHaveBeenCalled();
  });
});
