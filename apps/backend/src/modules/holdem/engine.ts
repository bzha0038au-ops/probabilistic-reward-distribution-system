import { createHash } from "node:crypto";

import Decimal from "decimal.js";
import type {
  HoldemAction,
  HoldemActionAvailability,
  HoldemCard,
  HoldemCardView,
  HoldemFairness,
  HoldemPot,
  HoldemRecentHand,
  HoldemRealtimePublicSeat,
  HoldemRealtimePublicTable,
  HoldemTableRakePolicy,
  HoldemTable,
  HoldemTableSummary,
  HoldemStreet,
} from "@reward/shared-types/holdem";
import { HOLDEM_MIN_PLAYERS } from "@reward/shared-types/holdem";

import {
  badRequestError,
  conflictError,
  internalInvariantError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { evaluateBestHoldemHand, compareHoldemBestHands } from "./evaluator";
import {
  resolveSeatPresenceState,
  resolveSeatDisplayName,
  type HoldemSeatState,
  type HoldemTableState,
} from "./model";

type MoneyAmount = ReturnType<typeof toDecimal>;

const HOLDEM_DECK_TEMPLATE: HoldemCard[] = (
  ["spades", "hearts", "diamonds", "clubs"] as const
).flatMap((suit) =>
  (
    [
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
      "A",
    ] as const
  ).map((rank) => ({ rank, suit })),
);

const hashSha256Hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export type HoldemRakePolicy = HoldemTableRakePolicy;

export type HoldemAppliedRake = {
  totalRakeAmount: string;
  seatRakeAmounts: Array<{
    seatIndex: number;
    amount: string;
  }>;
};

const RECENT_HAND_LIMIT = 6;

const seatStack = (seat: Pick<HoldemSeatState, "stackAmount">) =>
  toDecimal(seat.stackAmount);
const seatCommitted = (seat: Pick<HoldemSeatState, "committedAmount">) =>
  toDecimal(seat.committedAmount);
const seatTotalCommitted = (
  seat: Pick<HoldemSeatState, "totalCommittedAmount">,
) => toDecimal(seat.totalCommittedAmount);

const currentBetAmount = (state: HoldemTableState) =>
  toDecimal(state.metadata.currentBet);

const lastFullRaiseAmount = (state: HoldemTableState) =>
  toDecimal(state.metadata.lastFullRaiseSize);

const smallBlindAmount = (state: HoldemTableState) => toDecimal(state.smallBlind);

const bigBlindAmount = (state: HoldemTableState) => toDecimal(state.bigBlind);

const sortSeatsByIndex = (seats: HoldemSeatState[]) =>
  seats.slice().sort((left, right) => left.seatIndex - right.seatIndex);

const toIsoStringOrNull = (value: string | Date | null | undefined) =>
  value ? new Date(value).toISOString() : null;

type SerializedHoldemTournamentState = NonNullable<HoldemTable["tournament"]>;

const serializeHoldemTournamentState = (
  tournament: HoldemTableState["metadata"]["tournament"],
): SerializedHoldemTournamentState | null => {
  if (!tournament) {
    return null;
  }

  return {
    ...tournament,
    payoutPlaces: Math.max(tournament.payoutPlaces ?? 1, 1),
    completedAt: toIsoStringOrNull(tournament.completedAt),
    standings: tournament.standings.map((standing) => ({
      ...standing,
      eliminatedAt: toIsoStringOrNull(standing.eliminatedAt),
    })),
    payouts: tournament.payouts.map((payout) => ({
      ...payout,
      awardedAt: toIsoStringOrNull(payout.awardedAt),
    })),
  };
};

const findSeatByIndex = (state: HoldemTableState, seatIndex: number | null) =>
  seatIndex === null
    ? null
    : state.seats.find((seat) => seat.seatIndex === seatIndex) ?? null;

const isSeatInHand = (seat: HoldemSeatState) =>
  seat.status === "active" ||
  seat.status === "all_in" ||
  seat.status === "folded";

const isSeatActionable = (seat: HoldemSeatState) =>
  seat.status === "active" && seatStack(seat).gt(0);

const isSeatEligibleForHand = (seat: HoldemSeatState) =>
  !seat.metadata.sittingOut && seatStack(seat).gt(0);

const listEligibleSeats = (state: HoldemTableState) =>
  sortSeatsByIndex(state.seats).filter(isSeatEligibleForHand);

const listNonFoldedSeats = (state: HoldemTableState) =>
  sortSeatsByIndex(state.seats).filter(
    (seat) => seat.status !== "folded" && isSeatInHand(seat),
  );

const listActionableSeats = (state: HoldemTableState) =>
  sortSeatsByIndex(state.seats).filter(isSeatActionable);

const awardToSeatStack = (seat: HoldemSeatState, amount: MoneyAmount) => {
  seat.stackAmount = toMoneyString(seatStack(seat).plus(amount));
};

const subtractFromSeatStack = (seat: HoldemSeatState, amount: MoneyAmount) => {
  if (amount.lte(0)) {
    return;
  }

  seat.stackAmount = toMoneyString(seatStack(seat).minus(amount));
};

const postFromStack = (seat: HoldemSeatState, amount: MoneyAmount) => {
  if (amount.lte(0)) {
    return toDecimal(0);
  }

  const transfer = Decimal.min(seatStack(seat), amount);
  const stackAfter = seatStack(seat).minus(transfer);
  seat.stackAmount = toMoneyString(stackAfter);
  seat.committedAmount = toMoneyString(seatCommitted(seat).plus(transfer));
  seat.totalCommittedAmount = toMoneyString(
    seatTotalCommitted(seat).plus(transfer),
  );
  if (stackAfter.eq(0)) {
    seat.status = "all_in";
  }
  return transfer;
};

const resetSettledBoardState = (state: HoldemTableState) => {
  state.metadata.stage = null;
  state.metadata.communityCards = [];
  state.metadata.deck = [];
  state.metadata.nextCardIndex = 0;
  state.metadata.fairnessSeed = null;
  state.metadata.pendingActorSeatIndex = null;
  state.metadata.currentBet = "0.00";
  state.metadata.lastFullRaiseSize = "0.00";
  state.metadata.actedSeatIndexes = [];
  state.metadata.fairness = null;
  state.metadata.revealedSeatIndexes = [];
  state.metadata.winnerSeatIndexes = [];
  state.metadata.resolvedPots = [];
};

const nextSeatIndex = (
  orderedSeatIndexes: number[],
  fromSeatIndex: number,
): number | null => {
  if (orderedSeatIndexes.length === 0) {
    return null;
  }

  const exactIndex = orderedSeatIndexes.findIndex((value) => value === fromSeatIndex);
  if (exactIndex >= 0) {
    return orderedSeatIndexes[(exactIndex + 1) % orderedSeatIndexes.length] ?? null;
  }

  const greater = orderedSeatIndexes.find((value) => value > fromSeatIndex);
  return greater ?? orderedSeatIndexes[0] ?? null;
};

const firstSeatIndex = (orderedSeatIndexes: number[]) => orderedSeatIndexes[0] ?? null;

const resolveNextDealerSeatIndex = (state: HoldemTableState) => {
  const eligibleSeatIndexes = listEligibleSeats(state).map((seat) => seat.seatIndex);
  if (eligibleSeatIndexes.length < HOLDEM_MIN_PLAYERS) {
    return null;
  }

  const previousDealer = state.metadata.dealerSeatIndex;
  if (previousDealer === null) {
    return firstSeatIndex(eligibleSeatIndexes);
  }

  return nextSeatIndex(eligibleSeatIndexes, previousDealer);
};

const resolveBlindSeats = (
  state: HoldemTableState,
  dealerSeatIndex: number,
) => {
  const eligibleSeatIndexes = listEligibleSeats(state).map((seat) => seat.seatIndex);
  if (eligibleSeatIndexes.length < HOLDEM_MIN_PLAYERS) {
    throw conflictError("At least two funded seats are required to start a hand.");
  }

  if (eligibleSeatIndexes.length === 2) {
    const bigBlindSeatIndex =
      eligibleSeatIndexes.find((seatIndex) => seatIndex !== dealerSeatIndex) ?? null;
    if (bigBlindSeatIndex === null) {
      throw internalInvariantError("Big blind seat is missing.");
    }
    return {
      smallBlindSeatIndex: dealerSeatIndex,
      bigBlindSeatIndex,
    };
  }

  const smallBlindSeatIndex = nextSeatIndex(eligibleSeatIndexes, dealerSeatIndex);
  const bigBlindSeatIndex =
    smallBlindSeatIndex === null
      ? null
      : nextSeatIndex(eligibleSeatIndexes, smallBlindSeatIndex);
  if (smallBlindSeatIndex === null || bigBlindSeatIndex === null) {
    throw internalInvariantError("Blind seats are missing.");
  }
  return {
    smallBlindSeatIndex,
    bigBlindSeatIndex,
  };
};

export const deriveHoldemHandSeed = (params: {
  seed: string;
  tableId: number;
  handNumber: number;
  seatUserIds: number[];
}) =>
  hashSha256Hex(
    [
      "holdem-hand-seed-v1",
      params.seed,
      String(params.tableId),
      String(params.handNumber),
      params.seatUserIds.join(","),
    ].join(":"),
  );

export const shuffleHoldemDeck = (params: {
  handSeed: string;
}) => {
  const deck = HOLDEM_DECK_TEMPLATE.map((card) => ({ ...card }));
  const digests: string[] = [];

  for (let cursor = deck.length - 1; cursor > 0; cursor -= 1) {
    const digest = createHash("sha256")
      .update(`${params.handSeed}:swap:${cursor}`, "utf8")
      .digest();
    const rawDigest = digest.toString("hex");
    const swapIndex = digest.readUInt32BE(0) % (cursor + 1);
    const currentCard = deck[cursor];
    const swapCard = deck[swapIndex];
    if (!currentCard || !swapCard) {
      throw internalInvariantError("Failed to shuffle holdem deck.");
    }

    deck[cursor] = swapCard;
    deck[swapIndex] = currentCard;
    digests.push(rawDigest);
  }

  return {
    deck,
    deckDigest: createHash("sha256")
      .update(deck.map((card) => `${card.rank}-${card.suit}`).join(":"))
      .digest("hex"),
    rngDigest: createHash("sha256").update(digests.join(":")).digest("hex"),
  };
};

export const buildHoldemFairness = (params: {
  epoch: number;
  epochSeconds: number;
  commitHash: string;
  sourceCommitHash?: string | null;
  deckDigest: string;
  rngDigest: string;
  revealSeed?: string | null;
  revealedAt?: Date | string | null;
}) => ({
  epoch: params.epoch,
  epochSeconds: params.epochSeconds,
  commitHash: params.commitHash,
  sourceCommitHash: params.sourceCommitHash ?? null,
  deckDigest: params.deckDigest,
  rngDigest: params.rngDigest,
  revealSeed: params.revealSeed ?? null,
  revealedAt: params.revealedAt
    ? new Date(params.revealedAt).toISOString()
    : null,
  algorithm:
    "handSeed=sha256(epochSeed:tableId:handNumber:seatUserIds); Fisher-Yates shuffle with sha256(handSeed:swap:index); no-limit hold'em button rotation and street deal order",
} satisfies HoldemFairness);

const revealHoldemFairness = (state: HoldemTableState) => {
  const handSeed = state.metadata.fairnessSeed;
  if (!state.metadata.fairness || !handSeed) {
    return;
  }

  state.metadata.fairness = buildHoldemFairness({
    ...state.metadata.fairness,
    revealSeed: handSeed,
    revealedAt: new Date(),
  });
  state.metadata.fairnessSeed = null;
};

const takeNextCard = (state: HoldemTableState) => {
  const nextCard = state.metadata.deck[state.metadata.nextCardIndex];
  if (!nextCard) {
    throw internalInvariantError("Holdem deck exhausted.");
  }
  state.metadata.nextCardIndex += 1;
  return nextCard;
};

const resolveDealOrder = (
  state: HoldemTableState,
  firstSeatIndexForDeal: number,
): HoldemSeatState[] => {
  const eligibleSeatIndexes = listEligibleSeats(state).map((seat) => seat.seatIndex);
  const orderedIndexes: number[] = [];
  let current = firstSeatIndexForDeal;
  for (let count = 0; count < eligibleSeatIndexes.length; count += 1) {
    orderedIndexes.push(current);
    current = nextSeatIndex(eligibleSeatIndexes, current) ?? current;
  }
  return orderedIndexes
    .map((seatIndex) => findSeatByIndex(state, seatIndex))
    .filter((seat): seat is HoldemSeatState => Boolean(seat));
};

const setActedSeats = (state: HoldemTableState, seatIndexes: number[]) => {
  state.metadata.actedSeatIndexes = seatIndexes;
};

const serializeHoldemFairness = (
  fairness: HoldemFairness | null,
): HoldemFairness | null =>
  fairness
    ? {
        ...fairness,
        revealedAt: fairness.revealedAt
          ? new Date(fairness.revealedAt).toISOString()
          : null,
      }
    : null;

const getActedSeatIndexes = (state: HoldemTableState) =>
  new Set(state.metadata.actedSeatIndexes ?? []);

const markSeatActed = (state: HoldemTableState, seatIndex: number) => {
  const acted = getActedSeatIndexes(state);
  acted.add(seatIndex);
  setActedSeats(state, [...acted].sort((left, right) => left - right));
};

const resetActedSeatsForNextResponse = (
  state: HoldemTableState,
  actorSeatIndex: number,
) => {
  const nextActed = sortSeatsByIndex(state.seats)
    .filter((seat) => seat.seatIndex === actorSeatIndex && seat.status === "active")
    .map((seat) => seat.seatIndex);
  setActedSeats(state, nextActed);
};

const hasRoundCompleted = (state: HoldemTableState) => {
  const activeSeats = listActionableSeats(state);
  if (activeSeats.length === 0) {
    return true;
  }

  const actedSeatIndexes = getActedSeatIndexes(state);
  const currentBet = currentBetAmount(state);
  return activeSeats.every(
    (seat) =>
      actedSeatIndexes.has(seat.seatIndex) && seatCommitted(seat).eq(currentBet),
  );
};

const resolveNextActionableSeatIndex = (
  state: HoldemTableState,
  fromSeatIndex: number,
) => {
  const actionableSeatIndexes = listActionableSeats(state).map(
    (seat) => seat.seatIndex,
  );
  if (actionableSeatIndexes.length === 0) {
    return null;
  }
  return nextSeatIndex(actionableSeatIndexes, fromSeatIndex);
};

const resolveFirstPostflopSeatIndex = (state: HoldemTableState) => {
  const actionableSeatIndexes = listActionableSeats(state).map(
    (seat) => seat.seatIndex,
  );
  if (actionableSeatIndexes.length === 0) {
    return null;
  }
  const dealerSeatIndex = state.metadata.dealerSeatIndex;
  if (dealerSeatIndex === null) {
    return actionableSeatIndexes[0] ?? null;
  }
  return nextSeatIndex(actionableSeatIndexes, dealerSeatIndex);
};

const resetStreetCommitments = (state: HoldemTableState) => {
  for (const seat of state.seats) {
    seat.committedAmount = "0.00";
    if (seat.status === "active" && seatStack(seat).eq(0)) {
      seat.status = "all_in";
    }
  }
  state.metadata.currentBet = "0.00";
  state.metadata.lastFullRaiseSize = toMoneyString(state.bigBlind);
  setActedSeats(state, []);
};

const buildPendingPotViews = (state: HoldemTableState): HoldemPot[] => {
  const contributingSeats = sortSeatsByIndex(state.seats).filter((seat) =>
    seatTotalCommitted(seat).gt(0),
  );
  if (contributingSeats.length === 0) {
    return [];
  }

  const contributionLevels = [...new Set(
    contributingSeats.map((seat) => seatTotalCommitted(seat).toFixed(2)),
  )]
    .map((value) => toDecimal(value))
    .sort((left, right) => left.comparedTo(right));

  const pots: HoldemPot[] = [];
  let previousLevel = toDecimal(0);
  for (const level of contributionLevels) {
    const involvedSeats = contributingSeats.filter((seat) =>
      seatTotalCommitted(seat).gte(level),
    );
    const potAmount = level.minus(previousLevel).mul(involvedSeats.length);
    if (potAmount.gt(0)) {
      const eligibleSeatIndexes = involvedSeats
        .filter((seat) => seat.status !== "folded")
        .map((seat) => seat.seatIndex);
      pots.push({
        potIndex: pots.length,
        kind: pots.length === 0 ? "main" : "side",
        amount: toMoneyString(potAmount),
        rakeAmount: "0.00",
        eligibleSeatIndexes,
        winnerSeatIndexes: [],
      });
    }
    previousLevel = level;
  }
  return pots;
};

const sortSeatIndexesLeftOfDealer = (
  state: HoldemTableState,
  seatIndexes: number[],
) => {
  const dealerSeatIndex = state.metadata.dealerSeatIndex ?? 0;
  const maxSeats = state.maxSeats;
  return seatIndexes
    .slice()
    .sort((left, right) => {
      const leftDistance = (left - dealerSeatIndex + maxSeats) % maxSeats;
      const rightDistance = (right - dealerSeatIndex + maxSeats) % maxSeats;
      return leftDistance - rightDistance;
    });
};

const formatPotWinners = (state: HoldemTableState, seatIndexes: number[]) =>
  sortSeatIndexesLeftOfDealer(state, seatIndexes).map((seatIndex) => {
    const seat = findSeatByIndex(state, seatIndex);
    if (!seat) {
      return `Seat ${seatIndex + 1}`;
    }
    return resolveSeatDisplayName(seat.userId, seat.userEmail);
  });

const distributeAmountAcrossSeatIndexes = (
  amount: MoneyAmount,
  seatIndexes: number[],
) => {
  const orderedSeatIndexes = seatIndexes.slice();
  const totalCents = Math.round(Number(amount) * 100);
  const shareCents = Math.floor(totalCents / orderedSeatIndexes.length);
  let remainder = totalCents % orderedSeatIndexes.length;
  const distributions = new Map<number, MoneyAmount>();

  for (const seatIndex of orderedSeatIndexes) {
    const extraCent = remainder > 0 ? 1 : 0;
    if (remainder > 0) {
      remainder -= 1;
    }
    distributions.set(
      seatIndex,
      toDecimal((shareCents + extraCent) / 100),
    );
  }

  return distributions;
};

const settleTableToWaiting = (state: HoldemTableState) => {
  state.status = "waiting";
  state.metadata.pendingActorSeatIndex = null;
  state.metadata.currentBet = "0.00";
  setActedSeats(state, []);
};

const settleByFold = (state: HoldemTableState, terminalStage: HoldemStreet) => {
  const remainingSeats = listNonFoldedSeats(state);
  const winnerSeat = remainingSeats[0] ?? null;
  if (!winnerSeat) {
    throw internalInvariantError("Unable to resolve folded holdem winner.");
  }

  const pots = buildPendingPotViews(state).map((pot) => ({
    ...pot,
    rakeAmount: "0.00",
    winnerSeatIndexes: [winnerSeat.seatIndex],
  }));
  const totalPot = pots.reduce(
    (sum, pot) => sum.plus(pot.amount),
    toDecimal(0),
  );

  awardToSeatStack(winnerSeat, totalPot);
  winnerSeat.metadata.winner = true;
  winnerSeat.lastAction = winnerSeat.lastAction ?? "Win";

  state.metadata.stage = "showdown";
  state.metadata.pendingActorSeatIndex = null;
  state.metadata.revealedSeatIndexes = [winnerSeat.seatIndex];
  state.metadata.winnerSeatIndexes = [winnerSeat.seatIndex];
  state.metadata.resolvedPots = pots;
  revealHoldemFairness(state);
  const recentHand: HoldemRecentHand = {
    roundId: null,
    handNumber: state.metadata.handNumber,
    stage: terminalStage,
    boardCards: [...state.metadata.communityCards],
    potAmount: toMoneyString(totalPot),
    rakeAmount: "0.00",
    winnerSeatIndexes: [winnerSeat.seatIndex],
    winnerLabels: formatPotWinners(state, [winnerSeat.seatIndex]),
    settledAt: new Date(),
  };
  state.metadata.recentHands = [
    recentHand,
    ...state.metadata.recentHands,
  ].slice(0, RECENT_HAND_LIMIT);

  for (const seat of state.seats) {
    seat.committedAmount = "0.00";
    seat.totalCommittedAmount = "0.00";
    if (seat.metadata.winner !== true) {
      seat.metadata.winner = false;
    }
    seat.status = "waiting";
  }

  settleTableToWaiting(state);
};

const settleShowdown = (state: HoldemTableState) => {
  const showdownSeats = listNonFoldedSeats(state);
  if (showdownSeats.length === 0) {
    throw internalInvariantError("Unable to resolve holdem showdown.");
  }

  const bestHands = new Map<number, ReturnType<typeof evaluateBestHoldemHand>>();
  for (const seat of showdownSeats) {
    const bestHand = evaluateBestHoldemHand([
      ...seat.holeCards,
      ...state.metadata.communityCards,
    ]);
    bestHands.set(seat.seatIndex, bestHand);
    seat.metadata.bestHand = {
      category: bestHand.category,
      label: bestHand.label,
      cards: bestHand.cards,
    };
  }

  const resolvedPots = buildPendingPotViews(state).map((pot) => {
    const eligibleSeats = pot.eligibleSeatIndexes
      .map((seatIndex) => findSeatByIndex(state, seatIndex))
      .filter(
        (seat): seat is HoldemSeatState =>
          seat !== null && seat.status !== "folded",
      );
    if (eligibleSeats.length === 0) {
      return pot;
    }

    let winnerSeats = [eligibleSeats[0]!];
    let winnerHand = bestHands.get(eligibleSeats[0]!.seatIndex);
    if (!winnerHand) {
      throw internalInvariantError("Missing holdem best hand.");
    }

    for (let index = 1; index < eligibleSeats.length; index += 1) {
      const contender = eligibleSeats[index]!;
      const contenderHand = bestHands.get(contender.seatIndex);
      if (!contenderHand) {
        throw internalInvariantError("Missing holdem contender hand.");
      }
      const comparison = compareHoldemBestHands(contenderHand, winnerHand);
      if (comparison > 0) {
        winnerSeats = [contender];
        winnerHand = contenderHand;
      } else if (comparison === 0) {
        winnerSeats.push(contender);
      }
    }

    const orderedWinnerIndexes = sortSeatIndexesLeftOfDealer(
      state,
      winnerSeats.map((seat) => seat.seatIndex),
    );
    const totalCents = Math.round(Number(pot.amount) * 100);
    const shareCents = Math.floor(totalCents / orderedWinnerIndexes.length);
    let remainder = totalCents % orderedWinnerIndexes.length;

    for (const seatIndex of orderedWinnerIndexes) {
      const seat = findSeatByIndex(state, seatIndex);
      if (!seat) {
        continue;
      }
      const extraCent = remainder > 0 ? 1 : 0;
      if (remainder > 0) {
        remainder -= 1;
      }
      const seatShare = toDecimal((shareCents + extraCent) / 100);
      awardToSeatStack(seat, seatShare);
      seat.metadata.winner = true;
    }

    return {
      ...pot,
      rakeAmount: "0.00",
      winnerSeatIndexes: orderedWinnerIndexes,
    };
  });

  const allWinnerSeatIndexes = [...new Set(
    resolvedPots.flatMap((pot) => pot.winnerSeatIndexes),
  )];
  const totalPotAmount = resolvedPots.reduce(
    (sum, pot) => sum.plus(pot.amount),
    toDecimal(0),
  );

  state.metadata.stage = "showdown";
  state.metadata.pendingActorSeatIndex = null;
  state.metadata.revealedSeatIndexes = showdownSeats.map((seat) => seat.seatIndex);
  state.metadata.winnerSeatIndexes = allWinnerSeatIndexes;
  state.metadata.resolvedPots = resolvedPots;
  revealHoldemFairness(state);
  const recentHand: HoldemRecentHand = {
    roundId: null,
    handNumber: state.metadata.handNumber,
    stage: "showdown",
    boardCards: [...state.metadata.communityCards],
    potAmount: toMoneyString(totalPotAmount),
    rakeAmount: "0.00",
    winnerSeatIndexes: allWinnerSeatIndexes,
    winnerLabels: formatPotWinners(state, allWinnerSeatIndexes),
    settledAt: new Date(),
  };
  state.metadata.recentHands = [
    recentHand,
    ...state.metadata.recentHands,
  ].slice(0, RECENT_HAND_LIMIT);

  for (const seat of state.seats) {
    seat.committedAmount = "0.00";
    seat.totalCommittedAmount = "0.00";
    seat.status = "waiting";
  }

  settleTableToWaiting(state);
};

const dealNextStreet = (state: HoldemTableState) => {
  const currentStage = state.metadata.stage;
  if (!currentStage) {
    throw internalInvariantError("Cannot advance holdem street without a stage.");
  }

  if (currentStage === "preflop") {
    state.metadata.communityCards.push(takeNextCard(state));
    state.metadata.communityCards.push(takeNextCard(state));
    state.metadata.communityCards.push(takeNextCard(state));
    state.metadata.stage = "flop";
  } else if (currentStage === "flop") {
    state.metadata.communityCards.push(takeNextCard(state));
    state.metadata.stage = "turn";
  } else if (currentStage === "turn") {
    state.metadata.communityCards.push(takeNextCard(state));
    state.metadata.stage = "river";
  } else {
    settleShowdown(state);
    return;
  }

  resetStreetCommitments(state);
  state.metadata.pendingActorSeatIndex = resolveFirstPostflopSeatIndex(state);
};

const resolveTerminalAndStreetProgression = (
  state: HoldemTableState,
  currentStage: HoldemStreet,
) => {
  while (state.status === "active") {
    if (listNonFoldedSeats(state).length <= 1) {
      settleByFold(state, currentStage);
      return;
    }

    if (!hasRoundCompleted(state)) {
      return;
    }

    if (state.metadata.stage === "river") {
      settleShowdown(state);
      return;
    }

    dealNextStreet(state);
    currentStage = state.metadata.stage ?? currentStage;
  }
};

const parseTargetAmount = (value: string | undefined, label: string) => {
  if (!value) {
    throw badRequestError(`${label} amount is required.`);
  }

  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw badRequestError(`Invalid ${label} amount.`);
  }

  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw badRequestError(`Invalid ${label} amount.`);
  }
  return amount;
};

