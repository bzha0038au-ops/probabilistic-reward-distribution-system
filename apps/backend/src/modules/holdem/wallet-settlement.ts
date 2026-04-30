import {
  holdemTableSeats,
  ledgerEntries,
  userWallets,
} from "@reward/database";
import { eq } from "@reward/database/orm";
import type { HoldemTableType } from "@reward/shared-types/holdem";

import type { DbTransaction } from "../../db";
import {
  conflictError,
  internalInvariantError,
  notFoundError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import {
  adjustLockedAsset,
  lockAsset,
  unlockAsset,
} from "../economy/service";
import { applyHouseBankrollDelta, applyPrizePoolDelta } from "../house/service";
import {
  canUserLeaveTable,
  clearTableAfterCashout,
  type HoldemAppliedRake,
} from "./engine";
import { type HoldemTableState, isBotSeat } from "./model";
import {
  HOLDEM_CASUAL_ASSET_CODE,
  HOLDEM_REFERENCE_TYPE,
  buildHoldemRoundId,
  countBotSeats,
  distributeTournamentPayouts,
  ensureSeatTournamentMetadata,
  ensureTournamentMetadata,
  removeTournamentStanding,
  resolveHoldemFundingSource,
  resolveTournamentPayoutPlaces,
  syncTournamentStandings,
  usesHoldemEarnedAsset,
  type HoldemTableEventInput,
  type HoldemTableFundingSource,
  type HoldemTournamentMetadata,
  type LockedWalletRow,
  type PersistedHoldemTableEvent,
} from "./service-shared";

type SettleHoldemPlayModeSessionIfPresent = (params: {
  tx: DbTransaction;
  userId: number;
  tableId: number;
  cashOutAmount: ReturnType<typeof toDecimal>;
  balanceType: HoldemTableFundingSource;
}) => Promise<unknown>;

type LoadLockedWalletRows = (
  tx: DbTransaction,
  userIds: number[],
) => Promise<Map<number, LockedWalletRow>>;

type AppendTableEvents = (params: {
  tx: DbTransaction;
  tableId: number;
  events: HoldemTableEventInput[];
}) => Promise<PersistedHoldemTableEvent[]>;

type RemoveBotSeats = (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  predicate: (seat: HoldemTableState["seats"][number]) => boolean;
}) => Promise<HoldemTableState["seats"][number][]>;

export const applyBuyInToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
  tableType: HoldemTableType;
  balanceType: HoldemTableFundingSource;
}) => {
  const {
    tx,
    wallet,
    amount,
    tableId,
    tableName,
    seatIndex,
    tableType,
    balanceType,
  } = params;
  if (usesHoldemEarnedAsset(balanceType)) {
    const assetResult = await lockAsset(
      {
        userId: wallet.userId,
        assetCode: HOLDEM_CASUAL_ASSET_CODE,
        amount: toMoneyString(amount),
        entryType: "holdem_buy_in",
        referenceType: HOLDEM_REFERENCE_TYPE,
        referenceId: tableId,
        audit: {
          sourceApp: "backend.holdem",
          metadata: {
            balanceType,
            assetCode: HOLDEM_CASUAL_ASSET_CODE,
            tableName,
            seatIndex,
            tableType,
          },
        },
      },
      tx,
    );

    wallet.bonusBalance = assetResult.availableAfter;
    wallet.lockedBalance = assetResult.lockedAfter;
    return;
  }

  const withdrawableBefore = toDecimal(wallet.withdrawableBalance);
  const lockedBefore = toDecimal(wallet.lockedBalance);
  const sourceBefore = withdrawableBefore;
  if (sourceBefore.lt(amount)) {
    throw conflictError("Insufficient withdrawable balance.");
  }
  const withdrawableAfter = withdrawableBefore.minus(amount);
  const lockedAfter = lockedBefore.plus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, wallet.userId));

  await tx.insert(ledgerEntries).values({
    userId: wallet.userId,
    entryType: "holdem_buy_in",
    amount: toMoneyString(amount.negated()),
    balanceBefore: toMoneyString(sourceBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: tableId,
    metadata: {
      balanceType,
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      tableName,
      seatIndex,
      tableType,
    },
  });

  wallet.withdrawableBalance = toMoneyString(withdrawableAfter);
  wallet.lockedBalance = toMoneyString(lockedAfter);
};

