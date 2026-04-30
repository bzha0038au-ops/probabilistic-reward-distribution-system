import type { DealerEvent } from "@reward/shared-types/dealer";
import {
  buildHoldemRealtimeTableTopic,
  type HoldemAction,
} from "@reward/shared-types/holdem";
import {
  handHistories,
  tableEvents,
} from "@reward/database";
import { and, eq, sql } from "@reward/database/orm";

import type { DbTransaction } from "../../db";
import {
  conflictError,
  internalInvariantError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { appendRoundEvents } from "../hand-history/service";
import { HOLDEM_ROUND_TYPE } from "../hand-history/round-id";
import {
  appendDealerFeedEvent,
  buildDealerEvent,
} from "../dealer-bot/service";
import {
  buildHoldemRealtimeFanout,
  type HoldemRealtimeFanout,
} from "./realtime";
import {
  applyRakeToSettledState,
  serializeHoldemRealtimeTable,
  type HoldemRakePolicy,
} from "./engine";
import {
  resolveSeatDisplayName,
  type HoldemTableState,
} from "./model";
import {
  buildHoldemRoundId,
  buildHoldemTableRef,
  cloneTableState,
  countHoldemActiveSeats,
  countHumanSeats,
  getPendingActorSeat,
  isSettledHoldemState,
  isTournamentTable,
  resolveSettledHoldemEventType,
  type HoldemEventActor,
  type HoldemHandEventInput,
  type HoldemTableEventInput,
  type LockedWalletRow,
  type PersistedHoldemTableEvent,
} from "./service-shared";
import {
  settlePendingSeatCashOuts,
  settleTournamentAfterHand,
  syncSettledLockedBalances,
} from "./wallet-settlement";

type LoadLockedWalletRows = (
  tx: DbTransaction,
  userIds: number[],
) => Promise<Map<number, LockedWalletRow>>;

type SettleHoldemPlayModeSessionIfPresent = (params: {
  tx: DbTransaction;
  userId: number;
  tableId: number;
  cashOutAmount: ReturnType<typeof toDecimal>;
  balanceType: "bonus" | "withdrawable";
}) => Promise<unknown>;

type RemoveBotSeats = (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  predicate: (seat: HoldemTableState["seats"][number]) => boolean;
}) => Promise<HoldemTableState["seats"][number][]>;

type PersistTableState = (
  tx: DbTransaction,
  state: HoldemTableState,
) => Promise<void>;

type SyncHoldemTurnDeadlines = (
  state: HoldemTableState,
  now?: Date,
) => void;

type ResolveHoldemRakePolicySnapshot = (
  executor: DbTransaction,
  state: HoldemTableState,
) => Promise<HoldemRakePolicy | null>;

export type HoldemDealerLanguageTask =
  | {
      scenario: string;
      summary: Record<string, unknown>;
    }
  | null;

export type HoldemPersistedTransition = {
  dealerEvents: DealerEvent[];
  dealerLanguageTask: HoldemDealerLanguageTask;
  fanout: HoldemRealtimeFanout;
  handHistoryId: number;
  historyUserId: number;
  phase: string | null;
};

type EmitAsyncHoldemDealerLanguageEvent = (params: {
  tableId: number;
  handHistoryId: number;
  historyUserId: number;
  phase: string | null;
  scenario: string;
  summary: Record<string, unknown>;
  seatIndex?: number | null;
}) => void;

const resolveTotalRakeAmount = (state: HoldemTableState) =>
  state.metadata.resolvedPots.reduce(
    (sum, pot) => sum.plus(pot.rakeAmount ?? "0.00"),
    toDecimal(0),
  );

const getActiveHandHistoryId = (state: HoldemTableState) =>
  state.metadata.activeHandHistoryId;

export const buildRealtimeUpdate = (params: {
  state: HoldemTableState;
  tableEvents: PersistedHoldemTableEvent[];
  action?: HoldemAction | null;
  timedOut?: boolean;
}): HoldemRealtimeFanout => {
  const latestEvent =
    params.tableEvents[params.tableEvents.length - 1] ?? null;
  const handHistoryId =
    latestEvent?.handHistoryId ?? getActiveHandHistoryId(params.state) ?? null;

  return buildHoldemRealtimeFanout({
    state: params.state,
    update: {
      table: serializeHoldemRealtimeTable(params.state),
      handHistoryId,
      roundId: handHistoryId ? buildHoldemRoundId(handHistoryId) : null,
      actorSeatIndex: latestEvent?.seatIndex ?? null,
      action: params.action ?? null,
      timedOut: params.timedOut === true,
      eventTypes: params.tableEvents.map((event) => event.eventType),
    },
  });
};

