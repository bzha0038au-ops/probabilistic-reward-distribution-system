import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { DealerEvent } from "@reward/shared-types/dealer";
import { blackjackGames, userWallets } from "@reward/database";
import { and, asc, eq, isNotNull, lte } from "@reward/database/orm";
import type {
  BlackjackAction,
  BlackjackFairness,
  BlackjackGame,
  BlackjackGameStatus,
  BlackjackLinkedGroup,
  BlackjackMutationResponse,
  BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";
import type {
  PlayModeOutcome,
  PlayModeSnapshot,
} from "@reward/shared-types/play-mode";
import { PlayModeSnapshotSchema } from "@reward/shared-types/play-mode";
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
  loadPlayModeSessionById,
  loadPlayModeSessionsByParent,
  loadUserPlayModeSnapshot,
  lockUserPlayModeState,
  resolveSettledPlayMode,
  saveUserPlayModeState,
  settlePlayModeSession,
  updatePlayModeSessionReference,
} from "../play-mode/service";
import { applySettledPlayModePayoutPolicy } from "../play-mode/deferred-payouts";
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

const resolveBlackjackStakeMultiplier = (snapshot: PlayModeSnapshot) =>
  snapshot.type === "dual_bet" ? 1 : snapshot.appliedMultiplier;

const sortBlackjackGames = <T extends { id: number }>(
  games: T[],
  readLinkedGroup: (game: T) => BlackjackLinkedGroup | null | undefined,
) =>
  [...games].sort((left, right) => {
    const leftLinkedGroup = readLinkedGroup(left);
    const rightLinkedGroup = readLinkedGroup(right);
    const leftPrimaryGameId = leftLinkedGroup?.primaryGameId ?? left.id;
    const rightPrimaryGameId = rightLinkedGroup?.primaryGameId ?? right.id;
    if (leftPrimaryGameId !== rightPrimaryGameId) {
      return leftPrimaryGameId - rightPrimaryGameId;
    }

    const leftExecutionIndex = leftLinkedGroup?.executionIndex ?? 1;
    const rightExecutionIndex = rightLinkedGroup?.executionIndex ?? 1;
    if (leftExecutionIndex !== rightExecutionIndex) {
      return leftExecutionIndex - rightExecutionIndex;
    }

    return left.id - right.id;
  });

const buildBlackjackMutationResponse = (params: {
  balance: string;
  playMode: PlayModeSnapshot;
  games: BlackjackGame[];
}): BlackjackMutationResponse => {
  const orderedGames = sortBlackjackGames(
    params.games,
    (game) => game.linkedGroup,
  );
  const primaryGame = orderedGames[0];
  if (!primaryGame) {
    throw internalInvariantError("Blackjack mutation is missing a game.");
  }

  return {
    balance: params.balance,
    playMode: params.playMode,
    games: orderedGames,
    game: primaryGame,
  };
};

const saveBlackjackUserPlayModeSnapshot = async (params: {
  tx: DbTransaction;
  userId: number;
  snapshot: PlayModeSnapshot;
}) => {
  const storedPlayMode = await lockUserPlayModeState(
    params.tx,
    params.userId,
    "blackjack",
  );
  if (!storedPlayMode) {
    return;
  }

  await saveUserPlayModeState({
    tx: params.tx,
    rowId: storedPlayMode.id,
    snapshot: params.snapshot,
  });
};

const loadBlackjackWalletBalance = async (
  tx: DbTransaction,
  userId: number,
) => {
  const [wallet] = await tx
    .select({ balance: userWallets.withdrawableBalance })
    .from(userWallets)
    .where(eq(userWallets.userId, userId))
    .limit(1);

  return wallet?.balance ?? "0.00";
};

