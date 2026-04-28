import { describe, expect, it } from "vitest";
import type { HandHistory } from "@reward/shared-types/hand-history";
import {
  buildHoldemDisputePayload,
  buildHoldemHandEvidence,
  buildHoldemReplayData,
  findReplayParticipant,
} from "@reward/user-core";

const sampleHistory: HandHistory = {
  roundId: "holdem:12",
  roundType: "holdem",
  referenceId: 7,
  userId: 42,
  status: "settled",
  stakeAmount: "4.00",
  totalStake: "4.00",
  payoutAmount: "11.00",
  fairness: {
    commitHash: "commit-hash-123",
  },
  summary: {
    tableId: 7,
    tableName: "Replay Holdem",
    handNumber: 12,
    stage: "showdown",
    dealerSeatIndex: 1,
    smallBlindSeatIndex: 0,
    bigBlindSeatIndex: 1,
    pendingActorSeatIndex: null,
    boardCards: [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
      { rank: "Q", suit: "clubs" },
      { rank: "J", suit: "diamonds" },
      { rank: "9", suit: "spades" },
    ],
    winnerSeatIndexes: [0],
    revealedSeatIndexes: [0, 1],
    totalRakeAmount: "0.50",
    pots: [
      {
        potIndex: 0,
        kind: "main",
        amount: "15.50",
        rakeAmount: "0.50",
        eligibleSeatIndexes: [0, 1],
        winnerSeatIndexes: [0],
      },
    ],
    participants: [
      {
        seatIndex: 0,
        userId: 42,
        displayName: "Hero",
        contributionAmount: "4.00",
        payoutAmount: "11.00",
        stackBefore: "100.00",
        stackAfter: "111.00",
        winner: true,
        status: "active",
        holeCards: [
          { rank: "T", suit: "spades" },
          { rank: "9", suit: "clubs" },
        ],
        bestHand: {
          label: "Straight",
        },
        lastAction: "Call",
      },
      {
        seatIndex: 1,
        userId: 52,
        displayName: "Villain",
        contributionAmount: "4.00",
        payoutAmount: "0.00",
        stackBefore: "100.00",
        stackAfter: "89.00",
        winner: false,
        status: "active",
        bestHand: {
          label: "Pair",
        },
        lastAction: "Check",
      },
    ],
    blinds: {
      smallBlind: "1.00",
      bigBlind: "2.00",
    },
  },
  startedAt: "2026-04-28T11:00:00.000Z",
  settledAt: "2026-04-28T11:01:00.000Z",
  events: [
    {
      sequence: 0,
      type: "hand_started",
      actor: "system",
      payload: {
        handNumber: 12,
        participants: [
          { seatIndex: 0, userId: 42, displayName: "Hero" },
          { seatIndex: 1, userId: 52, displayName: "Villain" },
        ],
      },
      createdAt: "2026-04-28T11:00:00.000Z",
    },
    {
      sequence: 1,
      type: "player_acted",
      actor: "player",
      payload: {
        stage: "river",
        seatIndex: 0,
        userId: 42,
        action: "call",
        lastAction: "Call",
        stackAmount: "96.00",
        committedAmount: "4.00",
        totalCommittedAmount: "4.00",
      },
      createdAt: "2026-04-28T11:00:30.000Z",
    },
    {
      sequence: 2,
      type: "hand_settled",
      actor: "system",
      payload: {
        winnerSeatIndexes: [0],
        pots: [
          {
            potIndex: 0,
            kind: "main",
            amount: "15.50",
            rakeAmount: "0.50",
            eligibleSeatIndexes: [0, 1],
            winnerSeatIndexes: [0],
          },
        ],
      },
      createdAt: "2026-04-28T11:01:00.000Z",
    },
  ],
  tableEvents: [
    {
      sequence: 0,
      type: "hand_started",
      actor: "system",
      seatIndex: null,
      userId: null,
      handHistoryId: 12,
      phase: "preflop",
      payload: {
        roundId: "holdem:12",
        handNumber: 12,
      },
      createdAt: "2026-04-28T11:00:00.000Z",
    },
    {
      sequence: 1,
      type: "hand_settled",
      actor: "system",
      seatIndex: null,
      userId: null,
      handHistoryId: 12,
      phase: "showdown",
      payload: {
        roundId: "holdem:12",
        winnerSeatIndexes: [0],
      },
      createdAt: "2026-04-28T11:01:00.000Z",
    },
  ],
};

describe("holdem hand history parsing", () => {
  it("builds replay data from a settled holdem history", () => {
    const replay = buildHoldemReplayData(sampleHistory);
    expect(replay).not.toBeNull();
    if (!replay) {
      throw new Error("Expected replay data");
    }

    expect(replay.handNumber).toBe(12);
    expect(replay.tableName).toBe("Replay Holdem");
    expect(replay.fairnessCommitHash).toBe("commit-hash-123");
    expect(replay.boardCards).toHaveLength(5);
    expect(replay.pots[0]).toMatchObject({
      kind: "main",
      amount: "15.50",
      rakeAmount: "0.50",
    });
    expect(replay.viewerSeatIndex).toBe(0);
    expect(findReplayParticipant(replay, 0)).toMatchObject({
      displayName: "Hero",
      bestHandLabel: "Straight",
      holeCards: [
        { rank: "T", suit: "spades", hidden: false },
        { rank: "9", suit: "clubs", hidden: false },
      ],
    });
    expect(replay.events[1]).toMatchObject({
      type: "player_acted",
      action: "call",
      seatIndex: 0,
      stackAmount: "96.00",
    });
  });

  it("builds dispute payload and evidence export artifacts", () => {
    const disputePayload = buildHoldemDisputePayload(sampleHistory);
    expect(disputePayload).not.toBeNull();
    expect(disputePayload).toMatchObject({
      schemaVersion: "holdem_dispute_payload_v1",
      roundId: "holdem:12",
      referenceId: 7,
      eventCount: 3,
      tableEventCount: 2,
      participantCount: 2,
      fairnessCommitHash: "commit-hash-123",
    });

    const evidence = buildHoldemHandEvidence(sampleHistory);
    expect(evidence).not.toBeNull();
    expect(evidence).toMatchObject({
      schemaVersion: "holdem_hand_evidence_v1",
      disputePayload: {
        roundId: "holdem:12",
      },
      history: {
        roundId: "holdem:12",
        referenceId: 7,
      },
    });
    expect(evidence?.history.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "hand_started",
        }),
      ]),
    );
    expect(evidence?.history.tableEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "hand_started",
        }),
      ]),
    );
  });
});
