import { z } from "zod";
import { DealerFeedSchema } from "./dealer";

export const holdemCardSuitValues = [
  "spades",
  "hearts",
  "diamonds",
  "clubs",
] as const;

export const holdemCardRankValues = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;

export const holdemActionValues = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all_in",
] as const;

export const holdemSeatStatusValues = [
  "waiting",
  "active",
  "folded",
  "all_in",
  "out",
] as const;

export const holdemSeatPresenceStateValues = [
  "connected",
  "grace",
  "disconnected",
] as const;

export const holdemTableStatusValues = ["waiting", "active"] as const;
export const holdemTableTypeValues = ["cash", "casual", "tournament"] as const;
export const holdemTournamentStatusValues = [
  "registering",
  "running",
  "completed",
] as const;

export const holdemStreetValues = [
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
] as const;

export const holdemHandCategoryValues = [
  "high_card",
  "one_pair",
  "two_pair",
  "three_of_a_kind",
  "straight",
  "flush",
  "full_house",
  "four_of_a_kind",
  "straight_flush",
] as const;

export const holdemTableMessageKindValues = ["chat", "emoji"] as const;
export const holdemTableEmojiValues = [
  "👍",
  "😂",
  "😮",
  "🔥",
  "🃏",
  "🙈",
] as const;

export const HOLDEM_DEFAULT_SMALL_BLIND = "1.00";
export const HOLDEM_DEFAULT_BIG_BLIND = "2.00";
export const HOLDEM_DEFAULT_MIN_BUY_IN = "40.00";
export const HOLDEM_DEFAULT_MAX_BUY_IN = "200.00";
export const HOLDEM_DEFAULT_MAX_SEATS = 6;
export const HOLDEM_DEFAULT_CASUAL_MAX_SEATS = 2;
export const HOLD_EM_CREATE_MAX_SEAT_OPTIONS = [2, 4, 6, 9] as const;
export const HOLDEM_DEFAULT_PRESENCE_HEARTBEAT_MS = 10_000;
export const HOLDEM_TABLE_MESSAGE_MAX_LENGTH = 180;
export const HOLDEM_TABLE_MESSAGE_LIMIT = 40;
export const HOLDEM_MIN_PLAYERS = 2;
export const HOLDEM_MAX_BOT_PLAYERS = 8;
export const HOLDEM_REALTIME_LOBBY_TOPIC = "public:holdem:lobby";
export const HOLDEM_REALTIME_LOBBY_EVENT = "holdem.lobby.updated";
export const HOLDEM_REALTIME_TABLE_EVENT = "holdem.table.updated";
export const HOLDEM_REALTIME_TABLE_MESSAGE_EVENT = "holdem.table.message";
export const HOLDEM_REALTIME_PRIVATE_TABLE_EVENT =
  "holdem.table.private.updated";

const DateLikeSchema = z.union([z.string(), z.date()]);

export const HoldemCardSuitSchema = z.enum(holdemCardSuitValues);
export type HoldemCardSuit = z.infer<typeof HoldemCardSuitSchema>;

export const HoldemCardRankSchema = z.enum(holdemCardRankValues);
export type HoldemCardRank = z.infer<typeof HoldemCardRankSchema>;

export const HoldemActionSchema = z.enum(holdemActionValues);
export type HoldemAction = z.infer<typeof HoldemActionSchema>;

export const HoldemSeatStatusSchema = z.enum(holdemSeatStatusValues);
export type HoldemSeatStatus = z.infer<typeof HoldemSeatStatusSchema>;

export const HoldemSeatPresenceStateSchema = z.enum(
  holdemSeatPresenceStateValues,
);
export type HoldemSeatPresenceState = z.infer<
  typeof HoldemSeatPresenceStateSchema
>;

export const HoldemTableStatusSchema = z.enum(holdemTableStatusValues);
export type HoldemTableStatus = z.infer<typeof HoldemTableStatusSchema>;

export const HoldemTableTypeSchema = z.enum(holdemTableTypeValues);
export type HoldemTableType = z.infer<typeof HoldemTableTypeSchema>;

export const HoldemTournamentStatusSchema = z.enum(
  holdemTournamentStatusValues,
);
export type HoldemTournamentStatus = z.infer<
  typeof HoldemTournamentStatusSchema
>;

export const HoldemStreetSchema = z.enum(holdemStreetValues);
export type HoldemStreet = z.infer<typeof HoldemStreetSchema>;

