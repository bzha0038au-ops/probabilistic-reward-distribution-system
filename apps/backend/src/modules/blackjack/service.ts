import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { DealerEvent } from "@reward/shared-types/dealer";
import { blackjackGames } from "@reward/database";
import { and, asc, eq, isNotNull, lte } from "@reward/database/orm";
import type {
  BlackjackAction,
  BlackjackFairness,
  BlackjackGameStatus,
  BlackjackMutationResponse,
  BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";
import type {
  PlayModeOutcome,
  PlayModeSnapshot,
} from "@reward/shared-types/play-mode";
import { BLACKJACK_TURN_TIMEOUT_ACTION } from "@reward/shared-types/blackjack";

import { db, type DbTransaction } from "../../db";
import {
  conflictError,
  internalInvariantError,
  notFoundError,
} from "../../shared/errors";
import { getConfigView, type AppConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import {
  appendDealerFeedEvent,
  buildDealerEvent,
  maybeGenerateDealerLanguageEvent,
  publishDealerRealtimeToUser,
} from "../dealer-bot/service";
import { ensureFairnessSeed, getFairnessCommit } from "../fairness/service";
import { assertKycStakeAllowed } from "../kyc/service";
import {
  loadActivePlayModeSession,
  loadUserPlayModeSnapshot,
  lockUserPlayModeState,
  resolveSettledPlayMode,
  saveUserPlayModeState,
  settlePlayModeSession,
  updatePlayModeSessionReference,
} from "../play-mode/service";
import { getBlackjackConfig, getPoolSystemConfig } from "../system/service";
import { assertWalletLedgerInvariant } from "../wallet/invariant-service";
import {
  BLACKJACK_REFERENCE_TYPE,
  buildFairnessAlgorithmLabel,
  drawBlackjackDeck,
  resolveClientNonce,
  resolveStakeAmount,
  scoreBlackjackCards,
  type BlackjackGameState,
} from "./game";
import {
  advancePlayerHand,
  advanceResolvableHands,
  getActivePlayerHand,
  getAvailableActions,
  resolveInitialOutcome,
  serializeBlackjackGame,
  serializeBlackjackSummary,
  syncBlackjackTableTurnState,
  takeNextCard,
  toGameState,
} from "./blackjack-state";
import {
  applyStakeDebit,
  ensurePoolCanCover,
  getWalletBalanceForBlackjack,
  insertInitialGame,
  loadBlackjackGameRows,
  loadLockedBlackjackUser,
  persistGameState,
  settleGameByStatus,
  settleResolvedHands,
} from "./blackjack-persistence";
import { appendRoundEvents } from "../hand-history/service";
import { BLACKJACK_ROUND_TYPE } from "../hand-history/round-id";

export { drawBlackjackDeck, scoreBlackjackCards } from "./game";

const resolveBlackjackPlayModeOutcome = (
  status: BlackjackGameStatus,
): PlayModeOutcome => {
  if (
    status === "player_blackjack" ||
    status === "dealer_bust" ||
    status === "player_win"
  ) {
    return "win";
  }

  if (status === "push") {
    return "push";
  }

  return "lose";
};

const persistSettledBlackjackPlayMode = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  snapshot: PlayModeSnapshot;
}) => {
  const { tx, userId, game, snapshot } = params;
  const settledPlayMode = resolveSettledPlayMode({
    snapshot,
    outcome: resolveBlackjackPlayModeOutcome(game.status),
  });
  game.metadata.playMode = settledPlayMode;
  await persistGameState(tx, game);
  const activeSession = await loadActivePlayModeSession(tx, {
    userId,
    gameKey: "blackjack",
  });
  if (activeSession) {
    await settlePlayModeSession({
      tx,
      sessionId: activeSession.id,
      snapshot: settledPlayMode,
      outcome: resolveBlackjackPlayModeOutcome(game.status),
      referenceType: BLACKJACK_REFERENCE_TYPE,
      referenceId: game.id,
    });
  }

  const storedPlayMode = await lockUserPlayModeState(tx, userId, "blackjack");
  if (storedPlayMode) {
    await saveUserPlayModeState({
      tx,
      rowId: storedPlayMode.id,
      snapshot: settledPlayMode,
    });
  }
  return settledPlayMode;
};

