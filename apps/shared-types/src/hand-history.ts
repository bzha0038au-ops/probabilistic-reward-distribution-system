import { z } from 'zod';

import { HoldemCardViewSchema } from './holdem';

export const handHistoryRoundTypeValues = [
  'blackjack',
  'quick_eight',
  'holdem',
] as const;
export const handHistoryEventActorValues = ['player', 'dealer', 'system'] as const;

const DateLikeSchema = z.union([z.string(), z.date()]);

export const HandHistoryRoundTypeSchema = z.enum(handHistoryRoundTypeValues);
export type HandHistoryRoundType = z.infer<typeof HandHistoryRoundTypeSchema>;

export const HandHistoryEventActorSchema = z.enum(handHistoryEventActorValues);
export type HandHistoryEventActor = z.infer<typeof HandHistoryEventActorSchema>;

export const HandHistoryRoundIdSchema = z
  .string()
  .min(1)
  .regex(/^(blackjack|quick_eight|holdem):[1-9]\d*$/, {
    message: 'Invalid round id.',
  });
export type HandHistoryRoundId = z.infer<typeof HandHistoryRoundIdSchema>;

export const HandHistoryEventPayloadSchema = z.record(z.string(), z.unknown());
export type HandHistoryEventPayload = z.infer<
  typeof HandHistoryEventPayloadSchema
>;

export const HandHistoryEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1).max(64),
  actor: HandHistoryEventActorSchema,
  payload: HandHistoryEventPayloadSchema,
  createdAt: DateLikeSchema,
});
export type HandHistoryEvent = z.infer<typeof HandHistoryEventSchema>;

export const TableHistoryEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1).max(64),
  actor: HandHistoryEventActorSchema,
  seatIndex: z.number().int().nonnegative().nullable(),
  userId: z.number().int().positive().nullable(),
  handHistoryId: z.number().int().positive().nullable(),
  phase: z.string().nullable(),
  payload: HandHistoryEventPayloadSchema,
  createdAt: DateLikeSchema,
});
export type TableHistoryEvent = z.infer<typeof TableHistoryEventSchema>;

export const HandHistorySchema = z.object({
  roundId: HandHistoryRoundIdSchema,
  roundType: HandHistoryRoundTypeSchema,
  referenceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  status: z.string().min(1).max(64),
  stakeAmount: z.string(),
  totalStake: z.string(),
  payoutAmount: z.string(),
  fairness: HandHistoryEventPayloadSchema.nullable(),
  summary: HandHistoryEventPayloadSchema.nullable().optional(),
  startedAt: DateLikeSchema,
  settledAt: DateLikeSchema.nullable(),
  events: z.array(HandHistoryEventSchema),
  tableEvents: z.array(TableHistoryEventSchema).default([]),
});
export type HandHistory = z.infer<typeof HandHistorySchema>;

const HoldemReplayPotKindSchema = z.enum(['main', 'side']);

export const HoldemReplayPotSchema = z.object({
  potIndex: z.number().int().nonnegative(),
  kind: HoldemReplayPotKindSchema,
  amount: z.string(),
  rakeAmount: z.string(),
  eligibleSeatIndexes: z.array(z.number().int().nonnegative()),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
});
export type HoldemReplayPot = z.infer<typeof HoldemReplayPotSchema>;

export const HoldemReplayParticipantSchema = z.object({
  seatIndex: z.number().int().nonnegative(),
  userId: z.number().int().positive().nullable(),
  displayName: z.string().nullable(),
  contributionAmount: z.string().nullable(),
  payoutAmount: z.string().nullable(),
  stackBefore: z.string().nullable(),
  stackAfter: z.string().nullable(),
  winner: z.boolean(),
  status: z.string().nullable(),
  holeCards: z.array(HoldemCardViewSchema),
  bestHandLabel: z.string().nullable(),
  lastAction: z.string().nullable(),
});
export type HoldemReplayParticipant = z.infer<typeof HoldemReplayParticipantSchema>;