export const HoldemHandCategorySchema = z.enum(holdemHandCategoryValues);
export type HoldemHandCategory = z.infer<typeof HoldemHandCategorySchema>;

export const HoldemTableMessageKindSchema = z.enum(
  holdemTableMessageKindValues,
);
export type HoldemTableMessageKind = z.infer<
  typeof HoldemTableMessageKindSchema
>;

export const HoldemTableEmojiSchema = z.enum(holdemTableEmojiValues);
export type HoldemTableEmoji = z.infer<typeof HoldemTableEmojiSchema>;

export const HoldemCardSchema = z.object({
  rank: HoldemCardRankSchema,
  suit: HoldemCardSuitSchema,
});
export type HoldemCard = z.infer<typeof HoldemCardSchema>;

export const HoldemCardViewSchema = z.object({
  rank: HoldemCardRankSchema.nullable(),
  suit: HoldemCardSuitSchema.nullable(),
  hidden: z.boolean(),
});
export type HoldemCardView = z.infer<typeof HoldemCardViewSchema>;

export const HoldemConfigSchema = z.object({
  smallBlind: z.string(),
  bigBlind: z.string(),
  minimumBuyIn: z.string(),
  maximumBuyIn: z.string(),
  maxSeats: z.number().int().min(HOLDEM_MIN_PLAYERS).max(9),
});
export type HoldemConfig = z.infer<typeof HoldemConfigSchema>;

export const HOLDEM_CONFIG: HoldemConfig = {
  smallBlind: HOLDEM_DEFAULT_SMALL_BLIND,
  bigBlind: HOLDEM_DEFAULT_BIG_BLIND,
  minimumBuyIn: HOLDEM_DEFAULT_MIN_BUY_IN,
  maximumBuyIn: HOLDEM_DEFAULT_MAX_BUY_IN,
  maxSeats: HOLDEM_DEFAULT_MAX_SEATS,
};

export const HoldemFairnessSchema = z.object({
  epoch: z.number().int(),
  epochSeconds: z.number().int(),
  commitHash: z.string(),
  sourceCommitHash: z.string().nullable().default(null),
  deckDigest: z.string(),
  rngDigest: z.string(),
  revealSeed: z.string().nullable().default(null),
  revealedAt: z.string().datetime().nullable().default(null),
  algorithm: z.string(),
});
export type HoldemFairness = z.infer<typeof HoldemFairnessSchema>;

export const HoldemLinkedGroupSchema = z.object({
  groupId: z.string(),
  primaryTableId: z.number().int().positive().nullable().default(null),
  tableIds: z.array(z.number().int().positive()).max(2).default([]),
  executionIndex: z.number().int().positive(),
  executionCount: z.number().int().positive(),
});
export type HoldemLinkedGroup = z.infer<typeof HoldemLinkedGroupSchema>;

export const HoldemBestHandSchema = z.object({
  category: HoldemHandCategorySchema,
  label: z.string(),
  cards: z.array(HoldemCardSchema).length(5),
});
export type HoldemBestHand = z.infer<typeof HoldemBestHandSchema>;

export const HoldemSeatViewSchema = z.object({
  seatIndex: z.number().int().nonnegative(),
  userId: z.number().int().positive().nullable(),
  displayName: z.string().nullable(),
  isBot: z.boolean().default(false),
  connectionState: HoldemSeatPresenceStateSchema.nullable(),
  disconnectGraceExpiresAt: DateLikeSchema.nullable(),
  seatLeaseExpiresAt: DateLikeSchema.nullable(),
  autoCashOutPending: z.boolean(),
  turnDeadlineAt: DateLikeSchema.nullable(),
  timeBankRemainingMs: z.number().int().nonnegative().default(0),
  stackAmount: z.string(),
  committedAmount: z.string(),
  totalCommittedAmount: z.string(),
  status: HoldemSeatStatusSchema.nullable(),
  cards: z.array(HoldemCardViewSchema).max(2),
  inHand: z.boolean(),
  sittingOut: z.boolean(),
  isDealer: z.boolean(),
  isSmallBlind: z.boolean(),
  isBigBlind: z.boolean(),
  isCurrentTurn: z.boolean(),
  winner: z.boolean(),
  bestHand: HoldemBestHandSchema.nullable(),
  lastAction: z.string().nullable(),
});
export type HoldemSeatView = z.infer<typeof HoldemSeatViewSchema>;

