import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  HOLDEM_REALTIME_LOBBY_EVENT,
  HOLDEM_REALTIME_LOBBY_TOPIC,
  HOLDEM_REALTIME_PRIVATE_TABLE_EVENT,
  HOLDEM_REALTIME_TABLE_MESSAGE_EVENT,
  buildHoldemRealtimeTableTopic,
  type HoldemRealtimePrivateUpdate,
  type HoldemRealtimeUpdate,
  type HoldemTableMessage,
} from "@reward/shared-types/holdem";
import type { DealerEvent } from "@reward/shared-types/dealer";
import {
  REALTIME_CLOSE_CODES,
  REALTIME_ERROR_CODES,
} from "@reward/shared-types/realtime";

import { createDealerRealtimeClient } from "../src/dealer-realtime";
import { createHoldemRealtimeClient } from "../src/holdem-realtime";

type TimerCallback = () => void;

let nextTimerId = 1;
let scheduledTimers = new Map<number, TimerCallback>();

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const runScheduledTimers = () => {
  const callbacks = [...scheduledTimers.values()];
  scheduledTimers.clear();
  callbacks.forEach((callback) => callback());
};

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onclose: ((event: { code: number }) => void | Promise<void>) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 1;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  send(message: string) {
    this.sent.push(message);
  }

  emit(payload: unknown) {
    this.onmessage?.({
      data: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  }

  close(code = 1000) {
    this.readyState = 3;
    void this.onclose?.({ code });
  }
}

const buildDealerEvent = (id: string): DealerEvent => ({
  id,
  kind: "action",
  source: "rule",
  gameType: "holdem",
  tableId: 7,
  tableRef: "table-7",
  roundId: "holdem:12",
  referenceId: 12,
  phase: "turn",
  seatIndex: 1,
  actionCode: "raise",
  pace: null,
  text: null,
  metadata: null,
  createdAt: "2026-04-28T09:00:03.000Z",
});

const buildPublicUpdate = (): HoldemRealtimeUpdate => ({
  table: {
    id: 7,
    name: "Realtime Holdem",
    linkedGroup: null,
    tableType: "cash",
    status: "active",
    rakePolicy: null,
    tournament: null,
    handNumber: 4,
    stage: "preflop",
    smallBlind: "1.00",
    bigBlind: "2.00",
    minimumBuyIn: "40.00",
    maximumBuyIn: "200.00",
    maxSeats: 6,
    occupiedSeats: 2,
    canStart: false,
    communityCards: [],
    pots: [],
    seats: [
      {
        seatIndex: 0,
        userId: 42,
        displayName: "Hero",
        isBot: false,
        connectionState: null,
        disconnectGraceExpiresAt: null,
        seatLeaseExpiresAt: null,
        autoCashOutPending: false,
        turnDeadlineAt: null,
        timeBankRemainingMs: 0,
        stackAmount: "99.00",
        committedAmount: "1.00",
        totalCommittedAmount: "1.00",
        status: "active",
        inHand: true,
        sittingOut: false,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrentTurn: false,
        winner: false,
        bestHand: null,
        lastAction: "Small blind",
        revealedCards: [],
      },
      {
        seatIndex: 1,
        userId: 52,
        displayName: "Villain",
        isBot: false,
        connectionState: null,
        disconnectGraceExpiresAt: null,
        seatLeaseExpiresAt: null,
        autoCashOutPending: false,
        turnDeadlineAt: "2026-04-28T09:02:00.000Z",
        timeBankRemainingMs: 30_000,
        stackAmount: "98.00",
        committedAmount: "2.00",
        totalCommittedAmount: "2.00",
        status: "active",
        inHand: true,
        sittingOut: false,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrentTurn: true,
        winner: false,
        bestHand: null,
        lastAction: "Big blind",
        revealedCards: [],
      },
    ],
    dealerSeatIndex: 1,
    smallBlindSeatIndex: 0,
    bigBlindSeatIndex: 1,
    pendingActorSeatIndex: 1,
    pendingActorDeadlineAt: "2026-04-28T09:02:00.000Z",
    pendingActorTimeBankStartsAt: "2026-04-28T09:01:30.000Z",
    pendingActorTimeoutAction: "fold",
    fairness: null,
    revealedSeatIndexes: [],
    winnerSeatIndexes: [],
    recentHands: [],
    updatedAt: "2026-04-28T09:01:30.000Z",
  },
  handHistoryId: 12,
  roundId: "holdem:12",
  actorSeatIndex: 1,
  action: "raise",
  timedOut: false,
  eventTypes: ["hand_started", "turn_started"],
});

const buildPrivateUpdate = (): HoldemRealtimePrivateUpdate => ({
  table: {
    id: 7,
    name: "Realtime Holdem",
    linkedGroup: null,
    tableType: "cash",
    status: "active",
    rakePolicy: null,
    tournament: null,
    handNumber: 4,
    stage: "preflop",
    smallBlind: "1.00",
    bigBlind: "2.00",
    minimumBuyIn: "40.00",
    maximumBuyIn: "200.00",
    maxSeats: 6,
    communityCards: [],
    pots: [],
    seats: [
      {
        seatIndex: 0,
        userId: 42,
        displayName: "Hero",
        isBot: false,
        connectionState: null,
        disconnectGraceExpiresAt: null,
        seatLeaseExpiresAt: null,
        autoCashOutPending: false,
        turnDeadlineAt: null,
        timeBankRemainingMs: 0,
        stackAmount: "99.00",
        committedAmount: "1.00",
        totalCommittedAmount: "1.00",
        status: "active",
        cards: [
          { rank: "A", suit: "spades", hidden: false },
          { rank: "A", suit: "hearts", hidden: false },
        ],
        inHand: true,
        sittingOut: false,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrentTurn: false,
        winner: false,
        bestHand: null,
        lastAction: "Small blind",
      },
      {
        seatIndex: 1,
        userId: 52,
        displayName: "Villain",
        isBot: false,
        connectionState: null,
        disconnectGraceExpiresAt: null,
        seatLeaseExpiresAt: null,
        autoCashOutPending: false,
        turnDeadlineAt: "2026-04-28T09:02:00.000Z",
        timeBankRemainingMs: 30_000,
        stackAmount: "98.00",
        committedAmount: "2.00",
        totalCommittedAmount: "2.00",
        status: "active",
        cards: [
          { rank: null, suit: null, hidden: true },
          { rank: null, suit: null, hidden: true },
        ],
        inHand: true,
        sittingOut: false,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrentTurn: true,
        winner: false,
        bestHand: null,
        lastAction: "Big blind",
      },
    ],
    heroSeatIndex: 0,
    pendingActorSeatIndex: 1,
    pendingActorDeadlineAt: "2026-04-28T09:02:00.000Z",
    pendingActorTimeBankStartsAt: "2026-04-28T09:01:30.000Z",
    pendingActorTimeoutAction: "fold",
    availableActions: {
      actions: ["fold", "call", "raise", "all_in"],
      toCall: "2.00",
      currentBet: "2.00",
      minimumRaiseTo: "4.00",
      maximumRaiseTo: "100.00",
      minimumBetTo: "2.00",
    },
    fairness: null,
    recentHands: [],
    dealerEvents: [],
    createdAt: "2026-04-28T09:00:00.000Z",
    updatedAt: "2026-04-28T09:01:30.000Z",
  },
  handHistoryId: 12,
  roundId: "holdem:12",
  actorSeatIndex: 1,
  action: "raise",
  timedOut: false,
  eventTypes: ["hand_started", "turn_started"],
});

const buildTableMessage = (): HoldemTableMessage => ({
  id: 2,
  tableId: 7,
  userId: 52,
  seatIndex: 1,
  displayName: "Villain",
  kind: "emoji",
  text: null,
  emoji: "🔥",
  createdAt: "2026-04-28T09:00:03.000Z",
});

const buildHelloMessage = (resumeToken: string) => ({
  type: "transport.hello",
  protocolVersion: 1,
  connectionId: `connection-${resumeToken}`,
  sessionId: "session-1",
  userId: 42,
  resumeToken,
  heartbeatIntervalMs: 10_000,
  heartbeatTimeoutMs: 30_000,
  reconnectWindowMs: 60_000,
  serverTime: "2026-04-28T09:00:00.000Z",
  subscriptions: [],
});

const originalWindow = globalThis.window;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalWebSocket = globalThis.WebSocket;
const originalDateNow = Date.now;

beforeEach(() => {
  nextTimerId = 1;
  scheduledTimers = new Map();
  FakeWebSocket.instances = [];

  const fakeSetTimeout = ((callback: TimerCallback) => {
    const id = nextTimerId++;
    scheduledTimers.set(id, callback);
    return id;
  }) as unknown as typeof setTimeout;

  const fakeClearTimeout = ((timerId: number) => {
    scheduledTimers.delete(timerId);
  }) as unknown as typeof clearTimeout;

  globalThis.setTimeout = fakeSetTimeout;
  globalThis.clearTimeout = fakeClearTimeout;
  globalThis.window = {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
  } as typeof globalThis.window;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  Date.now = () => Date.parse("2026-04-28T09:00:05.000Z");
});

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.WebSocket = originalWebSocket;
  Date.now = originalDateNow;
});