type BlackjackTurnConfig = AppConfig & {
  blackjackTurnTimeoutMs: number;
  blackjackTimeoutWorkerBatchSize: number;
};

const blackjackTurnConfig = getConfigView<BlackjackTurnConfig>();
const BLACKJACK_PLAYER_SEAT_INDEX = 1;

const buildBlackjackDealerEvent = (params: {
  game: BlackjackGameState;
  actionCode: string;
  text: string;
  metadata?: Record<string, unknown> | null;
  source?: DealerEvent["source"];
}) =>
  buildDealerEvent({
    kind: "action",
    source: params.source ?? "rule",
    gameType: "blackjack",
    tableId: null,
    tableRef: params.game.metadata.table.tableId,
    roundId: `${BLACKJACK_ROUND_TYPE}:${params.game.id}`,
    referenceId: params.game.id,
    phase: params.game.status === "active" ? "active" : "settlement",
    actionCode: params.actionCode,
    text: params.text,
    metadata: params.metadata ?? null,
  });

const appendDealerEventsToBlackjackGame = (
  game: BlackjackGameState,
  events: DealerEvent[],
) => {
  for (const event of events) {
    game.metadata.dealerEvents = appendDealerFeedEvent(
      game.metadata.dealerEvents,
      event,
    );
  }
};

const persistBlackjackDealerEvents = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  events: DealerEvent[];
}) => {
  if (params.events.length === 0) {
    return;
  }

  appendDealerEventsToBlackjackGame(params.game, params.events);
  await appendRoundEvents(params.tx, {
    roundType: BLACKJACK_ROUND_TYPE,
    roundEntityId: params.game.id,
    userId: params.userId,
    events: params.events.map((event) => ({
      type:
        event.kind === "message"
          ? "dealer_message"
          : event.kind === "pace_hint"
            ? "dealer_pace_hint"
            : "dealer_action",
      actor: "dealer" as const,
      payload: {
        dealerEvent: event,
      },
    })),
  });
  await persistGameState(params.tx, params.game);
};

const emitAsyncBlackjackDealerLanguageEvent = (params: {
  userId: number;
  gameId: number;
  scenario: string;
  summary: Record<string, unknown>;
  tableRef: string;
}) => {
  void (async () => {
    const event = await maybeGenerateDealerLanguageEvent({
      scenario: params.scenario,
      locale: "",
      gameType: "blackjack",
      tableId: null,
      tableRef: params.tableRef,
      roundId: `${BLACKJACK_ROUND_TYPE}:${params.gameId}`,
      referenceId: params.gameId,
      phase: "active",
      seatIndex: null,
      summary: params.summary,
    });
    if (!event) {
      return;
    }

    const persisted = await db.transaction(async (tx) => {
      const [activeRow] = await loadBlackjackGameRows(tx, {
        userId: params.userId,
        lock: true,
      });
      if (!activeRow || activeRow.id !== params.gameId) {
        return null;
      }

      const game = toGameState(activeRow);
      await persistBlackjackDealerEvents({
        tx,
        userId: params.userId,
        game,
        events: [event],
      });
      return event;
    });

    if (persisted) {
      publishDealerRealtimeToUser(params.userId, persisted);
    }
  })().catch((error) => {
    logger.warning("blackjack dealer bot async emission failed", {
      err: error,
      userId: params.userId,
      gameId: params.gameId,
      scenario: params.scenario,
    });
  });
};

const buildBlackjackTurnDeadline = (now = new Date()) =>
  new Date(now.getTime() + blackjackTurnConfig.blackjackTurnTimeoutMs);

const syncBlackjackTurnDeadline = (game: BlackjackGameState, now = new Date()) => {
  const activeHand = getActivePlayerHand(game);
  if (game.status !== "active" || !activeHand || activeHand.state !== "active") {
    game.turnDeadlineAt = null;
    syncBlackjackTableTurnState(game);
    return;
  }

  const playerScore = scoreBlackjackCards(activeHand.cards);
  game.turnDeadlineAt =
    !playerScore.bust && playerScore.total < 21
      ? buildBlackjackTurnDeadline(now)
      : null;
  syncBlackjackTableTurnState(game);
};