export const HoldemPotSchema = z.object({
  potIndex: z.number().int().nonnegative(),
  kind: z.enum(["main", "side"]),
  amount: z.string(),
  rakeAmount: z.string().default("0.00"),
  eligibleSeatIndexes: z.array(z.number().int().nonnegative()),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
});
export type HoldemPot = z.infer<typeof HoldemPotSchema>;

export const HoldemTableRakePolicySchema = z.object({
  rakeBps: z.number().int().nonnegative(),
  capAmount: z.string(),
  noFlopNoDrop: z.boolean(),
});
export type HoldemTableRakePolicy = z.infer<
  typeof HoldemTableRakePolicySchema
>;

export const HoldemTournamentStandingSchema = z.object({
  userId: z.number().int().positive().nullable(),
  displayName: z.string().nullable(),
  seatIndex: z.number().int().nonnegative().nullable(),
  stackAmount: z.string(),
  active: z.boolean(),
  finishingPlace: z.number().int().positive().nullable().default(null),
  eliminatedAt: DateLikeSchema.nullable().default(null),
  prizeAmount: z.string().nullable().default(null),
});
export type HoldemTournamentStanding = z.infer<
  typeof HoldemTournamentStandingSchema
>;

export const HoldemTournamentPayoutSchema = z.object({
  place: z.number().int().positive(),
  userId: z.number().int().positive().nullable(),
  displayName: z.string().nullable(),
  amount: z.string(),
  awardedAt: DateLikeSchema.nullable().default(null),
});
export type HoldemTournamentPayout = z.infer<
  typeof HoldemTournamentPayoutSchema
>;

export const HoldemTournamentStateSchema = z.object({
  status: HoldemTournamentStatusSchema,
  buyInAmount: z.string(),
  startingStackAmount: z.string(),
  prizePoolAmount: z.string(),
  registeredCount: z.number().int().nonnegative(),
  payoutPlaces: z.number().int().positive(),
  allowRebuy: z.boolean().default(false),
  allowCashOut: z.boolean().default(false),
  completedAt: DateLikeSchema.nullable().default(null),
  standings: z.array(HoldemTournamentStandingSchema).default([]),
  payouts: z.array(HoldemTournamentPayoutSchema).default([]),
});
export type HoldemTournamentState = z.infer<
  typeof HoldemTournamentStateSchema
>;

export const HoldemTournamentCreateConfigSchema = z.object({
  startingStackAmount: z.string().min(1).max(32).optional(),
  payoutPlaces: z.number().int().min(1).max(9).optional(),
});
export type HoldemTournamentCreateConfig = z.infer<
  typeof HoldemTournamentCreateConfigSchema
>;

export const HoldemActionAvailabilitySchema = z.object({
  actions: z.array(HoldemActionSchema),
  toCall: z.string(),
  currentBet: z.string(),
  minimumRaiseTo: z.string().nullable(),
  maximumRaiseTo: z.string().nullable(),
  minimumBetTo: z.string(),
});
export type HoldemActionAvailability = z.infer<
  typeof HoldemActionAvailabilitySchema
>;

export const HoldemRecentHandSchema = z.object({
  roundId: z.string().nullable().default(null),
  handNumber: z.number().int().nonnegative(),
  stage: HoldemStreetSchema,
  boardCards: z.array(HoldemCardSchema).max(5),
  potAmount: z.string(),
  rakeAmount: z.string().default("0.00"),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
  winnerLabels: z.array(z.string()),
  settledAt: DateLikeSchema,
});
export type HoldemRecentHand = z.infer<typeof HoldemRecentHandSchema>;

export const HoldemRealtimeRecentHandSchema = z.object({
  roundId: z.string().nullable().default(null),
  handNumber: z.number().int().nonnegative(),
  stage: HoldemStreetSchema,
  boardCards: z.array(HoldemCardSchema).max(5),
  potAmount: z.string(),
  rakeAmount: z.string().default("0.00"),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
  winnerLabels: z.array(z.string()),
  settledAt: z.string().datetime(),
});
export type HoldemRealtimeRecentHand = z.infer<
  typeof HoldemRealtimeRecentHandSchema
>;