test("createDealerRealtimeClient handles ping traffic, dealer events, and reconnects after close", async () => {
  const statuses: string[] = [];
  const dealerEvents: DealerEvent[] = [];

  const client = createDealerRealtimeClient({
    baseUrl: "https://api.example.com",
    getAuthToken: async () => "token-1",
    onConnectionStatusChange: (status) => {
      statuses.push(status);
    },
    onDealerEvent: (event) => {
      dealerEvents.push(event);
    },
    onUnauthorized: async () => undefined,
  });

  client.start();
  await flushAsync();

  assert.equal(FakeWebSocket.instances.length, 1);
  const firstSocket = FakeWebSocket.instances[0]!;
  assert.equal(
    firstSocket.url,
    "wss://api.example.com/realtime?token=token-1",
  );

  firstSocket.open();
  firstSocket.emit({
    type: "transport.ping",
    pingId: "ping-1",
    sentAt: "2026-04-28T09:00:00.000Z",
  });
  firstSocket.emit({
    type: "transport.event",
    topic: "public:dealer:table:7",
    event: "dealer.action",
    data: buildDealerEvent("dealer-1"),
    sentAt: "2026-04-28T09:00:03.000Z",
  });

  assert.equal(JSON.parse(firstSocket.sent[0]!).type, "transport.pong");
  assert.deepEqual(dealerEvents, [buildDealerEvent("dealer-1")]);

  firstSocket.close(REALTIME_CLOSE_CODES.HEARTBEAT_TIMEOUT);
  runScheduledTimers();
  await flushAsync();

  assert.equal(FakeWebSocket.instances.length, 2);
  FakeWebSocket.instances[1]!.open();
  assert.deepEqual(statuses, [
    "connecting",
    "connecting",
    "live",
    "reconnecting",
    "reconnecting",
    "live",
  ]);
});