const clearBlackjackTurnDeadline = (game: BlackjackGameState) => {
  game.turnDeadlineAt = null;
  syncBlackjackTableTurnState(game);
};

const isBlackjackTurnExpired = (game: BlackjackGameState, now = new Date()) =>
  Boolean(
    game.turnDeadlineAt &&
      new Date(game.turnDeadlineAt).getTime() <= now.getTime(),
  );

const assertCurrentTurnSeat = (userId: number, game: BlackjackGameState) => {
  const tableState = game.metadata.table;
  if (!tableState) {
    throw internalInvariantError("Blackjack table state is missing.");
  }

  const currentTurnSeat =
    tableState.currentTurnSeatIndex === null
      ? null
      : tableState.seats.find(
          (seat) => seat.seatIndex === tableState.currentTurnSeatIndex,
        ) ?? null;
  if (!currentTurnSeat) {
    throw conflictError("Blackjack turn is no longer available.");
  }
  if (
    currentTurnSeat.seatIndex !== BLACKJACK_PLAYER_SEAT_INDEX ||
    currentTurnSeat.participantId !== `user:${userId}`
  ) {
    throw conflictError("Only the current turn seat can act.");
  }
};

const finalizeBlackjackProgress = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
  now?: Date;
}) => {
  const { tx, userId, game, walletBalance, now = new Date() } = params;
  const { allHandsComplete, events } = advanceResolvableHands(game, walletBalance);
  if (events.length > 0) {
    await appendRoundEvents(tx, {
      roundType: BLACKJACK_ROUND_TYPE,
      roundEntityId: game.id,
      userId,
      events,
    });
  }

  if (allHandsComplete) {
    clearBlackjackTurnDeadline(game);
    const settled = await settleResolvedHands({
      tx,
      game,
      walletBalance,
    });
    const playMode = await persistSettledBlackjackPlayMode({
      tx,
      userId,
      game: settled.game,
      snapshot: game.metadata.playMode,
    });
    return {
      balance: toMoneyString(settled.balance),
      playMode,
      game: serializeBlackjackGame(settled.game, settled.balance),
    } satisfies BlackjackMutationResponse;
  }

  syncBlackjackTurnDeadline(game, now);
  await persistGameState(tx, game);
  return {
    balance: toMoneyString(walletBalance),
    playMode: game.metadata.playMode,
    game: serializeBlackjackGame(game, walletBalance),
  } satisfies BlackjackMutationResponse;
};

const applyBlackjackStandAction = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
  actor: "player" | "system";
  now?: Date;
  dueToTimeout?: boolean;
}) => {
  const {
    tx,
    userId,
    game,
    walletBalance,
    actor,
    now = new Date(),
    dueToTimeout = false,
  } = params;
  const activeHandIndex = game.metadata.activeHandIndex;
  const activeHand = getActivePlayerHand(game);
  if (activeHandIndex === null || !activeHand) {
    throw internalInvariantError("Blackjack active hand is missing.");
  }

  const events = [];
  if (dueToTimeout) {
    events.push({
      type: "turn_timeout",
      actor: "system" as const,
      payload: {
        seatIndex: BLACKJACK_PLAYER_SEAT_INDEX,
        handIndex: activeHandIndex,
        defaultAction: BLACKJACK_TURN_TIMEOUT_ACTION,
        total: scoreBlackjackCards(activeHand.cards).total,
        deadlineAt:
          game.turnDeadlineAt instanceof Date
            ? game.turnDeadlineAt.toISOString()
            : game.turnDeadlineAt,
      },
    });
  }
  events.push({
    type: "player_stand",
    actor,
    payload: {
      handIndex: activeHandIndex,
      total: scoreBlackjackCards(activeHand.cards).total,
      reason: dueToTimeout ? "timeout" : "player_action",
    },
  });
  await appendRoundEvents(tx, {
    roundType: BLACKJACK_ROUND_TYPE,
    roundEntityId: game.id,
    userId,
    events,
  });

  const allHandsComplete = advancePlayerHand(game, "stood");
  if (allHandsComplete) {
    clearBlackjackTurnDeadline(game);
    const settled = await settleResolvedHands({
      tx,
      game,
      walletBalance,
    });
    const playMode = await persistSettledBlackjackPlayMode({
      tx,
      userId,
      game: settled.game,
      snapshot: game.metadata.playMode,
    });
    return {
      balance: toMoneyString(settled.balance),
      playMode,
      game: serializeBlackjackGame(settled.game, settled.balance),
    } satisfies BlackjackMutationResponse;
  }

  return finalizeBlackjackProgress({
    tx,
    userId,
    game,
    walletBalance,
    now,
  });
};