const applyTournamentWithdrawableDelta = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  delta: ReturnType<typeof toDecimal>;
  entryType:
    | "holdem_tournament_buy_in"
    | "holdem_tournament_refund"
    | "holdem_tournament_payout";
  tableId: number;
  tableName: string;
  seatIndex: number | null;
  metadata?: Record<string, unknown>;
}) => {
  const withdrawableBefore = toDecimal(params.wallet.withdrawableBalance);
  const withdrawableAfter = withdrawableBefore.plus(params.delta);
  if (withdrawableAfter.lt(0)) {
    throw conflictError("Insufficient withdrawable balance.");
  }

  await params.tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, params.wallet.userId));

  await params.tx.insert(ledgerEntries).values({
    userId: params.wallet.userId,
    entryType: params.entryType,
    amount: toMoneyString(params.delta),
    balanceBefore: toMoneyString(withdrawableBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      balanceType: "withdrawable",
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      ...(params.metadata ?? {}),
    },
  });

  params.wallet.withdrawableBalance = toMoneyString(withdrawableAfter);
};

export const applyTournamentRefundToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
}) => {
  await applyTournamentWithdrawableDelta({
    tx: params.tx,
    wallet: params.wallet,
    delta: params.amount,
    entryType: "holdem_tournament_refund",
    tableId: params.tableId,
    tableName: params.tableName,
    seatIndex: params.seatIndex,
  });
  await applyPrizePoolDelta(params.tx, params.amount.negated(), {
    entryType: "holdem_tournament_pool_refund",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      tableType: "tournament",
    },
  });
};

export const applyTournamentBuyInToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
}) => {
  await applyTournamentWithdrawableDelta({
    tx: params.tx,
    wallet: params.wallet,
    delta: params.amount.negated(),
    entryType: "holdem_tournament_buy_in",
    tableId: params.tableId,
    tableName: params.tableName,
    seatIndex: params.seatIndex,
  });
  await applyPrizePoolDelta(params.tx, params.amount, {
    entryType: "holdem_tournament_pool_buy_in",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      tableType: "tournament",
    },
  });
};

export const applyTournamentPayoutToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number | null;
  place: number;
}) => {
  if (params.amount.lte(0)) {
    return;
  }

  await applyTournamentWithdrawableDelta({
    tx: params.tx,
    wallet: params.wallet,
    delta: params.amount,
    entryType: "holdem_tournament_payout",
    tableId: params.tableId,
    tableName: params.tableName,
    seatIndex: params.seatIndex,
    metadata: {
      place: params.place,
    },
  });
  await applyPrizePoolDelta(params.tx, params.amount.negated(), {
    entryType: "holdem_tournament_pool_payout",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      tableType: "tournament",
      place: params.place,
    },
  });
};

export const applyCashOutToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
  tableType: HoldemTableType;
  balanceType: HoldemTableFundingSource;
}) => {
  const {
    tx,
    wallet,
    amount,
    tableId,
    tableName,
    seatIndex,
    tableType,
    balanceType,
  } = params;
  if (amount.lte(0)) {
    return;
  }
  if (usesHoldemEarnedAsset(balanceType)) {
    const assetResult = await unlockAsset(
      {
        userId: wallet.userId,
        assetCode: HOLDEM_CASUAL_ASSET_CODE,
        amount: toMoneyString(amount),
        entryType: "holdem_cash_out",
        referenceType: HOLDEM_REFERENCE_TYPE,
        referenceId: tableId,
        audit: {
          sourceApp: "backend.holdem",
          metadata: {
            balanceType,
            assetCode: HOLDEM_CASUAL_ASSET_CODE,
            tableName,
            seatIndex,
            tableType,
          },
        },
      },
      tx,
    );

    wallet.bonusBalance = assetResult.availableAfter;
    wallet.lockedBalance = assetResult.lockedAfter;
    return;
  }

  const withdrawableBefore = toDecimal(wallet.withdrawableBalance);
  const lockedBefore = toDecimal(wallet.lockedBalance);
  if (lockedBefore.lt(amount)) {
    throw conflictError("Locked balance is lower than the table stack.");
  }
  const withdrawableAfter = withdrawableBefore.plus(amount);
  const lockedAfter = lockedBefore.minus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, wallet.userId));

  await tx.insert(ledgerEntries).values({
    userId: wallet.userId,
    entryType: "holdem_cash_out",
    amount: toMoneyString(amount),
    balanceBefore: toMoneyString(withdrawableBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: tableId,
    metadata: {
      balanceType,
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      tableName,
      seatIndex,
      tableType,
    },
  });

  wallet.withdrawableBalance = toMoneyString(withdrawableAfter);
  wallet.lockedBalance = toMoneyString(lockedAfter);
};