const buildContributionMap = (state: HoldemTableState) =>
  new Map(
    state.seats.map((seat) => [
      seat.seatIndex,
      toDecimal(seat.totalCommittedAmount),
    ] as const),
  );

const buildParticipantSummaries = (params: {
  state: HoldemTableState;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
  contributionBySeatIndex?: Map<number, ReturnType<typeof toDecimal>>;
}) =>
  params.state.seats
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((seat) => {
      const stackBefore =
        params.stackBeforeByUserId.get(seat.userId) ?? toDecimal(seat.stackAmount);
      const stackAfter = toDecimal(seat.stackAmount);
      const contributionAmount =
        params.contributionBySeatIndex?.get(seat.seatIndex) ??
        toDecimal(seat.totalCommittedAmount);
      const payoutFloor = stackBefore.minus(contributionAmount);
      const payoutAmount = stackAfter.gt(payoutFloor)
        ? stackAfter.minus(payoutFloor)
        : toDecimal(0);

      return {
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        displayName: resolveSeatDisplayName(
          seat.userId,
          seat.userEmail,
          seat.metadata,
        ),
        contributionAmount: toMoneyString(contributionAmount),
        payoutAmount: toMoneyString(payoutAmount),
        stackBefore: toMoneyString(stackBefore),
        stackAfter: toMoneyString(stackAfter),
        winner: seat.metadata.winner,
        status: seat.status,
        holeCards: seat.holeCards,
        bestHand: seat.metadata.bestHand,
        lastAction: seat.lastAction,
      };
    });

const buildHoldemHandSummary = (params: {
  state: HoldemTableState;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
  contributionBySeatIndex?: Map<number, ReturnType<typeof toDecimal>>;
}) => ({
  gameType: "holdem",
  tableId: params.state.id,
  tableName: params.state.name,
  handNumber: params.state.metadata.handNumber,
  status: isSettledHoldemState(params.state) ? "settled" : params.state.status,
  stage: params.state.metadata.stage,
  blinds: {
    smallBlind: toMoneyString(params.state.smallBlind),
    bigBlind: toMoneyString(params.state.bigBlind),
  },
  dealerSeatIndex: params.state.metadata.dealerSeatIndex,
  smallBlindSeatIndex: params.state.metadata.smallBlindSeatIndex,
  bigBlindSeatIndex: params.state.metadata.bigBlindSeatIndex,
  pendingActorSeatIndex: params.state.metadata.pendingActorSeatIndex,
  boardCards: params.state.metadata.communityCards,
  revealedSeatIndexes: params.state.metadata.revealedSeatIndexes,
  winnerSeatIndexes: params.state.metadata.winnerSeatIndexes,
  totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.state)),
  pots:
    params.state.metadata.resolvedPots.length > 0
      ? params.state.metadata.resolvedPots
      : null,
  participants: buildParticipantSummaries(params),
});

export const appendTableEvents = async (params: {
  tx: DbTransaction;
  tableId: number;
  events: HoldemTableEventInput[];
}) => {
  const { tx } = params;
  if (params.events.length === 0) {
    return [] satisfies PersistedHoldemTableEvent[];
  }

  const [row] = await tx
    .select({
      maxEventIndex: sql<number>`coalesce(max(${tableEvents.eventIndex}), -1)`,
    })
    .from(tableEvents)
    .where(
      and(
        eq(tableEvents.tableType, "holdem"),
        eq(tableEvents.tableId, params.tableId),
      ),
    );
  const nextEventIndex = Number(row?.maxEventIndex ?? -1) + 1;
  const createdAt = new Date();
  const values = params.events.map((event, index) => ({
    tableType: "holdem" as const,
    tableId: params.tableId,
    seatIndex: event.seatIndex ?? null,
    userId: event.userId ?? null,
    handHistoryId: event.handHistoryId ?? null,
    phase: event.phase ?? null,
    eventIndex: nextEventIndex + index,
    eventType: event.eventType,
    actor: event.actor,
    payload: event.payload ?? {},
    createdAt,
  }));

  await tx.insert(tableEvents).values(values);

  return values.map((event) => ({
    eventType: event.eventType,
    actor: event.actor,
    userId: event.userId,
    seatIndex: event.seatIndex,
    handHistoryId: event.handHistoryId,
    phase: event.phase,
    payload: event.payload as Record<string, unknown>,
    eventIndex: event.eventIndex,
    createdAt: event.createdAt,
  }));
};