export const HoldemRealtimePublicSeatSchema = z.object({
  seatIndex: z.number().int().nonnegative(),
  userId: z.number().int().positive().nullable(),
  displayName: z.string().nullable(),
  isBot: z.boolean().default(false),
  connectionState: HoldemSeatPresenceStateSchema.nullable(),
  disconnectGraceExpiresAt: z.string().datetime().nullable(),
  seatLeaseExpiresAt: z.string().datetime().nullable(),
  autoCashOutPending: z.boolean(),
  turnDeadlineAt: z.string().datetime().nullable(),
  timeBankRemainingMs: z.number().int().nonnegative().default(0),
  stackAmount: z.string(),
  committedAmount: z.string(),
  totalCommittedAmount: z.string(),
  status: HoldemSeatStatusSchema.nullable(),
  inHand: z.boolean(),
  sittingOut: z.boolean(),
  isDealer: z.boolean(),
  isSmallBlind: z.boolean(),
  isBigBlind: z.boolean(),
  isCurrentTurn: z.boolean(),
  winner: z.boolean(),
  bestHand: HoldemBestHandSchema.nullable(),
  lastAction: z.string().nullable(),
  revealedCards: z.array(HoldemCardSchema).max(2),
});
export type HoldemRealtimePublicSeat = z.infer<
  typeof HoldemRealtimePublicSeatSchema
>;

export const HoldemRealtimePublicTableSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  linkedGroup: HoldemLinkedGroupSchema.nullable().default(null),
  tableType: HoldemTableTypeSchema,
  status: HoldemTableStatusSchema,
  rakePolicy: HoldemTableRakePolicySchema.nullable(),
  tournament: HoldemTournamentStateSchema.nullable().default(null),
  handNumber: z.number().int().nonnegative(),
  stage: HoldemStreetSchema.nullable(),
  smallBlind: z.string(),
  bigBlind: z.string(),
  minimumBuyIn: z.string(),
  maximumBuyIn: z.string(),
  maxSeats: z.number().int().min(HOLDEM_MIN_PLAYERS).max(9),
  occupiedSeats: z.number().int().nonnegative(),
  canStart: z.boolean(),
  communityCards: z.array(HoldemCardSchema).max(5),
  pots: z.array(HoldemPotSchema),
  seats: z.array(HoldemRealtimePublicSeatSchema).max(9),
  dealerSeatIndex: z.number().int().nonnegative().nullable(),
  smallBlindSeatIndex: z.number().int().nonnegative().nullable(),
  bigBlindSeatIndex: z.number().int().nonnegative().nullable(),
  pendingActorSeatIndex: z.number().int().nonnegative().nullable(),
  pendingActorDeadlineAt: z.string().datetime().nullable(),
  pendingActorTimeBankStartsAt: z.string().datetime().nullable(),
  pendingActorTimeoutAction: HoldemActionSchema.nullable(),
  fairness: HoldemFairnessSchema.nullable(),
  revealedSeatIndexes: z.array(z.number().int().nonnegative()),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()),
  recentHands: z.array(HoldemRealtimeRecentHandSchema),
  updatedAt: z.string().datetime(),
});
export type HoldemRealtimePublicTable = z.infer<
  typeof HoldemRealtimePublicTableSchema
>;

export const HoldemRealtimeTableTopicSchema = z
  .string()
  .regex(/^public:holdem:table:[1-9]\d*$/, "Invalid holdem realtime table topic.");
export type HoldemRealtimeTableTopic = z.infer<
  typeof HoldemRealtimeTableTopicSchema
>;

export const buildHoldemRealtimeTableTopic = (tableId: number) =>
  `public:holdem:table:${tableId}` as HoldemRealtimeTableTopic;

export const HoldemRealtimeUpdateSchema = z.object({
  table: HoldemRealtimePublicTableSchema,
  handHistoryId: z.number().int().positive().nullable(),
  roundId: z.string().nullable(),
  actorSeatIndex: z.number().int().nonnegative().nullable(),
  action: HoldemActionSchema.nullable(),
  timedOut: z.boolean(),
  eventTypes: z.array(z.string().min(1).max(64)).min(1),
});
export type HoldemRealtimeUpdate = z.infer<typeof HoldemRealtimeUpdateSchema>;