export const removeSeatAndCashOut = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  seatUserId: number;
  lockedWallets: Map<number, LockedWalletRow>;
  settleHoldemPlayModeSessionIfPresent: SettleHoldemPlayModeSessionIfPresent;
}) => {
  const seat = params.state.seats.find((entry) => entry.userId === params.seatUserId) ?? null;
  if (!seat) {
    throw conflictError("You are not seated at this holdem table.");
  }
  if (isBotSeat(seat)) {
    throw conflictError("Bot seats cannot use human cash-out flows.");
  }

  const wallet = params.lockedWallets.get(seat.userId);
  if (!wallet) {
    throw notFoundError("Wallet not found.");
  }

  const stackAmount = toDecimal(seat.stackAmount);
  await params.tx.delete(holdemTableSeats).where(eq(holdemTableSeats.id, seat.id));
  await applyCashOutToWallet({
    tx: params.tx,
    wallet,
    amount: stackAmount,
    tableId: params.state.id,
    tableName: params.state.name,
    seatIndex: seat.seatIndex,
    tableType: params.state.metadata.tableType,
    balanceType: resolveHoldemFundingSource(params.state.metadata.tableType),
  });
  await params.settleHoldemPlayModeSessionIfPresent({
    tx: params.tx,
    userId: seat.userId,
    tableId: params.state.id,
    cashOutAmount: stackAmount,
    balanceType: resolveHoldemFundingSource(params.state.metadata.tableType),
  });

  params.state.seats = params.state.seats.filter((entry) => entry.id !== seat.id);
  clearTableAfterCashout(params.state);
  if (params.state.status === "waiting") {
    params.state.metadata.activeHandHistoryId = null;
  }

  return {
    seat,
    stackAmount,
  };
};

export const removeTournamentSeatAndRefund = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  seatUserId: number;
  wallets: Map<number, LockedWalletRow>;
  settleHoldemPlayModeSessionIfPresent: SettleHoldemPlayModeSessionIfPresent;
}) => {
  ensureTournamentMetadata(params.state);
  const seat = params.state.seats.find((entry) => entry.userId === params.seatUserId) ?? null;
  if (!seat) {
    throw conflictError("You are not seated at this holdem tournament.");
  }

  const wallet = params.wallets.get(seat.userId);
  if (!wallet) {
    throw notFoundError("Wallet not found.");
  }

  const seatTournament = ensureSeatTournamentMetadata(seat);
  const refundAmount = toDecimal(seatTournament.entryBuyInAmount);

  await params.tx.delete(holdemTableSeats).where(eq(holdemTableSeats.id, seat.id));
  await applyTournamentRefundToWallet({
    tx: params.tx,
    wallet,
    amount: refundAmount,
    tableId: params.state.id,
    tableName: params.state.name,
    seatIndex: seat.seatIndex,
  });
  await params.settleHoldemPlayModeSessionIfPresent({
    tx: params.tx,
    userId: seat.userId,
    tableId: params.state.id,
    cashOutAmount: refundAmount,
    balanceType: "withdrawable",
  });

  params.state.seats = params.state.seats.filter((entry) => entry.id !== seat.id);
  removeTournamentStanding(params.state, seat.userId);

  return {
    seat,
    refundAmount,
  };
};