export const createHoldemHandHistory = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  startedByUserId: number;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
}) => {
  const { tx, state } = params;
  const now = new Date();
  const [createdHandHistory] = await tx
    .insert(handHistories)
    .values({
      roundType: HOLDEM_ROUND_TYPE,
      gameType: "holdem",
      tableId: state.id,
      referenceId: state.id,
      primaryUserId: params.startedByUserId,
      participantUserIds: state.seats.map((seat) => seat.userId),
      handNumber: state.metadata.handNumber,
      status: "active",
      summary: buildHoldemHandSummary({
        state,
        stackBeforeByUserId: params.stackBeforeByUserId,
      }),
      fairness: state.metadata.fairness,
      startedAt: now,
      settledAt: null,
      updatedAt: now,
    })
    .returning({
      id: handHistories.id,
    });

  if (!createdHandHistory) {
    throw conflictError("Failed to create holdem hand history.");
  }

  state.metadata.activeHandHistoryId = createdHandHistory.id;
  return createdHandHistory.id;
};

const loadHoldemHandHistoryOwnerUserId = async (
  tx: DbTransaction,
  handHistoryId: number,
) => {
  const [row] = await tx
    .select({
      primaryUserId: handHistories.primaryUserId,
    })
    .from(handHistories)
    .where(eq(handHistories.id, handHistoryId))
    .limit(1);

  if (!row?.primaryUserId) {
    throw internalInvariantError("Holdem hand history owner is missing.");
  }

  return row.primaryUserId;
};

const syncHoldemHandHistory = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  handHistoryId: number;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
  contributionBySeatIndex?: Map<number, ReturnType<typeof toDecimal>>;
}) => {
  const nextRoundId = buildHoldemRoundId(params.handHistoryId);
  if (
    isSettledHoldemState(params.state) &&
    params.state.metadata.recentHands[0]?.handNumber === params.state.metadata.handNumber
  ) {
    params.state.metadata.recentHands[0].roundId = nextRoundId;
  }

  const settled = isSettledHoldemState(params.state);
  await params.tx
    .update(handHistories)
    .set({
      status: settled ? "settled" : "active",
      summary: buildHoldemHandSummary({
        state: params.state,
        stackBeforeByUserId: params.stackBeforeByUserId,
        contributionBySeatIndex: params.contributionBySeatIndex,
      }),
      fairness: params.state.metadata.fairness,
      settledAt: settled ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(handHistories.id, params.handHistoryId));

  if (settled) {
    params.state.metadata.activeHandHistoryId = null;
  }
};

const buildTurnStartedEvent = (
  state: HoldemTableState,
): HoldemHandEventInput | null => {
  const pendingActorSeat = getPendingActorSeat(state);
  if (!pendingActorSeat) {
    return null;
  }

  return {
    type: "turn_started",
    actor: "system" as const,
    userId: pendingActorSeat.userId,
    payload: {
      handNumber: state.metadata.handNumber,
      stage: state.metadata.stage,
      seatIndex: pendingActorSeat.seatIndex,
      userId: pendingActorSeat.userId,
      turnDeadlineAt: pendingActorSeat.turnDeadlineAt,
      turnTimeBankStartsAt: state.metadata.turnTimeBankStartsAt,
      timeBankRemainingMs: pendingActorSeat.metadata.timeBankRemainingMs,
    },
  };
};

const appendHoldemHandEvents = async (params: {
  tx: DbTransaction;
  handHistoryId: number;
  historyUserId: number;
  tableId: number;
  phase: string | null;
  events: HoldemHandEventInput[];
}) => {
  if (params.events.length === 0) {
    return;
  }

  await appendRoundEvents(params.tx, {
    roundType: HOLDEM_ROUND_TYPE,
    roundEntityId: params.handHistoryId,
    userId: params.historyUserId,
    events: params.events.map((event) => ({
      type: event.type,
      actor: event.actor,
      payload: {
        tableId: params.tableId,
        handHistoryId: params.handHistoryId,
        phase: params.phase,
        ...event.payload,
      },
      userId: event.userId ?? null,
    })),
  });
};

const mapDealerEventToHoldemEventType = (event: DealerEvent) => {
  switch (event.kind) {
    case "action":
      return "dealer_action";
    case "message":
      return "dealer_message";
    case "pace_hint":
      return "dealer_pace_hint";
  }
};

const appendDealerEventsToHoldemState = (
  state: HoldemTableState,
  events: DealerEvent[],
) => {
  for (const event of events) {
    state.metadata.dealerEvents = appendDealerFeedEvent(
      state.metadata.dealerEvents,
      event,
    );
  }
};

export const buildHoldemDealerEvent = (params: {
  state: HoldemTableState;
  handHistoryId: number;
  kind: DealerEvent["kind"];
  actionCode?: string | null;
  pace?: DealerEvent["pace"];
  phase?: string | null;
  seatIndex?: number | null;
  text: string;
  metadata?: Record<string, unknown> | null;
  source?: DealerEvent["source"];
}) =>
  buildDealerEvent({
    kind: params.kind,
    source: params.source ?? "rule",
    gameType: "holdem",
    tableId: params.state.id,
    tableRef: buildHoldemTableRef(params.state.id),
    roundId: buildHoldemRoundId(params.handHistoryId),
    referenceId: params.handHistoryId,
    phase: params.phase ?? params.state.metadata.stage,
    seatIndex: params.seatIndex ?? null,
    actionCode: params.actionCode ?? null,
    pace: params.pace ?? null,
    text: params.text,
    metadata: params.metadata ?? null,
  });

export const resolveHoldemDealerPromptPace = (params: {
  state: HoldemTableState;
  seat: HoldemTableState["seats"][number];
}) => {
  if (countHoldemActiveSeats(params.state) <= 2) {
    return "expedite" as const;
  }

  return params.seat.metadata.timeBankRemainingMs <= 10_000
    ? ("expedite" as const)
    : ("normal" as const);
};

export const persistHoldemDealerEvents = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  handHistoryId: number;
  historyUserId: number;
  phase: string | null;
  events: DealerEvent[];
}) => {
  if (params.events.length === 0) {
    return [] satisfies PersistedHoldemTableEvent[];
  }

  appendDealerEventsToHoldemState(params.state, params.events);
  await appendHoldemHandEvents({
    tx: params.tx,
    handHistoryId: params.handHistoryId,
    historyUserId: params.historyUserId,
    tableId: params.state.id,
    phase: params.phase,
    events: params.events.map((event) => ({
      type: mapDealerEventToHoldemEventType(event),
      actor: "dealer" as const,
      payload: {
        dealerEvent: event,
      },
    })),
  });

  return appendTableEvents({
    tx: params.tx,
    tableId: params.state.id,
    events: params.events.map((event) => ({
      eventType: mapDealerEventToHoldemEventType(event),
      actor: "dealer" as const,
      handHistoryId: params.handHistoryId,
      phase: params.phase,
      seatIndex: event.seatIndex ?? null,
      payload: {
        dealerEvent: event,
      },
    })),
  });
};

