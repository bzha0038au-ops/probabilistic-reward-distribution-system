import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { HoldemCard } from "@reward/shared-types/holdem";

import {
  applyRakeToSettledState,
  actOnHoldemSeat,
  deriveHoldemHandSeed,
  resolveHoldemActionAvailability,
  shuffleHoldemDeck,
  startHoldemHand,
} from "./engine";
import type { HoldemSeatState, HoldemTableState } from "./model";

const tableCreatedAt = new Date("2026-01-01T00:00:00.000Z");

const card = (rank: HoldemCard["rank"], suit: HoldemCard["suit"]): HoldemCard => ({
  rank,
  suit,
});

const buildSeat = (params: {
  id: number;
  tableId: number;
  seatIndex: number;
  userId: number;
  userEmail: string;
  stackAmount: string;
  committedAmount?: string;
  totalCommittedAmount?: string;
  status?: HoldemSeatState["status"];
  holeCards?: HoldemCard[];
}) =>
  ({
    id: params.id,
    tableId: params.tableId,
    seatIndex: params.seatIndex,
    userId: params.userId,
    userEmail: params.userEmail,
    stackAmount: params.stackAmount,
    committedAmount: params.committedAmount ?? "0.00",
    totalCommittedAmount: params.totalCommittedAmount ?? "0.00",
    status: params.status ?? "waiting",
    turnDeadlineAt: null,
    holeCards: params.holeCards ?? [],
    lastAction: null,
    metadata: {
      sittingOut: false,
      sitOutSource: null,
      timeBankRemainingMs: 0,
      winner: false,
      bestHand: null,
      tournament: null,
    },
    createdAt: tableCreatedAt,
    updatedAt: tableCreatedAt,
  }) satisfies HoldemSeatState;

const buildTable = (seats: HoldemSeatState[]): HoldemTableState => ({
  id: 41,
  name: "Test Holdem Table",
  status: "waiting",
  smallBlind: "1.00",
  bigBlind: "2.00",
  minimumBuyIn: "40.00",
  maximumBuyIn: "200.00",
  maxSeats: 6,
  metadata: {
    tableType: "cash",
    rakePolicy: null,
    tournament: null,
    handNumber: 0,
    stage: null,
    dealerSeatIndex: null,
    smallBlindSeatIndex: null,
    bigBlindSeatIndex: null,
    pendingActorSeatIndex: null,
    turnStartedAt: null,
    turnTimeBankStartsAt: null,
    turnTimeBankAllocatedMs: 0,
    currentBet: "0.00",
    lastFullRaiseSize: "0.00",
    actedSeatIndexes: [],
    communityCards: [],
    deck: [],
    nextCardIndex: 0,
    fairnessSeed: null,
    activeHandHistoryId: null,
    fairness: null,
    revealedSeatIndexes: [],
    winnerSeatIndexes: [],
    dealerEvents: [],
    resolvedPots: [],
    recentHands: [],
  },
  seats,
  createdAt: tableCreatedAt,
  updatedAt: tableCreatedAt,
});

