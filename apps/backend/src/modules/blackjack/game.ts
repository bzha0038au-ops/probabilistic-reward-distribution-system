import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";
import { sql } from "@reward/database/orm";
import {
  BLACKJACK_CONFIG,
  BLACKJACK_TURN_TIMEOUT_ACTION,
  BlackjackCardSchema,
  BlackjackConfigSchema,
  BlackjackFairnessSchema,
  BlackjackGameStatusSchema,
  BlackjackTableSchema,
  type BlackjackCard,
  type BlackjackConfig,
  type BlackjackFairness,
  type BlackjackTable,
} from "@reward/shared-types/blackjack";
import { DealerFeedSchema } from "@reward/shared-types/dealer";
import {
  PlayModeSnapshotSchema,
  type PlayModeSnapshot,
} from "@reward/shared-types/play-mode";

import type { DbClient, DbTransaction } from "../../db";
import { badRequestError, internalInvariantError } from "../../shared/errors";
import { toDecimal } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { parseSchema } from "../../shared/validation";

export const BLACKJACK_REFERENCE_TYPE = "blackjack_game";
export const MAX_RECENT_GAMES = 5;
export const BLACKJACK_AI_DEALER_ID = "ai-dealer:default";

const DEFAULT_PLAY_MODE_SNAPSHOT: PlayModeSnapshot = {
  type: "standard",
  appliedMultiplier: 1,
  nextMultiplier: 1,
  streak: 0,
  lastOutcome: null,
  carryActive: false,
};

export type DbExecutor = DbClient | DbTransaction;

const DateLikeSchema = z.union([z.date(), z.string()]);

const blackjackPlayerHandProgressValues = [
  "active",
  "waiting",
  "stood",
  "bust",
] as const;

const BlackjackPlayerHandProgressSchema = z.enum(
  blackjackPlayerHandProgressValues,
);

const BlackjackStoredPlayerHandSchema = z.object({
  cards: z.array(BlackjackCardSchema).min(1),
  stakeAmount: z.string(),
  state: BlackjackPlayerHandProgressSchema.default("active"),
  splitFromAces: z.boolean().default(false),
});

const BlackjackStoredConfigSchema = BlackjackConfigSchema.partial()
  .transform((value) => ({
    ...BLACKJACK_CONFIG,
    ...value,
  }))
  .pipe(BlackjackConfigSchema);

const BlackjackActionHistoryEntrySchema = z.object({
  action: z.string(),
  actor: z.enum(["player", "dealer", "system"]),
  card: BlackjackCardSchema.optional(),
  handIndex: z.number().int().nonnegative().optional(),
  total: z.number().int().nullable().optional(),
  status: BlackjackGameStatusSchema.optional(),
});

export const BlackjackMetadataSchema = z.object({
  config: BlackjackStoredConfigSchema.default(BLACKJACK_CONFIG),
  fairness: BlackjackFairnessSchema,
  table: BlackjackTableSchema.optional(),
  actionHistory: z.array(BlackjackActionHistoryEntrySchema).default([]),
  playMode: PlayModeSnapshotSchema.default(DEFAULT_PLAY_MODE_SNAPSHOT),
  playerHands: z.array(BlackjackStoredPlayerHandSchema).default([]),
  activeHandIndex: z.number().int().nonnegative().nullable().default(0),
  dealerEvents: DealerFeedSchema.default([]),
});

const BlackjackGameRowSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  stakeAmount: z.union([z.string(), z.number()]),
  totalStake: z.union([z.string(), z.number()]),
  payoutAmount: z.union([z.string(), z.number()]),
  playerCards: z.array(BlackjackCardSchema),
  dealerCards: z.array(BlackjackCardSchema),
  deck: z.array(BlackjackCardSchema),
  nextCardIndex: z.number().int().nonnegative(),
  status: BlackjackGameStatusSchema,
  turnDeadlineAt: DateLikeSchema.nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  settledAt: DateLikeSchema.nullable().optional(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});

export const BlackjackGameRowsSchema = z.array(BlackjackGameRowSchema);

const LockedBlackjackUserRowSchema = z.object({
  id: z.number().int().positive(),
  withdrawable_balance: z.union([z.string(), z.number()]),
  wagered_amount: z.union([z.string(), z.number()]),
});

export const LockedBlackjackUserRowsSchema = z.array(
  LockedBlackjackUserRowSchema,
);

export type BlackjackGameRow = z.infer<typeof BlackjackGameRowSchema>;
export type LockedBlackjackUserRow = z.infer<
  typeof LockedBlackjackUserRowSchema
>;
export type BlackjackMetadata = z.infer<typeof BlackjackMetadataSchema>;
export type ResolvedBlackjackMetadata = Omit<BlackjackMetadata, "table"> & {
  table: BlackjackTable;
};
export type BlackjackStoredPlayerHand = z.infer<
  typeof BlackjackStoredPlayerHandSchema
>;
export type BlackjackGameState = Omit<BlackjackGameRow, "metadata"> & {
  metadata: ResolvedBlackjackMetadata;
};

export type BlackjackActionHistoryEntry = z.infer<
  typeof BlackjackActionHistoryEntrySchema
>;

const buildBlackjackTableId = (params: {
  userId: number;
  fairness: BlackjackFairness;
}) => {
  const nonceFragment = params.fairness.clientNonce.slice(0, 12) || "auto";
  return `bj-${params.fairness.epoch}-${params.userId}-${nonceFragment}`;
};