const processExpiredBlackjackTurnInTransaction = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
  now?: Date;
}) => {
  const { tx, userId, game, walletBalance, now = new Date() } = params;
  if (!isBlackjackTurnExpired(game, now)) {
    return false;
  }

  await applyBlackjackStandAction({
    tx,
    userId,
    game,
    walletBalance,
    actor: "system",
    now,
    dueToTimeout: true,
  });
  return true;
};

export async function processExpiredBlackjackTurnForUser(userId: number) {
  return db.transaction(async (tx) => {
    const user = await loadLockedBlackjackUser(tx, userId);
    if (!user) {
      return false;
    }

    const [activeRow] = await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
    });
    if (!activeRow) {
      return false;
    }

    return processExpiredBlackjackTurnInTransaction({
      tx,
      userId,
      game: toGameState(activeRow),
      walletBalance: toDecimal(user.withdrawable_balance ?? 0),
    });
  });
}

export async function runBlackjackTimeoutCycle() {
  const candidates = await db
    .select({
      userId: blackjackGames.userId,
    })
    .from(blackjackGames)
    .where(
      and(
        eq(blackjackGames.status, "active"),
        isNotNull(blackjackGames.turnDeadlineAt),
        lte(blackjackGames.turnDeadlineAt, new Date()),
      ),
    )
    .orderBy(asc(blackjackGames.turnDeadlineAt))
    .limit(blackjackTurnConfig.blackjackTimeoutWorkerBatchSize);
  let timedOut = 0;

  for (const row of candidates) {
    const processed = await processExpiredBlackjackTurnForUser(row.userId);
    if (processed) {
      timedOut += 1;
    }
  }

  return {
    scanned: candidates.length,
    timedOut,
  };
}

export async function getBlackjackOverview(
  userId: number,
): Promise<BlackjackOverviewResponse> {
  await processExpiredBlackjackTurnForUser(userId);

  const [walletBalance, poolSystem, blackjackConfig, storedPlayMode] =
    await Promise.all([
    getWalletBalanceForBlackjack(userId),
    getPoolSystemConfig(db),
    getBlackjackConfig(db),
    loadUserPlayModeSnapshot(db, userId, "blackjack"),
  ]);
  const [fairness, activeRows, recentRows] = await Promise.all([
    getFairnessCommit(db, Number(poolSystem.epochSeconds ?? 0)),
    loadBlackjackGameRows(db, { userId }),
    loadBlackjackGameRows(db, { userId, settledOnly: true }),
  ]);

  const activeGame = activeRows[0] ? toGameState(activeRows[0]) : null;
  const recentGames = recentRows.map((row) =>
    serializeBlackjackSummary(toGameState(row)),
  );
  const balance = toDecimal(walletBalance);

  return {
    balance: toMoneyString(balance),
    config: activeGame?.metadata.config ?? blackjackConfig,
    playMode: activeGame?.metadata.playMode ?? storedPlayMode,
    fairness,
    activeGame: activeGame ? serializeBlackjackGame(activeGame, balance) : null,
    recentGames,
  };
}