const buildHoldemTransitionDealerEvents = (params: {
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  handHistoryId: number;
  action?: HoldemAction;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
}) => {
  const events: DealerEvent[] = [];
  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  const beforeStage = params.beforeState.metadata.stage;
  const afterStage = params.afterState.metadata.stage;

  if (
    params.timedOut &&
    params.action &&
    params.beforeState.metadata.pendingActorSeatIndex !== null
  ) {
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "action",
        actionCode: "timeout_forced_action",
        seatIndex: params.beforeState.metadata.pendingActorSeatIndex,
        text: `Seat #${params.beforeState.metadata.pendingActorSeatIndex + 1} timed out. Dealer applies ${params.action}.`,
        metadata: {
          action: params.action,
          timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        },
      }),
    );
  }

  if (afterStage !== null && beforeStage !== afterStage) {
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "action",
        actionCode: "stage_opened",
        text: `Dealer opens the ${afterStage}.`,
        metadata: {
          fromStage: beforeStage,
          stage: afterStage,
        },
      }),
    );
  }

  if (afterStage !== null && afterBoardCount > beforeBoardCount) {
    const newCards = params.afterState.metadata.communityCards
      .slice(beforeBoardCount)
      .map((card) => `${card.rank}${card.suit[0]?.toUpperCase() ?? ""}`);
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "action",
        actionCode: "board_revealed",
        text: `Dealer reveals ${newCards.join(" ")} on the ${params.afterState.metadata.stage}.`,
        metadata: {
          boardCards: params.afterState.metadata.communityCards,
        },
      }),
    );
  } else if (beforeStage !== afterStage) {
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "pace_hint",
        actionCode: "phase_resolving",
        pace: "pause",
        text: "Dealer is resolving the street before action reopens.",
        metadata: {
          fromStage: beforeStage,
          stage: afterStage,
        },
      }),
    );
  }

  if (isSettledHoldemState(params.afterState)) {
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "action",
        actionCode: "hand_settled",
        text: `Pot awarded to seat${params.afterState.metadata.winnerSeatIndexes.length === 1 ? "" : "s"} ${params.afterState.metadata.winnerSeatIndexes
          .map((seatIndex) => `#${seatIndex + 1}`)
          .join(", ")}.`,
        metadata: {
          winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        },
      }),
    );
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "pace_hint",
        actionCode: "settlement_pause",
        pace: "pause",
        text: "Dealer is settling the pot before the next hand.",
      }),
    );
  } else {
    const nextSeat = getPendingActorSeat(params.afterState);
    if (nextSeat) {
      events.push(
        buildHoldemDealerEvent({
          state: params.afterState,
          handHistoryId: params.handHistoryId,
          kind: "pace_hint",
          actionCode: "prompt_next_actor",
          pace: resolveHoldemDealerPromptPace({
            state: params.afterState,
            seat: nextSeat,
          }),
          seatIndex: nextSeat.seatIndex,
          text:
            countHoldemActiveSeats(params.afterState) <= 2
              ? `Short-handed table. Action is on seat #${nextSeat.seatIndex + 1}.`
              : `Action is on seat #${nextSeat.seatIndex + 1}.`,
          metadata: {
            turnDeadlineAt: nextSeat.turnDeadlineAt,
          },
        }),
      );
    }
  }

  return events;
};