export const HoldemTableMessageSchema = z.object({
  id: z.number().int().positive(),
  tableId: z.number().int().positive(),
  userId: z.number().int().positive(),
  seatIndex: z.number().int().nonnegative(),
  displayName: z.string().min(1).max(64),
  kind: HoldemTableMessageKindSchema,
  text: z.string().min(1).max(HOLDEM_TABLE_MESSAGE_MAX_LENGTH).nullable(),
  emoji: HoldemTableEmojiSchema.nullable(),
  createdAt: DateLikeSchema,
});
export type HoldemTableMessage = z.infer<typeof HoldemTableMessageSchema>;

export const HoldemRealtimeTableMessageSchema = HoldemTableMessageSchema;
export type HoldemRealtimeTableMessage = z.infer<
  typeof HoldemRealtimeTableMessageSchema
>;

export const HoldemTableSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  linkedGroup: HoldemLinkedGroupSchema.nullable().default(null),
  tableType: HoldemTableTypeSchema,
  status: HoldemTableStatusSchema,
  rakePolicy: HoldemTableRakePolicySchema.nullable(),
  tournament: HoldemTournamentStateSchema.nullable().default(null),
  smallBlind: z.string(),
  bigBlind: z.string(),
  minimumBuyIn: z.string(),
  maximumBuyIn: z.string(),
  maxSeats: z.number().int().min(HOLDEM_MIN_PLAYERS).max(9),
  occupiedSeats: z.number().int().nonnegative(),
  heroSeatIndex: z.number().int().nonnegative().nullable(),
  canStart: z.boolean(),
  updatedAt: DateLikeSchema,
});
export type HoldemTableSummary = z.infer<typeof HoldemTableSummarySchema>;

export const HoldemTableSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  linkedGroup: HoldemLinkedGroupSchema.nullable().default(null),
  tableType: HoldemTableTypeSchema,
  status: HoldemTableStatusSchema,
  rakePolicy: HoldemTableRakePolicySchema.nullable(),
  tournament: HoldemTournamentStateSchema.nullable().default(null),
  handNumber: z.number().int().nonnegative(),
  stage: HoldemStreetSchema.nullable(),
  smallBlind: z.string(),
  bigBlind: z.string(),
  minimumBuyIn: z.string(),
  maximumBuyIn: z.string(),
  maxSeats: z.number().int().min(HOLDEM_MIN_PLAYERS).max(9),
  communityCards: z.array(HoldemCardViewSchema).max(5),
  pots: z.array(HoldemPotSchema),
  seats: z.array(HoldemSeatViewSchema).min(HOLDEM_MIN_PLAYERS),
  heroSeatIndex: z.number().int().nonnegative().nullable(),
  pendingActorSeatIndex: z.number().int().nonnegative().nullable(),
  pendingActorDeadlineAt: DateLikeSchema.nullable(),
  pendingActorTimeBankStartsAt: DateLikeSchema.nullable(),
  pendingActorTimeoutAction: HoldemActionSchema.nullable(),
  availableActions: HoldemActionAvailabilitySchema.nullable(),
  fairness: HoldemFairnessSchema.nullable(),
  recentHands: z.array(HoldemRecentHandSchema),
  dealerEvents: DealerFeedSchema.default([]),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type HoldemTable = z.infer<typeof HoldemTableSchema>;

export const HoldemTablesResponseSchema = z.object({
  currentTableId: z.number().int().positive().nullable(),
  activeTableIds: z.array(z.number().int().positive()).default([]),
  tables: z.array(HoldemTableSummarySchema),
});
export type HoldemTablesResponse = z.infer<typeof HoldemTablesResponseSchema>;

export const HoldemTableResponseSchema = z.object({
  table: HoldemTableSchema,
  tables: z.array(HoldemTableSchema).min(1),
});
export type HoldemTableResponse = z.infer<typeof HoldemTableResponseSchema>;

export const HoldemRealtimePrivateUpdateSchema = z.object({
  table: HoldemTableSchema,
  handHistoryId: z.number().int().positive().nullable(),
  roundId: z.string().nullable(),
  actorSeatIndex: z.number().int().nonnegative().nullable(),
  action: HoldemActionSchema.nullable(),
  timedOut: z.boolean(),
  eventTypes: z.array(z.string().min(1).max(64)).min(1),
});
export type HoldemRealtimePrivateUpdate = z.infer<
  typeof HoldemRealtimePrivateUpdateSchema
>;

