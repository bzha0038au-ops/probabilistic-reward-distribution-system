import { z } from "zod";
import { sql } from "@reward/database/orm";
import {
  HoldemBestHandSchema,
  HoldemCardSchema,
  HoldemFairnessSchema,
  HoldemLinkedGroupSchema,
  HoldemTableEmojiSchema,
  HoldemTableMessageKindSchema,
  HoldemTournamentPayoutSchema,
  HoldemTableRakePolicySchema,
  HoldemTournamentStandingSchema,
  HoldemTournamentStatusSchema,
  type HoldemTableMessage,
  HoldemPotSchema,
  HoldemRecentHandSchema,
  type HoldemSeatPresenceState,
  HoldemSeatStatusSchema,
  HoldemStreetSchema,
  HoldemTableStatusSchema,
  HoldemTableTypeSchema,
} from "@reward/shared-types/holdem";
import { DealerFeedSchema } from "@reward/shared-types/dealer";

import type { DbClient, DbTransaction } from "../../db";
import { internalInvariantError } from "../../shared/errors";
import { readSqlRows } from "../../shared/sql-result";
import { parseSchema } from "../../shared/validation";

export type DbExecutor = DbClient | DbTransaction;

const DateLikeSchema = z.union([z.date(), z.string()]);
const parseMaybeJsonString = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};
const HoldemHoleCardsColumnSchema = z.preprocess(
  parseMaybeJsonString,
  z.array(HoldemCardSchema).max(2),
) as z.ZodType<z.infer<typeof HoldemCardSchema>[]>;
const NullableJsonColumnSchema: z.ZodType<unknown | null | undefined> =
  z.preprocess(parseMaybeJsonString, z.unknown().nullable().optional());

export const HoldemSeatTournamentMetadataSchema = z
  .object({
    entryBuyInAmount: z.string(),
    registeredAt: DateLikeSchema,
    eliminatedAt: DateLikeSchema.nullable().default(null),
    finishingPlace: z.number().int().positive().nullable().default(null),
    prizeAmount: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

export const HoldemSeatBotMetadataSchema = z
  .object({
    enabled: z.boolean().default(true),
    displayName: z.string().trim().min(1).max(64),
    behaviorVersion: z.string().trim().min(1).max(32).default("casual-v1"),
    ownerUserId: z.number().int().positive().nullable().default(null),
  })
  .nullable()
  .default(null);

export const HoldemSeatMetadataSchema = z
  .object({
    sittingOut: z.boolean().default(false),
    sitOutSource: z.enum(["manual", "presence"]).nullable().default(null),
    timeBankRemainingMs: z.number().int().nonnegative().default(0),
    winner: z.boolean().default(false),
    bestHand: HoldemBestHandSchema.nullable().default(null),
    bot: HoldemSeatBotMetadataSchema,
    tournament: HoldemSeatTournamentMetadataSchema,
  })
  .default({
    sittingOut: false,
    sitOutSource: null,
    timeBankRemainingMs: 0,
    winner: false,
    bestHand: null,
    bot: null,
    tournament: null,
  });

export const HoldemTableTournamentMetadataSchema = z
  .object({
    status: HoldemTournamentStatusSchema.default("registering"),
    buyInAmount: z.string(),
    startingStackAmount: z.string(),
    prizePoolAmount: z.string().default("0.00"),
    registeredCount: z.number().int().nonnegative().default(0),
    payoutPlaces: z.number().int().positive().nullable().default(null),
    allowRebuy: z.boolean().default(false),
    allowCashOut: z.boolean().default(false),
    completedAt: DateLikeSchema.nullable().default(null),
    standings: z.array(HoldemTournamentStandingSchema).default([]),
    payouts: z.array(HoldemTournamentPayoutSchema).default([]),
  })
  .nullable()
  .default(null);

export const HoldemTableMetadataSchema = z.object({
  tableType: HoldemTableTypeSchema.default("cash"),
  linkedGroup: HoldemLinkedGroupSchema.nullable().default(null),
  rakePolicy: HoldemTableRakePolicySchema.nullable().default(null),
  tournament: HoldemTableTournamentMetadataSchema,
  handNumber: z.number().int().nonnegative().default(0),
  stage: HoldemStreetSchema.nullable().default(null),
  dealerSeatIndex: z.number().int().nonnegative().nullable().default(null),
  smallBlindSeatIndex: z.number().int().nonnegative().nullable().default(null),
  bigBlindSeatIndex: z.number().int().nonnegative().nullable().default(null),
  pendingActorSeatIndex: z.number().int().nonnegative().nullable().default(null),
  turnStartedAt: DateLikeSchema.nullable().default(null),
  turnTimeBankStartsAt: DateLikeSchema.nullable().default(null),
  turnTimeBankAllocatedMs: z.number().int().nonnegative().default(0),
  currentBet: z.string().default("0.00"),
  lastFullRaiseSize: z.string().default("0.00"),
  actedSeatIndexes: z.array(z.number().int().nonnegative()).default([]),
  communityCards: z.array(HoldemCardSchema).max(5).default([]),
  deck: z.array(HoldemCardSchema).max(52).default([]),
  nextCardIndex: z.number().int().nonnegative().default(0),
  fairnessSeed: z.string().nullable().default(null),
  activeHandHistoryId: z.number().int().positive().nullable().default(null),
  fairness: HoldemFairnessSchema.nullable().default(null),
  revealedSeatIndexes: z.array(z.number().int().nonnegative()).default([]),
  winnerSeatIndexes: z.array(z.number().int().nonnegative()).default([]),
  resolvedPots: z.array(HoldemPotSchema).default([]),
  recentHands: z.array(HoldemRecentHandSchema).default([]),
  dealerEvents: DealerFeedSchema.default([]),
});

export const HoldemTableRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: HoldemTableStatusSchema,
  smallBlind: z.union([z.string(), z.number()]),
  bigBlind: z.union([z.string(), z.number()]),
  minimumBuyIn: z.union([z.string(), z.number()]),
  maximumBuyIn: z.union([z.string(), z.number()]),
  maxSeats: z.number().int().min(2).max(9),
  metadata: NullableJsonColumnSchema,
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});