describe("holdem engine", () => {
  it("enforces the minimum preflop raise and advances the reopen size", () => {
    const state = buildTable([
      buildSeat({
        id: 1,
        tableId: 41,
        seatIndex: 0,
        userId: 10,
        userEmail: "alice@example.com",
        stackAmount: "100.00",
      }),
      buildSeat({
        id: 2,
        tableId: 41,
        seatIndex: 1,
        userId: 20,
        userEmail: "bob@example.com",
        stackAmount: "100.00",
      }),
    ]);

    startHoldemHand(state, {
      fairnessSeed: {
        seed: "seed-1",
        epoch: 7,
        epochSeconds: 60,
        commitHash: "c".repeat(64),
      },
    });

    const openerAvailability = resolveHoldemActionAvailability(state, 0);
    expect(openerAvailability).not.toBeNull();
    expect(openerAvailability?.toCall).toBe("1.00");
    expect(openerAvailability?.minimumRaiseTo).toBe("4.00");

    expect(() =>
      actOnHoldemSeat(state, {
        seatIndex: 0,
        action: "raise",
        amount: "3.00",
      }),
    ).toThrowError(/minimum raise/i);

    actOnHoldemSeat(state, {
      seatIndex: 0,
      action: "raise",
      amount: "4.00",
    });

    const responseAvailability = resolveHoldemActionAvailability(state, 1);
    expect(responseAvailability).not.toBeNull();
    expect(responseAvailability?.toCall).toBe("2.00");
    expect(responseAvailability?.currentBet).toBe("4.00");
    expect(responseAvailability?.minimumRaiseTo).toBe("6.00");
  });

  it("derives a per-hand fairness commit and reveals the hand seed after settlement", () => {
    const state = buildTable([
      buildSeat({
        id: 1,
        tableId: 41,
        seatIndex: 0,
        userId: 10,
        userEmail: "alice@example.com",
        stackAmount: "100.00",
      }),
      buildSeat({
        id: 2,
        tableId: 41,
        seatIndex: 1,
        userId: 20,
        userEmail: "bob@example.com",
        stackAmount: "100.00",
      }),
    ]);

    startHoldemHand(state, {
      fairnessSeed: {
        seed: "epoch-seed-1",
        epoch: 7,
        epochSeconds: 60,
        commitHash: "c".repeat(64),
      },
    });

    const handSeed = deriveHoldemHandSeed({
      seed: "epoch-seed-1",
      tableId: 41,
      handNumber: 1,
      seatUserIds: [10, 20],
    });
    const expectedCommitHash = createHash("sha256")
      .update(handSeed, "utf8")
      .digest("hex");
    const replayedDeck = shuffleHoldemDeck({ handSeed });

    expect(state.metadata.fairness).toMatchObject({
      commitHash: expectedCommitHash,
      sourceCommitHash: "c".repeat(64),
      revealSeed: null,
      deckDigest: replayedDeck.deckDigest,
      rngDigest: replayedDeck.rngDigest,
    });

    actOnHoldemSeat(state, {
      seatIndex: 0,
      action: "fold",
    });

    expect(state.metadata.fairness).toMatchObject({
      commitHash: expectedCommitHash,
      sourceCommitHash: "c".repeat(64),
      revealSeed: handSeed,
    });
    expect(state.metadata.fairnessSeed).toBeNull();
  });

  it("settles main and side pots to the correct winners at showdown", () => {
    const state = buildTable([
      buildSeat({
        id: 1,
        tableId: 41,
        seatIndex: 0,
        userId: 10,
        userEmail: "alice@example.com",
        stackAmount: "0.00",
        totalCommittedAmount: "50.00",
        status: "all_in",
        holeCards: [card("A", "spades"), card("A", "hearts")],
      }),
      buildSeat({
        id: 2,
        tableId: 41,
        seatIndex: 1,
        userId: 20,
        userEmail: "bob@example.com",
        stackAmount: "0.00",
        totalCommittedAmount: "100.00",
        status: "all_in",
        holeCards: [card("Q", "spades"), card("Q", "hearts")],
      }),
      buildSeat({
        id: 3,
        tableId: 41,
        seatIndex: 2,
        userId: 30,
        userEmail: "carol@example.com",
        stackAmount: "10.00",
        totalCommittedAmount: "100.00",
        status: "active",
        holeCards: [card("J", "spades"), card("J", "hearts")],
      }),
    ]);

    state.status = "active";
    state.metadata.handNumber = 3;
    state.metadata.stage = "river";
    state.metadata.dealerSeatIndex = 0;
    state.metadata.smallBlindSeatIndex = 1;
    state.metadata.bigBlindSeatIndex = 2;
    state.metadata.pendingActorSeatIndex = 2;
    state.metadata.currentBet = "0.00";
    state.metadata.lastFullRaiseSize = "2.00";
    state.metadata.actedSeatIndexes = [0, 1];
    state.metadata.communityCards = [
      card("K", "clubs"),
      card("K", "diamonds"),
      card("2", "spades"),
      card("2", "hearts"),
      card("7", "clubs"),
    ];

    actOnHoldemSeat(state, {
      seatIndex: 2,
      action: "check",
    });

    expect(state.status).toBe("waiting");
    expect(state.metadata.stage).toBe("showdown");
    expect(state.metadata.revealedSeatIndexes).toEqual([0, 1, 2]);
    expect(state.metadata.resolvedPots).toEqual([
      {
        potIndex: 0,
        kind: "main",
        amount: "150.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [0, 1, 2],
        winnerSeatIndexes: [0],
      },
      {
        potIndex: 1,
        kind: "side",
        amount: "100.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [1, 2],
        winnerSeatIndexes: [1],
      },
    ]);

    expect(state.seats[0]?.stackAmount).toBe("150.00");
    expect(state.seats[1]?.stackAmount).toBe("100.00");
    expect(state.seats[2]?.stackAmount).toBe("10.00");
    expect(state.seats[0]?.metadata.bestHand?.label).toBe("Two pair");
    expect(state.seats[1]?.metadata.bestHand?.label).toBe("Two pair");
    expect(state.metadata.recentHands[0]).toMatchObject({
      handNumber: 3,
      potAmount: "250.00",
      rakeAmount: "0.00",
      winnerSeatIndexes: [0, 1],
      winnerLabels: ["alice", "bob"],
    });
  });

  it("applies capped rake across resolved pots without changing winners", () => {
    const state = buildTable([
      buildSeat({
        id: 1,
        tableId: 41,
        seatIndex: 0,
        userId: 10,
        userEmail: "alice@example.com",
        stackAmount: "150.00",
      }),
      buildSeat({
        id: 2,
        tableId: 41,
        seatIndex: 1,
        userId: 20,
        userEmail: "bob@example.com",
        stackAmount: "100.00",
      }),
    ]);

    state.status = "waiting";
    state.metadata.handNumber = 4;
    state.metadata.stage = "showdown";
    state.metadata.dealerSeatIndex = 0;
    state.metadata.resolvedPots = [
      {
        potIndex: 0,
        kind: "main",
        amount: "150.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [0, 1],
        winnerSeatIndexes: [0],
      },
      {
        potIndex: 1,
        kind: "side",
        amount: "100.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [1],
        winnerSeatIndexes: [1],
      },
    ];
    state.metadata.recentHands = [
      {
        roundId: null,
        handNumber: 4,
        stage: "showdown",
        boardCards: [],
        potAmount: "250.00",
        rakeAmount: "0.00",
        winnerSeatIndexes: [0, 1],
        winnerLabels: ["alice", "bob"],
        settledAt: tableCreatedAt,
      },
    ];

    const appliedRake = applyRakeToSettledState(state, {
      rakeBps: 500,
      capAmount: "8.00",
      noFlopNoDrop: false,
    });

    expect(appliedRake).toEqual({
      totalRakeAmount: "8.00",
      seatRakeAmounts: [
        { seatIndex: 0, amount: "8.00" },
      ],
    });
    expect(state.seats[0]?.stackAmount).toBe("142.00");
    expect(state.seats[1]?.stackAmount).toBe("100.00");
    expect(state.metadata.resolvedPots).toEqual([
      {
        potIndex: 0,
        kind: "main",
        amount: "150.00",
        rakeAmount: "8.00",
        eligibleSeatIndexes: [0, 1],
        winnerSeatIndexes: [0],
      },
      {
        potIndex: 1,
        kind: "side",
        amount: "100.00",
        rakeAmount: "0.00",
        eligibleSeatIndexes: [1],
        winnerSeatIndexes: [1],
      },
    ]);
    expect(state.metadata.recentHands[0]?.rakeAmount).toBe("8.00");
  });
});
