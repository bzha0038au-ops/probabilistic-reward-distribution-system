import { ledgerEntries, userWallets, users } from '@reward/database';
import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTransaction } from '../../db';

vi.mock('../../db', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock('../system/service', () => ({
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

vi.mock('../kyc/service', () => ({
  assertKycStakeAllowed: vi.fn(),
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

import { logger } from '../../shared/logger';
import { ensureFairnessSeed } from '../fairness/service';
import { assertKycStakeAllowed } from '../kyc/service';
import {
  getDrawCost,
  getDrawSystemConfig,
  getEconomyConfig,
  getPayoutControlConfig,
  getPoolSystemConfig,
  getProbabilityControlConfig,
  getRandomizationConfig,
} from '../system/service';
import { executeDrawInTransaction } from './execute-draw';
import { resolveDrawOutcome } from './outcome';
import { loadLockedDrawUser } from './queries';
import {
  applyHouseDrawEntries,
  createDrawRecord,
  updateUserDrawState,
} from './record';
import { prepareDrawSelection } from './selection';
import type {
  DrawConfigBundle,
  DrawUserRow,
  FairnessSeed,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

type TxState = {
  wallet: {
    withdrawableBalance: string;
    bonusBalance: string;
    wageredAmount: string;
    updatedAt: Date | null;
  };
  user: {
    userPoolBalance: string;
    updatedAt: Date | null;
  };
  insertedWallets: Array<Record<string, unknown>>;
  insertedLedgerEntries: Array<Record<string, unknown>>;
};

const makeTx = (userId = 123) => {
  const state: TxState = {
    wallet: {
      withdrawableBalance: '100.00',
      bonusBalance: '0.00',
      wageredAmount: '0.00',
      updatedAt: null,
    },
    user: {
      userPoolBalance: '0.00',
      updatedAt: null,
    },
    insertedWallets: [],
    insertedLedgerEntries: [],
  };

  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: userId }],
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === userWallets) {
            Object.assign(state.wallet, values);
          }
          if (table === users) {
            Object.assign(state.user, values);
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === userWallets) {
          state.insertedWallets.push(values);
        }
        if (table === ledgerEntries) {
          state.insertedLedgerEntries.push(values);
        }

        return {
          onConflictDoNothing: async () => undefined,
          returning: async () => [],
        };
      },
    }),
  } as unknown as DbTransaction;

  return { tx, state };
};

const makeDrawUser = (): DrawUserRow => ({
  id: 123,
  user_pool_balance: '0.00',
  pity_streak: 0,
  last_draw_at: null,
  last_win_at: null,
  withdrawable_balance: '100.00',
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
  payoutLimitReason: null,
});

const mockConfigBundle = (config: DrawConfigBundle) => {
  vi.mocked(getDrawSystemConfig).mockResolvedValue(config.drawSystem);
  vi.mocked(getEconomyConfig).mockResolvedValue(config.economy);
  vi.mocked(getPoolSystemConfig).mockResolvedValue(config.poolSystem);
  vi.mocked(getPayoutControlConfig).mockResolvedValue(config.payoutControl);
  vi.mocked(getProbabilityControlConfig).mockResolvedValue(
    config.probabilityControl
  );
  vi.mocked(getRandomizationConfig).mockResolvedValue(config.randomization);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertKycStakeAllowed).mockResolvedValue(undefined);
});

