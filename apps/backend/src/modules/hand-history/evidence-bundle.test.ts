import { afterEach, describe, expect, it } from "vitest";

import type { HandHistory } from "@reward/shared-types/hand-history";

import {
  buildHoldemSignedEvidenceBundle,
  verifyHoldemSignedEvidenceBundle,
} from "./evidence-bundle";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

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
          { rank: "10", suit: "spades" },
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

describe("holdem evidence bundle signing", () => {
  it("builds and verifies a signed evidence bundle with a summary page", () => {
    process.env.NODE_ENV = "test";
    process.env.USER_JWT_SECRET = "user-secret-current-1234567890";
    process.env.HAND_HISTORY_EVIDENCE_SIGNING_SECRET =
      "holdem-evidence-secret-1234567890";

    const bundle = buildHoldemSignedEvidenceBundle(
      sampleHistory,
      new Date("2026-04-28T11:05:00.000Z"),
    );

    expect(bundle).toMatchObject({
      schemaVersion: "holdem_signed_evidence_bundle_v1",
      roundId: "holdem:12",
      referenceId: 7,
      disputePayload: {
        schemaVersion: "holdem_dispute_payload_v1",
        tableEventCount: 2,
      },
      evidence: {
        schemaVersion: "holdem_hand_evidence_v1",
        history: {
          tableEvents: expect.arrayContaining([
            expect.objectContaining({
              type: "hand_started",
            }),
          ]),
        },
      },
      signature: {
        algorithm: "hmac-sha256",
        keyId: "holdem-hand-history-evidence-v1",
      },
    });
    expect(bundle.summaryPage.markdown).toContain("Hold'em Evidence Summary");
    expect(bundle.summaryPage.markdown).toContain("Round id: holdem:12");
    expect(verifyHoldemSignedEvidenceBundle(bundle)).toBe(true);
  });

  it("fails verification after tampering with the payload", () => {
    process.env.NODE_ENV = "test";
    process.env.USER_JWT_SECRET = "user-secret-current-1234567890";
    process.env.HAND_HISTORY_EVIDENCE_SIGNING_SECRET =
      "holdem-evidence-secret-1234567890";

    const bundle = buildHoldemSignedEvidenceBundle(
      sampleHistory,
      new Date("2026-04-28T11:05:00.000Z"),
    );
    bundle.disputePayload.status = "cancelled";

    expect(verifyHoldemSignedEvidenceBundle(bundle)).toBe(false);
  });
});