const resolveBlackjackSessionSnapshot = (
  value: unknown,
  fallback: PlayModeSnapshot,
) => {
  const parsed = PlayModeSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

const resolveBlackjackGroupedOutcome = (params: {
  totalStakeAmount: ReturnType<typeof toDecimal>;
  totalPayoutAmount: ReturnType<typeof toDecimal>;
}): PlayModeOutcome => {
  const comparison = params.totalPayoutAmount.cmp(params.totalStakeAmount);
  if (comparison > 0) {
    return "win";
  }
  if (comparison < 0) {
    return "lose";
  }
  return "push";
};

const resolveBlackjackSettlementTotalsFromMetadata = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const totalStakeAmount = record.totalStakeAmount;
  const payoutAmount = record.payoutAmount;
  const status = record.status;
  if (
    typeof totalStakeAmount !== "string" ||
    typeof payoutAmount !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }

  return {
    totalStakeAmount,
    payoutAmount,
    status,
  };
};

const maybeFinalizeGroupedBlackjackPlayMode = async (params: {
  tx: DbTransaction;
  userId: number;
  parentSessionId: number;
  fallbackSnapshot: PlayModeSnapshot;
}) => {
  const parentSession = await loadPlayModeSessionById(params.tx, {
    sessionId: params.parentSessionId,
  });
  if (!parentSession) {
    return null;
  }

  const childSessions = await loadPlayModeSessionsByParent(params.tx, {
    parentSessionId: params.parentSessionId,
  });
  if (
    childSessions.length === 0 ||
    childSessions.some((session) => session.status === "active")
  ) {
    return null;
  }

  let totalStakeAmount = toDecimal(0);
  let totalPayoutAmount = toDecimal(0);
  for (const session of childSessions) {
    const totals = resolveBlackjackSettlementTotalsFromMetadata(session.metadata);
    if (!totals) {
      return null;
    }

    totalStakeAmount = totalStakeAmount.plus(totals.totalStakeAmount);
    totalPayoutAmount = totalPayoutAmount.plus(totals.payoutAmount);
  }

  const parentSnapshot = resolveBlackjackSessionSnapshot(
    parentSession.snapshot,
    params.fallbackSnapshot,
  );
  const outcome = resolveBlackjackGroupedOutcome({
    totalStakeAmount,
    totalPayoutAmount,
  });
  const settledSnapshot = resolveSettledPlayMode({
    snapshot: parentSnapshot,
    outcome,
  });

  await settlePlayModeSession({
    tx: params.tx,
    sessionId: parentSession.id,
    snapshot: settledSnapshot,
    outcome,
    metadata: {
      totalStakeAmount: toMoneyString(totalStakeAmount),
      totalPayoutAmount: toMoneyString(totalPayoutAmount),
      childSessionCount: childSessions.length,
    },
  });
  await saveBlackjackUserPlayModeSnapshot({
    tx: params.tx,
    userId: params.userId,
    snapshot: settledSnapshot,
  });

  return settledSnapshot;
};

const persistSettledBlackjackPlayMode = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  snapshot: PlayModeSnapshot;
  sessionId?: number | null;
}) => {
  const { tx, userId, game, snapshot } = params;
  const outcome = resolveBlackjackPlayModeOutcome(game.status);
  const settledPlayMode = resolveSettledPlayMode({
    snapshot,
    outcome,
  });
  const activeSession =
    params.sessionId
      ? await loadPlayModeSessionById(tx, {
          sessionId: params.sessionId,
        })
      : await loadActivePlayModeSession(tx, {
          userId,
          gameKey: "blackjack",
          referenceType: BLACKJACK_REFERENCE_TYPE,
          referenceId: game.id,
          includeChildSessions: true,
        });
  const adjustedPlayMode = await applySettledPlayModePayoutPolicy({
    tx,
    userId,
    gameKey: "blackjack",
    outcome,
    settledSnapshot: settledPlayMode,
    netPayoutAmount: toMoneyString(
      Decimal.max(
        toDecimal(game.payoutAmount).minus(toDecimal(game.totalStake)),
        0,
      ),
    ),
    balanceType: "withdrawable",
    sessionId: activeSession?.id ?? params.sessionId ?? null,
    sourceReferenceType: BLACKJACK_REFERENCE_TYPE,
    sourceReferenceId: game.id,
  });
  game.metadata.playMode = adjustedPlayMode;
  await persistGameState(tx, game);
  if (!activeSession) {
    await saveBlackjackUserPlayModeSnapshot({
      tx,
      userId,
      snapshot: adjustedPlayMode,
    });
    return adjustedPlayMode;
  }

  await settlePlayModeSession({
    tx,
    sessionId: activeSession.id,
    snapshot: adjustedPlayMode,
    outcome,
    referenceType: BLACKJACK_REFERENCE_TYPE,
    referenceId: game.id,
    metadata: {
      totalStakeAmount: toMoneyString(game.totalStake),
      payoutAmount: toMoneyString(game.payoutAmount),
      status: game.status,
      executionIndex: game.metadata.linkedGroup?.executionIndex ?? 1,
      executionCount: game.metadata.linkedGroup?.executionCount ?? 1,
      groupId: game.metadata.linkedGroup?.groupId ?? null,
    },
  });

  if (!activeSession.parentSessionId) {
    await saveBlackjackUserPlayModeSnapshot({
      tx,
      userId,
      snapshot: adjustedPlayMode,
    });
    return adjustedPlayMode;
  }

  const groupedSnapshot = await maybeFinalizeGroupedBlackjackPlayMode({
    tx,
    userId,
    parentSessionId: activeSession.parentSessionId,
    fallbackSnapshot: snapshot,
  });
  return groupedSnapshot ?? snapshot;
};