export const resolveHoldemActionAvailability = (
  state: HoldemTableState,
  seatIndex: number,
): HoldemActionAvailability | null => {
  if (state.status !== "active" || state.metadata.pendingActorSeatIndex !== seatIndex) {
    return null;
  }

  const seat = findSeatByIndex(state, seatIndex);
  if (!seat || seat.status !== "active") {
    return null;
  }

  const currentBet = currentBetAmount(state);
  const committed = seatCommitted(seat);
  const stack = seatStack(seat);
  const toCall = Decimal.max(currentBet.minus(committed), 0);
  const maximumRaiseTo = committed.plus(stack);
  const minimumBetTo = bigBlindAmount(state);
  const minimumRaiseTo = currentBet.gt(0)
    ? currentBet.plus(lastFullRaiseAmount(state))
    : minimumBetTo;

  const actions: HoldemAction[] = [];
  if (toCall.gt(0)) {
    actions.push("fold", "call");
  } else {
    actions.push("check");
  }

  if (stack.gt(0) && currentBet.eq(0) && maximumRaiseTo.gte(minimumBetTo)) {
    actions.push("bet");
  }

  if (stack.gt(0) && currentBet.gt(0) && maximumRaiseTo.gte(minimumRaiseTo)) {
    actions.push("raise");
  }

  if (stack.gt(0)) {
    actions.push("all_in");
  }

  return {
    actions,
    toCall: toMoneyString(toCall),
    currentBet: toMoneyString(currentBet),
    minimumRaiseTo:
      currentBet.gt(0) && maximumRaiseTo.gte(minimumRaiseTo)
        ? toMoneyString(minimumRaiseTo)
        : null,
    maximumRaiseTo: stack.gt(0) ? toMoneyString(maximumRaiseTo) : null,
    minimumBetTo: toMoneyString(minimumBetTo),
  };
};

