import { and, desc, eq, gte, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { randomBytes } from 'node:crypto';

import { db, type DbTransaction } from '../../db';
import { drawRecords, ledgerEntries, userWallets, users } from '@reward/database';
import {
  getBonusReleaseConfig,
  getDrawCost,
  getDrawSystemConfig,
  getEconomyConfig,
  getPayoutControlConfig,
  getPoolSystemConfig,
  getProbabilityControlConfig,
  getRandomizationConfig,
} from '../system/service';
import { ensureFairnessSeed } from '../fairness/service';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';
import { resolveDrawOutcome } from './outcome';
import { loadLockedDrawUser } from './queries';
import { applyHouseDrawEntries, createDrawRecord, updateUserDrawState } from './record';
import { prepareDrawSelection } from './selection';
import type {
  DebitedDrawState,
  DrawConfigBundle,
  DrawOptions,
  DrawUserRow,
} from './types';

const loadDrawConfig = async (tx: DbTransaction): Promise<DrawConfigBundle> => {
  const [
    drawSystem,
    economy,
    poolSystem,
    payoutControl,
    probabilityControl,
    randomization,
  ] = await Promise.all([
    getDrawSystemConfig(tx),
    getEconomyConfig(tx),
    getPoolSystemConfig(tx),
    getPayoutControlConfig(tx),
    getProbabilityControlConfig(tx),
    getRandomizationConfig(tx),
  ]);

  return {
    drawSystem,
    economy,
    poolSystem,
    payoutControl,
    probabilityControl,
    randomization,
  };
};

const resolveClientNonce = (value?: string | null) => {
  const rawNonce = value ? String(value).trim() : '';
  if (!rawNonce) {
    return {
      clientNonce: randomBytes(16).toString('hex'),
      nonceSource: 'server' as const,
    };
  }

  return {
    clientNonce: rawNonce,
    nonceSource: 'client' as const,
  };
};

const enforceDrawGuards = async (
  tx: DbTransaction,
  userId: number,
  drawSystem: DrawConfigBundle['drawSystem'],
  now: Date
) => {
  if (!drawSystem.drawEnabled) {
    throw new Error('Draws are disabled.');
  }
  if (drawSystem.maxDrawPerRequest.gt(0) && drawSystem.maxDrawPerRequest.lt(1)) {
    throw new Error('Draw limit configured to zero.');
  }

  if (drawSystem.maxDrawPerDay.gt(0)) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const [{ total = 0 }] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(drawRecords)
      .where(
        and(
          eq(drawRecords.userId, userId),
          gte(drawRecords.createdAt, startOfDay)
        )
      );
    if (Number(total ?? 0) >= Number(drawSystem.maxDrawPerDay)) {
      throw new Error('Daily draw limit reached.');
    }
  }

  if (drawSystem.cooldownSeconds.gt(0)) {
    const cooldownSince = new Date(
      now.getTime() - Number(drawSystem.cooldownSeconds) * 1000
    );
    const [recent] = await tx
      .select({ id: drawRecords.id })
      .from(drawRecords)
      .where(
        and(
          eq(drawRecords.userId, userId),
          gte(drawRecords.createdAt, cooldownSince)
        )
      )
      .orderBy(desc(drawRecords.createdAt))
      .limit(1);
    if (recent) {
      throw new Error('Draw cooldown active.');
    }
  }
};