export const HoldemTableRowsSchema = z.array(HoldemTableRowSchema);

export const HoldemSeatRowSchema = z.object({
  id: z.number().int().positive(),
  tableId: z.number().int().positive(),
  seatIndex: z.number().int().nonnegative(),
  userId: z.number().int().positive(),
  userEmail: z.string().nullable().optional(),
  stackAmount: z.union([z.string(), z.number()]),
  committedAmount: z.union([z.string(), z.number()]),
  totalCommittedAmount: z.union([z.string(), z.number()]),
  status: HoldemSeatStatusSchema,
  presenceHeartbeatAt: DateLikeSchema.nullable().optional(),
  disconnectGraceExpiresAt: DateLikeSchema.nullable().optional(),
  seatLeaseExpiresAt: DateLikeSchema.nullable().optional(),
  autoCashOutPending: z.boolean().optional(),
  turnDeadlineAt: DateLikeSchema.nullable().optional(),
  holeCards: HoldemHoleCardsColumnSchema,
  lastAction: z.string().nullable().optional(),
  metadata: NullableJsonColumnSchema,
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});

export const HoldemSeatRowsSchema = z.array(HoldemSeatRowSchema);

export const HoldemTableMessageRowSchema = z.object({
  id: z.number().int().positive(),
  tableId: z.number().int().positive(),
  userId: z.number().int().positive(),
  seatIndex: z.number().int().nonnegative(),
  userEmail: z.string().nullable().optional(),
  kind: HoldemTableMessageKindSchema,
  text: z.string().nullable().optional(),
  emoji: HoldemTableEmojiSchema.nullable().optional(),
  createdAt: DateLikeSchema,
});

export const HoldemTableMessageRowsSchema = z.array(HoldemTableMessageRowSchema);

export type HoldemTableMetadata = z.infer<typeof HoldemTableMetadataSchema>;
export type HoldemSeatMetadata = z.infer<typeof HoldemSeatMetadataSchema>;
export type HoldemSeatBotMetadata = z.infer<typeof HoldemSeatBotMetadataSchema>;
export type HoldemTableRow = z.infer<typeof HoldemTableRowSchema>;
export type HoldemSeatRow = z.infer<typeof HoldemSeatRowSchema>;
export type HoldemTableMessageRow = z.infer<typeof HoldemTableMessageRowSchema>;
export type HoldemSeatState = Omit<HoldemSeatRow, "metadata"> & {
  metadata: HoldemSeatMetadata;
};
export type HoldemTableState = Omit<HoldemTableRow, "metadata"> & {
  metadata: HoldemTableMetadata;
  seats: HoldemSeatState[];
};