test("createDealerRealtimeClient treats a missing auth token as unauthorized", async () => {
  let unauthorizedCount = 0;

  const client = createDealerRealtimeClient({
    baseUrl: "https://api.example.com",
    getAuthToken: async () => null,
    onDealerEvent: () => undefined,
    onUnauthorized: async () => {
      unauthorizedCount += 1;
    },
  });

  client.start();
  await flushAsync();

  assert.equal(FakeWebSocket.instances.length, 0);
  assert.equal(unauthorizedCount, 1);
});

test("createHoldemRealtimeClient subscribes topics and dispatches public, private, message, and observation events", async () => {
  const statuses: string[] = [];
  const publicUpdates: HoldemRealtimeUpdate[] = [];
  const privateUpdates: HoldemRealtimePrivateUpdate[] = [];
  const messages: HoldemTableMessage[] = [];
  const observations: Array<{ tableId: number | null; roundId: string | null; deliveryLatencyMs: number }> = [];

  const client = createHoldemRealtimeClient({
    baseUrl: "https://api.example.com",
    getAuthToken: async () => "token-1",
    onConnectionStatusChange: (status) => {
      statuses.push(status);
    },
    onSyncNeeded: () => undefined,
    onUnauthorized: async () => undefined,
    onPublicUpdate: (update) => {
      publicUpdates.push(update);
    },
    onPrivateUpdate: (update) => {
      privateUpdates.push(update);
    },
    onTableMessage: (message) => {
      messages.push(message);
    },
    onObservation: (observation) => {
      observations.push({
        tableId: observation.tableId,
        roundId: observation.roundId,
        deliveryLatencyMs: observation.deliveryLatencyMs,
      });
    },
    reconnectDelayMs: 25,
  });

  client.syncTopics([HOLDEM_REALTIME_LOBBY_TOPIC, buildHoldemRealtimeTableTopic(7)]);
  client.start();
  await flushAsync();

  const socket = FakeWebSocket.instances[0]!;
  socket.emit(buildHelloMessage("resume-1"));

  assert.deepEqual(
    JSON.parse(socket.sent[0]!),
    {
      type: "transport.subscribe",
      topics: [HOLDEM_REALTIME_LOBBY_TOPIC, "public:holdem:table:7"],
    },
  );

  socket.emit({
    type: "transport.event",
    topic: HOLDEM_REALTIME_LOBBY_TOPIC,
    event: HOLDEM_REALTIME_LOBBY_EVENT,
    data: buildPublicUpdate(),
    sentAt: "2026-04-28T09:00:04.000Z",
  });
  socket.emit({
    type: "transport.event",
    topic: buildHoldemRealtimeTableTopic(7),
    event: HOLDEM_REALTIME_TABLE_MESSAGE_EVENT,
    data: buildTableMessage(),
    sentAt: "2026-04-28T09:00:04.000Z",
  });
  socket.emit({
    type: "transport.event",
    topic: buildHoldemRealtimeTableTopic(7),
    event: HOLDEM_REALTIME_PRIVATE_TABLE_EVENT,
    data: buildPrivateUpdate(),
    sentAt: "2026-04-28T09:00:04.000Z",
  });

  assert.deepEqual(statuses, ["connecting", "live"]);
  assert.equal(publicUpdates[0]?.table.id, 7);
  assert.equal(messages[0]?.id, 2);
  assert.equal(privateUpdates[0]?.table.availableActions?.toCall, "2.00");
  assert.deepEqual(observations[0], {
    tableId: 7,
    roundId: "holdem:12",
    deliveryLatencyMs: 1_000,
  });
});