export const resolveHoldemTimeoutAction = (
  state: HoldemTableState,
  seatIndex: number,
): HoldemAction | null => {
  const availability = resolveHoldemActionAvailability(state, seatIndex);
  if (!availability) {
    return null;
  }
  if (availability.actions.includes("check")) {
    return "check";
  }
  if (availability.actions.includes("fold")) {
    return "fold";
  }
  return null;
};

const applyPassiveSeatAction = (
  state: HoldemTableState,
  seat: HoldemSeatState,
  action: HoldemAction,
) => {
  if (action === "fold") {
    seat.status = "folded";
    seat.lastAction = "Fold";
    state.metadata.pendingActorSeatIndex = resolveNextActionableSeatIndex(
      state,
      seat.seatIndex,
    );
    return;
  }

  if (action === "check") {
    if (seatCommitted(seat).lt(currentBetAmount(state))) {
      throw conflictError("You cannot check while facing a bet.");
    }
    seat.lastAction = "Check";
    markSeatActed(state, seat.seatIndex);
    state.metadata.pendingActorSeatIndex = resolveNextActionableSeatIndex(
      state,
      seat.seatIndex,
    );
    return;
  }

  if (action === "call") {
    const toCall = Decimal.max(
      currentBetAmount(state).minus(seatCommitted(seat)),
      0,
    );
    if (toCall.lte(0)) {
      throw conflictError("There is nothing to call.");
    }
    postFromStack(seat, toCall);
    seat.lastAction = "Call";
    markSeatActed(state, seat.seatIndex);
    state.metadata.pendingActorSeatIndex = resolveNextActionableSeatIndex(
      state,
      seat.seatIndex,
    );
  }
};