export const HoldemReplayEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1).max(64),
  actor: HandHistoryEventActorSchema,
  createdAt: z.string(),
  stage: z.string().nullable(),
  seatIndex: z.number().int().nonnegative().nullable(),
  userId: z.number().int().positive().nullable(),
  action: z.string().nullable(),
  timeoutAction: z.string().nullable(),
  amount: z.string().nullable(),
  stackAmount: z.string().nullable(),
  committedAmount: z.string().nullable(),
  totalCommittedAmount: z.string().nullable(),
  lastAction: z.string().nullable(),
  turnDeadlineAt: z.string().nullable(),
  turnTimeBankStartsAt: z.string().nullable(),
  timeBankConsumedMs: z.number().int().nonnegative().nullable(),
  timeBankRemainingMs: z.number().int().nonnegative().nullable(),
  boardCards: z.array(HoldemCardViewSchema),
  newCards: z.array(HoldemCardViewSchema),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
  revealedSeatIndexes: z.array(z.number().int().nonnegative()),
  pots: z.array(HoldemReplayPotSchema),
  participants: z.array(HoldemReplayParticipantSchema),
});
export type HoldemReplayEvent = z.infer<typeof HoldemReplayEventSchema>;

export const HoldemReplayDataSchema = z.object({
  roundId: HandHistoryRoundIdSchema,
  userId: z.number().int().positive(),
  startedAt: z.string(),
  settledAt: z.string().nullable(),
  handNumber: z.number().int().positive().nullable(),
  tableId: z.number().int().positive().nullable(),
  tableName: z.string().nullable(),
  status: z.string().min(1).max(64),
  stage: z.string().nullable(),
  fairnessCommitHash: z.string().nullable(),
  totalRakeAmount: z.string().nullable(),
  blinds: z.object({
    smallBlind: z.string().nullable(),
    bigBlind: z.string().nullable(),
  }),
  dealerSeatIndex: z.number().int().nonnegative().nullable(),
  smallBlindSeatIndex: z.number().int().nonnegative().nullable(),
  bigBlindSeatIndex: z.number().int().nonnegative().nullable(),
  pendingActorSeatIndex: z.number().int().nonnegative().nullable(),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
  revealedSeatIndexes: z.array(z.number().int().nonnegative()),
  boardCards: z.array(HoldemCardViewSchema),
  pots: z.array(HoldemReplayPotSchema),
  participants: z.array(HoldemReplayParticipantSchema),
  events: z.array(HoldemReplayEventSchema),
  viewerSeatIndex: z.number().int().nonnegative().nullable(),
  stakeAmount: z.string(),
  payoutAmount: z.string(),
});
export type HoldemReplayData = z.infer<typeof HoldemReplayDataSchema>;

export const HoldemDisputePayloadSchema = z.object({
  schemaVersion: z.literal('holdem_dispute_payload_v1'),
  exportedAt: z.string(),
  roundId: HandHistoryRoundIdSchema,
  referenceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  status: z.string().min(1).max(64),
  stakeAmount: z.string(),
  totalStake: z.string(),
  payoutAmount: z.string(),
  startedAt: z.string(),
  settledAt: z.string().nullable(),
  tableId: z.number().int().positive().nullable(),
  tableName: z.string().nullable(),
  handNumber: z.number().int().positive().nullable(),
  stage: z.string().nullable(),
  fairnessCommitHash: z.string().nullable(),
  viewerSeatIndex: z.number().int().nonnegative().nullable(),
  eventCount: z.number().int().nonnegative(),
  tableEventCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
  totalRakeAmount: z.string().nullable(),
  pots: z.array(HoldemReplayPotSchema),
  participants: z.array(
    z.object({
      seatIndex: z.number().int().nonnegative(),
      userId: z.number().int().positive().nullable(),
      displayName: z.string().nullable(),
      contributionAmount: z.string().nullable(),
      payoutAmount: z.string().nullable(),
      winner: z.boolean(),
      bestHandLabel: z.string().nullable(),
      lastAction: z.string().nullable(),
    }),
  ),
  events: z.array(
    z.object({
      sequence: z.number().int().nonnegative(),
      type: z.string().min(1).max(64),
      actor: HandHistoryEventActorSchema,
      createdAt: z.string(),
      stage: z.string().nullable(),
      seatIndex: z.number().int().nonnegative().nullable(),
      userId: z.number().int().positive().nullable(),
      action: z.string().nullable(),
      timeoutAction: z.string().nullable(),
      amount: z.string().nullable(),
      turnTimeBankStartsAt: z.string().nullable(),
      timeBankConsumedMs: z.number().int().nonnegative().nullable(),
      timeBankRemainingMs: z.number().int().nonnegative().nullable(),
      winnerSeatIndexes: z.array(z.number().int().nonnegative()),
      revealedSeatIndexes: z.array(z.number().int().nonnegative()),
    }),
  ),
  tableEvents: z.array(
    z.object({
      sequence: z.number().int().nonnegative(),
      type: z.string().min(1).max(64),
      actor: HandHistoryEventActorSchema,
      createdAt: z.string(),
      phase: z.string().nullable(),
      seatIndex: z.number().int().nonnegative().nullable(),
      userId: z.number().int().positive().nullable(),
      handHistoryId: z.number().int().positive().nullable(),
      action: z.string().nullable(),
      amount: z.string().nullable(),
      turnDeadlineAt: z.string().nullable(),
      turnTimeBankStartsAt: z.string().nullable(),
      timeBankConsumedMs: z.number().int().nonnegative().nullable(),
      timeBankRemainingMs: z.number().int().nonnegative().nullable(),
      winnerSeatIndexes: z.array(z.number().int().nonnegative()),
      revealedSeatIndexes: z.array(z.number().int().nonnegative()),
    }),
  ),
});
export type HoldemDisputePayload = z.infer<typeof HoldemDisputePayloadSchema>;

