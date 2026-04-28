import type {
  BlackjackAction,
  BlackjackCard,
  BlackjackConfig,
  BlackjackGame,
  BlackjackGameStatus,
  BlackjackGameSummary,
  BlackjackTable,
} from "@reward/shared-types/blackjack";

import { internalInvariantError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { parseSchema } from "../../shared/validation";
import { buildRoundId } from "../hand-history/round-id";
import {
  BlackjackMetadataSchema,
  isTenValueRank,
  resolveBlackjackTable,
  scoreBlackjackCards,
  type BlackjackGameRow,
  type BlackjackGameState,
  type BlackjackMetadata,
  type BlackjackStoredPlayerHand,
} from "./game";

const parseMetadata = (value: unknown): BlackjackMetadata => {
  const parsed = parseSchema(BlackjackMetadataSchema, value ?? {});
  if (!parsed.isValid) {
    throw internalInvariantError("Invalid blackjack metadata.");
  }
  return parsed.data;
};

const resolveLegacyHandState = (
  row: BlackjackGameRow,
): BlackjackStoredPlayerHand["state"] => {
  if (row.status === "active") {
    return "active";
  }
  if (row.status === "player_bust") {
    return "bust";
  }
  return "stood";
};

export const getPrimaryPlayerHand = (game: BlackjackGameState) =>
  game.metadata.playerHands[0] ?? null;

export const getActivePlayerHand = (game: BlackjackGameState) => {
  if (game.metadata.activeHandIndex === null) {
    return null;
  }

  return game.metadata.playerHands[game.metadata.activeHandIndex] ?? null;
};

const resolveGameTable = (
  game: BlackjackGameState,
): BlackjackTable => {
  const table = resolveBlackjackTable({
    userId: game.userId,
    fairness: game.metadata.fairness,
    table: game.metadata.table,
  });
  game.metadata.table = table;
  return table;
};

const hasPendingPlayerTurn = (game: BlackjackGameState) => {
  if (game.status !== "active") {
    return false;
  }

  const activeHand = getActivePlayerHand(game);
  if (!activeHand || activeHand.state !== "active") {
    return false;
  }

  const playerScore = scoreBlackjackCards(activeHand.cards);
  return !playerScore.bust && playerScore.total < 21;
};

export const syncBlackjackTableTurnState = (game: BlackjackGameState) => {
  const currentTurnSeatIndex = hasPendingPlayerTurn(game) ? 1 : null;
  const turnDeadlineAt =
    currentTurnSeatIndex === 1 ? game.turnDeadlineAt ?? null : null;
  const table = resolveGameTable(game);

  const nextTable: BlackjackTable = {
    ...table,
    currentTurnSeatIndex,
    turnTimeoutAction:
      currentTurnSeatIndex === 1 ? table.turnTimeoutAction : null,
    seats: table.seats.map((seat) => ({
      ...seat,
      turnDeadlineAt:
        seat.seatIndex === currentTurnSeatIndex ? turnDeadlineAt : null,
    })),
  };
  game.metadata.table = nextTable;
};

export const syncLegacyPlayerCards = (game: BlackjackGameState) => {
  const currentHand = getActivePlayerHand(game) ?? getPrimaryPlayerHand(game);
  if (currentHand) {
    game.playerCards = [...currentHand.cards];
  }
};

export const toGameState = (row: BlackjackGameRow): BlackjackGameState => {
  const metadata = parseMetadata(row.metadata);
  const table: BlackjackTable = resolveBlackjackTable({
    userId: row.userId,
    fairness: metadata.fairness,
    table: metadata.table,
  });
  const playerHands =
    metadata.playerHands.length > 0
      ? metadata.playerHands
      : [
          {
            cards: [...row.playerCards],
            stakeAmount: toMoneyString(row.stakeAmount),
            state: resolveLegacyHandState(row),
            splitFromAces: false,
          },
        ];
  const activeHandIndex =
    row.status === "active"
      ? Math.min(metadata.activeHandIndex ?? 0, playerHands.length - 1)
      : null;
  const resolvedMetadata: BlackjackGameState["metadata"] = {
    ...metadata,
    table,
    playerHands,
    activeHandIndex,
  };
  const game: BlackjackGameState = {
    ...row,
    metadata: resolvedMetadata,
  };
  syncLegacyPlayerCards(game);
  syncBlackjackTableTurnState(game);
  return game;
};

const canSplitCards = (cards: BlackjackCard[], config: BlackjackConfig) => {
  if (cards.length !== 2) {
    return false;
  }

  const [first, second] = cards;
  if (!first || !second) {
    return false;
  }

  if (first.rank === second.rank) {
    return first.rank !== "A" || config.splitAcesAllowed;
  }

  return (
    config.splitTenValueCardsAllowed &&
    isTenValueRank(first.rank) &&
    isTenValueRank(second.rank)
  );
};

export const isRestrictedSplitAceHand = (
  hand: BlackjackStoredPlayerHand,
  config: BlackjackConfig,
) => hand.splitFromAces && !config.hitSplitAcesAllowed;

const canSplitHand = (params: {
  game: BlackjackGameState;
  hand: BlackjackStoredPlayerHand;
  walletBalance: ReturnType<typeof toDecimal>;
}) => {
  const { game, hand, walletBalance } = params;
  const playerScore = scoreBlackjackCards(hand.cards);
  if (playerScore.blackjack || playerScore.bust) {
    return false;
  }

  if (!canSplitCards(hand.cards, game.metadata.config)) {
    return false;
  }

  if (walletBalance.lt(toDecimal(hand.stakeAmount))) {
    return false;
  }

  if (game.metadata.playerHands.length >= game.metadata.config.maxSplitHands) {
    return false;
  }

  if (
    game.metadata.playerHands.length > 1 &&
    !game.metadata.config.resplitAllowed
  ) {
    return false;
  }

  return true;
};

export const getAvailableActions = (
  game: BlackjackGameState,
  walletBalance: ReturnType<typeof toDecimal>,
): BlackjackAction[] => {
  if (game.status !== "active") {
    return [];
  }

  const activeHand = getActivePlayerHand(game);
  if (!activeHand) {
    return [];
  }
  if (activeHand.state !== "active") {
    return [];
  }

  const playerScore = scoreBlackjackCards(activeHand.cards);
  if (playerScore.bust || playerScore.total >= 21) {
    return [];
  }

  const restrictedSplitAceHand = isRestrictedSplitAceHand(
    activeHand,
    game.metadata.config,
  );
  const actions: BlackjackAction[] = restrictedSplitAceHand
    ? ["stand"]
    : ["hit", "stand"];
  const canDouble =
    !restrictedSplitAceHand &&
    game.metadata.config.doubleDownAllowed &&
    activeHand.cards.length === 2 &&
    !playerScore.blackjack &&
    !playerScore.bust &&
    walletBalance.gte(toDecimal(activeHand.stakeAmount));
  const canSplit = canSplitHand({
    game,
    hand: activeHand,
    walletBalance,
  });

  if (canDouble) {
    actions.push("double");
  }

  if (canSplit) {
    actions.push("split");
  }

  return actions;
};

const buildHandView = (
  cards: BlackjackCard[],
  concealHoleCard: boolean,
): BlackjackGame["dealerHand"] => {
  const score = scoreBlackjackCards(cards);
  const visibleCards = concealHoleCard
    ? cards.filter((_, index) => index !== 1)
    : cards;
  const visibleScore =
    visibleCards.length > 0 ? scoreBlackjackCards(visibleCards).total : null;

  return {
    cards: cards.map((card, index) =>
      concealHoleCard && index === 1
        ? { rank: null, suit: null, hidden: true }
        : { rank: card.rank, suit: card.suit, hidden: false },
    ),
    total: concealHoleCard ? null : score.total,
    visibleTotal: visibleScore,
    soft: concealHoleCard ? null : score.soft,
    blackjack: concealHoleCard ? null : score.blackjack,
    bust: concealHoleCard ? null : score.bust,
  };
};

const resolveSerializedPlayerHandState = (
  game: BlackjackGameState,
  hand: BlackjackStoredPlayerHand,
): BlackjackGame["playerHands"][number]["state"] => {
  if (game.status === "active") {
    return hand.state;
  }

  const playerScore = scoreBlackjackCards(hand.cards);
  if (hand.state === "bust" || playerScore.bust) {
    return "bust";
  }
  if (game.metadata.playerHands.length === 1) {
    if (game.status === "player_blackjack") {
      return "win";
    }
    if (game.status === "dealer_blackjack") {
      return "lose";
    }
  }

  const dealerScore = scoreBlackjackCards(game.dealerCards);
  if (dealerScore.bust) {
    return "win";
  }
  if (playerScore.total > dealerScore.total) {
    return "win";
  }
  if (playerScore.total < dealerScore.total) {
    return "lose";
  }

  return "push";
};

const buildPlayerHandView = (
  game: BlackjackGameState,
  hand: BlackjackStoredPlayerHand,
  index: number,
): BlackjackGame["playerHands"][number] => ({
  ...buildHandView(hand.cards, false),
  index,
  stakeAmount: toMoneyString(hand.stakeAmount),
  state: resolveSerializedPlayerHandState(game, hand),
  active: game.status === "active" && game.metadata.activeHandIndex === index,
});

export const summarizePlayerTotals = (game: BlackjackGameState) => {
  const totals = game.metadata.playerHands.map(
    (hand) => scoreBlackjackCards(hand.cards).total,
  );
  const nonBustTotals = totals.filter((total) => total <= 21);
  return {
    totals,
    primaryTotal:
      nonBustTotals.length > 0
        ? Math.max(...nonBustTotals)
        : (totals[0] ?? scoreBlackjackCards(game.playerCards).total),
  };
};

export const serializeBlackjackGame = (
  game: BlackjackGameState,
  walletBalance: ReturnType<typeof toDecimal>,
): BlackjackGame => {
  syncBlackjackTableTurnState(game);
  const table = resolveGameTable(game);
  const playerHands = game.metadata.playerHands.map((hand, index) =>
    buildPlayerHandView(game, hand, index),
  );
  const currentHand = getActivePlayerHand(game) ?? getPrimaryPlayerHand(game);

  return {
    id: game.id,
    roundId: buildRoundId({ roundType: "blackjack", roundEntityId: game.id }),
    userId: game.userId,
    stakeAmount: toMoneyString(game.stakeAmount),
    totalStake: toMoneyString(game.totalStake),
    payoutAmount: toMoneyString(game.payoutAmount),
    status: game.status,
    turnDeadlineAt: game.turnDeadlineAt ?? null,
    turnTimeoutAction: table.turnTimeoutAction,
    table,
    playerHand: buildHandView(currentHand?.cards ?? game.playerCards, false),
    playerHands,
    activeHandIndex: game.metadata.activeHandIndex,
    dealerHand: buildHandView(game.dealerCards, game.status === "active"),
    availableActions: getAvailableActions(game, walletBalance),
    fairness: game.metadata.fairness,
    playMode: game.metadata.playMode,
    createdAt: game.createdAt,
    settledAt: game.settledAt ?? null,
  };
};

export const serializeBlackjackSummary = (
  game: BlackjackGameState,
): BlackjackGameSummary => {
  const { totals, primaryTotal } = summarizePlayerTotals(game);

  return {
    id: game.id,
    roundId: buildRoundId({ roundType: "blackjack", roundEntityId: game.id }),
    userId: game.userId,
    stakeAmount: toMoneyString(game.stakeAmount),
    totalStake: toMoneyString(game.totalStake),
    payoutAmount: toMoneyString(game.payoutAmount),
    status: game.status,
    playerTotal: primaryTotal,
    playerTotals: totals,
    dealerTotal: scoreBlackjackCards(game.dealerCards).total,
    createdAt: game.createdAt,
    settledAt: game.settledAt ?? null,
  };
};

export const takeNextCard = (game: BlackjackGameState) => {
  const nextCard = game.deck[game.nextCardIndex];
  if (!nextCard) {
    throw internalInvariantError("Blackjack deck exhausted.");
  }
  game.nextCardIndex += 1;
  return nextCard;
};

export const resolveInitialOutcome = (
  game: BlackjackGameState,
): BlackjackGameStatus => {
  const primaryHand = getPrimaryPlayerHand(game);
  if (!primaryHand) {
    throw internalInvariantError("Blackjack player hand is missing.");
  }

  const playerScore = scoreBlackjackCards(primaryHand.cards);
  const dealerScore = scoreBlackjackCards(game.dealerCards);

  if (playerScore.blackjack && dealerScore.blackjack) {
    return "push";
  }
  if (playerScore.blackjack) {
    return "player_blackjack";
  }
  if (dealerScore.blackjack) {
    return "dealer_blackjack";
  }

  return "active";
};

const shouldDealerHit = (cards: BlackjackCard[], config: BlackjackConfig) => {
  const score = scoreBlackjackCards(cards);
  if (score.total < 17) {
    return true;
  }
  if (score.total === 17 && score.soft && config.dealerHitsSoft17) {
    return true;
  }
  return false;
};

export const advancePlayerHand = (
  game: BlackjackGameState,
  nextState: BlackjackStoredPlayerHand["state"],
) => {
  const activeHandIndex = game.metadata.activeHandIndex;
  if (activeHandIndex === null) {
    throw internalInvariantError("Blackjack active hand is missing.");
  }

  const activeHand = game.metadata.playerHands[activeHandIndex];
  if (!activeHand) {
    throw internalInvariantError("Blackjack active hand is missing.");
  }
  activeHand.state = nextState;

  for (
    let index = activeHandIndex + 1;
    index < game.metadata.playerHands.length;
    index += 1
  ) {
    const candidate = game.metadata.playerHands[index];
    if (candidate?.state === "waiting") {
      candidate.state = "active";
      game.metadata.activeHandIndex = index;
      syncLegacyPlayerCards(game);
      return false;
    }
  }

  game.metadata.activeHandIndex = null;
  syncLegacyPlayerCards(game);
  return true;
};

export const advanceResolvableHands = (
  game: BlackjackGameState,
  walletBalance: ReturnType<typeof toDecimal>,
) => {
  const events: Array<{
    type: "auto_stand_split_aces";
    actor: "system";
    payload: {
      handIndex: number;
      total: number;
    };
  }> = [];
  let activeHand = getActivePlayerHand(game);
  while (activeHand) {
    const playerScore = scoreBlackjackCards(activeHand.cards);
    if (playerScore.bust) {
      const allHandsComplete = advancePlayerHand(game, "bust");
      if (allHandsComplete) {
        return { allHandsComplete: true, events };
      }
      activeHand = getActivePlayerHand(game);
      continue;
    }
    if (playerScore.total === 21) {
      const allHandsComplete = advancePlayerHand(game, "stood");
      if (allHandsComplete) {
        return { allHandsComplete: true, events };
      }
      activeHand = getActivePlayerHand(game);
      continue;
    }

    if (
      isRestrictedSplitAceHand(activeHand, game.metadata.config) &&
      !canSplitHand({ game, hand: activeHand, walletBalance })
    ) {
      events.push({
        type: "auto_stand_split_aces",
        actor: "system",
        payload: {
          handIndex: game.metadata.activeHandIndex ?? 0,
          total: playerScore.total,
        },
      });
      const allHandsComplete = advancePlayerHand(game, "stood");
      if (allHandsComplete) {
        return { allHandsComplete: true, events };
      }
      activeHand = getActivePlayerHand(game);
      continue;
    }

    syncLegacyPlayerCards(game);
    return { allHandsComplete: false, events };
  }

  return { allHandsComplete: true, events };
};

const resolveStatusPayoutAmount = (
  status: BlackjackGameStatus,
  stakeAmount: ReturnType<typeof toDecimal>,
  totalStake: ReturnType<typeof toDecimal>,
  config: BlackjackConfig,
) => {
  const winPayoutMultiplier = toDecimal(config.winPayoutMultiplier);
  const pushPayoutMultiplier = toDecimal(config.pushPayoutMultiplier);
  const naturalPayoutMultiplier = toDecimal(config.naturalPayoutMultiplier);

  switch (status) {
    case "player_blackjack":
      return stakeAmount.mul(naturalPayoutMultiplier);
    case "dealer_bust":
    case "player_win":
      return totalStake.mul(winPayoutMultiplier);
    case "push":
      return totalStake.mul(pushPayoutMultiplier);
    default:
      return toDecimal(0);
  }
};

export const playDealerHand = (game: BlackjackGameState) => {
  const events: Array<{
    type: "dealer_draw";
    actor: "dealer";
    payload: {
      card: BlackjackCard;
      total: number;
    };
  }> = [];
  while (shouldDealerHit(game.dealerCards, game.metadata.config)) {
    const card = takeNextCard(game);
    game.dealerCards.push(card);
    events.push({
      type: "dealer_draw",
      actor: "dealer",
      payload: {
        card,
        total: scoreBlackjackCards(game.dealerCards).total,
      },
    });
  }

  return {
    dealerScore: scoreBlackjackCards(game.dealerCards),
    events,
  };
};

const resolveRegularHandPayoutAmount = (
  handStakeAmount: ReturnType<typeof toDecimal>,
  outcome: "win" | "lose" | "push" | "bust",
  config: BlackjackConfig,
) => {
  if (outcome === "win") {
    return handStakeAmount.mul(toDecimal(config.winPayoutMultiplier));
  }
  if (outcome === "push") {
    return handStakeAmount.mul(toDecimal(config.pushPayoutMultiplier));
  }

  return toDecimal(0);
};

export const resolveSettledHandOutcomes = (game: BlackjackGameState) => {
  const dealerScore = scoreBlackjackCards(game.dealerCards);
  const outcomes = game.metadata.playerHands.map((hand) => {
    const playerScore = scoreBlackjackCards(hand.cards);
    const handStakeAmount = toDecimal(hand.stakeAmount);
    if (hand.state === "bust" || playerScore.bust) {
      return {
        state: "bust" as const,
        payoutAmount: toDecimal(0),
      };
    }
    if (dealerScore.bust || playerScore.total > dealerScore.total) {
      return {
        state: "win" as const,
        payoutAmount: resolveRegularHandPayoutAmount(
          handStakeAmount,
          "win",
          game.metadata.config,
        ),
      };
    }
    if (playerScore.total < dealerScore.total) {
      return {
        state: "lose" as const,
        payoutAmount: toDecimal(0),
      };
    }

    return {
      state: "push" as const,
      payoutAmount: resolveRegularHandPayoutAmount(
        handStakeAmount,
        "push",
        game.metadata.config,
      ),
    };
  });

  return { dealerScore, outcomes };
};

export const resolveAggregateSettledStatus = (
  game: BlackjackGameState,
  dealerScore: ReturnType<typeof scoreBlackjackCards>,
  outcomes: ReturnType<typeof resolveSettledHandOutcomes>["outcomes"],
) => {
  if (game.metadata.playerHands.length === 1) {
    const primaryOutcome = outcomes[0]?.state;
    if (primaryOutcome === "bust") {
      return "player_bust";
    }
    if (dealerScore.bust) {
      return "dealer_bust";
    }
    if (primaryOutcome === "win") {
      return "player_win";
    }
    if (primaryOutcome === "lose") {
      return "dealer_win";
    }
    return "push";
  }

  if (outcomes.every((outcome) => outcome.state === "bust")) {
    return "player_bust";
  }
  if (
    dealerScore.bust &&
    outcomes.every((outcome) => outcome.state === "win")
  ) {
    return "dealer_bust";
  }

  const totalPayout = outcomes.reduce(
    (sum, outcome) => sum.plus(outcome.payoutAmount),
    toDecimal(0),
  );
  const totalStake = toDecimal(game.totalStake);
  if (totalPayout.eq(0)) {
    return "dealer_win";
  }
  if (totalPayout.eq(totalStake)) {
    return "push";
  }

  return totalPayout.gt(totalStake) ? "player_win" : "dealer_win";
};

export const resolveSettledStatusPayoutAmount = resolveStatusPayoutAmount;