const applyBetOrRaise = (params: {
  state: HoldemTableState;
  seat: HoldemSeatState;
  action: "bet" | "raise" | "all_in";
  amount?: string;
}) => {
  const { state, seat, action, amount } = params;
  const committed = seatCommitted(seat);
  const currentBet = currentBetAmount(state);
  const stack = seatStack(seat);
  const totalAvailable = committed.plus(stack);
  const minimumBetTo = bigBlindAmount(state);
  const minimumRaiseTo = currentBet.plus(lastFullRaiseAmount(state));

  let targetTotal: MoneyAmount;
  if (action === "all_in") {
    targetTotal = totalAvailable;
  } else if (action === "bet") {
    if (currentBet.gt(0)) {
      throw conflictError("Use raise when betting is already open.");
    }
    targetTotal = parseTargetAmount(amount, "Bet");
    if (targetTotal.lt(minimumBetTo)) {
      throw conflictError("Bet amount is below the big blind.");
    }
  } else {
    if (currentBet.lte(0)) {
      throw conflictError("Use bet when no one has opened the action.");
    }
    targetTotal = parseTargetAmount(amount, "Raise");
    if (targetTotal.lt(minimumRaiseTo)) {
      throw conflictError("Raise amount is below the minimum raise.");
    }
  }

  if (targetTotal.gt(totalAvailable)) {
    throw conflictError("Action exceeds the chips available in front of you.");
  }

  if (targetTotal.lte(committed)) {
    throw conflictError("Action amount must move the current bet forward.");
  }

  const transfer = targetTotal.minus(committed);
  postFromStack(seat, transfer);
  const previousCurrentBet = currentBet;
  const increasedBet = targetTotal.gt(previousCurrentBet);
  if (increasedBet) {
    state.metadata.currentBet = toMoneyString(targetTotal);
  }

  if (action === "bet") {
    state.metadata.lastFullRaiseSize = toMoneyString(targetTotal);
    seat.lastAction = "Bet";
  } else if (action === "raise") {
    state.metadata.lastFullRaiseSize = toMoneyString(targetTotal.minus(previousCurrentBet));
    seat.lastAction = "Raise";
  } else {
    seat.lastAction = "All-in";
    const raiseSize = targetTotal.minus(previousCurrentBet);
    if (currentBet.eq(0) && targetTotal.gte(minimumBetTo)) {
      state.metadata.lastFullRaiseSize = toMoneyString(targetTotal);
    } else if (currentBet.gt(0) && raiseSize.gte(lastFullRaiseAmount(state))) {
      state.metadata.lastFullRaiseSize = toMoneyString(raiseSize);
    }
  }

  resetActedSeatsForNextResponse(state, seat.seatIndex);
  state.metadata.pendingActorSeatIndex = resolveNextActionableSeatIndex(
    state,
    seat.seatIndex,
  );
};