export const publishHoldemDealerTransition = (params: {
  tableId: number;
  transition: HoldemPersistedTransition;
  publishHoldemRealtimeUpdate: (fanout: HoldemRealtimeFanout) => void;
  publishDealerRealtimeToTopic: (topic: string, event: DealerEvent) => void;
  emitAsyncHoldemDealerLanguageEvent: EmitAsyncHoldemDealerLanguageEvent;
}) => {
  params.publishHoldemRealtimeUpdate(params.transition.fanout);
  for (const dealerEvent of params.transition.dealerEvents) {
    params.publishDealerRealtimeToTopic(
      buildHoldemRealtimeTableTopic(params.tableId),
      dealerEvent,
    );
  }

  if (!params.transition.dealerLanguageTask) {
    return;
  }

  params.emitAsyncHoldemDealerLanguageEvent({
    tableId: params.tableId,
    handHistoryId: params.transition.handHistoryId,
    historyUserId: params.transition.historyUserId,
    phase: params.transition.phase,
    scenario: params.transition.dealerLanguageTask.scenario,
    summary: params.transition.dealerLanguageTask.summary,
  });
};

export const recordHandStartedEvents = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  handHistoryId: number;
  historyUserId: number;
}) => {
  const participants = params.state.seats
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((seat) => ({
      seatIndex: seat.seatIndex,
      userId: seat.userId,
      displayName: resolveSeatDisplayName(
        seat.userId,
        seat.userEmail,
        seat.metadata,
      ),
    }));
  const blindSeats = params.state.seats.filter(
    (seat) => seat.lastAction === "Small blind" || seat.lastAction === "Big blind",
  );
  const events: HoldemHandEventInput[] = [
    {
      type: "hand_started",
      actor: "system" as const,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.state.metadata.handNumber,
        tableName: params.state.name,
        dealerSeatIndex: params.state.metadata.dealerSeatIndex,
        smallBlindSeatIndex: params.state.metadata.smallBlindSeatIndex,
        bigBlindSeatIndex: params.state.metadata.bigBlindSeatIndex,
        fairness: params.state.metadata.fairness,
        participants,
      },
    },
    {
      type: "hole_cards_dealt",
      actor: "dealer" as const,
      payload: {
        handNumber: params.state.metadata.handNumber,
        seats: params.state.seats.map((seat) => ({
          seatIndex: seat.seatIndex,
          userId: seat.userId,
          holeCards: seat.holeCards,
        })),
      },
    },
    ...blindSeats.map((seat) => ({
      type:
        seat.lastAction === "Small blind"
          ? "small_blind_posted"
          : "big_blind_posted",
      actor: "player" as const,
      userId: seat.userId,
      payload: {
        handNumber: params.state.metadata.handNumber,
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        amount: seat.committedAmount,
        stackAmount: seat.stackAmount,
      },
    })),
  ];

  const turnEvent = buildTurnStartedEvent(params.state);
  if (turnEvent) {
    events.push(turnEvent);
  }

  await appendHoldemHandEvents({
    tx: params.tx,
    handHistoryId: params.handHistoryId,
    historyUserId: params.historyUserId,
    tableId: params.state.id,
    phase: params.state.metadata.stage,
    events,
  });
};

