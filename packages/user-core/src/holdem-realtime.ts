import {
  HOLDEM_REALTIME_LOBBY_EVENT,
  HOLDEM_REALTIME_PRIVATE_TABLE_EVENT,
  HOLDEM_REALTIME_TABLE_EVENT,
  HOLDEM_REALTIME_TABLE_MESSAGE_EVENT,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  HoldemRealtimePrivateUpdateSchema,
  HoldemRealtimeTableMessageSchema,
  HoldemRealtimeUpdateSchema,
  type HoldemCard,
  type HoldemCardView,
  type HoldemRealtimePrivateUpdate,
  type HoldemRealtimePublicSeat,
  type HoldemRealtimePublicTable,
  type HoldemTableMessage,
  type HoldemRealtimeUpdate,
  type HoldemTable,
  type HoldemTableResponse,
  type HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import {
  DEALER_REALTIME_ACTION_EVENT,
  DEALER_REALTIME_MESSAGE_EVENT,
  DEALER_REALTIME_PACE_HINT_EVENT,
  DealerEventSchema,
  type DealerEvent,
} from "@reward/shared-types/dealer";
import {
  REALTIME_CLOSE_CODES,
  REALTIME_ERROR_CODES,
  RealtimeServerMessageSchema,
} from "@reward/shared-types/realtime";

import { resolveUserRealtimeUrl } from "./api";

const WS_OPEN = 1;
const HOLDEM_EVENT_TYPES_THAT_RESET_HERO_STATE = new Set([
  "hand_started",
  "board_revealed",
  "showdown_resolved",
  "hand_won_by_fold",
  "hand_settled",
  "player_acted",
  "turn_started",
  "turn_timed_out",
]);

const HOLDEM_HERO_CARD_PLACEHOLDERS: HoldemCardView[] = [
  { rank: null, suit: null, hidden: true },
  { rank: null, suit: null, hidden: true },
];

const mapRevealedCards = (cards: HoldemCard[]): HoldemCardView[] =>
  cards.map((card) => ({
    rank: card.rank,
    suit: card.suit,
    hidden: false,
  }));

const clonePlaceholderCards = () =>
  HOLDEM_HERO_CARD_PLACEHOLDERS.map((card) => ({ ...card }));

const buildOpenSeat = (
  seatIndex: number,
  table: HoldemRealtimePublicTable,
): HoldemTable["seats"][number] => ({
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
  isDealer: table.dealerSeatIndex === seatIndex,
  isSmallBlind: table.smallBlindSeatIndex === seatIndex,
  isBigBlind: table.bigBlindSeatIndex === seatIndex,
  isCurrentTurn: table.pendingActorSeatIndex === seatIndex,
  winner: false,
  bestHand: null,
  lastAction: null,
});

const buildSeatCards = (params: {
  existingCards: HoldemCardView[];
  seat: HoldemRealtimePublicSeat;
  heroSeatIndex: number | null;
  resetHeroCards: boolean;
}) => {
  if (params.seat.revealedCards.length > 0) {
    return mapRevealedCards(params.seat.revealedCards);
  }

  if (params.seat.userId === null) {
    return [];
  }

  const isHero = params.heroSeatIndex === params.seat.seatIndex;
  if (
    isHero &&
    !params.resetHeroCards &&
    params.existingCards.length > 0
  ) {
    return params.existingCards;
  }

  if (params.seat.inHand) {
    return clonePlaceholderCards();
  }

  return [];
};

const patchSelectedHoldemTable = (params: {
  current: HoldemTableResponse;
  update: HoldemRealtimeUpdate;
}) => {
  const { current, update } = params;
  const currentTable = current.table;
  const publicTable = update.table;
  const existingSeatsByIndex = new Map(
    currentTable.seats.map((seat) => [seat.seatIndex, seat] as const),
  );
  const publicSeatsByIndex = new Map(
    publicTable.seats.map((seat) => [seat.seatIndex, seat] as const),
  );
  const resetHeroCards = update.eventTypes.some((eventType) =>
    HOLDEM_EVENT_TYPES_THAT_RESET_HERO_STATE.has(eventType),
  );

  const seats = Array.from({ length: publicTable.maxSeats }, (_, seatIndex) => {
    const publicSeat = publicSeatsByIndex.get(seatIndex) ?? null;
    if (!publicSeat) {
      return existingSeatsByIndex.get(seatIndex) ?? buildOpenSeat(seatIndex, publicTable);
    }

    const existingSeat = existingSeatsByIndex.get(seatIndex);
    return {
      seatIndex: publicSeat.seatIndex,
      userId: publicSeat.userId,
      displayName: publicSeat.displayName,
      connectionState: publicSeat.connectionState,
      disconnectGraceExpiresAt: publicSeat.disconnectGraceExpiresAt,
      seatLeaseExpiresAt: publicSeat.seatLeaseExpiresAt,
      autoCashOutPending: publicSeat.autoCashOutPending,
      turnDeadlineAt: publicSeat.turnDeadlineAt,
      timeBankRemainingMs: publicSeat.timeBankRemainingMs,
      stackAmount: publicSeat.stackAmount,
      committedAmount: publicSeat.committedAmount,
      totalCommittedAmount: publicSeat.totalCommittedAmount,
      status: publicSeat.status,
      cards: buildSeatCards({
        existingCards: existingSeat?.cards ?? [],
        seat: publicSeat,
        heroSeatIndex: currentTable.heroSeatIndex,
        resetHeroCards,
      }),
      inHand: publicSeat.inHand,
      sittingOut: publicSeat.sittingOut,
      isDealer: publicSeat.isDealer,
      isSmallBlind: publicSeat.isSmallBlind,
      isBigBlind: publicSeat.isBigBlind,
      isCurrentTurn: publicSeat.isCurrentTurn,
      winner: publicSeat.winner,
      bestHand: publicSeat.bestHand,
      lastAction: publicSeat.lastAction,
    };
  });

  return {
    table: {
      ...currentTable,
      id: publicTable.id,
      name: publicTable.name,
      tableType: publicTable.tableType,
      status: publicTable.status,
      rakePolicy: publicTable.rakePolicy,
      tournament: publicTable.tournament,
      handNumber: publicTable.handNumber,
      stage: publicTable.stage,
      smallBlind: publicTable.smallBlind,
      bigBlind: publicTable.bigBlind,
      minimumBuyIn: publicTable.minimumBuyIn,
      maximumBuyIn: publicTable.maximumBuyIn,
      maxSeats: publicTable.maxSeats,
      communityCards: publicTable.communityCards.map((card) => ({
        rank: card.rank,
        suit: card.suit,
        hidden: false,
      })),
      pots: publicTable.pots,
      seats,
      pendingActorSeatIndex: publicTable.pendingActorSeatIndex,
      pendingActorDeadlineAt: publicTable.pendingActorDeadlineAt,
      pendingActorTimeBankStartsAt: publicTable.pendingActorTimeBankStartsAt,
      pendingActorTimeoutAction: publicTable.pendingActorTimeoutAction,
      availableActions: null,
      fairness: publicTable.fairness,
      dealerEvents: currentTable.dealerEvents,
      recentHands: publicTable.recentHands,
      updatedAt: publicTable.updatedAt,
    },
  } satisfies HoldemTableResponse;
};

const patchLobbyTableSummary = (params: {
  tables: HoldemTablesResponse;
  update: HoldemRealtimeUpdate;
}) => {
  const { tables, update } = params;
  const summary = {
    id: update.table.id,
    name: update.table.name,
    tableType: update.table.tableType,
    status: update.table.status,
    rakePolicy: update.table.rakePolicy,
    tournament: update.table.tournament,
    smallBlind: update.table.smallBlind,
    bigBlind: update.table.bigBlind,
    minimumBuyIn: update.table.minimumBuyIn,
    maximumBuyIn: update.table.maximumBuyIn,
    maxSeats: update.table.maxSeats,
    occupiedSeats: update.table.occupiedSeats,
    heroSeatIndex:
      tables.tables.find((table) => table.id === update.table.id)?.heroSeatIndex ?? null,
    canStart: update.table.canStart,
    updatedAt: update.table.updatedAt,
  };

  const nextTables = tables.tables.some((table) => table.id === update.table.id)
    ? tables.tables.map((table) =>
        table.id === update.table.id
          ? {
              ...table,
              ...summary,
            }
          : table,
      )
    : [...tables.tables, summary].sort((left, right) => left.id - right.id);

  return {
    currentTableId: tables.currentTableId,
    tables: nextTables,
  } satisfies HoldemTablesResponse;
};

export type HoldemRealtimePatchResult = {
  nextLobby: HoldemTablesResponse | null;
  nextTable: HoldemTableResponse | null;
  patchedSelectedTable: boolean;
};

export const applyHoldemRealtimeUpdate = (params: {
  holdemTables: HoldemTablesResponse | null;
  selectedHoldemTable: HoldemTableResponse | null;
  selectedHoldemTableId: number | null;
  update: HoldemRealtimeUpdate;
}): HoldemRealtimePatchResult => {
  const nextLobby =
    params.holdemTables === null
      ? null
      : patchLobbyTableSummary({
          tables: params.holdemTables,
          update: params.update,
        });

  const shouldPatchSelectedTable =
    params.selectedHoldemTable !== null &&
    params.selectedHoldemTable.table.id === params.update.table.id &&
    params.selectedHoldemTableId === params.update.table.id &&
    params.selectedHoldemTable.table.heroSeatIndex === null;

  return {
    nextLobby,
    nextTable:
      shouldPatchSelectedTable && params.selectedHoldemTable
        ? patchSelectedHoldemTable({
            current: params.selectedHoldemTable,
            update: params.update,
          })
        : params.selectedHoldemTable,
    patchedSelectedTable: shouldPatchSelectedTable,
  };
};

export const applyHoldemPrivateRealtimeUpdate = (params: {
  selectedHoldemTable: HoldemTableResponse | null;
  selectedHoldemTableId: number | null;
  update: HoldemRealtimePrivateUpdate;
}) =>
  params.selectedHoldemTableId === params.update.table.id
    ? {
        table: params.update.table,
      }
    : params.selectedHoldemTable;

export const applyHoldemTableMessage = (params: {
  currentMessages: HoldemTableMessage[];
  message: HoldemTableMessage;
  maxMessages?: number;
}) => {
  const dedupedMessages = params.currentMessages.filter(
    (entry) => entry.id !== params.message.id,
  );
  dedupedMessages.push(params.message);
  dedupedMessages.sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id - right.id;
  });

  const maxMessages = Math.max(
    1,
    params.maxMessages ?? HOLDEM_TABLE_MESSAGE_LIMIT,
  );
  return dedupedMessages.slice(-maxMessages);
};