export const startHoldemHand = (
  state: HoldemTableState,
  params: {
    fairnessSeed: {
      seed: string;
      epoch: number;
      epochSeconds: number;
      commitHash: string;
    };
  },
) => {
  if (state.status === "active") {
    throw conflictError("Finish the active hand before starting another one.");
  }

  const eligibleSeats = listEligibleSeats(state);
  if (eligibleSeats.length < HOLDEM_MIN_PLAYERS) {
    throw conflictError("At least two funded seats are required to start a hand.");
  }

  const dealerSeatIndex = resolveNextDealerSeatIndex(state);
  if (dealerSeatIndex === null) {
    throw internalInvariantError("Dealer seat is missing.");
  }
  const { smallBlindSeatIndex, bigBlindSeatIndex } = resolveBlindSeats(
    state,
    dealerSeatIndex,
  );
  const dealOrder = resolveDealOrder(state, smallBlindSeatIndex);

  for (const seat of state.seats) {
    seat.committedAmount = "0.00";
    seat.totalCommittedAmount = "0.00";
    seat.holeCards = [];
    seat.lastAction = null;
    seat.metadata.winner = false;
    seat.metadata.bestHand = null;
    seat.status = isSeatEligibleForHand(seat) ? "active" : "waiting";
  }

  const handNumber = state.metadata.handNumber + 1;
  const handSeed = deriveHoldemHandSeed({
    seed: params.fairnessSeed.seed,
    tableId: state.id,
    handNumber,
    seatUserIds: eligibleSeats.map((seat) => seat.userId),
  });
  const handCommitHash = hashSha256Hex(handSeed);
  const { deck, deckDigest, rngDigest } = shuffleHoldemDeck({
    handSeed,
  });

  state.status = "active";
  state.metadata.handNumber = handNumber;
  state.metadata.stage = "preflop";
  state.metadata.dealerSeatIndex = dealerSeatIndex;
  state.metadata.smallBlindSeatIndex = smallBlindSeatIndex;
  state.metadata.bigBlindSeatIndex = bigBlindSeatIndex;
  state.metadata.communityCards = [];
  state.metadata.deck = deck;
  state.metadata.nextCardIndex = 0;
  state.metadata.fairnessSeed = handSeed;
  state.metadata.currentBet = "0.00";
  state.metadata.lastFullRaiseSize = toMoneyString(state.bigBlind);
  state.metadata.fairness = buildHoldemFairness({
    epoch: params.fairnessSeed.epoch,
    epochSeconds: params.fairnessSeed.epochSeconds,
    commitHash: handCommitHash,
    sourceCommitHash: params.fairnessSeed.commitHash,
    deckDigest,
    rngDigest,
  });
  state.metadata.revealedSeatIndexes = [];
  state.metadata.winnerSeatIndexes = [];
  state.metadata.resolvedPots = [];

  for (let round = 0; round < 2; round += 1) {
    for (const seat of dealOrder) {
      seat.holeCards.push(takeNextCard(state));
    }
  }

  const smallBlindSeat = findSeatByIndex(state, smallBlindSeatIndex);
  const bigBlindSeat = findSeatByIndex(state, bigBlindSeatIndex);
  if (!smallBlindSeat || !bigBlindSeat) {
    throw internalInvariantError("Blind seat state is missing.");
  }

  postFromStack(smallBlindSeat, smallBlindAmount(state));
  smallBlindSeat.lastAction = "Small blind";
  postFromStack(bigBlindSeat, bigBlindAmount(state));
  bigBlindSeat.lastAction = "Big blind";

  state.metadata.currentBet = toMoneyString(
    Decimal.max(seatCommitted(bigBlindSeat), seatCommitted(smallBlindSeat)),
  );
  setActedSeats(state, []);
  state.metadata.pendingActorSeatIndex = resolveNextActionableSeatIndex(
    state,
    bigBlindSeatIndex,
  );
  resolveTerminalAndStreetProgression(state, "preflop");
};