type BlackjackTurnConfig = AppConfig & {
  blackjackTurnTimeoutMs: number;
  blackjackTimeoutWorkerBatchSize: number;
};

const blackjackTurnConfig = getConfigView<BlackjackTurnConfig>();
const BLACKJACK_PLAYER_SEAT_INDEX = 1;

const buildBlackjackDealerEvent = (params: {
  game: BlackjackGameState;
  kind?: DealerEvent["kind"];
  actionCode?: string | null;
  pace?: DealerEvent["pace"];
  seatIndex?: number | null;
  phase?: string | null;
  text?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: DealerEvent["source"];
}) =>
  buildDealerEvent({
    kind: params.kind ?? "action",
    source: params.source ?? "rule",
    gameType: "blackjack",
    tableId: null,
    tableRef: params.game.metadata.table.tableId,
    roundId: `${BLACKJACK_ROUND_TYPE}:${params.game.id}`,
    referenceId: params.game.id,
    phase:
      params.phase ?? (params.game.status === "active" ? "active" : "settlement"),
    seatIndex: params.seatIndex ?? null,
    actionCode: params.actionCode ?? null,
    pace: params.pace ?? null,
    text: params.text ?? null,
    metadata: params.metadata ?? null,
  });

type BlackjackDealerLanguageTask =
  | {
      scenario: string;
      summary: Record<string, unknown>;
    }
  | null;

type BlackjackMutationExecutionResult =
  | {
      response: BlackjackMutationResponse;
      dealerEvents: DealerEvent[];
      dealerLanguageTask: BlackjackDealerLanguageTask;
    }
  | {
      expiredTurnWasProcessed: true;
    };

const publishBlackjackDealerEvents = (userId: number, events: DealerEvent[]) => {
  for (const event of events) {
    publishDealerRealtimeToUser(userId, event);
  }
};

const buildBlackjackPromptLanguageTask = (params: {
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
  scenario: string;
}) => ({
  scenario: params.scenario,
  summary: {
    activeHandIndex: params.game.metadata.activeHandIndex,
    availableActions: getAvailableActions(params.game, params.walletBalance),
    dealerVisibleTotal: scoreBlackjackCards(
      params.game.dealerCards.filter((_, index) => index !== 1),
    ).total,
    playerTotals: params.game.metadata.playerHands.map(
      (hand) => scoreBlackjackCards(hand.cards).total,
    ),
  },
}) satisfies Exclude<BlackjackDealerLanguageTask, null>;

