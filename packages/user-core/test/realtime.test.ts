import assert from "node:assert/strict";
import test from "node:test";

import type {
  HoldemRealtimePrivateUpdate,
  HoldemRealtimeUpdate,
  HoldemTableMessage,
  HoldemTableResponse,
  HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import type { DealerEvent } from "@reward/shared-types/dealer";

import { applyDealerEventFeed } from "../src/dealer-realtime";
import {
  applyHoldemPrivateRealtimeUpdate,
  applyHoldemRealtimeUpdate,
  applyHoldemTableMessage,
} from "../src/holdem-realtime";

const baseSeatPresence = {
  connectionState: null,
  disconnectGraceExpiresAt: null,
  seatLeaseExpiresAt: null,
  autoCashOutPending: false,
  timeBankRemainingMs: 0,
} as const;

const buildDealerEvent = (
  id: string,
  createdAt: string,
  overrides: Partial<DealerEvent> = {},
): DealerEvent => ({
  id,
  kind: "action",
  source: "rule",
  gameType: "holdem",
  tableId: 7,
  tableRef: "table-7",
  roundId: "holdem:12",
  referenceId: 12,
  phase: "turn",
  seatIndex: 0,
  actionCode: "call",
  pace: null,
  text: null,
  metadata: null,
  createdAt,
  ...overrides,
});

const buildSelectedTable = (): HoldemTableResponse => ({
  table: {
    id: 7,
    name: "Realtime Holdem",
    linkedGroup: null,
    tableType: "cash",
    status: "active",
    rakePolicy: null,
    tournament: null,
    handNumber: 3,
    stage: "flop",
    smallBlind: "1.00",
    bigBlind: "2.00",
    minimumBuyIn: "40.00",
    maximumBuyIn: "200.00",
    maxSeats: 6,
    communityCards: [
      { rank: "A", suit: "spades", hidden: false },
      { rank: "K", suit: "hearts", hidden: false },
      { rank: "Q", suit: "clubs", hidden: false },
    ],
    pots: [],
    seats: [
      {
        ...baseSeatPresence,
        seatIndex: 0,
        userId: 42,
        displayName: "Hero",
        isBot: false,
        turnDeadlineAt: null,
        stackAmount: "96.00",
        committedAmount: "4.00",
        totalCommittedAmount: "4.00",
        status: "active",
        cards: [
          { rank: "9", suit: "clubs", hidden: false },
          { rank: "9", suit: "diamonds", hidden: false },
        ],
        inHand: true,
        sittingOut: false,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrentTurn: false,
        winner: false,
        bestHand: null,
        lastAction: "Call",
      },
      {
        ...baseSeatPresence,
        seatIndex: 1,
        userId: 52,
        displayName: "Villain",
        isBot: false,
        turnDeadlineAt: null,
        timeBankRemainingMs: 30_000,
        stackAmount: "96.00",
        committedAmount: "4.00",
        totalCommittedAmount: "4.00",
        status: "active",
        cards: [
          { rank: null, suit: null, hidden: true },
          { rank: null, suit: null, hidden: true },
        ],
        inHand: true,
        sittingOut: false,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrentTurn: true,
        winner: false,
        bestHand: null,
        lastAction: "Raise",
      },
      ...[2, 3, 4, 5].map((seatIndex) => ({
        ...baseSeatPresence,
        seatIndex,
        userId: null,
        displayName: null,
        isBot: false,
        turnDeadlineAt: null,
        stackAmount: "0.00",
        committedAmount: "0.00",
        totalCommittedAmount: "0.00",
        status: null,
        cards: [],
        inHand: false,
        sittingOut: false,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrentTurn: false,
        winner: false,
        bestHand: null,
        lastAction: null,
      })),
    ],
    heroSeatIndex: 0,
    pendingActorSeatIndex: 1,
    pendingActorDeadlineAt: null,
    pendingActorTimeBankStartsAt: null,
    pendingActorTimeoutAction: "fold",
    availableActions: {
      actions: ["fold", "call", "raise", "all_in"],
      toCall: "2.00",
      currentBet: "4.00",
      minimumRaiseTo: "6.00",
      maximumRaiseTo: "100.00",
      minimumBetTo: "2.00",
    },
    fairness: null,
    dealerEvents: [],
    recentHands: [],
    createdAt: "2026-04-28T09:00:00.000Z",
    updatedAt: "2026-04-28T09:01:00.000Z",
  },
  tables: [],
});

const buildLobby = (): HoldemTablesResponse => ({
  currentTableId: 7,
  activeTableIds: [7],
  tables: [
    {
      id: 7,
      name: "Realtime Holdem",
      linkedGroup: null,
      tableType: "cash",
      status: "active",
      rakePolicy: null,
      tournament: null,
      smallBlind: "1.00",
      bigBlind: "2.00",
      minimumBuyIn: "40.00",
      maximumBuyIn: "200.00",
      maxSeats: 6,
      occupiedSeats: 2,
      heroSeatIndex: 0,
      canStart: false,
      updatedAt: "2026-04-28T09:01:00.000Z",
    },
  ],
});

const buildRealtimeUpdate = (): HoldemRealtimeUpdate => ({
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
    pots: [
      {
        potIndex: 0,
        kind: "main",
        amount: "3.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [0, 1],
        winnerSeatIndexes: [],
      },
    ],
    seats: [
      {
        ...baseSeatPresence,
        seatIndex: 0,
        userId: 42,
        displayName: "Hero",
        isBot: false,
        turnDeadlineAt: null,
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
        ...baseSeatPresence,
        seatIndex: 1,
        userId: 52,
        displayName: "Villain",
        isBot: false,
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

const buildPrivateRealtimeUpdate = (): HoldemRealtimePrivateUpdate => ({
  table: {
    ...buildSelectedTable().table,
    linkedGroup: null,
    handNumber: 4,
    stage: "preflop",
    communityCards: [],
    pots: [
      {
        potIndex: 0,
        kind: "main",
        amount: "3.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [0, 1],
        winnerSeatIndexes: [],
      },
    ],
    seats: [
      {
        ...buildSelectedTable().table.seats[0]!,
        stackAmount: "99.00",
        committedAmount: "1.00",
        totalCommittedAmount: "1.00",
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        cards: [
          { rank: "A", suit: "spades", hidden: false },
          { rank: "A", suit: "hearts", hidden: false },
        ],
        lastAction: "Small blind",
      },
      {
        ...buildSelectedTable().table.seats[1]!,
        stackAmount: "98.00",
        committedAmount: "2.00",
        totalCommittedAmount: "2.00",
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrentTurn: true,
        lastAction: "Big blind",
      },
      ...buildSelectedTable().table.seats.slice(2),
    ],
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
    updatedAt: "2026-04-28T09:01:30.000Z",
  },
  handHistoryId: 12,
  roundId: "holdem:12",
  actorSeatIndex: 1,
  action: "raise",
  timedOut: false,
  eventTypes: ["hand_started", "turn_started"],
});

test("applyDealerEventFeed deduplicates by id, sorts by time, and enforces the cap", () => {
  const nextEvents = applyDealerEventFeed({
    currentEvents: [
      buildDealerEvent("b", "2026-04-28T09:00:02.000Z"),
      buildDealerEvent("a", "2026-04-28T09:00:01.000Z"),
    ],
    event: buildDealerEvent("a", "2026-04-28T09:00:03.000Z", {
      text: "Updated event",
    }),
    maxEvents: 2,
  });

  assert.deepEqual(nextEvents.map((event) => event.id), ["b", "a"]);
  assert.equal(nextEvents[1]?.text, "Updated event");
});

test("applyHoldemRealtimeUpdate patches the lobby but leaves hero-selected tables to private realtime", () => {
  const nextState = applyHoldemRealtimeUpdate({
    holdemTables: buildLobby(),
    selectedHoldemTable: buildSelectedTable(),
    selectedHoldemTableId: 7,
    update: buildRealtimeUpdate(),
  });

  assert.equal(nextState.nextLobby?.tables[0]?.id, 7);
  assert.equal(nextState.nextLobby?.tables[0]?.updatedAt, "2026-04-28T09:01:30.000Z");
  assert.equal(nextState.patchedSelectedTable, false);
  assert.deepEqual(nextState.nextTable, buildSelectedTable());
});

test("applyHoldemPrivateRealtimeUpdate applies private seat state and action availability", () => {
  const nextTable = applyHoldemPrivateRealtimeUpdate({
    selectedHoldemTable: buildSelectedTable(),
    selectedHoldemTableId: 7,
    update: buildPrivateRealtimeUpdate(),
  });

  assert.equal(nextTable?.table.handNumber, 4);
  assert.deepEqual(nextTable?.table.availableActions, {
    actions: ["fold", "call", "raise", "all_in"],
    toCall: "2.00",
    currentBet: "2.00",
    minimumRaiseTo: "4.00",
    maximumRaiseTo: "100.00",
    minimumBetTo: "2.00",
  });
  assert.deepEqual(nextTable?.table.seats[0]?.cards, [
    { rank: "A", suit: "spades", hidden: false },
    { rank: "A", suit: "hearts", hidden: false },
  ]);
});

test("applyHoldemTableMessage appends, sorts, and deduplicates chat history", () => {
  const initialMessages: HoldemTableMessage[] = [
    {
      id: 1,
      tableId: 7,
      userId: 42,
      seatIndex: 0,
      displayName: "Hero",
      kind: "chat",
      text: "nh",
      emoji: null,
      createdAt: "2026-04-28T09:00:00.000Z",
    },
  ];

  const nextMessages = applyHoldemTableMessage({
    currentMessages: initialMessages,
    message: {
      id: 2,
      tableId: 7,
      userId: 52,
      seatIndex: 1,
      displayName: "Villain",
      kind: "emoji",
      text: null,
      emoji: "🔥",
      createdAt: "2026-04-28T09:00:03.000Z",
    },
  });

  assert.deepEqual(nextMessages.map((message) => message.id), [1, 2]);

  const dedupedMessages = applyHoldemTableMessage({
    currentMessages: nextMessages,
    message: {
      id: 2,
      tableId: 7,
      userId: 52,
      seatIndex: 1,
      displayName: "Villain",
      kind: "emoji",
      text: null,
      emoji: "🔥",
      createdAt: "2026-04-28T09:00:03.000Z",
    },
  });

  assert.equal(dedupedMessages.length, 2);
});