export type HoldemRealtimeConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "resyncing";

export type HoldemRealtimeSyncReason = "resume" | "resume_failed";

export type HoldemRealtimeObservation = {
  topic: string;
  event: string;
  sentAt: string;
  receivedAt: string;
  deliveryLatencyMs: number;
  tableId: number | null;
  roundId: string | null;
};

export type HoldemRealtimeClient = {
  markSynchronized: () => void;
  start: () => void;
  stop: () => void;
  syncTopics: (topics: string[]) => void;
};

export const createHoldemRealtimeClient = (params: {
  baseUrl: string;
  getAuthToken: () => Promise<string | null>;
  onConnectionStatusChange: (status: HoldemRealtimeConnectionStatus) => void;
  onSyncNeeded: (reason: HoldemRealtimeSyncReason) => void;
  onUnauthorized: () => void | Promise<void>;
  onPublicUpdate: (update: HoldemRealtimeUpdate) => void;
  onPrivateUpdate: (update: HoldemRealtimePrivateUpdate) => void;
  onDealerEvent?: (event: DealerEvent) => void;
  onTableMessage?: (message: HoldemTableMessage) => void;
  onObservation?: (observation: HoldemRealtimeObservation) => void;
  onWarning?: (message: string) => void;
  reconnectDelayMs?: number;
}): HoldemRealtimeClient => {
  let currentStatus: HoldemRealtimeConnectionStatus = "connecting";
  let requestedTopics = new Set<string>();
  let subscribedTopics = new Set<string>();
  let socket: WebSocket | null = null;
  let resumeToken: string | null = null;
  let shouldAttemptResume = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let started = false;
  let resyncing = false;

  const buildObservation = (payload: {
    topic: string;
    event: string;
    sentAt: string;
    data: unknown;
  }): HoldemRealtimeObservation | null => {
    const sentAtMs = Date.parse(payload.sentAt);
    if (!Number.isFinite(sentAtMs)) {
      return null;
    }

    const receivedAtMs = Date.now();
    const deliveryLatencyMs = receivedAtMs - sentAtMs;
    if (deliveryLatencyMs < 0 || deliveryLatencyMs > 60_000) {
      return null;
    }

    const data =
      payload.data !== null && typeof payload.data === "object" ? payload.data : null;
    const tableValue =
      data && "table" in data && data.table !== null && typeof data.table === "object"
        ? data.table
        : null;
    const tableId =
      tableValue && "id" in tableValue && Number.isInteger(tableValue.id)
        ? Number(tableValue.id)
        : data && "tableId" in data && Number.isInteger(data.tableId)
          ? Number(data.tableId)
          : null;
    const roundId =
      data && "roundId" in data && typeof data.roundId === "string" && data.roundId !== ""
        ? data.roundId
        : null;

    return {
      topic: payload.topic,
      event: payload.event,
      sentAt: payload.sentAt,
      receivedAt: new Date(receivedAtMs).toISOString(),
      deliveryLatencyMs,
      tableId,
      roundId,
    };
  };

  const setStatus = (status: HoldemRealtimeConnectionStatus) => {
    if (currentStatus === status) {
      return;
    }

    currentStatus = status;
    params.onConnectionStatusChange(status);
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const applyTopicDiff = () => {
    if (!socket || socket.readyState !== WS_OPEN) {
      return;
    }

    const nextTopics = [...requestedTopics];
    const currentTopics = [...subscribedTopics];
    const topicsToSubscribe = nextTopics.filter(
      (topic) => !subscribedTopics.has(topic),
    );
    const topicsToUnsubscribe = currentTopics.filter(
      (topic) => !requestedTopics.has(topic),
    );

    if (topicsToUnsubscribe.length > 0) {
      socket.send(
        JSON.stringify({
          type: "transport.unsubscribe",
          topics: topicsToUnsubscribe,
        }),
      );
    }

    if (topicsToSubscribe.length > 0) {
      socket.send(
        JSON.stringify({
          type: "transport.subscribe",
          topics: topicsToSubscribe,
        }),
      );
    }
  };

  const scheduleReconnect = () => {
    if (disposed) {
      return;
    }

    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      void connect();
    }, params.reconnectDelayMs ?? 1_000);
  };

  const connect = async () => {
    if (disposed) {
      return;
    }

    clearReconnectTimer();
    setStatus(shouldAttemptResume ? "reconnecting" : "connecting");

    let authToken: string | null;
    try {
      authToken = await params.getAuthToken();
    } catch (error) {
      params.onWarning?.(
        error instanceof Error ? error.message : "Failed to prepare realtime auth token.",
      );
      shouldAttemptResume = true;
      setStatus("reconnecting");
      scheduleReconnect();
      return;
    }

    if (!authToken) {
      await params.onUnauthorized();
      return;
    }

    const nextSocket = new WebSocket(
      resolveUserRealtimeUrl({
        baseUrl: params.baseUrl,
        authToken,
      }),
    );
    socket = nextSocket;

    nextSocket.onmessage = (event) => {
      if (disposed || typeof event.data !== "string") {
        return;
      }

      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        return;
      }

      const parsed = RealtimeServerMessageSchema.safeParse(json);
      if (!parsed.success) {
        return;
      }

      if (parsed.data.type === "transport.ping") {
        nextSocket.send(
          JSON.stringify({
            type: "transport.pong",
            pingId: parsed.data.pingId,
            sentAt: new Date().toISOString(),
          }),
        );
        return;
      }

      if (parsed.data.type === "transport.hello") {
        subscribedTopics = new Set(parsed.data.subscriptions);
        const previousResumeToken = shouldAttemptResume ? resumeToken : null;
        resumeToken = parsed.data.resumeToken;

        if (previousResumeToken) {
          nextSocket.send(
            JSON.stringify({
              type: "transport.resume",
              resumeToken: previousResumeToken,
            }),
          );
          shouldAttemptResume = false;
          return;
        }

        applyTopicDiff();
        if (!resyncing) {
          setStatus("live");
        }
        return;
      }

      if (parsed.data.type === "transport.resumed") {
        subscribedTopics = new Set(parsed.data.subscriptions);
        applyTopicDiff();
        resyncing = false;
        setStatus("live");
        return;
      }

      if (parsed.data.type === "transport.subscribed") {
        for (const topic of parsed.data.topics) {
          subscribedTopics.add(topic);
        }
        if (!resyncing) {
          setStatus("live");
        }
        return;
      }

      if (parsed.data.type === "transport.unsubscribed") {
        for (const topic of parsed.data.topics) {
          subscribedTopics.delete(topic);
        }
        return;
      }

      if (parsed.data.type === "transport.error") {
        if (
          parsed.data.code === REALTIME_ERROR_CODES.RESUME_NOT_AVAILABLE ||
          parsed.data.code === REALTIME_ERROR_CODES.RESUME_SESSION_MISMATCH
        ) {
          resyncing = true;
          setStatus("resyncing");
          applyTopicDiff();
          params.onSyncNeeded("resume_failed");
          return;
        }

        params.onWarning?.(parsed.data.message);
        return;
      }

      if (
        parsed.data.type !== "transport.event"
      ) {
        return;
      }

      const observation = buildObservation({
        topic: parsed.data.topic,
        event: parsed.data.event,
        sentAt: parsed.data.sentAt,
        data: parsed.data.data,
      });
      if (observation) {
        params.onObservation?.(observation);
      }

      if (
        parsed.data.event === HOLDEM_REALTIME_LOBBY_EVENT ||
        parsed.data.event === HOLDEM_REALTIME_TABLE_EVENT
      ) {
        const payload = HoldemRealtimeUpdateSchema.safeParse(parsed.data.data);
        if (!payload.success) {
          return;
        }

        params.onPublicUpdate(payload.data);
        return;
      }

      if (parsed.data.event === HOLDEM_REALTIME_TABLE_MESSAGE_EVENT) {
        const payload = HoldemRealtimeTableMessageSchema.safeParse(parsed.data.data);
        if (!payload.success) {
          return;
        }

        params.onTableMessage?.(payload.data);
        return;
      }

      if (
        parsed.data.event === DEALER_REALTIME_ACTION_EVENT ||
        parsed.data.event === DEALER_REALTIME_MESSAGE_EVENT ||
        parsed.data.event === DEALER_REALTIME_PACE_HINT_EVENT
      ) {
        const payload = DealerEventSchema.safeParse(parsed.data.data);
        if (!payload.success) {
          return;
        }

        params.onDealerEvent?.(payload.data);
        return;
      }

      if (parsed.data.event !== HOLDEM_REALTIME_PRIVATE_TABLE_EVENT) {
        return;
      }

      const payload = HoldemRealtimePrivateUpdateSchema.safeParse(
        parsed.data.data,
      );
      if (!payload.success) {
        return;
      }

      params.onPrivateUpdate(payload.data);
    };

    nextSocket.onclose = (event) => {
      if (disposed) {
        return;
      }

      socket = null;
      subscribedTopics = new Set();

      if (event.code === REALTIME_CLOSE_CODES.SESSION_REVOKED) {
        void params.onUnauthorized();
        return;
      }

      shouldAttemptResume = true;
      setStatus("reconnecting");
      scheduleReconnect();
    };
  };

  return {
    markSynchronized() {
      resyncing = false;
      if (!disposed && socket?.readyState === WS_OPEN) {
        setStatus("live");
      }
    },
    start() {
      if (started || disposed) {
        return;
      }

      started = true;
      params.onConnectionStatusChange(currentStatus);
      void connect();
    },
    stop() {
      disposed = true;
      clearReconnectTimer();
      socket?.close();
      socket = null;
      subscribedTopics = new Set();
    },
    syncTopics(topics: string[]) {
      requestedTopics = new Set(
        topics.filter((topic) => topic.trim().length > 0),
      );
      applyTopicDiff();
    },
  };
};