const buildBlackjackPromptDealerEvents = (params: {
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
  actionCode?: string;
  text?: string;
  pace?: DealerEvent["pace"];
}) => {
  const availableActions = getAvailableActions(params.game, params.walletBalance);
  if (params.game.status !== "active" || availableActions.length === 0) {
    return [] satisfies DealerEvent[];
  }

  const activeHandIndex = params.game.metadata.activeHandIndex;
  return [
    buildBlackjackDealerEvent({
      game: params.game,
      kind: "pace_hint",
      actionCode: params.actionCode ?? "prompt_player",
      pace: params.pace ?? "normal",
      seatIndex: BLACKJACK_PLAYER_SEAT_INDEX,
      text:
        params.text ??
        (params.game.metadata.playerHands.length > 1 && activeHandIndex !== null
          ? `Hand ${activeHandIndex + 1} is live. Your move.`
          : "Your move."),
      metadata: {
        activeHandIndex,
        availableActions,
        turnDeadlineAt: params.game.turnDeadlineAt,
      },
    }),
  ] satisfies DealerEvent[];
};

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
  phase: string;
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
      phase: params.phase,
      seatIndex: null,
      summary: params.summary,
    });
    if (!event) {
      return;
    }

    const persisted = await db.transaction(async (tx) => {
      const activeRows = await loadBlackjackGameRows(tx, {
        userId: params.userId,
        lock: true,
        limit: null,
      });
      const settledRows =
        !activeRows.some((row) => row.id === params.gameId)
          ? await loadBlackjackGameRows(tx, {
              userId: params.userId,
              settledOnly: true,
            })
          : [];
      const activeTargetRow = activeRows.find((row) => row.id === params.gameId);
      const targetRow =
        activeTargetRow ?? settledRows.find((row) => row.id === params.gameId) ?? null;
      if (!targetRow) {
        return null;
      }

      const game = toGameState(targetRow);
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

export const runBlackjackDealerSideEffects = (params: {
  userId: number;
  response: BlackjackMutationResponse;
  dealerEvents: DealerEvent[];
  dealerLanguageTask: BlackjackDealerLanguageTask;
}) => {
  publishBlackjackDealerEvents(params.userId, params.dealerEvents);
  if (!params.dealerLanguageTask) {
    return;
  }

  emitAsyncBlackjackDealerLanguageEvent({
    userId: params.userId,
    gameId: params.response.game.id,
    scenario: params.dealerLanguageTask.scenario,
    summary: params.dealerLanguageTask.summary,
    tableRef: params.response.game.table.tableId,
    phase: params.response.game.status === "active" ? "active" : "settlement",
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
}): Promise<Exclude<BlackjackMutationExecutionResult, { expiredTurnWasProcessed: true }>> => {
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
    const responseBalance = toDecimal(await loadBlackjackWalletBalance(tx, userId));
    return {
      response: buildBlackjackMutationResponse({
        balance: toMoneyString(responseBalance),
        playMode,
        games: [serializeBlackjackGame(settled.game, responseBalance)],
      }),
      dealerEvents: settled.dealerEvents,
      dealerLanguageTask: {
        scenario: "blackjack_round_settled",
        summary: {
          status: settled.game.status,
          payoutAmount: settled.game.payoutAmount,
          dealerCards: settled.game.dealerCards,
        },
      },
    };
  }

  syncBlackjackTurnDeadline(game, now);
  const dealerEvents = buildBlackjackPromptDealerEvents({
    game,
    walletBalance,
    actionCode:
      game.metadata.playerHands.length > 1 ? "prompt_next_hand" : "prompt_player",
  });
  if (dealerEvents.length > 0) {
    await persistBlackjackDealerEvents({
      tx,
      userId,
      game,
      events: dealerEvents,
    });
  } else {
    await persistGameState(tx, game);
  }
  return {
    response: buildBlackjackMutationResponse({
      balance: toMoneyString(walletBalance),
      playMode: game.metadata.playMode,
      games: [serializeBlackjackGame(game, walletBalance)],
    }),
    dealerEvents,
    dealerLanguageTask:
      dealerEvents.length > 0
        ? buildBlackjackPromptLanguageTask({
            game,
            walletBalance,
            scenario: "blackjack_player_turn",
          })
        : null,
  };
};

const applyBlackjackStandAction = async (params: {
  tx: DbTransaction;
  userId: number;
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
  actor: "player" | "system";
  now?: Date;
  dueToTimeout?: boolean;
}): Promise<Exclude<BlackjackMutationExecutionResult, { expiredTurnWasProcessed: true }>> => {
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
  const dealerEvents = dueToTimeout
    ? [
        buildBlackjackDealerEvent({
          game,
          kind: "action",
          actionCode: "timeout_forced_stand",
          seatIndex: BLACKJACK_PLAYER_SEAT_INDEX,
          text: "Turn timer expired. Dealer stands the hand.",
          metadata: {
            handIndex: activeHandIndex,
            total: scoreBlackjackCards(activeHand.cards).total,
          },
        }),
      ]
    : [];
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
  if (dealerEvents.length > 0) {
    await persistBlackjackDealerEvents({
      tx,
      userId,
      game,
      events: dealerEvents,
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
    const responseBalance = toDecimal(await loadBlackjackWalletBalance(tx, userId));
    return {
      response: buildBlackjackMutationResponse({
        balance: toMoneyString(responseBalance),
        playMode,
        games: [serializeBlackjackGame(settled.game, responseBalance)],
      }),
      dealerEvents: [...dealerEvents, ...settled.dealerEvents],
      dealerLanguageTask: dueToTimeout
        ? {
            scenario: "blackjack_timeout_forced_stand",
            summary: {
              handIndex: activeHandIndex,
              total: scoreBlackjackCards(activeHand.cards).total,
            },
          }
        : {
            scenario: "blackjack_round_settled",
            summary: {
              status: settled.game.status,
              payoutAmount: settled.game.payoutAmount,
              dealerCards: settled.game.dealerCards,
            },
          },
    };
  }

  const continued = await finalizeBlackjackProgress({
    tx,
    userId,
    game,
    walletBalance,
    now,
  });
  return {
    ...continued,
    dealerEvents: [...dealerEvents, ...continued.dealerEvents],
    dealerLanguageTask: dueToTimeout
      ? {
          scenario: "blackjack_timeout_forced_stand",
          summary: {
            handIndex: activeHandIndex,
            total: scoreBlackjackCards(activeHand.cards).total,
          },
        }
      : continued.dealerLanguageTask,
  };
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
    return null;
  }

  return applyBlackjackStandAction({
    tx,
    userId,
    game,
    walletBalance,
    actor: "system",
    now,
    dueToTimeout: true,
  });
};

export async function processExpiredBlackjackTurnForUser(userId: number) {
  const result = await db.transaction(async (tx) => {
    const user = await loadLockedBlackjackUser(tx, userId);
    if (!user) {
      return null;
    }

    const activeGames = sortBlackjackGames(
      (await loadBlackjackGameRows(tx, {
        userId,
        lock: true,
        limit: null,
      })).map((row) => toGameState(row)),
      (game) => game.metadata.linkedGroup,
    );
    const targetGame = activeGames.find((game) => isBlackjackTurnExpired(game));
    if (!targetGame) {
      return null;
    }

    return processExpiredBlackjackTurnInTransaction({
      tx,
      userId,
      game: targetGame,
      walletBalance: toDecimal(user.withdrawable_balance ?? 0),
    });
  });

  if (!result) {
    return false;
  }

  runBlackjackDealerSideEffects({
    userId,
    response: result.response,
    dealerEvents: result.dealerEvents,
    dealerLanguageTask: result.dealerLanguageTask,
  });
  return true;
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
    loadBlackjackGameRows(db, { userId, limit: null }),
    loadBlackjackGameRows(db, { userId, settledOnly: true }),
  ]);

  const activeGames = sortBlackjackGames(
    activeRows.map((row) => toGameState(row)),
    (game) => game.metadata.linkedGroup,
  );
  const recentGames = recentRows.map((row) =>
    serializeBlackjackSummary(toGameState(row)),
  );
  const balance = toDecimal(walletBalance);
  const serializedActiveGames = activeGames.map((game) =>
    serializeBlackjackGame(game, balance),
  );
  const activeGame = serializedActiveGames[0] ?? null;

  return {
    balance: toMoneyString(balance),
    config: activeGames[0]?.metadata.config ?? blackjackConfig,
    playMode: activeGame?.playMode ?? storedPlayMode,
    fairness,
    activeGames: serializedActiveGames,
    activeGame,
    recentGames,
  };
}

export const startResolvedBlackjackInTransaction = async (
  tx: DbTransaction,
  userId: number,
  options: {
    stakeAmount: string;
    clientNonce?: string | null;
    playMode: import("@reward/shared-types/play-mode").PlayModeSnapshot;
    playModeSessionId?: number | null;
    linkedGroup?: Omit<BlackjackLinkedGroup, "primaryGameId" | "gameIds"> & {
      primaryGameId?: number | null;
      gameIds?: number[];
    };
  },
) => {
  const user = await loadLockedBlackjackUser(tx, userId);
  if (!user) {
    throw notFoundError("User not found.");
  }

  const existingActiveGames = sortBlackjackGames(
    (await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
      limit: null,
    })).map((row) => toGameState(row)),
    (game) => game.metadata.linkedGroup,
  );
  if (!options.linkedGroup && existingActiveGames.length > 0) {
    throw conflictError(
      "Finish the active blackjack game before starting a new one.",
    );
  }
  if (options.linkedGroup) {
    const unrelatedActiveGame = existingActiveGames.find(
      (game) => game.metadata.linkedGroup?.groupId !== options.linkedGroup?.groupId,
    );
    if (unrelatedActiveGame) {
      throw conflictError(
        "Finish the active blackjack game before starting a new one.",
      );
    }
  }

  const activePlayMode = options.playMode;
  const blackjackConfig = await getBlackjackConfig(tx);
  const minStakeAmount = toDecimal(blackjackConfig.minStake);
  const maxStakeAmount = toDecimal(blackjackConfig.maxStake);
  const naturalPayoutMultiplier = toDecimal(
    blackjackConfig.naturalPayoutMultiplier,
  );
  const baseStakeAmount = resolveStakeAmount(options.stakeAmount);
  const stakeAmount = baseStakeAmount.mul(
    resolveBlackjackStakeMultiplier(activePlayMode),
  );
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
  const linkedGroup = options.linkedGroup
    ? {
        groupId: options.linkedGroup.groupId,
        primaryGameId: options.linkedGroup.primaryGameId ?? null,
        gameIds: options.linkedGroup.gameIds ?? [],
        executionIndex: options.linkedGroup.executionIndex,
        executionCount: options.linkedGroup.executionCount,
      }
    : null;
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
    linkedGroup,
  });
  const activeSession =
    options.playModeSessionId
      ? await loadPlayModeSessionById(tx, {
          sessionId: options.playModeSessionId,
        })
      : await loadActivePlayModeSession(tx, {
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
          linkedGroup,
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
  const initialDealerEvents = [
    buildBlackjackDealerEvent({
      game,
      actionCode: "cards_dealt",
      text: "Dealer completes the opening deal.",
      metadata: {
        playerCards,
        dealerUpCard: dealerCards[0] ?? null,
      },
    }),
    ...buildBlackjackPromptDealerEvents({
      game,
      walletBalance: walletAfter,
      actionCode: "prompt_player",
      text: "Opening deal is complete. Your move.",
    }),
  ];
  await persistBlackjackDealerEvents({
    tx,
    userId,
    game,
    events: initialDealerEvents,
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
      sessionId: activeSession?.id ?? null,
    });
    const responseBalance = toDecimal(await loadBlackjackWalletBalance(tx, userId));
    const response = buildBlackjackMutationResponse({
      balance: toMoneyString(responseBalance),
      playMode: settledPlayMode,
      games: [serializeBlackjackGame(settled.game, responseBalance)],
    });

    await assertWalletLedgerInvariant(tx, userId, {
      service: "blackjack",
      operation: "startBlackjack",
    });

    return {
      game: settled.game,
      response,
      dealerEvents: [...initialDealerEvents, ...settled.dealerEvents],
      dealerLanguageTask: {
        scenario: "blackjack_round_settled",
        summary: {
          status: settled.game.status,
          payoutAmount: settled.game.payoutAmount,
          dealerCards: settled.game.dealerCards,
        },
      },
    };
  }

  const response = buildBlackjackMutationResponse({
    balance: toMoneyString(walletAfter),
    playMode: activePlayMode,
    games: [serializeBlackjackGame(game, walletAfter)],
  });

  await assertWalletLedgerInvariant(tx, userId, {
    service: "blackjack",
    operation: "startBlackjack",
  });

  return {
    game,
    response,
    dealerEvents: initialDealerEvents,
    dealerLanguageTask:
      initialDealerEvents.length > 1
        ? buildBlackjackPromptLanguageTask({
            game,
            walletBalance: walletAfter,
            scenario: "blackjack_initial_deal",
          })
        : null,
  };
};