export const HoldemHandEvidenceSchema = z.object({
  schemaVersion: z.literal('holdem_hand_evidence_v1'),
  exportedAt: z.string(),
  disputePayload: HoldemDisputePayloadSchema,
  replay: HoldemReplayDataSchema,
  history: z.object({
    roundId: HandHistoryRoundIdSchema,
    roundType: HandHistoryRoundTypeSchema,
    referenceId: z.number().int().positive(),
    userId: z.number().int().positive(),
    status: z.string().min(1).max(64),
    stakeAmount: z.string(),
    totalStake: z.string(),
    payoutAmount: z.string(),
    fairness: HandHistoryEventPayloadSchema.nullable(),
    summary: HandHistoryEventPayloadSchema.nullable(),
    startedAt: z.string(),
    settledAt: z.string().nullable(),
    events: z.array(
      z.object({
        sequence: z.number().int().nonnegative(),
        type: z.string().min(1).max(64),
        actor: HandHistoryEventActorSchema,
        payload: HandHistoryEventPayloadSchema,
        createdAt: z.string(),
      }),
    ),
    tableEvents: z.array(
      z.object({
        sequence: z.number().int().nonnegative(),
        type: z.string().min(1).max(64),
        actor: HandHistoryEventActorSchema,
        seatIndex: z.number().int().nonnegative().nullable(),
        userId: z.number().int().positive().nullable(),
        handHistoryId: z.number().int().positive().nullable(),
        phase: z.string().nullable(),
        payload: HandHistoryEventPayloadSchema,
        createdAt: z.string(),
      }),
    ),
  }),
});
export type HoldemHandEvidence = z.infer<typeof HoldemHandEvidenceSchema>;

export const HoldemEvidenceSummaryEntrySchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});
export type HoldemEvidenceSummaryEntry = z.infer<
  typeof HoldemEvidenceSummaryEntrySchema
>;

export const HoldemEvidenceSummaryPageSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
  generatedAt: DateLikeSchema,
  overview: z.array(HoldemEvidenceSummaryEntrySchema),
  highlights: z.array(z.string().min(1)),
  markdown: z.string().min(1),
});
export type HoldemEvidenceSummaryPage = z.infer<
  typeof HoldemEvidenceSummaryPageSchema
>;

export const HoldemEvidenceBundleSignatureSchema = z.object({
  algorithm: z.literal('hmac-sha256'),
  keyId: z.string().min(1),
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export type HoldemEvidenceBundleSignature = z.infer<
  typeof HoldemEvidenceBundleSignatureSchema
>;

export const HoldemSignedEvidenceBundleSchema = z.object({
  schemaVersion: z.literal('holdem_signed_evidence_bundle_v1'),
  roundId: HandHistoryRoundIdSchema,
  referenceId: z.number().int().positive(),
  exportedAt: z.string(),
  summaryPage: HoldemEvidenceSummaryPageSchema,
  disputePayload: HoldemDisputePayloadSchema,
  evidence: HoldemHandEvidenceSchema,
  signature: HoldemEvidenceBundleSignatureSchema,
});
export type HoldemSignedEvidenceBundle = z.infer<
  typeof HoldemSignedEvidenceBundleSchema
>;