const recordHandTransitionEvents = async (params: {
  tx: DbTransaction;
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  handHistoryId: number;
  historyUserId: number;
  action: HoldemAction;
  actingUserId: number | null;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
}) => {
  const actorSeat =
    params.beforeState.seats.find((seat) => seat.userId === params.actingUserId) ?? null;
  const actingSeatAfter =
    actorSeat === null
      ? null
      : params.afterState.seats.find(
          (seat) => seat.seatIndex === actorSeat.seatIndex,
        ) ?? null;
  const events: Array<{
    type: string;
    actor: HoldemEventActor;
    userId?: number | null;
    payload?: Record<string, unknown> | null;
  }> = [];

  if (params.timedOut && actorSeat) {
    events.push({
      type: "turn_timed_out",
      actor: "system",
      userId: actorSeat.userId,
      payload: {
        handNumber: params.afterState.metadata.handNumber,
        stage: params.beforeState.metadata.stage,
        seatIndex: actorSeat.seatIndex,
        userId: actorSeat.userId,
        timeoutAction: params.action,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  if (actorSeat) {
    events.push({
      type: "player_acted",
      actor: "player",
      userId: actorSeat.userId,
      payload: {
        handNumber: params.afterState.metadata.handNumber,
        stage: params.beforeState.metadata.stage,
        seatIndex: actorSeat.seatIndex,
        userId: actorSeat.userId,
        action: params.action,
        resultingStatus: actingSeatAfter?.status ?? null,
        stackAmount: actingSeatAfter?.stackAmount ?? actorSeat.stackAmount,
        committedAmount:
          actingSeatAfter?.committedAmount ?? actorSeat.committedAmount,
        totalCommittedAmount:
          actingSeatAfter?.totalCommittedAmount ?? actorSeat.totalCommittedAmount,
        lastAction: actingSeatAfter?.lastAction ?? actorSeat.lastAction,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  if (
    params.afterState.metadata.stage &&
    afterBoardCount > beforeBoardCount
  ) {
    events.push({
      type: "board_revealed",
      actor: "dealer",
      payload: {
        handNumber: params.afterState.metadata.handNumber,
        stage: params.afterState.metadata.stage,
        newCards: params.afterState.metadata.communityCards.slice(beforeBoardCount),
        boardCards: params.afterState.metadata.communityCards,
      },
    });
  }

  const fairnessRevealSeed = params.afterState.metadata.fairness?.revealSeed;
  if (
    typeof fairnessRevealSeed === "string" &&
    fairnessRevealSeed.length > 0 &&
    params.beforeState.metadata.fairness?.revealSeed !== fairnessRevealSeed
  ) {
    events.push({
      type: "fairness_revealed",
      actor: "system",
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        fairness: params.afterState.metadata.fairness,
      },
    });
  }

  if (isSettledHoldemState(params.afterState)) {
    const roundId = buildHoldemRoundId(params.handHistoryId);
    events.push({
      type: resolveSettledHoldemEventType(params.afterState),
      actor: "system",
      payload: {
        roundId,
        handNumber: params.afterState.metadata.handNumber,
        stage: params.afterState.metadata.stage,
        boardCards: params.afterState.metadata.communityCards,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        revealedSeatIndexes: params.afterState.metadata.revealedSeatIndexes,
        pots: params.afterState.metadata.resolvedPots,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
        participants: buildParticipantSummaries({
          state: params.afterState,
          stackBeforeByUserId: new Map(
            params.beforeState.seats.map((seat) => [
              seat.userId,
              toDecimal(seat.stackAmount).plus(
                toDecimal(seat.totalCommittedAmount),
              ),
            ] as const),
          ),
          contributionBySeatIndex: buildContributionMap(params.beforeState),
        }),
      },
    });
    events.push({
      type: "hand_settled",
      actor: "system",
      payload: {
        roundId,
        handNumber: params.afterState.metadata.handNumber,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        pots: params.afterState.metadata.resolvedPots,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
      },
    });
  } else {
    const turnEvent = buildTurnStartedEvent(params.afterState);
    if (turnEvent) {
      events.push(turnEvent);
    }
  }

  await appendHoldemHandEvents({
    tx: params.tx,
    handHistoryId: params.handHistoryId,
    historyUserId: params.historyUserId,
    tableId: params.afterState.id,
    phase: params.afterState.metadata.stage,
    events,
  });
};

const recordTableTransitionEvents = async (params: {
  tx: DbTransaction;
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  handHistoryId: number;
  action: HoldemAction;
  actingUserId: number | null;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
}) => {
  const actorSeat =
    params.beforeState.seats.find((seat) => seat.userId === params.actingUserId) ??
    null;
  const actingSeatAfter =
    actorSeat === null
      ? null
      : params.afterState.seats.find(
          (seat) => seat.seatIndex === actorSeat.seatIndex,
        ) ?? null;
  const events: HoldemTableEventInput[] = [];

  if (params.timedOut && actorSeat) {
    events.push({
      eventType: "turn_timed_out",
      actor: "system",
      userId: actorSeat.userId,
      seatIndex: actorSeat.seatIndex,
      handHistoryId: params.handHistoryId,
      phase: params.beforeState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        action: params.action,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  if (actorSeat) {
    events.push({
      eventType: "player_acted",
      actor: params.timedOut ? "system" : "player",
      userId: actorSeat.userId,
      seatIndex: actorSeat.seatIndex,
      handHistoryId: params.handHistoryId,
      phase: params.beforeState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        stage: params.beforeState.metadata.stage,
        action: params.action,
        stackAmount: actingSeatAfter?.stackAmount ?? actorSeat.stackAmount,
        committedAmount:
          actingSeatAfter?.committedAmount ?? actorSeat.committedAmount,
        totalCommittedAmount:
          actingSeatAfter?.totalCommittedAmount ?? actorSeat.totalCommittedAmount,
        lastAction: actingSeatAfter?.lastAction ?? actorSeat.lastAction,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  if (
    params.afterState.metadata.stage !== null &&
    afterBoardCount > beforeBoardCount
  ) {
    events.push({
      eventType: "board_revealed",
      actor: "dealer",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        stage: params.afterState.metadata.stage,
        newCards: params.afterState.metadata.communityCards.slice(beforeBoardCount),
        boardCards: params.afterState.metadata.communityCards,
      },
    });
  }

  const fairnessRevealSeed = params.afterState.metadata.fairness?.revealSeed;
  if (
    typeof fairnessRevealSeed === "string" &&
    fairnessRevealSeed.length > 0 &&
    params.beforeState.metadata.fairness?.revealSeed !== fairnessRevealSeed
  ) {
    events.push({
      eventType: "fairness_revealed",
      actor: "system",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        fairness: params.afterState.metadata.fairness,
      },
    });
  }

  if (isSettledHoldemState(params.afterState)) {
    events.push({
      eventType: resolveSettledHoldemEventType(params.afterState),
      actor: "system",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        revealedSeatIndexes: params.afterState.metadata.revealedSeatIndexes,
        boardCards: params.afterState.metadata.communityCards,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
      },
    });
    events.push({
      eventType: "hand_settled",
      actor: "system",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        pots: params.afterState.metadata.resolvedPots,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
      },
    });
  } else {
    const nextSeat = getPendingActorSeat(params.afterState);
    if (nextSeat) {
      events.push({
        eventType: "turn_started",
        actor: "system",
        userId: nextSeat.userId,
        seatIndex: nextSeat.seatIndex,
        handHistoryId: params.handHistoryId,
        phase: params.afterState.metadata.stage,
        payload: {
          roundId: buildHoldemRoundId(params.handHistoryId),
          handNumber: params.afterState.metadata.handNumber,
          stage: params.afterState.metadata.stage,
          turnDeadlineAt: nextSeat.turnDeadlineAt,
          turnTimeBankStartsAt: params.afterState.metadata.turnTimeBankStartsAt,
          timeBankRemainingMs: nextSeat.metadata.timeBankRemainingMs,
        },
      });
    }
  }

  return appendTableEvents({
    tx: params.tx,
    tableId: params.afterState.id,
    events,
  });
};

export const persistHoldemTransition = async (params: {
  tx: DbTransaction;
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  previousStacks: Map<number, ReturnType<typeof toDecimal>>;
  lockedWallets: Map<number, LockedWalletRow>;
  action: HoldemAction;
  actingUserId: number | null;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
  loadLockedWalletRows: LoadLockedWalletRows;
  settleHoldemPlayModeSessionIfPresent: SettleHoldemPlayModeSessionIfPresent;
  removeBotSeats: RemoveBotSeats;
  persistTableState: PersistTableState;
  syncHoldemTurnDeadlines: SyncHoldemTurnDeadlines;
  resolveHoldemRakePolicySnapshot: ResolveHoldemRakePolicySnapshot;
}) => {
  const handHistoryId =
    getActiveHandHistoryId(params.beforeState) ??
    getActiveHandHistoryId(params.afterState);
  if (!handHistoryId) {
    throw conflictError("Holdem hand history is missing for the active hand.");
  }

  const contributionBySeatIndex = buildContributionMap(params.beforeState);
  const historyUserId = await loadHoldemHandHistoryOwnerUserId(
    params.tx,
    handHistoryId,
  );
  const grossSettledState = isSettledHoldemState(params.afterState)
    ? cloneTableState(params.afterState)
    : null;
  const appliedRakePolicy = isSettledHoldemState(params.afterState)
    ? await params.resolveHoldemRakePolicySnapshot(params.tx, params.afterState)
    : null;
  const appliedRake = appliedRakePolicy
    ? applyRakeToSettledState(params.afterState, appliedRakePolicy)
    : null;
  params.syncHoldemTurnDeadlines(params.afterState);

  await recordHandTransitionEvents({
    tx: params.tx,
    beforeState: params.beforeState,
    afterState: params.afterState,
    handHistoryId,
    historyUserId,
    action: params.action,
    actingUserId: params.actingUserId,
    timedOut: params.timedOut,
    timeBankConsumedMs: params.timeBankConsumedMs,
  });

  await syncHoldemHandHistory({
    tx: params.tx,
    state: params.afterState,
    handHistoryId,
    stackBeforeByUserId: params.previousStacks,
    contributionBySeatIndex,
  });
  let persistedTableEvents: PersistedHoldemTableEvent[] =
    await recordTableTransitionEvents({
      tx: params.tx,
      beforeState: params.beforeState,
      afterState: params.afterState,
      handHistoryId,
      action: params.action,
      actingUserId: params.actingUserId,
      timedOut: params.timedOut,
      timeBankConsumedMs: params.timeBankConsumedMs,
    });
  const dealerRuleEvents = buildHoldemTransitionDealerEvents({
    beforeState: params.beforeState,
    afterState: params.afterState,
    handHistoryId,
    action: params.action,
    timedOut: params.timedOut,
    timeBankConsumedMs: params.timeBankConsumedMs,
  });
  const dealerTableEvents = await persistHoldemDealerEvents({
    tx: params.tx,
    state: params.afterState,
    handHistoryId,
    historyUserId,
    phase: params.afterState.metadata.stage,
    events: dealerRuleEvents,
  });
  persistedTableEvents = [...persistedTableEvents, ...dealerTableEvents];

  if (!isTournamentTable(params.afterState)) {
    await syncSettledLockedBalances({
      tx: params.tx,
      state: params.afterState,
      grossSettledState,
      appliedRake,
      lockedWallets: params.lockedWallets,
      previousStacks: params.previousStacks,
      handHistoryId,
    });
  }
  if (isSettledHoldemState(params.afterState) && isTournamentTable(params.afterState)) {
    const tournamentEvents = await settleTournamentAfterHand({
      tx: params.tx,
      state: params.afterState,
      wallets: params.lockedWallets,
      previousStacks: params.previousStacks,
      loadLockedWalletRows: params.loadLockedWalletRows,
      appendTableEvents,
      settleHoldemPlayModeSessionIfPresent:
        params.settleHoldemPlayModeSessionIfPresent,
    });
    persistedTableEvents = [...persistedTableEvents, ...tournamentEvents];
  }
  const autoCashOuts = isTournamentTable(params.afterState)
    ? []
    : await settlePendingSeatCashOuts({
        tx: params.tx,
        state: params.afterState,
        lockedWallets: params.lockedWallets,
        removeBotSeats: params.removeBotSeats,
        settleHoldemPlayModeSessionIfPresent:
          params.settleHoldemPlayModeSessionIfPresent,
      });
  if (autoCashOuts.length > 0) {
    const autoCashOutEvents = await appendTableEvents({
      tx: params.tx,
      tableId: params.afterState.id,
      events: autoCashOuts.map((entry) => ({
        eventType: "seat_auto_cashed_out",
        actor: "system" as const,
        userId: entry.userId,
        seatIndex: entry.seatIndex,
        payload: {
          tableName: params.afterState.name,
          cashOutAmount: entry.cashOutAmount,
          remainingSeatCount: params.afterState.seats.length,
        },
      })),
    });
    persistedTableEvents = [...persistedTableEvents, ...autoCashOutEvents];
  }
  if (countHumanSeats(params.afterState) === 0) {
    await params.removeBotSeats({
      tx: params.tx,
      state: params.afterState,
      predicate: () => true,
    });
  }
  await params.persistTableState(params.tx, params.afterState);

  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  const dealerLanguageTask =
    afterBoardCount > beforeBoardCount
      ? {
          scenario: "holdem_board_revealed",
          summary: {
            handNumber: params.afterState.metadata.handNumber,
            stage: params.afterState.metadata.stage,
            newBoardCards: params.afterState.metadata.communityCards.slice(
              beforeBoardCount,
            ),
            boardCards: params.afterState.metadata.communityCards,
          },
        }
      : isSettledHoldemState(params.afterState)
        ? {
            scenario: "holdem_hand_settled",
            summary: {
              handNumber: params.afterState.metadata.handNumber,
              winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
              boardCards: params.afterState.metadata.communityCards,
            },
          }
        : null;

  return {
    dealerEvents: dealerRuleEvents,
    dealerLanguageTask,
    fanout: buildRealtimeUpdate({
      state: params.afterState,
      tableEvents: persistedTableEvents,
      action: params.action,
      timedOut: params.timedOut,
    }),
    handHistoryId,
    historyUserId,
    phase: params.afterState.metadata.stage,
  } satisfies HoldemPersistedTransition;
};