test("createHoldemRealtimeClient resumes after reconnect and requests a resync when resume fails", async () => {
  const statuses: string[] = [];
  const syncReasons: string[] = [];

  const client = createHoldemRealtimeClient({
    baseUrl: "https://api.example.com",
    getAuthToken: async () => "token-1",
    onConnectionStatusChange: (status) => {
      statuses.push(status);
    },
    onSyncNeeded: (reason) => {
      syncReasons.push(reason);
    },
    onUnauthorized: async () => undefined,
    onPublicUpdate: () => undefined,
    onPrivateUpdate: () => undefined,
    reconnectDelayMs: 25,
  });

  client.syncTopics([HOLDEM_REALTIME_LOBBY_TOPIC]);
  client.start();
  await flushAsync();

  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.emit(buildHelloMessage("resume-1"));
  firstSocket.close(REALTIME_CLOSE_CODES.HEARTBEAT_TIMEOUT);

  runScheduledTimers();
  await flushAsync();

  const secondSocket = FakeWebSocket.instances[1]!;
  secondSocket.emit(buildHelloMessage("resume-2"));

  assert.deepEqual(JSON.parse(secondSocket.sent[0]!), {
    type: "transport.resume",
    resumeToken: "resume-1",
  });

  secondSocket.emit({
    type: "transport.error",
    code: REALTIME_ERROR_CODES.RESUME_NOT_AVAILABLE,
    message: "Resume window expired.",
    retryable: true,
  });

  assert.equal(statuses.at(-1), "resyncing");
  assert.deepEqual(syncReasons, ["resume_failed"]);
  assert.deepEqual(JSON.parse(secondSocket.sent[1]!), {
    type: "transport.subscribe",
    topics: [HOLDEM_REALTIME_LOBBY_TOPIC],
  });

  client.markSynchronized();
  assert.equal(statuses.at(-1), "live");
});
