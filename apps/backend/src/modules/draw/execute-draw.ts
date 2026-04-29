import { and, desc, eq, gte, sql } from "@reward/database/orm";
import Decimal from "decimal.js";
import { randomBytes } from "node:crypto";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { db, type DbTransaction } from "../../db";
import {
  drawRecords,
  ledgerEntries,
  userWallets,
  users,
} from "@reward/database";
import {
  conflictError,
  notFoundError,
  serviceUnavailableError,
} from "../../shared/errors";
import {
  getDrawCost,
  getDrawSystemConfig,
  getEconomyConfig,
  getPayoutControlConfig,
  getPoolSystemConfig,
  getProbabilityControlConfig,
  getRandomizationConfig,
} from "../system/service";
import { ensureFairnessSeed } from "../fairness/service";
import { assertKycStakeAllowed } from "../kyc/service";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { assertWalletLedgerInvariant } from "../wallet/invariant-service";
import { resolveDrawOutcome } from "./outcome";
import { loadLockedDrawUser } from "./queries";
import {
  applyHouseDrawEntries,
  createDrawRecord,
  updateUserDrawState,
} from "./record";
import { prepareDrawSelection } from "./selection";
import type {
  DebitedDrawState,
  DrawConfigBundle,
  DrawOptions,
  DrawUserRow,
} from "./types";

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
  const rawNonce = value ? String(value).trim() : "";
  if (!rawNonce) {
    return {
      clientNonce: randomBytes(16).toString("hex"),
      nonceSource: "server" as const,
    };
  }

  return {
    clientNonce: rawNonce,
    nonceSource: "client" as const,
  };
};

const resolveEffectiveDrawCost = (
  drawCostBase: Decimal,
  drawSystem: DrawConfigBundle["drawSystem"],
) => {
  let drawCost = drawCostBase;
  if (drawSystem.minDrawCost.gt(0) && drawCost.lt(drawSystem.minDrawCost)) {
    drawCost = drawSystem.minDrawCost;
  }
  if (drawSystem.maxDrawCost.gt(0) && drawCost.gt(drawSystem.maxDrawCost)) {
    drawCost = drawSystem.maxDrawCost;
  }
  return drawCost;
};

const enforceDrawGuards = async (
  tx: DbTransaction,
  userId: number,
  drawSystem: DrawConfigBundle["drawSystem"],
  now: Date,
) => {
  if (!drawSystem.drawEnabled) {
    throw serviceUnavailableError("Draws are disabled.");
  }
  if (
    drawSystem.maxDrawPerRequest.gt(0) &&
    drawSystem.maxDrawPerRequest.lt(1)
  ) {
    throw serviceUnavailableError("Draw limit configured to zero.");
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
          gte(drawRecords.createdAt, startOfDay),
        ),
      );
    if (Number(total ?? 0) >= Number(drawSystem.maxDrawPerDay)) {
      throw conflictError("Daily draw limit reached.", {
        code: API_ERROR_CODES.DRAW_DAILY_LIMIT_REACHED,
      });
    }
  }

  if (drawSystem.cooldownSeconds.gt(0)) {
    const cooldownSince = new Date(
      now.getTime() - Number(drawSystem.cooldownSeconds) * 1000,
    );
    const [recent] = await tx
      .select({ id: drawRecords.id })
      .from(drawRecords)
      .where(
        and(
          eq(drawRecords.userId, userId),
          gte(drawRecords.createdAt, cooldownSince),
        ),
      )
      .orderBy(desc(drawRecords.createdAt))
      .limit(1);
    if (recent) {
      throw conflictError("Draw cooldown active.", {
        code: API_ERROR_CODES.DRAW_COOLDOWN_ACTIVE,
      });
    }
  }
};