const debitDrawCost = async (
  tx: DbTransaction,
  userId: number,
  user: DrawUserRow,
  drawSystem: DrawConfigBundle['drawSystem'],
  now: Date
): Promise<DebitedDrawState> => {
  const drawCostBase = await getDrawCost(tx);
  let drawCost = drawCostBase;
  if (drawSystem.minDrawCost.gt(0) && drawCost.lt(drawSystem.minDrawCost)) {
    drawCost = drawSystem.minDrawCost;
  }
  if (drawSystem.maxDrawCost.gt(0) && drawCost.gt(drawSystem.maxDrawCost)) {
    drawCost = drawSystem.maxDrawCost;
  }

  const walletBefore = toDecimal(user.withdrawable_balance ?? 0);
  const userPoolBefore = toDecimal(user.user_pool_balance ?? 0);
  const bonusBefore = toDecimal(user.bonus_balance ?? 0);
  const wageredBefore = toDecimal(user.wagered_amount ?? 0);
  const pityStreakBefore = Number(user.pity_streak ?? 0);
  if (walletBefore.lt(drawCost)) {
    throw new Error('Insufficient balance.');
  }

  const walletAfterDebit = walletBefore.minus(drawCost);
  const userPoolAfterDebit = userPoolBefore.plus(drawCost);
  const wageredAfter = wageredBefore.plus(drawCost);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(walletAfterDebit),
      wageredAmount: toMoneyString(wageredAfter),
      updatedAt: now,
    })
    .where(eq(userWallets.userId, user.id));

  await tx
    .update(users)
    .set({
      userPoolBalance: toMoneyString(userPoolAfterDebit),
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await tx.insert(ledgerEntries).values({
    userId,
    entryType: 'draw_cost',
    amount: toMoneyString(drawCost.negated()),
    balanceBefore: toMoneyString(walletBefore),
    balanceAfter: toMoneyString(walletAfterDebit),
    referenceType: 'draw',
    metadata: { reason: 'draw_cost' },
  });

  return {
    drawCostBase,
    drawCost,
    drawCostClamped: !drawCost.eq(drawCostBase),
    walletAfterDebit,
    userPoolBefore,
    userPoolAfterDebit,
    bonusBefore,
    wageredAfter,
    pityStreakBefore,
  };
};

const applyAutoBonusRelease = async (params: {
  tx: DbTransaction;
  userId: number;
  user: DrawUserRow;
  bonusAfterReward: Decimal;
  walletAfterDebit: Decimal;
  wageredAfter: Decimal;
}) => {
  const { tx, userId, user, walletAfterDebit, wageredAfter } = params;
  let { bonusAfterReward } = params;
  const bonusReleaseConfig = await getBonusReleaseConfig(tx);
  if (
    bonusReleaseConfig.bonusAutoReleaseEnabled &&
    bonusAfterReward.gt(0) &&
    bonusReleaseConfig.bonusUnlockWagerRatio.gt(0)
  ) {
    const maxRelease = wageredAfter.div(bonusReleaseConfig.bonusUnlockWagerRatio);
    const releaseAmount = Decimal.min(bonusAfterReward, maxRelease).toDecimalPlaces(
      2,
      Decimal.ROUND_FLOOR
    );

    if (releaseAmount.gt(0)) {
      const bonusAfterRelease = Decimal.max(
        bonusAfterReward.minus(releaseAmount),
        0
      );
      const walletAfterRelease = walletAfterDebit.plus(releaseAmount);
      const wageredAfterRelease = Decimal.max(
        wageredAfter.minus(releaseAmount.mul(bonusReleaseConfig.bonusUnlockWagerRatio)),
        0
      );

      await tx
        .update(userWallets)
        .set({
          withdrawableBalance: toMoneyString(walletAfterRelease),
          bonusBalance: toMoneyString(bonusAfterRelease),
          wageredAmount: toMoneyString(wageredAfterRelease),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, user.id));

      await tx.insert(ledgerEntries).values({
        userId,
        entryType: 'bonus_release_auto',
        amount: toMoneyString(releaseAmount),
        balanceBefore: toMoneyString(bonusAfterReward),
        balanceAfter: toMoneyString(bonusAfterRelease),
        referenceType: 'bonus_release',
        metadata: {
          reason: 'auto_release',
          balanceType: 'bonus',
          unlockRatio: toMoneyString(bonusReleaseConfig.bonusUnlockWagerRatio),
        },
      });

      bonusAfterReward = bonusAfterRelease;
    }
  }

  return bonusAfterReward;
};

export type ExecuteDrawDependencies = {
  now: () => Date;
  loadDrawConfig: typeof loadDrawConfig;
  ensureFairnessSeed: typeof ensureFairnessSeed;
  resolveClientNonce: typeof resolveClientNonce;
  loadLockedDrawUser: typeof loadLockedDrawUser;
  enforceDrawGuards: typeof enforceDrawGuards;
  debitDrawCost: typeof debitDrawCost;
  prepareDrawSelection: typeof prepareDrawSelection;
  resolveDrawOutcome: typeof resolveDrawOutcome;
  applyHouseDrawEntries: typeof applyHouseDrawEntries;
  applyAutoBonusRelease: typeof applyAutoBonusRelease;
  updateUserDrawState: typeof updateUserDrawState;
  createDrawRecord: typeof createDrawRecord;
  logDrawExecution: (payload: {
    userId: number;
    status: string;
    prizeId: number | null;
    rewardAmount: string;
    drawCost: string;
    poolBalanceBefore: string;
    poolBalanceAfter: string;
  }) => void;
};

const defaultExecuteDrawDependencies: ExecuteDrawDependencies = {
  now: () => new Date(),
  loadDrawConfig,
  ensureFairnessSeed,
  resolveClientNonce,
  loadLockedDrawUser,
  enforceDrawGuards,
  debitDrawCost,
  prepareDrawSelection,
  resolveDrawOutcome,
  applyHouseDrawEntries,
  applyAutoBonusRelease,
  updateUserDrawState,
  createDrawRecord,
  logDrawExecution: (payload) => {
    logger.info('draw executed', payload);
  },
};

export async function executeDrawInTransaction(
  tx: DbTransaction,
  userId: number,
  options?: DrawOptions,
  dependencies: Partial<ExecuteDrawDependencies> = {}
) {
  const deps = { ...defaultExecuteDrawDependencies, ...dependencies };

  const [existingUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existingUser) {
    throw new Error('User not found.');
  }

  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();

  const user = await deps.loadLockedDrawUser(tx, userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const config = await deps.loadDrawConfig(tx);
  const fairnessSeed = await deps.ensureFairnessSeed(
    tx,
    Number(config.poolSystem.epochSeconds ?? 0)
  );
  const { clientNonce, nonceSource } = deps.resolveClientNonce(options?.clientNonce);

  const now = deps.now();
  await deps.enforceDrawGuards(tx, userId, config.drawSystem, now);

  const drawState = await deps.debitDrawCost(
    tx,
    userId,
    user,
    config.drawSystem,
    now
  );
  const selectionState = await deps.prepareDrawSelection({
    tx,
    drawState,
    poolSystem: config.poolSystem,
    probabilityControl: config.probabilityControl,
    randomization: config.randomization,
    fairnessSeed,
    clientNonce,
  });

  const outcome = await deps.resolveDrawOutcome({
    tx,
    userId,
    user,
    drawState,
    selectionState,
    economy: config.economy,
    poolSystem: config.poolSystem,
    payoutControl: config.payoutControl,
    now,
  });

  await deps.applyHouseDrawEntries({
    tx,
    userId,
    drawCost: drawState.drawCost,
    rewardAmount: outcome.rewardAmount,
    prizeId: outcome.prizeId,
  });

  await deps.applyAutoBonusRelease({
    tx,
    userId,
    user,
    bonusAfterReward: outcome.bonusAfterReward,
    walletAfterDebit: drawState.walletAfterDebit,
    wageredAfter: drawState.wageredAfter,
  });

  const pityStreakAfter = await deps.updateUserDrawState({
    tx,
    user,
    status: outcome.status,
    pityStreakBefore: drawState.pityStreakBefore,
    now,
  });

  const { record, updatedPoolBalance } = await deps.createDrawRecord({
    tx,
    userId,
    drawState,
    selectionState,
    outcome,
    fairnessSeed,
    clientNonce,
    nonceSource,
    probabilityControl: config.probabilityControl,
    payoutControl: config.payoutControl,
    poolSystem: config.poolSystem,
    pityStreakAfter,
  });

  deps.logDrawExecution({
    userId,
    status: outcome.status,
    prizeId: outcome.prizeId,
    rewardAmount: toMoneyString(outcome.rewardAmount),
    drawCost: toMoneyString(drawState.drawCost),
    poolBalanceBefore: toMoneyString(selectionState.poolBalance),
    poolBalanceAfter: toMoneyString(updatedPoolBalance),
  });

  return record;
}

export async function executeDraw(userId: number, options?: DrawOptions) {
  return db.transaction((tx) => executeDrawInTransaction(tx, userId, options));
}