describe('executeDrawInTransaction', () => {
  it('orchestrates the happy path with direct module mocks', async () => {
    const { tx, state } = makeTx();
    const now = new Date('2026-03-10T12:00:00.000Z');
    const user = makeDrawUser();
    const config = makeConfig();
    const fairnessSeed = makeFairnessSeed();
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

    mockConfigBundle(config);
    vi.mocked(getDrawCost).mockResolvedValue(new Decimal(10));
    vi.mocked(ensureFairnessSeed).mockResolvedValue(fairnessSeed);
    vi.mocked(loadLockedDrawUser).mockResolvedValue(user);
    vi.mocked(prepareDrawSelection).mockResolvedValue(selectionState);
    vi.mocked(resolveDrawOutcome).mockResolvedValue(outcome);
    vi.mocked(applyHouseDrawEntries).mockResolvedValue(undefined);
    vi.mocked(updateUserDrawState).mockResolvedValue(0);
    vi.mocked(createDrawRecord).mockResolvedValue({
      record,
      updatedPoolBalance: new Decimal(30),
    });

    const result = await executeDrawInTransaction(
      tx,
      123,
      { clientNonce: 'user-supplied' },
      {
        dependencies: {
          now: () => now,
        },
      }
    );

    expect(result).toEqual(record);
    expect(ensureFairnessSeed).toHaveBeenCalledWith(tx, 3600);
    expect(assertKycStakeAllowed).toHaveBeenCalledWith(123, '10.00', tx);
    expect(prepareDrawSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        clientNonce: 'user-supplied',
        fairnessSeed,
      })
    );
    expect(resolveDrawOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        userId: 123,
        drawState: expect.objectContaining({
          drawCost: new Decimal(10),
          drawCostBase: new Decimal(10),
          walletAfterDebit: new Decimal(90),
          userPoolBefore: new Decimal(0),
          userPoolAfterDebit: new Decimal(10),
          wageredAfter: new Decimal(10),
          pityStreakBefore: 0,
        }),
        selectionState,
        economy: config.economy,
        poolSystem: config.poolSystem,
        payoutControl: config.payoutControl,
        now,
      })
    );
    expect(applyHouseDrawEntries).toHaveBeenCalledWith({
      tx,
      userId: 123,
      drawCost: new Decimal(10),
      rewardAmount: new Decimal(5),
      prizeId: 7,
    });
    expect(updateUserDrawState).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        user,
        status: 'won',
        pityStreakBefore: 0,
        now,
      })
    );
    expect(createDrawRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        userId: 123,
        fairnessSeed,
        clientNonce: 'user-supplied',
        nonceSource: 'client',
        pityStreakAfter: 0,
      })
    );
    expect(logger.info).toHaveBeenCalledWith('draw executed', {
      userId: 123,
      status: 'won',
      prizeId: 7,
      rewardAmount: '5.00',
      drawCost: '10.00',
      poolBalanceBefore: '25.00',
      poolBalanceAfter: '30.00',
    });

    expect(state.insertedWallets).toEqual([{ userId: 123 }]);
    expect(state.wallet).toEqual({
      withdrawableBalance: '90.00',
      bonusBalance: '0.00',
      wageredAmount: '10.00',
      updatedAt: expect.any(Date),
    });
    expect(state.user).toEqual({
      userPoolBalance: '10.00',
      updatedAt: now,
    });
    expect(state.insertedLedgerEntries).toEqual([
      expect.objectContaining({
        userId: 123,
        entryType: 'draw_cost',
        amount: '-10.00',
        balanceBefore: '100.00',
        balanceAfter: '90.00',
        referenceType: 'draw',
        metadata: { reason: 'draw_cost' },
      }),
    ]);
  });

  it('fails before config loading when the locked draw user is missing', async () => {
    const { tx } = makeTx();

    vi.mocked(loadLockedDrawUser).mockResolvedValue(null);

    await expect(executeDrawInTransaction(tx, 123)).rejects.toThrow(
      'User not found.'
    );

    expect(getDrawSystemConfig).not.toHaveBeenCalled();
    expect(assertKycStakeAllowed).not.toHaveBeenCalled();
  });

  it('stops the flow when draw guards reject the request', async () => {
    const { tx } = makeTx();
    const config = makeConfig();
    config.drawSystem.drawEnabled = false;

    mockConfigBundle(config);
    vi.mocked(ensureFairnessSeed).mockResolvedValue(makeFairnessSeed());
    vi.mocked(loadLockedDrawUser).mockResolvedValue(makeDrawUser());

    await expect(
      executeDrawInTransaction(
        tx,
        123,
        { clientNonce: 'user-supplied' },
        {
          dependencies: {
            now: () => new Date('2026-03-10T12:00:00.000Z'),
          },
        }
      )
    ).rejects.toThrow('Draws are disabled.');

    expect(getDrawCost).not.toHaveBeenCalled();
    expect(assertKycStakeAllowed).not.toHaveBeenCalled();
    expect(ensureFairnessSeed).not.toHaveBeenCalled();
    expect(prepareDrawSelection).not.toHaveBeenCalled();
    expect(resolveDrawOutcome).not.toHaveBeenCalled();
  });
});