const debitDrawCost = async (
  tx: DbTransaction,
  userId: number,
  user: DrawUserRow,
  drawSystem: DrawConfigBundle["drawSystem"],
  now: Date,
): Promise<DebitedDrawState> => {
  const drawCostBase = await getDrawCost(tx);
  const drawCost = resolveEffectiveDrawCost(drawCostBase, drawSystem);

  const walletBefore = toDecimal(user.withdrawable_balance ?? 0);
  const userPoolBefore = toDecimal(user.user_pool_balance ?? 0);
  const wageredBefore = toDecimal(user.wagered_amount ?? 0);
  const pityStreakBefore = Number(user.pity_streak ?? 0);
  if (walletBefore.lt(drawCost)) {
    throw conflictError("Insufficient balance.", {
      code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
    });
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
    entryType: "draw_cost",
    amount: toMoneyString(drawCost.negated()),
    balanceBefore: toMoneyString(walletBefore),
    balanceAfter: toMoneyString(walletAfterDebit),
    referenceType: "draw",
    metadata: { reason: "draw_cost" },
  });

  return {
    drawCostBase,
    drawCost,
    drawCostClamped: !drawCost.eq(drawCostBase),
    walletAfterDebit,
    userPoolBefore,
    userPoolAfterDebit,
    wageredAfter,
    pityStreakBefore,
  };
};

export type ExecuteDrawDependencies = {
  now: () => Date;
  resolveClientNonce: typeof resolveClientNonce;
  loadLockedDrawUser: typeof loadLockedDrawUser;
};

type ExecuteDrawInTransactionOptions = {
  dependencies?: Partial<ExecuteDrawDependencies>;
  skipGuards?: boolean;
};

export async function executeDrawInTransaction(
  tx: DbTransaction,
  userId: number,
  options?: DrawOptions,
  executionOptions: ExecuteDrawInTransactionOptions = {},
) {
  const { dependencies = {}, skipGuards = false } = executionOptions;
  const getNow = dependencies.now ?? (() => new Date());
  const resolveNonce = dependencies.resolveClientNonce ?? resolveClientNonce;
  const loadUser = dependencies.loadLockedDrawUser ?? loadLockedDrawUser;

  const [existingUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existingUser) {
    throw notFoundError("User not found.");
  }

  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();

  const user = await loadUser(tx, userId);
  if (!user) {
    throw notFoundError("User not found.");
  }

  const config = await loadDrawConfig(tx);
  const currentTime = getNow();
  if (!skipGuards) {
    await enforceDrawGuards(tx, userId, config.drawSystem, currentTime);
  }

  const effectiveDrawCost = resolveEffectiveDrawCost(
    await getDrawCost(tx),
    config.drawSystem,
  );
  await assertKycStakeAllowed(userId, toMoneyString(effectiveDrawCost), tx);
  const fairnessSeed = await ensureFairnessSeed(
    tx,
    Number(config.poolSystem.epochSeconds ?? 0),
  );
  const { clientNonce, nonceSource } = resolveNonce(options?.clientNonce);

  const drawState = await debitDrawCost(
    tx,
    userId,
    user,
    config.drawSystem,
    currentTime,
  );
  const selectionState = await prepareDrawSelection({
    tx,
    drawState,
    poolSystem: config.poolSystem,
    probabilityControl: config.probabilityControl,
    randomization: config.randomization,
    fairnessSeed,
    clientNonce,
  });

  const outcome = await resolveDrawOutcome({
    tx,
    userId,
    drawState,
    selectionState,
    economy: config.economy,
    poolSystem: config.poolSystem,
    payoutControl: config.payoutControl,
    now: currentTime,
  });

  await applyHouseDrawEntries({
    tx,
    userId,
    drawCost: drawState.drawCost,
    rewardAmount: outcome.rewardAmount,
    prizeId: outcome.prizeId,
  });

  const pityStreakAfter = await updateUserDrawState({
    tx,
    user,
    status: outcome.status,
    pityStreakBefore: drawState.pityStreakBefore,
    now: currentTime,
  });

  const { record, updatedPoolBalance } = await createDrawRecord({
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
    playMode: options?.playMode ?? null,
  });

  logger.info("draw executed", {
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
  return db.transaction(async (tx) => {
    const result = await executeDrawInTransaction(tx, userId, options);
    await assertWalletLedgerInvariant(tx, userId, {
      service: "draw",
      operation: "executeDraw",
    });
    return result;
  });
}