export async function startResolvedBlackjack(
  userId: number,
  options: {
    stakeAmount: string;
    clientNonce?: string | null;
    playMode: import("@reward/shared-types/play-mode").PlayModeSnapshot;
  },
): Promise<BlackjackMutationResponse> {
  const result = await db.transaction(async (tx) => {
    const user = await loadLockedBlackjackUser(tx, userId);
    if (!user) {
      throw notFoundError("User not found.");
    }

    const [existingGame] = await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
    });
    if (existingGame) {
      throw conflictError(
        "Finish the active blackjack game before starting a new one.",
      );
    }

    const activePlayMode = options.playMode;

    const blackjackConfig = await getBlackjackConfig(tx);
    const minStakeAmount = toDecimal(blackjackConfig.minStake);
    const maxStakeAmount = toDecimal(blackjackConfig.maxStake);
    const naturalPayoutMultiplier = toDecimal(
      blackjackConfig.naturalPayoutMultiplier,
    );
    const baseStakeAmount = resolveStakeAmount(options.stakeAmount);
    const stakeAmount = baseStakeAmount.mul(activePlayMode.appliedMultiplier);
    if (stakeAmount.lt(minStakeAmount) || stakeAmount.gt(maxStakeAmount)) {
      throw conflictError("Stake amount is outside the allowed range.", {
        code: API_ERROR_CODES.STAKE_AMOUNT_OUT_OF_RANGE,
      });
    }
    await assertKycStakeAllowed(userId, toMoneyString(stakeAmount), tx);

    const walletBefore = toDecimal(user.withdrawable_balance ?? 0);
    const wageredBefore = toDecimal(user.wagered_amount ?? 0);
    if (walletBefore.lt(stakeAmount)) {
      throw conflictError("Insufficient balance.", {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    await ensurePoolCanCover(tx, {
      additionalStake: stakeAmount,
      maximumPayout: stakeAmount.mul(naturalPayoutMultiplier),
    });

    const poolSystem = await getPoolSystemConfig(tx);
    const fairnessSeed = await ensureFairnessSeed(
      tx,
      Number(poolSystem.epochSeconds ?? 0),
    );
    const { clientNonce, nonceSource } = resolveClientNonce(
      options.clientNonce,
    );
    const { deck, rngDigest, deckDigest } = drawBlackjackDeck({
      seed: fairnessSeed.seed,
      userId,
      clientNonce,
    });
    const fairness: BlackjackFairness = {
      epoch: fairnessSeed.epoch,
      epochSeconds: fairnessSeed.epochSeconds,
      commitHash: fairnessSeed.commitHash,
      clientNonce,
      nonceSource,
      rngDigest,
      deckDigest,
      algorithm: buildFairnessAlgorithmLabel(blackjackConfig),
    };

    const playerCards = [deck[0], deck[2]];
    const dealerCards = [deck[1], deck[3]];
    const game = await insertInitialGame({
      tx,
      userId,
      stakeAmount,
      totalStake: stakeAmount,
      playerCards,
      dealerCards,
      deck,
      nextCardIndex: 4,
      config: blackjackConfig,
      fairness,
      playMode: activePlayMode,
    });
    const activeSession = await loadActivePlayModeSession(tx, {
      userId,
      gameKey: "blackjack",
    });
    if (activeSession) {
      await updatePlayModeSessionReference({
        tx,
        sessionId: activeSession.id,
        referenceType: BLACKJACK_REFERENCE_TYPE,
        referenceId: game.id,
      });
    }
    syncBlackjackTurnDeadline(game);
    await persistGameState(tx, game);

    const { walletAfter } = await applyStakeDebit({
      tx,
      userId,
      referenceId: game.id,
      walletBefore,
      wageredBefore,
      stakeAmount,
      entryType: "blackjack_stake",
    });

    await appendRoundEvents(tx, {
      roundType: BLACKJACK_ROUND_TYPE,
      roundEntityId: game.id,
      userId,
      events: [
        {
          type: "round_started",
          actor: "system",
          payload: {
            stakeAmount: toMoneyString(stakeAmount),
            totalStake: toMoneyString(stakeAmount),
            playerCards,
            dealerCards,
            fairness,
            config: blackjackConfig,
            playMode: activePlayMode,
            requestedStakeAmount: toMoneyString(baseStakeAmount),
            table: game.metadata.table,
            nextCardIndex: game.nextCardIndex,
          },
        },
        {
          type: "stake_debited",
          actor: "system",
          payload: {
            amount: toMoneyString(stakeAmount),
            balanceBefore: toMoneyString(walletBefore),
            balanceAfter: toMoneyString(walletAfter),
            totalStake: toMoneyString(stakeAmount),
            entryType: "blackjack_stake",
          },
        },
      ],
    });
    await persistBlackjackDealerEvents({
      tx,
      userId,
      game,
      events: [
        buildBlackjackDealerEvent({
          game,
          actionCode: "cards_dealt",
          text: "Dealer completes the opening deal.",
          metadata: {
            playerCards,
            dealerUpCard: dealerCards[0] ?? null,
          },
        }),
        buildBlackjackDealerEvent({
          game,
          actionCode: "prompt_player",
          text: "Your move.",
          metadata: {
            availableActions: getAvailableActions(game, walletAfter),
          },
        }),
      ],
    });

    const initialStatus = resolveInitialOutcome(game);
    if (initialStatus !== "active") {
      const settled = await settleGameByStatus({
        tx,
        game,
        status: initialStatus,
        walletBalance: walletAfter,
      });
      const settledPlayMode = await persistSettledBlackjackPlayMode({
        tx,
        userId,
        game: settled.game,
        snapshot: activePlayMode,
      });
      const response = {
        balance: toMoneyString(settled.balance),
        playMode: settledPlayMode,
        game: serializeBlackjackGame(settled.game, settled.balance),
      };

      await assertWalletLedgerInvariant(tx, userId, {
        service: "blackjack",
        operation: "startBlackjack",
      });

      return {
        response,
        dealerLanguageTask: null,
      };
    }

    const response = {
      balance: toMoneyString(walletAfter),
      playMode: activePlayMode,
      game: serializeBlackjackGame(game, walletAfter),
    };

    await assertWalletLedgerInvariant(tx, userId, {
      service: "blackjack",
      operation: "startBlackjack",
    });

    return {
      response,
      dealerLanguageTask: {
        scenario: "blackjack_initial_deal",
        summary: {
          availableActions: response.game.availableActions,
          dealerVisibleTotal: response.game.dealerHand.visibleTotal,
          playerTotal: response.game.playerHand.total,
        },
      },
    };
  });

  if (result.dealerLanguageTask) {
    emitAsyncBlackjackDealerLanguageEvent({
      userId,
      gameId: result.response.game.id,
      scenario: result.dealerLanguageTask.scenario,
      summary: result.dealerLanguageTask.summary,
      tableRef: result.response.game.table.tableId,
    });
  }

  return result.response;
}

export const startBlackjack = startResolvedBlackjack;

export async function actOnBlackjack(
  userId: number,
  gameId: number,
  action: BlackjackAction,
): Promise<BlackjackMutationResponse> {
  const result = await db.transaction(async (tx) => {
    const user = await loadLockedBlackjackUser(tx, userId);
    if (!user) {
      throw notFoundError("User not found.");
    }

    const [activeRow] = await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
    });
    if (!activeRow) {
      throw notFoundError("No active blackjack game found.");
    }
    if (activeRow.id !== gameId) {
      throw conflictError("Blackjack game is no longer active.");
    }

    const game = toGameState(activeRow);
    let walletBalance = toDecimal(user.withdrawable_balance ?? 0);
    let wageredAmount = toDecimal(user.wagered_amount ?? 0);
    const now = new Date();

    assertCurrentTurnSeat(userId, game);
    const expiredTurnWasProcessed = await processExpiredBlackjackTurnInTransaction(
      {
        tx,
        userId,
        game,
        walletBalance,
        now,
      },
    );
    if (expiredTurnWasProcessed) {
      return {
        expiredTurnWasProcessed: true as const,
      } as const;
    }

    const finalizeMutation = async (
      response: BlackjackMutationResponse,
    ): Promise<BlackjackMutationResponse> => {
      await assertWalletLedgerInvariant(tx, userId, {
        service: "blackjack",
        operation: "actOnBlackjack",
      });
      return response;
    };

    const availableActions = getAvailableActions(game, walletBalance);
    if (!availableActions.includes(action)) {
      throw conflictError("That action is not available for the current hand.");
    }

    const persistOrSettleAfterAutoAdvance = async () => {
      const response = await finalizeBlackjackProgress({
        tx,
        userId,
        game,
        walletBalance,
        now,
      });
      return finalizeMutation(response);
    };

    const activeHandIndex = game.metadata.activeHandIndex;
    const activeHand = getActivePlayerHand(game);
    if (activeHandIndex === null || !activeHand) {
      throw internalInvariantError("Blackjack active hand is missing.");
    }

    if (action === "hit") {
      const card = takeNextCard(game);
      activeHand.cards.push(card);
      const playerScore = scoreBlackjackCards(activeHand.cards);
      await appendRoundEvents(tx, {
        roundType: BLACKJACK_ROUND_TYPE,
        roundEntityId: game.id,
        userId,
        events: [
          {
            type: "player_hit",
            actor: "player",
            payload: {
              handIndex: activeHandIndex,
              card,
              total: playerScore.total,
            },
          },
        ],
      });

      if (playerScore.bust || playerScore.total === 21) {
        return persistOrSettleAfterAutoAdvance();
      }

      syncBlackjackTurnDeadline(game, now);
      await persistGameState(tx, game);
      return finalizeMutation({
        balance: toMoneyString(walletBalance),
        playMode: game.metadata.playMode,
        game: serializeBlackjackGame(game, walletBalance),
      });
    }

    if (action === "double") {
      const stakeAmount = toDecimal(activeHand.stakeAmount);
      const nextTotalStake = toDecimal(game.totalStake).plus(stakeAmount);
      await assertKycStakeAllowed(userId, toMoneyString(nextTotalStake), tx);
      if (walletBalance.lt(stakeAmount)) {
        throw conflictError("Insufficient balance for double down.", {
          code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
        });
      }

      await ensurePoolCanCover(tx, {
        additionalStake: stakeAmount,
        maximumPayout: toDecimal(game.totalStake)
          .plus(stakeAmount)
          .mul(toDecimal(game.metadata.config.winPayoutMultiplier)),
      });

      const extraStake = await applyStakeDebit({
        tx,
        userId,
        referenceId: game.id,
        walletBefore: walletBalance,
        wageredBefore: wageredAmount,
        stakeAmount,
        entryType: "blackjack_double_down",
      });
      walletBalance = extraStake.walletAfter;
      wageredAmount = extraStake.wageredAfter;
      game.totalStake = toMoneyString(
        toDecimal(game.totalStake).plus(stakeAmount),
      );
      await appendRoundEvents(tx, {
        roundType: BLACKJACK_ROUND_TYPE,
        roundEntityId: game.id,
        userId,
        events: [
          {
            type: "stake_debited",
            actor: "system",
            payload: {
              amount: toMoneyString(stakeAmount),
              balanceBefore: toMoneyString(walletBalance.plus(stakeAmount)),
              balanceAfter: toMoneyString(walletBalance),
              totalStake: toMoneyString(game.totalStake),
              entryType: "blackjack_double_down",
            },
          },
        ],
      });

      const card = takeNextCard(game);
      activeHand.stakeAmount = toMoneyString(
        toDecimal(activeHand.stakeAmount).plus(stakeAmount),
      );
      activeHand.cards.push(card);
      const playerScore = scoreBlackjackCards(activeHand.cards);
      await appendRoundEvents(tx, {
        roundType: BLACKJACK_ROUND_TYPE,
        roundEntityId: game.id,
        userId,
        events: [
          {
            type: "player_double",
            actor: "player",
            payload: {
              handIndex: activeHandIndex,
              card,
              total: playerScore.total,
              handStakeAmount: activeHand.stakeAmount,
              totalStake: toMoneyString(game.totalStake),
            },
          },
        ],
      });

      const allHandsComplete = advancePlayerHand(
        game,
        playerScore.bust ? "bust" : "stood",
      );
      if (allHandsComplete) {
        clearBlackjackTurnDeadline(game);
        const settled = await settleResolvedHands({
          tx,
          game,
          walletBalance,
        });
        const playMode = await persistSettledBlackjackPlayMode({
          tx,
          userId,
          game: settled.game,
          snapshot: game.metadata.playMode,
        });
        return finalizeMutation({
          balance: toMoneyString(settled.balance),
          playMode,
          game: serializeBlackjackGame(settled.game, settled.balance),
        });
      }

      return persistOrSettleAfterAutoAdvance();
    }

    if (action === "split") {
      const stakeAmount = toDecimal(activeHand.stakeAmount);
      const nextTotalStake = toDecimal(game.totalStake).plus(stakeAmount);
      await assertKycStakeAllowed(userId, toMoneyString(nextTotalStake), tx);
      await ensurePoolCanCover(tx, {
        additionalStake: stakeAmount,
        maximumPayout: toDecimal(game.totalStake)
          .plus(stakeAmount)
          .mul(toDecimal(game.metadata.config.winPayoutMultiplier)),
      });

      const extraStake = await applyStakeDebit({
        tx,
        userId,
        referenceId: game.id,
        walletBefore: walletBalance,
        wageredBefore: wageredAmount,
        stakeAmount,
        entryType: "blackjack_split",
      });
      walletBalance = extraStake.walletAfter;
      wageredAmount = extraStake.wageredAfter;
      game.totalStake = toMoneyString(
        toDecimal(game.totalStake).plus(stakeAmount),
      );
      await appendRoundEvents(tx, {
        roundType: BLACKJACK_ROUND_TYPE,
        roundEntityId: game.id,
        userId,
        events: [
          {
            type: "stake_debited",
            actor: "system",
            payload: {
              amount: toMoneyString(stakeAmount),
              balanceBefore: toMoneyString(walletBalance.plus(stakeAmount)),
              balanceAfter: toMoneyString(walletBalance),
              totalStake: toMoneyString(game.totalStake),
              entryType: "blackjack_split",
            },
          },
        ],
      });

      const [leftCard, rightCard] = activeHand.cards;
      if (!leftCard || !rightCard) {
        throw internalInvariantError("Blackjack split hand is missing cards.");
      }
      const leftDraw = takeNextCard(game);
      const rightDraw = takeNextCard(game);
      const splitStakeAmount = toMoneyString(stakeAmount);

      activeHand.cards = [leftCard, leftDraw];
      activeHand.stakeAmount = splitStakeAmount;
      activeHand.state = "active";
      activeHand.splitFromAces =
        leftCard.rank === "A" && rightCard.rank === "A";

      game.metadata.playerHands.splice(activeHandIndex + 1, 0, {
        cards: [rightCard, rightDraw],
        stakeAmount: splitStakeAmount,
        state: "waiting",
        splitFromAces: leftCard.rank === "A" && rightCard.rank === "A",
      });
      await appendRoundEvents(tx, {
        roundType: BLACKJACK_ROUND_TYPE,
        roundEntityId: game.id,
        userId,
        events: [
          {
            type: "player_split",
            actor: "player",
            payload: {
              handIndex: activeHandIndex,
              totalStake: toMoneyString(game.totalStake),
              hands: [
                {
                  handIndex: activeHandIndex,
                  cards: activeHand.cards,
                  total: scoreBlackjackCards(activeHand.cards).total,
                },
                {
                  handIndex: activeHandIndex + 1,
                  cards: [rightCard, rightDraw],
                  total: scoreBlackjackCards([rightCard, rightDraw]).total,
                },
              ],
            },
          },
        ],
      });

      return persistOrSettleAfterAutoAdvance();
    }

    const response = await applyBlackjackStandAction({
      tx,
      userId,
      game,
      walletBalance,
      actor: "player",
      now,
    });

    return finalizeMutation(response);
  });

  if ("expiredTurnWasProcessed" in result) {
    throw conflictError(
      "Blackjack turn timed out and the default action was applied.",
      {
        code: API_ERROR_CODES.BLACKJACK_TURN_EXPIRED,
      },
    );
  }

  return result;
}
