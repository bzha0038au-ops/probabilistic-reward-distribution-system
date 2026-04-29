import Decimal from "decimal.js";
import { ledgerEntries, userWallets, users } from "@reward/database";
import { eq, sql } from "@reward/database/orm";
import type {
  PlayModeGameKey,
  PlayModeOutcome,
  PlayModeSnapshot,
  PlayModeType,
} from "@reward/shared-types/play-mode";

import type { DbTransaction } from "../../db";
import { conflictError, notFoundError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { applyPrizePoolDelta } from "../house/service";
import {
  createDeferredPayout,
  loadDeferredPayoutRows,
  markDeferredPayoutsReleased,
  type DeferredPayoutRow,
} from "./service";

type DeferredBalanceType = "bonus" | "withdrawable";
type DeferredFundingSource =
  | "draw_user_pool"
  | "prize_pool"
  | "locked_balance"
  | null;

const DEFERRED_WITHHOLD_ENTRY_TYPE = "play_mode_payout_deferred";
const DEFERRED_RELEASE_ENTRY_TYPE = "play_mode_payout_released";
const SNOWBALL_ENVELOPE_CAP = toDecimal("500.00");

const resolveFundingSourceForGame = (
  gameKey: PlayModeGameKey,
): DeferredFundingSource => {
  if (gameKey === "draw") {
    return "draw_user_pool";
  }
  if (gameKey === "blackjack") {
    return "prize_pool";
  }
  if (gameKey === "holdem") {
    return "locked_balance";
  }
  return null;
};

const loadLockedBalances = async (tx: DbTransaction, userId: number) => {
  const walletResult = await tx.execute(sql`
    SELECT
      user_id AS "userId",
      withdrawable_balance AS "withdrawableBalance",
      bonus_balance AS "bonusBalance",
      locked_balance AS "lockedBalance"
    FROM ${userWallets}
    WHERE user_id = ${userId}
    FOR UPDATE
  `);
  const [wallet] = readSqlRows<{
    userId: number;
    withdrawableBalance: string | number;
    bonusBalance: string | number;
    lockedBalance: string | number;
  }>(walletResult);
  if (!wallet) {
    throw notFoundError("Wallet not found.");
  }

  const userResult = await tx.execute(sql`
    SELECT
      id,
      user_pool_balance AS "userPoolBalance"
    FROM ${users}
    WHERE id = ${userId}
    FOR UPDATE
  `);
  const [user] = readSqlRows<{
    id: number;
    userPoolBalance: string | number;
  }>(userResult);
  if (!user) {
    throw notFoundError("User not found.");
  }

  return { wallet, user };
};

const applyWalletDelta = async (params: {
  tx: DbTransaction;
  userId: number;
  amount: ReturnType<typeof toDecimal>;
  balanceType: DeferredBalanceType;
  direction: "withhold" | "release";
  fundingSource: DeferredFundingSource;
  referenceType: string;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) => {
  if (params.amount.lte(0)) {
    return;
  }

  const { wallet, user } = await loadLockedBalances(params.tx, params.userId);
  const withdrawableBefore = toDecimal(wallet.withdrawableBalance ?? 0);
  const bonusBefore = toDecimal(wallet.bonusBalance ?? 0);
  const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
  const userPoolBefore = toDecimal(user.userPoolBalance ?? 0);
  const signedAmount =
    params.direction === "withhold" ? params.amount.negated() : params.amount;
  const withdrawableAfter =
    params.balanceType === "withdrawable"
      ? withdrawableBefore.plus(signedAmount)
      : withdrawableBefore;
  const bonusAfter =
    params.balanceType === "bonus"
      ? bonusBefore.plus(signedAmount)
      : bonusBefore;
  const lockedAfter =
    params.fundingSource === "locked_balance"
      ? params.direction === "withhold"
        ? lockedBefore.plus(params.amount)
        : lockedBefore.minus(params.amount)
      : lockedBefore;

  if (withdrawableAfter.lt(0) || bonusAfter.lt(0) || lockedAfter.lt(0)) {
    throw conflictError("Deferred payout balance adjustment would go negative.");
  }

  await params.tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      bonusBalance: toMoneyString(bonusAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, params.userId));

  await params.tx.insert(ledgerEntries).values({
    userId: params.userId,
    entryType:
      params.direction === "withhold"
        ? DEFERRED_WITHHOLD_ENTRY_TYPE
        : DEFERRED_RELEASE_ENTRY_TYPE,
    amount: toMoneyString(signedAmount),
    balanceBefore: toMoneyString(
      params.balanceType === "bonus" ? bonusBefore : withdrawableBefore,
    ),
    balanceAfter: toMoneyString(
      params.balanceType === "bonus" ? bonusAfter : withdrawableAfter,
    ),
    referenceType: params.referenceType,
    referenceId: params.referenceId ?? null,
      metadata: {
        balanceType: params.balanceType,
        direction: params.direction,
        lockedBefore: toMoneyString(lockedBefore),
        lockedAfter: toMoneyString(lockedAfter),
        ...(params.metadata ?? {}),
      },
    });

  if (params.fundingSource === "draw_user_pool") {
    const userPoolAfter =
      params.direction === "withhold"
        ? userPoolBefore.plus(params.amount)
        : userPoolBefore.minus(params.amount);
    await params.tx
      .update(users)
      .set({
        userPoolBalance: toMoneyString(
          params.direction === "release"
            ? userPoolAfter.gte(0)
              ? userPoolAfter
              : 0
            : userPoolAfter,
        ),
        updatedAt: new Date(),
      })
      .where(eq(users.id, params.userId));
  }

  if (params.fundingSource === "prize_pool") {
    await applyPrizePoolDelta(
      params.tx,
      params.direction === "withhold" ? params.amount : params.amount.negated(),
      {
        entryType:
          params.direction === "withhold"
            ? DEFERRED_WITHHOLD_ENTRY_TYPE
            : DEFERRED_RELEASE_ENTRY_TYPE,
        referenceType: params.referenceType,
        referenceId: params.referenceId ?? null,
        metadata: params.metadata ?? null,
      },
    );
  }
};

export const withholdDeferredPayout = async (params: {
  tx: DbTransaction;
  userId: number;
  amount: string;
  balanceType: DeferredBalanceType;
  fundingSource: DeferredFundingSource;
  referenceType: string;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) =>
  applyWalletDelta({
    ...params,
    amount: toDecimal(params.amount),
    direction: "withhold",
  });

export const releaseDeferredPayout = async (params: {
  tx: DbTransaction;
  userId: number;
  amount: string;
  balanceType: DeferredBalanceType;
  fundingSource: DeferredFundingSource;
  referenceType: string;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) =>
  applyWalletDelta({
    ...params,
    amount: toDecimal(params.amount),
    direction: "release",
  });

export const releasePendingDeferredPayoutsForMode = async (params: {
  tx: DbTransaction;
  userId: number;
  gameKey: PlayModeGameKey;
  mode: PlayModeType;
  triggerReferenceType?: string | null;
  triggerReferenceId?: number | null;
  metadataPatch?: Record<string, unknown> | null;
}) => {
  const rows = await loadDeferredPayoutRows(params.tx, {
    userId: params.userId,
    gameKey: params.gameKey,
    mode: params.mode,
    status: "pending",
  });
  if (rows.length === 0) {
    return {
      rows,
      totalAmount: "0.00",
      count: 0,
    };
  }

  const fundingSource = resolveFundingSourceForGame(params.gameKey);
  let totalAmount = toDecimal(0);
  for (const row of rows) {
    totalAmount = totalAmount.plus(row.amount);
    await releaseDeferredPayout({
      tx: params.tx,
      userId: params.userId,
      amount: String(row.amount),
      balanceType: row.balanceType,
      fundingSource,
      referenceType: params.triggerReferenceType ?? "play_mode_trigger",
      referenceId: params.triggerReferenceId ?? null,
      metadata: {
        deferredPayoutId: row.id,
        sourceReferenceType: row.sourceReferenceType ?? null,
        sourceReferenceId: row.sourceReferenceId ?? null,
      },
    });
  }

  await markDeferredPayoutsReleased({
    tx: params.tx,
    payoutIds: rows.map((row) => row.id),
    triggerReferenceType: params.triggerReferenceType ?? "play_mode_trigger",
    triggerReferenceId: params.triggerReferenceId ?? null,
    metadataPatch: params.metadataPatch ?? null,
  });

  return {
    rows,
    totalAmount: toMoneyString(totalAmount),
    count: rows.length,
  };
};

export const sumDeferredPayoutRows = (rows: DeferredPayoutRow[]) =>
  rows.reduce((sum, row) => sum.plus(row.amount), toDecimal(0));

export const applySettledPlayModePayoutPolicy = async (params: {
  tx: DbTransaction;
  userId: number;
  gameKey: PlayModeGameKey;
  outcome: PlayModeOutcome;
  settledSnapshot: PlayModeSnapshot;
  netPayoutAmount: string;
  balanceType: DeferredBalanceType;
  sessionId?: number | null;
  sourceReferenceType: string;
  sourceReferenceId?: number | null;
}) => {
  const fundingSource = resolveFundingSourceForGame(params.gameKey);
  const netPayoutAmount = toDecimal(params.netPayoutAmount);
  const pendingAmountBefore = toDecimal(params.settledSnapshot.pendingPayoutAmount);
  const pendingCountBefore = params.settledSnapshot.pendingPayoutCount;

  if (params.settledSnapshot.type === "deferred_double") {
    if (netPayoutAmount.lte(0)) {
      return {
        ...params.settledSnapshot,
        carryActive: pendingCountBefore > 0 || pendingAmountBefore.gt(0),
      };
    }

    await withholdDeferredPayout({
      tx: params.tx,
      userId: params.userId,
      amount: toMoneyString(netPayoutAmount),
      balanceType: params.balanceType,
      fundingSource,
      referenceType: params.sourceReferenceType,
      referenceId: params.sourceReferenceId ?? null,
      metadata: {
        mode: params.settledSnapshot.type,
      },
    });
    await createDeferredPayout({
      tx: params.tx,
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.settledSnapshot.type,
      balanceType: params.balanceType,
      amount: toMoneyString(netPayoutAmount),
      sourceSessionId: params.sessionId ?? null,
      sourceReferenceType: params.sourceReferenceType,
      sourceReferenceId: params.sourceReferenceId ?? null,
      metadata: {
        mode: params.settledSnapshot.type,
      },
    });

    const pendingAmountAfter = pendingAmountBefore.plus(netPayoutAmount);
    return {
      ...params.settledSnapshot,
      pendingPayoutAmount: toMoneyString(pendingAmountAfter),
      pendingPayoutCount: pendingCountBefore + 1,
      carryActive: true,
    };
  }

  if (params.settledSnapshot.type !== "snowball") {
    return params.settledSnapshot;
  }

  let pendingAmountAfter = pendingAmountBefore;
  let pendingCountAfter = pendingCountBefore;
  if (netPayoutAmount.gt(0)) {
    await withholdDeferredPayout({
      tx: params.tx,
      userId: params.userId,
      amount: toMoneyString(netPayoutAmount),
      balanceType: params.balanceType,
      fundingSource,
      referenceType: params.sourceReferenceType,
      referenceId: params.sourceReferenceId ?? null,
      metadata: {
        mode: params.settledSnapshot.type,
      },
    });
    pendingAmountAfter = pendingAmountAfter.plus(netPayoutAmount);
    pendingCountAfter += 1;
    const carryAmount = Decimal.min(pendingAmountAfter, SNOWBALL_ENVELOPE_CAP);
    const envelopeAmount = Decimal.max(
      pendingAmountAfter.minus(carryAmount),
      0,
    );
    await createDeferredPayout({
      tx: params.tx,
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.settledSnapshot.type,
      balanceType: params.balanceType,
      amount: toMoneyString(netPayoutAmount),
      sourceSessionId: params.sessionId ?? null,
      sourceReferenceType: params.sourceReferenceType,
      sourceReferenceId: params.sourceReferenceId ?? null,
      metadata: {
        mode: params.settledSnapshot.type,
        carryBucket:
          envelopeAmount.gt(0) && pendingAmountAfter.gt(SNOWBALL_ENVELOPE_CAP)
            ? "envelope"
            : "carry",
        envelopeCap: toMoneyString(SNOWBALL_ENVELOPE_CAP),
      },
    });
  }

  if (params.outcome === "win" || params.outcome === "push") {
    const carryAmount = Decimal.min(pendingAmountAfter, SNOWBALL_ENVELOPE_CAP);
    const envelopeAmount = Decimal.max(
      pendingAmountAfter.minus(carryAmount),
      0,
    );
    return {
      ...params.settledSnapshot,
      pendingPayoutAmount: toMoneyString(pendingAmountAfter),
      pendingPayoutCount: pendingCountAfter,
      carryActive: pendingAmountAfter.gt(0),
      snowballCarryAmount: toMoneyString(carryAmount),
      snowballEnvelopeAmount: toMoneyString(envelopeAmount),
    };
  }

  if (pendingCountAfter > 0 || pendingAmountAfter.gt(0)) {
    await releasePendingDeferredPayoutsForMode({
      tx: params.tx,
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.settledSnapshot.type,
      triggerReferenceType: params.sourceReferenceType,
      triggerReferenceId: params.sourceReferenceId ?? null,
      metadataPatch: {
        releasedOnOutcome: params.outcome,
      },
    });
  }

  return {
    ...params.settledSnapshot,
    pendingPayoutAmount: "0.00",
    pendingPayoutCount: 0,
    carryActive: false,
    snowballCarryAmount: "0.00",
    snowballEnvelopeAmount: "0.00",
  };
};