export const actOnHoldemSeat = (
  state: HoldemTableState,
  params: {
    seatIndex: number;
    action: HoldemAction;
    amount?: string;
  },
) => {
  if (state.status !== "active" || !state.metadata.stage) {
    throw conflictError("There is no active holdem hand at this table.");
  }

  const seat = findSeatByIndex(state, params.seatIndex);

  if (!seat || state.metadata.pendingActorSeatIndex !== seat.seatIndex) {
    throw conflictError("It is not your turn to act.");
  }

  if (seat.status !== "active") {
    throw conflictError("This seat cannot act right now.");
  }

  const availableActions = resolveHoldemActionAvailability(state, seat.seatIndex);
  if (!availableActions || !availableActions.actions.includes(params.action)) {
    throw conflictError("That holdem action is not available right now.");
  }

  const currentStage = state.metadata.stage;

  if (
    params.action === "fold" ||
    params.action === "check" ||
    params.action === "call"
  ) {
    applyPassiveSeatAction(state, seat, params.action);
  } else if (params.action === "bet" || params.action === "raise") {
    applyBetOrRaise({
      state,
      seat,
      action: params.action,
      amount: params.amount,
    });
  } else {
    applyBetOrRaise({
      state,
      seat,
      action: "all_in",
    });
  }

  resolveTerminalAndStreetProgression(state, currentStage);
};

export const actOnHoldemTable = (
  state: HoldemTableState,
  params: {
    userId: number;
    action: HoldemAction;
    amount?: string;
  },
) => {
  const seat = state.seats.find((entry) => entry.userId === params.userId) ?? null;
  if (!seat) {
    throw conflictError("You are not seated at this holdem table.");
  }

  actOnHoldemSeat(state, {
    seatIndex: seat.seatIndex,
    action: params.action,
    amount: params.amount,
  });
};

export const applyRakeToSettledState = (
  state: HoldemTableState,
  policy: HoldemRakePolicy,
): HoldemAppliedRake => {
  if (
    state.status !== "waiting" ||
    state.metadata.stage !== "showdown" ||
    state.metadata.resolvedPots.length === 0
  ) {
    return {
      totalRakeAmount: "0.00",
      seatRakeAmounts: [],
    };
  }

  if (
    policy.noFlopNoDrop &&
    state.metadata.communityCards.length < 3
  ) {
    return {
      totalRakeAmount: "0.00",
      seatRakeAmounts: [],
    };
  }

  const capAmount = toDecimal(policy.capAmount);
  const totalPotAmount = state.metadata.resolvedPots.reduce(
    (sum, pot) => sum.plus(pot.amount),
    toDecimal(0),
  );
  const totalRakeAmount = Decimal.min(
    totalPotAmount
      .mul(policy.rakeBps)
      .div(10_000)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN),
    capAmount,
  );

  if (totalRakeAmount.lte(0)) {
    return {
      totalRakeAmount: "0.00",
      seatRakeAmounts: [],
    };
  }

  const seatRakeTotals = new Map<number, MoneyAmount>();
  let remainingRakeAmount = totalRakeAmount;

  state.metadata.resolvedPots = state.metadata.resolvedPots.map((pot) => {
    const potAmount = toDecimal(pot.amount);
    const potRakeAmount = Decimal.min(remainingRakeAmount, potAmount);
    if (potRakeAmount.lte(0) || pot.winnerSeatIndexes.length === 0) {
      return {
        ...pot,
        rakeAmount: "0.00",
      };
    }

    // Rake is taken pot-by-pot from main to side so cap handling stays deterministic.
    const seatRakeBySeatIndex = distributeAmountAcrossSeatIndexes(
      potRakeAmount,
      pot.winnerSeatIndexes,
    );
    for (const [seatIndex, seatRakeAmount] of seatRakeBySeatIndex.entries()) {
      const seat = findSeatByIndex(state, seatIndex);
      if (!seat) {
        continue;
      }
      subtractFromSeatStack(seat, seatRakeAmount);
      seatRakeTotals.set(
        seatIndex,
        (seatRakeTotals.get(seatIndex) ?? toDecimal(0)).plus(seatRakeAmount),
      );
    }

    remainingRakeAmount = remainingRakeAmount.minus(potRakeAmount);
    return {
      ...pot,
      rakeAmount: toMoneyString(potRakeAmount),
    };
  });

  if (state.metadata.recentHands[0]) {
    state.metadata.recentHands[0].rakeAmount = toMoneyString(totalRakeAmount);
  }

  return {
    totalRakeAmount: toMoneyString(totalRakeAmount),
    seatRakeAmounts: [...seatRakeTotals.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([seatIndex, amount]) => ({
        seatIndex,
        amount: toMoneyString(amount),
      })),
  };
};