export const buildBlackjackTable = (params: {
  userId: number;
  fairness: BlackjackFairness;
  tableId?: string;
}): BlackjackTable => ({
  tableId: params.tableId ?? buildBlackjackTableId(params),
  capacity: 2,
  sharedDeck: true,
  currentTurnSeatIndex: 1,
  turnTimeoutAction: BLACKJACK_TURN_TIMEOUT_ACTION,
  seats: [
    {
      seatIndex: 0,
      role: "dealer",
      participantType: "ai_robot",
      participantId: BLACKJACK_AI_DEALER_ID,
      isSelf: false,
      turnDeadlineAt: null,
    },
    {
      seatIndex: 1,
      role: "player",
      participantType: "human_user",
      participantId: `user:${params.userId}`,
      isSelf: true,
      turnDeadlineAt: null,
    },
  ],
});

export const resolveBlackjackTable = (params: {
  userId: number;
  fairness: BlackjackFairness;
  table?: BlackjackTable;
}): BlackjackTable =>
  params.table
    ? params.table
    : buildBlackjackTable({
        userId: params.userId,
        fairness: params.fairness,
      });

export const parseSqlRows = <T>(
  schema: z.ZodType<T[]>,
  result: unknown,
  errorMessage: string,
) => {
  const parsed = parseSchema(schema, readSqlRows<T>(result));
  if (!parsed.isValid) {
    throw internalInvariantError(errorMessage);
  }
  return parsed.data;
};

export const toJsonbLiteral = (value: unknown) =>
  sql.raw(`'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`);

export const resolveClientNonce = (value?: string | null) => {
  const rawNonce = value ? String(value).trim() : "";
  if (!rawNonce) {
    return {
      clientNonce: randomBytes(16).toString("hex"),
      nonceSource: "server" as const,
    };
  }

  return {
    clientNonce: rawNonce,
    nonceSource: "client" as const,
  };
};

export const buildFairnessAlgorithmLabel = (config: BlackjackConfig) =>
  `sha256(seed:userId:clientNonce:step)%remaining -> deck; deal P1,D1,P2,D2; dealer ${
    config.dealerHitsSoft17 ? "hits soft 17s" : "stands on all 17s"
  }; double down ${config.doubleDownAllowed ? "enabled" : "disabled"}; split aces ${
    config.splitAcesAllowed ? "enabled" : "disabled"
  }; hit split aces ${config.hitSplitAcesAllowed ? "enabled" : "disabled"}; re-split ${
    config.resplitAllowed
      ? `enabled up to ${config.maxSplitHands} hands`
      : "disabled"
  }; 10-value mixed split ${
    config.splitTenValueCardsAllowed ? "enabled" : "disabled"
  }`;

export const resolveStakeAmount = (value: string) => {
  let stakeAmount;
  try {
    stakeAmount = toDecimal(value);
  } catch {
    throw badRequestError("Invalid stake amount.");
  }

  if (
    !stakeAmount.isFinite() ||
    stakeAmount.lte(0) ||
    stakeAmount.decimalPlaces() > 2
  ) {
    throw badRequestError("Invalid stake amount.");
  }

  return stakeAmount;
};

const rankValue = (rank: BlackjackCard["rank"]) => {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank);
};

export const isTenValueRank = (rank: BlackjackCard["rank"]) =>
  rankValue(rank) === 10;

export const scoreBlackjackCards = (cards: BlackjackCard[]) => {
  let total = 0;
  let softAceCount = 0;

  for (const card of cards) {
    total += rankValue(card.rank);
    if (card.rank === "A") {
      softAceCount += 1;
    }
  }

  while (total > 21 && softAceCount > 0) {
    total -= 10;
    softAceCount -= 1;
  }

  return {
    total,
    soft: softAceCount > 0,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
};

const createStandardDeck = (): BlackjackCard[] => {
  const deck: BlackjackCard[] = [];
  for (const suit of ["spades", "hearts", "diamonds", "clubs"] as const) {
    for (const rank of [
      "A",
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
    ] as const) {
      deck.push({ rank, suit });
    }
  }
  return deck;
};

export const drawBlackjackDeck = (params: {
  seed: string;
  userId: number;
  clientNonce: string;
}) => {
  const { seed, userId, clientNonce } = params;
  const availableCards = createStandardDeck();
  const deck: BlackjackCard[] = [];
  const digests: string[] = [];

  for (let step = 0; step < 52; step += 1) {
    const digest = createHash("sha256")
      .update(`${seed}:${userId}:${clientNonce}:${step}`)
      .digest();
    const rawDigest = digest.toString("hex");
    const nextIndex = digest.readUInt32BE(0) % availableCards.length;
    const [card] = availableCards.splice(nextIndex, 1);
    if (!card) {
      throw internalInvariantError("Failed to shuffle blackjack deck.");
    }
    digests.push(rawDigest);
    deck.push(card);
  }

  const deckDigest = createHash("sha256")
    .update(deck.map((card) => `${card.rank}-${card.suit}`).join(":"))
    .digest("hex");

  return {
    deck,
    rngDigest: createHash("sha256").update(digests.join(":")).digest("hex"),
    deckDigest,
  };
};