export const HoldemPresenceResponseSchema = z.object({
  tableId: z.number().int().positive(),
  seatIndex: z.number().int().nonnegative(),
  sittingOut: z.boolean(),
  connectionState: HoldemSeatPresenceStateSchema,
  disconnectGraceExpiresAt: DateLikeSchema.nullable(),
  seatLeaseExpiresAt: DateLikeSchema.nullable(),
  autoCashOutPending: z.boolean(),
});
export type HoldemPresenceResponse = z.infer<
  typeof HoldemPresenceResponseSchema
>;

export const HoldemTableMessagesResponseSchema = z.object({
  tableId: z.number().int().positive(),
  messages: z.array(HoldemTableMessageSchema),
});
export type HoldemTableMessagesResponse = z.infer<
  typeof HoldemTableMessagesResponseSchema
>;

export const holdemRealtimeObservationSurfaceValues = [
  "web",
  "ios",
  "android",
] as const;

export const HoldemRealtimeObservationSurfaceSchema = z.enum(
  holdemRealtimeObservationSurfaceValues,
);
export type HoldemRealtimeObservationSurface = z.infer<
  typeof HoldemRealtimeObservationSurfaceSchema
>;

export const HoldemRealtimeObservationSchema = z.object({
  topic: z.string().min(1).max(160),
  event: z.string().min(1).max(120),
  sentAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  deliveryLatencyMs: z.number().finite().min(0).max(60_000),
  tableId: z.number().int().positive().nullable().default(null),
  roundId: z.string().min(1).max(128).nullable().default(null),
});
export type HoldemRealtimeObservation = z.infer<
  typeof HoldemRealtimeObservationSchema
>;

export const HoldemRealtimeObservationsRequestSchema = z.object({
  surface: HoldemRealtimeObservationSurfaceSchema,
  observations: z.array(HoldemRealtimeObservationSchema).min(1).max(100),
});
export type HoldemRealtimeObservationsRequest = z.infer<
  typeof HoldemRealtimeObservationsRequestSchema
>;

export const HoldemRealtimeObservationsResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
});
export type HoldemRealtimeObservationsResponse = z.infer<
  typeof HoldemRealtimeObservationsResponseSchema
>;

export const HoldemCreateTableRequestSchema = z.object({
  tableName: z.string().trim().min(1).max(64).optional(),
  buyInAmount: z.string().min(1).max(32),
  tableType: HoldemTableTypeSchema.optional(),
  maxSeats: z.number().int().min(HOLDEM_MIN_PLAYERS).max(9).optional(),
  botCount: z.number().int().min(0).max(HOLDEM_MAX_BOT_PLAYERS).optional(),
  tournament: HoldemTournamentCreateConfigSchema.optional(),
});
export type HoldemCreateTableRequest = z.infer<
  typeof HoldemCreateTableRequestSchema
>;

export const HoldemTableBotsRequestSchema = z.object({
  count: z.number().int().min(1).max(HOLDEM_MAX_BOT_PLAYERS),
  buyInAmount: z.string().min(1).max(32),
});
export type HoldemTableBotsRequest = z.infer<
  typeof HoldemTableBotsRequestSchema
>;

export const HoldemJoinTableRequestSchema = z.object({
  buyInAmount: z.string().min(1).max(32),
});
export type HoldemJoinTableRequest = z.infer<
  typeof HoldemJoinTableRequestSchema
>;

export const HoldemSeatModeRequestSchema = z.object({
  sittingOut: z.boolean(),
});
export type HoldemSeatModeRequest = z.infer<
  typeof HoldemSeatModeRequestSchema
>;

export const HoldemTableActionRequestSchema = z.object({
  action: HoldemActionSchema,
  amount: z.string().min(1).max(32).optional(),
});
export type HoldemTableActionRequest = z.infer<
  typeof HoldemTableActionRequestSchema
>;

export const HoldemTableMessageRequestSchema = z
  .object({
    kind: HoldemTableMessageKindSchema,
    text: z
      .string()
      .trim()
      .min(1)
      .max(HOLDEM_TABLE_MESSAGE_MAX_LENGTH)
      .optional(),
    emoji: HoldemTableEmojiSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "chat") {
      if (!value.text) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: "Chat messages require text.",
        });
      }
      return;
    }

    if (!value.emoji) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emoji"],
        message: "Emoji messages require an emoji.",
      });
    }
  });
export type HoldemTableMessageRequest = z.infer<
  typeof HoldemTableMessageRequestSchema
>;