const toCardView = (
  card: HoldemCard,
  hidden: boolean,
): HoldemCardView => ({
  rank: hidden ? null : card.rank,
  suit: hidden ? null : card.suit,
  hidden,
});

const buildSeatViewCards = (
  state: HoldemTableState,
  viewerUserId: number,
  seat: HoldemSeatState,
) => {
  const revealCards =
    seat.userId === viewerUserId ||
    state.metadata.revealedSeatIndexes.includes(seat.seatIndex);
  return seat.holeCards.map((card) => toCardView(card, !revealCards));
};

const buildCommunityCardViews = (state: HoldemTableState) =>
  state.metadata.communityCards.map((card) => toCardView(card, false));

const buildRealtimeSeatSnapshot = (
  state: HoldemTableState,
  seat: HoldemSeatState,
): HoldemRealtimePublicSeat => {
  const revealed = state.metadata.revealedSeatIndexes.includes(seat.seatIndex);

  return {
    seatIndex: seat.seatIndex,
    userId: seat.userId,
    displayName: resolveSeatDisplayName(seat.userId, seat.userEmail),
    connectionState: resolveSeatPresenceState(seat),
    disconnectGraceExpiresAt: seat.disconnectGraceExpiresAt
      ? new Date(seat.disconnectGraceExpiresAt).toISOString()
      : null,
    seatLeaseExpiresAt: seat.seatLeaseExpiresAt
      ? new Date(seat.seatLeaseExpiresAt).toISOString()
      : null,
    autoCashOutPending: seat.autoCashOutPending ?? false,
    turnDeadlineAt: seat.turnDeadlineAt ? new Date(seat.turnDeadlineAt).toISOString() : null,
    timeBankRemainingMs: seat.metadata.timeBankRemainingMs,
    stackAmount: toMoneyString(seat.stackAmount),
    committedAmount: toMoneyString(seat.committedAmount),
    totalCommittedAmount: toMoneyString(seat.totalCommittedAmount),
    status: seat.status,
    inHand: isSeatInHand(seat) || seat.holeCards.length > 0,
    sittingOut: seat.metadata.sittingOut,
    isDealer: state.metadata.dealerSeatIndex === seat.seatIndex,
    isSmallBlind: state.metadata.smallBlindSeatIndex === seat.seatIndex,
    isBigBlind: state.metadata.bigBlindSeatIndex === seat.seatIndex,
    isCurrentTurn: state.metadata.pendingActorSeatIndex === seat.seatIndex,
    winner: seat.metadata.winner,
    bestHand: revealed ? seat.metadata.bestHand : null,
    lastAction: seat.lastAction ?? null,
    revealedCards: revealed ? seat.holeCards : [],
  };
};

const canStartHoldemTable = (state: HoldemTableState) => {
  if (
    state.metadata.tableType === "tournament" &&
    state.metadata.tournament?.status === "completed"
  ) {
    return false;
  }

  return state.status === "waiting" && listEligibleSeats(state).length >= HOLDEM_MIN_PLAYERS;
};

export const serializeHoldemRealtimeTable = (
  state: HoldemTableState,
): HoldemRealtimePublicTable => {
  const pendingActorSeat =
    state.metadata.pendingActorSeatIndex === null
      ? null
      : findSeatByIndex(state, state.metadata.pendingActorSeatIndex);

  return {
    id: state.id,
    name: state.name,
    tableType: state.metadata.tableType,
    status: state.status,
    rakePolicy: state.metadata.rakePolicy,
    tournament: serializeHoldemTournamentState(state.metadata.tournament),
    handNumber: state.metadata.handNumber,
    stage: state.metadata.stage,
    smallBlind: toMoneyString(state.smallBlind),
    bigBlind: toMoneyString(state.bigBlind),
    minimumBuyIn: toMoneyString(state.minimumBuyIn),
    maximumBuyIn: toMoneyString(state.maximumBuyIn),
    maxSeats: state.maxSeats,
    occupiedSeats: state.seats.length,
    canStart: canStartHoldemTable(state),
    communityCards: state.metadata.communityCards,
    pots:
      state.status === "active"
        ? buildPendingPotViews(state)
        : state.metadata.resolvedPots,
    seats: sortSeatsByIndex(state.seats).map((seat) =>
      buildRealtimeSeatSnapshot(state, seat),
    ),
    dealerSeatIndex: state.metadata.dealerSeatIndex,
    smallBlindSeatIndex: state.metadata.smallBlindSeatIndex,
    bigBlindSeatIndex: state.metadata.bigBlindSeatIndex,
    pendingActorSeatIndex: state.metadata.pendingActorSeatIndex,
    pendingActorDeadlineAt: pendingActorSeat?.turnDeadlineAt
      ? new Date(pendingActorSeat.turnDeadlineAt).toISOString()
      : null,
    pendingActorTimeBankStartsAt: state.metadata.turnTimeBankStartsAt
      ? new Date(state.metadata.turnTimeBankStartsAt).toISOString()
      : null,
    pendingActorTimeoutAction:
      state.metadata.pendingActorSeatIndex === null
        ? null
        : resolveHoldemTimeoutAction(state, state.metadata.pendingActorSeatIndex),
    fairness: serializeHoldemFairness(state.metadata.fairness),
    revealedSeatIndexes: state.metadata.revealedSeatIndexes,
    winnerSeatIndexes: state.metadata.winnerSeatIndexes,
    recentHands: state.metadata.recentHands.map((hand) => ({
      ...hand,
      settledAt: new Date(hand.settledAt).toISOString(),
    })),
    updatedAt: new Date(state.updatedAt).toISOString(),
  };
};