export const parseSqlRows = <T>(
  schema: z.ZodType<T[]>,
  result: unknown,
  errorMessage: string,
) => {
  const rawRows = readSqlRows<T>(result);
  const parsed = parseSchema(schema, rawRows);
  if (!parsed.isValid) {
    throw internalInvariantError(errorMessage, {
      details: parsed.errors,
    });
  }
  return parsed.data;
};

export const parseTableMetadata = (value: unknown): HoldemTableMetadata => {
  const parsed = parseSchema(
    HoldemTableMetadataSchema,
    parseMaybeJsonString(value) ?? {},
  );
  if (!parsed.isValid) {
    throw internalInvariantError("Invalid holdem table metadata.");
  }
  return parsed.data;
};

export const parseSeatMetadata = (value: unknown): HoldemSeatMetadata => {
  const parsed = parseSchema(
    HoldemSeatMetadataSchema,
    parseMaybeJsonString(value) ?? {},
  );
  if (!parsed.isValid) {
    throw internalInvariantError("Invalid holdem seat metadata.");
  }
  return parsed.data;
};

export const toSeatState = (row: HoldemSeatRow): HoldemSeatState => ({
  ...row,
  autoCashOutPending: row.autoCashOutPending ?? false,
  metadata: parseSeatMetadata(row.metadata),
});

export const toTableState = (
  row: HoldemTableRow,
  seats: HoldemSeatRow[],
): HoldemTableState => ({
  ...row,
  metadata: parseTableMetadata(row.metadata),
  seats: seats.map(toSeatState).sort((left, right) => left.seatIndex - right.seatIndex),
});

export const toJsonbLiteral = (value: unknown) =>
  sql.raw(`'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`);

export const isBotSeat = (seat: Pick<HoldemSeatState, "metadata">) =>
  seat.metadata.bot?.enabled === true;

export const resolveSeatDisplayName = (
  userId: number,
  userEmail?: string | null,
  seatMetadata?: HoldemSeatMetadata | null,
) => {
  const botDisplayName = seatMetadata?.bot?.displayName?.trim();
  if (botDisplayName) {
    return botDisplayName;
  }

  const email = userEmail?.trim();
  if (!email) {
    return `User ${userId}`;
  }

  const [localPart] = email.split("@");
  if (!localPart) {
    return `User ${userId}`;
  }

  return localPart.length > 18 ? `${localPart.slice(0, 18)}…` : localPart;
};

export const toHoldemTableMessage = (
  row: HoldemTableMessageRow,
): HoldemTableMessage => ({
  id: row.id,
  tableId: row.tableId,
  userId: row.userId,
  seatIndex: row.seatIndex,
  displayName: resolveSeatDisplayName(row.userId, row.userEmail),
  kind: row.kind,
  text: row.text ?? null,
  emoji: row.emoji ?? null,
  createdAt: row.createdAt,
});

export const resolveSeatPresenceState = (
  seat: Pick<
    HoldemSeatState,
    "presenceHeartbeatAt" | "disconnectGraceExpiresAt" | "seatLeaseExpiresAt"
  >,
  now = new Date(),
): HoldemSeatPresenceState | null => {
  const graceExpiresAt = seat.disconnectGraceExpiresAt
    ? new Date(seat.disconnectGraceExpiresAt)
    : null;
  const leaseExpiresAt = seat.seatLeaseExpiresAt
    ? new Date(seat.seatLeaseExpiresAt)
    : null;
  const heartbeatAt = seat.presenceHeartbeatAt
    ? new Date(seat.presenceHeartbeatAt)
    : null;

  if (graceExpiresAt && graceExpiresAt.getTime() > now.getTime()) {
    if (
      heartbeatAt &&
      now.getTime() - heartbeatAt.getTime() <= 2 * 10_000 + 2_000
    ) {
      return "connected";
    }

    return "grace";
  }

  if (leaseExpiresAt && leaseExpiresAt.getTime() > now.getTime()) {
    return "disconnected";
  }

  return null;
};