const buildTournamentPayoutPlan = (state: HoldemTableState) => {
  const tournament = ensureTournamentMetadata(state);
  const payoutPlaces = resolveTournamentPayoutPlaces(
    tournament.registeredCount,
    tournament.payoutPlaces,
  );
  tournament.payoutPlaces = payoutPlaces;

  return distributeTournamentPayouts(
    tournament.prizePoolAmount,
    payoutPlaces,
  ).map((amount, index) => ({
    place: index + 1,
    amount,
  }));
};

const upsertTournamentPayout = (
  tournament: HoldemTournamentMetadata,
  payout: {
    place: number;
    userId: number | null;
    displayName: string | null;
    amount: string;
    awardedAt: Date;
  },
) => {
  const existingIndex = tournament.payouts.findIndex(
    (entry) => entry.place === payout.place,
  );
  if (existingIndex >= 0) {
    tournament.payouts[existingIndex] = payout;
    return;
  }

  tournament.payouts.push(payout);
  tournament.payouts.sort((left, right) => left.place - right.place);
};

const findTournamentStandingByPlace = (
  tournament: HoldemTournamentMetadata,
  place: number,
) =>
  tournament.standings.find((entry) => entry.finishingPlace === place) ?? null;

export const settleTournamentAfterHand = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  wallets: Map<number, LockedWalletRow>;
  previousStacks: Map<number, ReturnType<typeof toDecimal>>;
  loadLockedWalletRows: LoadLockedWalletRows;
  appendTableEvents: AppendTableEvents;
  settleHoldemPlayModeSessionIfPresent: SettleHoldemPlayModeSessionIfPresent;
}) => {
  const tournament = ensureTournamentMetadata(params.state);
  const awardedAt = new Date();
  const bustedSeats = params.state.seats
    .filter((seat) => {
      const seatTournament = ensureSeatTournamentMetadata(seat);
      return (
        toDecimal(seat.stackAmount).lte(0) &&
        seatTournament.finishingPlace === null
      );
    })
    .sort((left, right) => {
      const leftPreviousStack = params.previousStacks.get(left.userId) ?? toDecimal(0);
      const rightPreviousStack =
        params.previousStacks.get(right.userId) ?? toDecimal(0);
      const stackComparison = leftPreviousStack.cmp(rightPreviousStack);
      if (stackComparison !== 0) {
        return stackComparison;
      }

      return left.seatIndex - right.seatIndex;
    });

  const activeSeats = params.state.seats.filter((seat) => {
    const seatTournament = ensureSeatTournamentMetadata(seat);
    return (
      toDecimal(seat.stackAmount).gt(0) &&
      seatTournament.finishingPlace === null
    );
  });

  if (bustedSeats.length === 0) {
    syncTournamentStandings(params.state);
    return [];
  }

  const tournamentEvents: HoldemTableEventInput[] = [];
  let finishingPlace = activeSeats.length + bustedSeats.length;
  for (const seat of bustedSeats) {
    const seatTournament = ensureSeatTournamentMetadata(seat);
    seatTournament.finishingPlace = finishingPlace;
    seatTournament.eliminatedAt = awardedAt;
    seatTournament.prizeAmount = null;
    syncTournamentStandings(params.state);
    tournamentEvents.push({
      eventType: "tournament_player_eliminated",
      actor: "system",
      userId: seat.userId,
      seatIndex: seat.seatIndex,
      payload: {
        tableName: params.state.name,
        handNumber: params.state.metadata.handNumber,
        finishingPlace,
      },
    });
    finishingPlace -= 1;
  }

  if (activeSeats.length <= 1) {
    const championSeat = activeSeats[0] ?? null;
    if (!championSeat) {
      throw internalInvariantError(
        "Holdem tournament settled without an active champion seat.",
      );
    }

    const championTournament = ensureSeatTournamentMetadata(championSeat);
    championTournament.finishingPlace = 1;
    championTournament.prizeAmount = null;
    syncTournamentStandings(params.state);

    const payoutPlan = buildTournamentPayoutPlan(params.state);
    const payoutRecipients = payoutPlan
      .map((entry) => {
        const standing = findTournamentStandingByPlace(tournament, entry.place);
        return standing
          ? {
              standing,
              place: entry.place,
              amount: entry.amount,
            }
          : null;
      })
      .filter(
        (
          entry,
        ): entry is {
          standing: HoldemTournamentMetadata["standings"][number];
          place: number;
          amount: string;
        } => entry !== null,
      );
    const missingWalletUserIds = payoutRecipients
      .map((entry) => entry.standing.userId)
      .filter(
        (userId): userId is number =>
          userId !== null && Number.isInteger(userId) && !params.wallets.has(userId),
      );
    if (missingWalletUserIds.length > 0) {
      const additionalWallets = await params.loadLockedWalletRows(
        params.tx,
        missingWalletUserIds,
      );
      for (const [userId, wallet] of additionalWallets.entries()) {
        params.wallets.set(userId, wallet);
      }
    }

    tournament.payouts = [];
    for (const payoutRecipient of payoutRecipients) {
      payoutRecipient.standing.prizeAmount = payoutRecipient.amount;
      const currentSeat =
        params.state.seats.find(
          (seat) => seat.userId === payoutRecipient.standing.userId,
        ) ?? null;
      if (currentSeat) {
        const currentSeatTournament = ensureSeatTournamentMetadata(currentSeat);
        currentSeatTournament.prizeAmount = payoutRecipient.amount;
      }

      if (payoutRecipient.standing.userId !== null) {
        const wallet = params.wallets.get(payoutRecipient.standing.userId);
        if (!wallet) {
          throw notFoundError("Wallet not found.");
        }

        await applyTournamentPayoutToWallet({
          tx: params.tx,
          wallet,
          amount: toDecimal(payoutRecipient.amount),
          tableId: params.state.id,
          tableName: params.state.name,
          seatIndex: payoutRecipient.standing.seatIndex,
          place: payoutRecipient.place,
        });
      }

      upsertTournamentPayout(tournament, {
        place: payoutRecipient.place,
        userId: payoutRecipient.standing.userId,
        displayName: payoutRecipient.standing.displayName,
        amount: payoutRecipient.amount,
        awardedAt,
      });
      tournamentEvents.push({
        eventType: "tournament_payout_awarded",
        actor: "system",
        userId: payoutRecipient.standing.userId,
        seatIndex: payoutRecipient.standing.seatIndex,
        payload: {
          tableName: params.state.name,
          handNumber: params.state.metadata.handNumber,
          place: payoutRecipient.place,
          amount: payoutRecipient.amount,
        },
      });
    }

    for (const standing of tournament.standings) {
      if (standing.userId === null) {
        continue;
      }

      await params.settleHoldemPlayModeSessionIfPresent({
        tx: params.tx,
        userId: standing.userId,
        tableId: params.state.id,
        cashOutAmount: toDecimal(standing.prizeAmount ?? 0),
        balanceType: "withdrawable",
      });
    }

    for (const seat of [...params.state.seats]) {
      await params.tx
        .delete(holdemTableSeats)
        .where(eq(holdemTableSeats.id, seat.id));
    }
    params.state.seats = [];
    clearTableAfterCashout(params.state);
    tournament.status = "completed";
    tournament.completedAt = awardedAt;
    syncTournamentStandings(params.state);
    tournamentEvents.push({
      eventType: "tournament_completed",
      actor: "system",
      payload: {
        tableName: params.state.name,
        prizePoolAmount: tournament.prizePoolAmount,
        payoutPlaces: tournament.payoutPlaces,
      },
    });

    return params.appendTableEvents({
      tx: params.tx,
      tableId: params.state.id,
      events: tournamentEvents,
    });
  }

  for (const seat of bustedSeats) {
    await params.tx
      .delete(holdemTableSeats)
      .where(eq(holdemTableSeats.id, seat.id));
  }
  const bustedSeatIds = new Set(bustedSeats.map((seat) => seat.id));
  params.state.seats = params.state.seats.filter(
    (seat) => !bustedSeatIds.has(seat.id),
  );
  tournament.completedAt = null;
  syncTournamentStandings(params.state);

  return params.appendTableEvents({
    tx: params.tx,
    tableId: params.state.id,
    events: tournamentEvents,
  });
};