export async function startResolvedBlackjack(
  userId: number,
  options: {
    stakeAmount: string;
    clientNonce?: string | null;
    playMode: import("@reward/shared-types/play-mode").PlayModeSnapshot;
    playModeSessionId?: number | null;
    linkedGroup?: Omit<BlackjackLinkedGroup, "primaryGameId" | "gameIds"> & {
      primaryGameId?: number | null;
      gameIds?: number[];
    };
  },
): Promise<BlackjackMutationResponse> {
  const result = await db.transaction(async (tx) =>
    startResolvedBlackjackInTransaction(tx, userId, options),
  );

  runBlackjackDealerSideEffects({
    userId,
    response: result.response,
    dealerEvents: result.dealerEvents,
    dealerLanguageTask: result.dealerLanguageTask,
  });

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

    const activeRows = await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
      limit: null,
    });
    if (activeRows.length === 0) {
      throw notFoundError("No active blackjack game found.");
    }
    const activeRow = activeRows.find((row) => row.id === gameId);
    if (!activeRow) {
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
        processedTurn: expiredTurnWasProcessed,
      } as const;
    }

    const finalizeMutation = async (
      result: Exclude<BlackjackMutationExecutionResult, { expiredTurnWasProcessed: true }>,
    ): Promise<Exclude<BlackjackMutationExecutionResult, { expiredTurnWasProcessed: true }>> => {
      await assertWalletLedgerInvariant(tx, userId, {
        service: "blackjack",
        operation: "actOnBlackjack",
      });
      return result;
    };

    const availableActions = getAvailableActions(game, walletBalance);
    if (!availableActions.includes(action)) {
      throw conflictError("That action is not available for the current hand.");
    }

    const persistOrSettleAfterAutoAdvance = async () => {
      const result = await finalizeBlackjackProgress({
        tx,
        userId,
        game,
        walletBalance,
        now,
      });
      return finalizeMutation(result);
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
      const dealerEvents = buildBlackjackPromptDealerEvents({
        game,
        walletBalance,
        text: "Card is live. Your move.",
      });
      if (dealerEvents.length > 0) {
        await persistBlackjackDealerEvents({
          tx,
          userId,
          game,
          events: dealerEvents,
        });
      } else {
        await persistGameState(tx, game);
      }
      return finalizeMutation({
        response: buildBlackjackMutationResponse({
          balance: toMoneyString(walletBalance),
          playMode: game.metadata.playMode,
          games: [serializeBlackjackGame(game, walletBalance)],
        }),
        dealerEvents,
        dealerLanguageTask: null,
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
        const responseBalance = toDecimal(await loadBlackjackWalletBalance(tx, userId));
        return finalizeMutation({
          response: buildBlackjackMutationResponse({
            balance: toMoneyString(responseBalance),
            playMode,
            games: [serializeBlackjackGame(settled.game, responseBalance)],
          }),
          dealerEvents: settled.dealerEvents,
          dealerLanguageTask: {
            scenario: "blackjack_round_settled",
            summary: {
              status: settled.game.status,
              payoutAmount: settled.game.payoutAmount,
              dealerCards: settled.game.dealerCards,
            },
          },
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
    if (result.processedTurn) {
      runBlackjackDealerSideEffects({
        userId,
        response: result.processedTurn.response,
        dealerEvents: result.processedTurn.dealerEvents,
        dealerLanguageTask: result.processedTurn.dealerLanguageTask,
      });
    }
    throw conflictError(
      "Blackjack turn timed out and the default action was applied.",
      {
        code: API_ERROR_CODES.BLACKJACK_TURN_EXPIRED,
      },
    );
  }

  runBlackjackDealerSideEffects({
    userId,
    response: result.response,
    dealerEvents: result.dealerEvents,
    dealerLanguageTask: result.dealerLanguageTask,
  });

  return result.response;
}