export const serializeHoldemTable = (
  state: HoldemTableState,
  viewerUserId: number,
): HoldemTable => {
  const heroSeat = state.seats.find((seat) => seat.userId === viewerUserId) ?? null;
  const heroSeatIndex = heroSeat?.seatIndex ?? null;
  const seatsByIndex = new Map(state.seats.map((seat) => [seat.seatIndex, seat] as const));
  const activePots =
    state.status === "active" ? buildPendingPotViews(state) : state.metadata.resolvedPots;

  const seats = Array.from({ length: state.maxSeats }, (_, seatIndex) => {
    const seat = seatsByIndex.get(seatIndex) ?? null;
    if (!seat) {
      return {
        seatIndex,
        userId: null,
        displayName: null,
        connectionState: null,
        disconnectGraceExpiresAt: null,
        seatLeaseExpiresAt: null,
        autoCashOutPending: false,
        turnDeadlineAt: null,
        timeBankRemainingMs: 0,
        stackAmount: "0.00",
        committedAmount: "0.00",
        totalCommittedAmount: "0.00",
        status: null,
        cards: [],
        inHand: false,
        sittingOut: false,
        isDealer: state.metadata.dealerSeatIndex === seatIndex,
        isSmallBlind: state.metadata.smallBlindSeatIndex === seatIndex,
        isBigBlind: state.metadata.bigBlindSeatIndex === seatIndex,
        isCurrentTurn: state.metadata.pendingActorSeatIndex === seatIndex,
        winner: false,
        bestHand: null,
        lastAction: null,
      };
    }

    return {
      seatIndex,
      userId: seat.userId,
      displayName: resolveSeatDisplayName(seat.userId, seat.userEmail),
      connectionState: resolveSeatPresenceState(seat),
      disconnectGraceExpiresAt: toIsoStringOrNull(seat.disconnectGraceExpiresAt),
      seatLeaseExpiresAt: toIsoStringOrNull(seat.seatLeaseExpiresAt),
      autoCashOutPending: seat.autoCashOutPending ?? false,
      turnDeadlineAt: toIsoStringOrNull(seat.turnDeadlineAt),
      timeBankRemainingMs: seat.metadata.timeBankRemainingMs,
      stackAmount: toMoneyString(seat.stackAmount),
      committedAmount: toMoneyString(seat.committedAmount),
      totalCommittedAmount: toMoneyString(seat.totalCommittedAmount),
      status: seat.status,
      cards: buildSeatViewCards(state, viewerUserId, seat),
      inHand: isSeatInHand(seat) || seat.holeCards.length > 0,
      sittingOut: seat.metadata.sittingOut,
      isDealer: state.metadata.dealerSeatIndex === seatIndex,
      isSmallBlind: state.metadata.smallBlindSeatIndex === seatIndex,
      isBigBlind: state.metadata.bigBlindSeatIndex === seatIndex,
      isCurrentTurn: state.metadata.pendingActorSeatIndex === seatIndex,
      winner: seat.metadata.winner,
      bestHand: seat.metadata.bestHand,
      lastAction: seat.lastAction ?? null,
    };
  });

  return {
    id: state.id,
    name: state.name,
    tableType: state.metadata.tableType,
    status: state.status,
    rakePolicy: state.metadata.rakePolicy,
    tournament: serializeHoldemTournamentState(state.metadata.tournament),
    handNumber: state.metadata.handNumber,
    stage: state.metadata.stage,
    smallBlind: toMoneyString(state.smallBlind),
    bigBlind: toMoneyString(state.bigBlind),
    minimumBuyIn: toMoneyString(state.minimumBuyIn),
    maximumBuyIn: toMoneyString(state.maximumBuyIn),
    maxSeats: state.maxSeats,
    communityCards: buildCommunityCardViews(state),
    pots: activePots,
    seats,
    heroSeatIndex,
    pendingActorSeatIndex: state.metadata.pendingActorSeatIndex,
    pendingActorDeadlineAt:
      state.metadata.pendingActorSeatIndex === null
        ? null
        : toIsoStringOrNull(
            findSeatByIndex(state, state.metadata.pendingActorSeatIndex)
              ?.turnDeadlineAt ?? null,
          ),
    pendingActorTimeBankStartsAt: toIsoStringOrNull(
      state.metadata.turnTimeBankStartsAt,
    ),
    pendingActorTimeoutAction:
      state.metadata.pendingActorSeatIndex === null
        ? null
        : resolveHoldemTimeoutAction(state, state.metadata.pendingActorSeatIndex),
    availableActions:
      heroSeatIndex === null
        ? null
        : resolveHoldemActionAvailability(state, heroSeatIndex),
    fairness: serializeHoldemFairness(state.metadata.fairness),
    recentHands: state.metadata.recentHands.map((hand) => ({
      ...hand,
      settledAt: toIsoStringOrNull(hand.settledAt) ?? hand.settledAt,
    })),
    dealerEvents: state.metadata.dealerEvents,
    createdAt: new Date(state.createdAt).toISOString(),
    updatedAt: new Date(state.updatedAt).toISOString(),
  };
};

export const serializeHoldemTableSummary = (
  state: HoldemTableState,
  viewerUserId: number,
): HoldemTableSummary => ({
  id: state.id,
  name: state.name,
  tableType: state.metadata.tableType,
  status: state.status,
  rakePolicy: state.metadata.rakePolicy,
  tournament: serializeHoldemTournamentState(state.metadata.tournament),
  smallBlind: toMoneyString(state.smallBlind),
  bigBlind: toMoneyString(state.bigBlind),
  minimumBuyIn: toMoneyString(state.minimumBuyIn),
  maximumBuyIn: toMoneyString(state.maximumBuyIn),
  maxSeats: state.maxSeats,
  occupiedSeats: state.seats.length,
  heroSeatIndex:
    state.seats.find((seat) => seat.userId === viewerUserId)?.seatIndex ?? null,
  canStart: canStartHoldemTable(state),
  updatedAt: new Date(state.updatedAt).toISOString(),
});

export const canUserLeaveTable = (state: HoldemTableState, userId: number) => {
  const seat = state.seats.find((entry) => entry.userId === userId) ?? null;
  if (!seat) {
    return false;
  }
  if (state.status === "active" && isSeatInHand(seat)) {
    return false;
  }
  return true;
};

export const clearTableAfterCashout = (state: HoldemTableState) => {
  if (state.seats.length === 0) {
    state.status = "waiting";
    resetSettledBoardState(state);
  }
};