export const settlePendingSeatCashOuts = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  lockedWallets: Map<number, LockedWalletRow>;
  removeBotSeats: RemoveBotSeats;
  settleHoldemPlayModeSessionIfPresent: SettleHoldemPlayModeSessionIfPresent;
}) => {
  const autoCashOuts: Array<{
    seatIndex: number;
    userId: number;
    cashOutAmount: string;
  }> = [];

  for (const seat of [...params.state.seats]) {
    if (isBotSeat(seat)) {
      if (toDecimal(seat.stackAmount).lte(0)) {
        await params.removeBotSeats({
          tx: params.tx,
          state: params.state,
          predicate: (entry) => entry.id === seat.id,
        });
      }
      continue;
    }

    if (!seat.autoCashOutPending || !canUserLeaveTable(params.state, seat.userId)) {
      continue;
    }

    const { seat: removedSeat, stackAmount } = await removeSeatAndCashOut({
      tx: params.tx,
      state: params.state,
      seatUserId: seat.userId,
      lockedWallets: params.lockedWallets,
      settleHoldemPlayModeSessionIfPresent:
        params.settleHoldemPlayModeSessionIfPresent,
    });
    autoCashOuts.push({
      seatIndex: removedSeat.seatIndex,
      userId: removedSeat.userId,
      cashOutAmount: toMoneyString(stackAmount),
    });
  }

  return autoCashOuts;
};

export const syncSettledLockedBalances = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  grossSettledState?: HoldemTableState | null;
  appliedRake?: HoldemAppliedRake | null;
  lockedWallets: Map<number, LockedWalletRow>;
  previousStacks: Map<number, ReturnType<typeof toDecimal>>;
  handHistoryId?: number | null;
}) => {
  const {
    tx,
    state,
    grossSettledState,
    appliedRake,
    lockedWallets,
    previousStacks,
    handHistoryId,
  } = params;
  const roundId = handHistoryId ? buildHoldemRoundId(handHistoryId) : null;
  const balanceType = resolveHoldemFundingSource(state.metadata.tableType);
  const rakeBySeatIndex = new Map(
    (appliedRake?.seatRakeAmounts ?? []).map((entry) => [
      entry.seatIndex,
      toDecimal(entry.amount),
    ] as const),
  );
  for (const seat of state.seats) {
    if (isBotSeat(seat)) {
      continue;
    }

    const previousStack = previousStacks.get(seat.userId) ?? toDecimal(0);
    const grossSeat =
      grossSettledState?.seats.find((entry) => entry.seatIndex === seat.seatIndex) ?? seat;
    const grossDelta = toDecimal(grossSeat.stackAmount).minus(previousStack);
    const rakeAmount = rakeBySeatIndex.get(seat.seatIndex) ?? toDecimal(0);
    const nextStack = toDecimal(seat.stackAmount);
    const netDelta = nextStack.minus(previousStack);
    if (netDelta.eq(0) && rakeAmount.eq(0) && grossDelta.eq(0)) {
      continue;
    }

    const wallet = lockedWallets.get(seat.userId);
    if (!wallet) {
      throw notFoundError("Wallet not found for seated holdem user.");
    }
    if (usesHoldemEarnedAsset(balanceType)) {
      if (grossDelta.eq(0) === false) {
        const grossResult = await adjustLockedAsset(
          {
            userId: seat.userId,
            assetCode: HOLDEM_CASUAL_ASSET_CODE,
            amount: toMoneyString(grossDelta),
            entryType: "holdem_hand_result",
            referenceType: HOLDEM_REFERENCE_TYPE,
            referenceId: state.id,
            audit: {
              sourceApp: "backend.holdem",
              metadata: {
                balanceType: "locked",
                assetCode: HOLDEM_CASUAL_ASSET_CODE,
                handNumber: state.metadata.handNumber,
                handHistoryId,
                roundId,
                tableName: state.name,
                tableType: state.metadata.tableType,
              },
            },
          },
          tx,
        );

        wallet.bonusBalance = grossResult.availableAfter;
        wallet.lockedBalance = grossResult.lockedAfter;
      }

      if (rakeAmount.gt(0)) {
        const rakeResult = await adjustLockedAsset(
          {
            userId: seat.userId,
            assetCode: HOLDEM_CASUAL_ASSET_CODE,
            amount: toMoneyString(rakeAmount.negated()),
            entryType: "holdem_rake",
            referenceType: HOLDEM_REFERENCE_TYPE,
            referenceId: state.id,
            audit: {
              sourceApp: "backend.holdem",
              metadata: {
                balanceType: "locked",
                assetCode: HOLDEM_CASUAL_ASSET_CODE,
                handNumber: state.metadata.handNumber,
                handHistoryId,
                roundId,
                tableName: state.name,
                tableType: state.metadata.tableType,
              },
            },
          },
          tx,
        );

        wallet.bonusBalance = rakeResult.availableAfter;
        wallet.lockedBalance = rakeResult.lockedAfter;
      }

      continue;
    }

    let lockedBefore = toDecimal(wallet.lockedBalance);

    if (grossDelta.eq(0) === false) {
      const lockedAfterGross = lockedBefore.plus(grossDelta);
      if (lockedAfterGross.lt(0)) {
        throw conflictError(
          "Locked balance drifted below zero during holdem settlement.",
        );
      }

      await tx
        .update(userWallets)
        .set({
          lockedBalance: toMoneyString(lockedAfterGross),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, seat.userId));

      await tx.insert(ledgerEntries).values({
        userId: seat.userId,
        entryType: "holdem_hand_result",
        amount: toMoneyString(grossDelta),
        balanceBefore: toMoneyString(lockedBefore),
        balanceAfter: toMoneyString(lockedAfterGross),
        referenceType: HOLDEM_REFERENCE_TYPE,
        referenceId: state.id,
        metadata: {
          balanceType: "locked",
          handNumber: state.metadata.handNumber,
          handHistoryId,
          roundId,
          tableName: state.name,
          tableType: state.metadata.tableType,
        },
      });

      lockedBefore = lockedAfterGross;
    }

    if (rakeAmount.gt(0)) {
      const lockedAfterRake = lockedBefore.minus(rakeAmount);
      if (lockedAfterRake.lt(0)) {
        throw conflictError("Locked balance drifted below zero after holdem rake.");
      }

      await tx
        .update(userWallets)
        .set({
          lockedBalance: toMoneyString(lockedAfterRake),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, seat.userId));

      await tx.insert(ledgerEntries).values({
        userId: seat.userId,
        entryType: "holdem_rake",
        amount: toMoneyString(rakeAmount.negated()),
        balanceBefore: toMoneyString(lockedBefore),
        balanceAfter: toMoneyString(lockedAfterRake),
        referenceType: HOLDEM_REFERENCE_TYPE,
        referenceId: state.id,
        metadata: {
          balanceType: "locked",
          handNumber: state.metadata.handNumber,
          handHistoryId,
          roundId,
          tableName: state.name,
          tableType: state.metadata.tableType,
        },
      });

      lockedBefore = lockedAfterRake;
    }

    wallet.lockedBalance = toMoneyString(lockedBefore);
  }

  const botNetDelta = state.seats.reduce((total, seat) => {
    if (!isBotSeat(seat)) {
      return total;
    }

    const previousStack = previousStacks.get(seat.userId) ?? toDecimal(0);
    return total.plus(toDecimal(seat.stackAmount).minus(previousStack));
  }, toDecimal(0));

  if (botNetDelta.eq(0) === false) {
    await applyHouseBankrollDelta(tx, botNetDelta, {
      entryType: "holdem_bot_bankroll_result",
      referenceType: HOLDEM_REFERENCE_TYPE,
      referenceId: state.id,
      metadata: {
        handNumber: state.metadata.handNumber,
        handHistoryId,
        roundId,
        tableName: state.name,
        tableType: state.metadata.tableType,
        botSeatCount: countBotSeats(state),
      },
    });
  }

  if (appliedRake && toDecimal(appliedRake.totalRakeAmount).gt(0)) {
    await applyHouseBankrollDelta(tx, appliedRake.totalRakeAmount, {
      entryType: "holdem_rake",
      referenceType: HOLDEM_REFERENCE_TYPE,
      referenceId: state.id,
      metadata: {
        handNumber: state.metadata.handNumber,
        handHistoryId,
        roundId,
        tableName: state.name,
        tableType: state.metadata.tableType,
      },
    });
  }
};
