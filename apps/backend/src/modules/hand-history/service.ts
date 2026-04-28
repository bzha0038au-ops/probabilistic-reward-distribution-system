import { z } from "zod";
import { handHistories, roundEvents, tableEvents } from "@reward/database";
import { and, asc, eq, sql } from "@reward/database/orm";
import {
  HandHistoryEventPayloadSchema,
  HandHistorySchema,
  type HandHistory,
  type HandHistoryEventActor,
  type HandHistoryEventPayload,
  type HandHistoryRoundType,
} from "@reward/shared-types/hand-history";

import { db, type DbClient, type DbTransaction } from "../../db";
import { notFoundError } from "../../shared/errors";
import { parseSchema } from "../../shared/validation";
import { buildRoundId, parseRoundId } from "./round-id";

type DbExecutor = DbClient | DbTransaction;

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

const RoundEventRowSchema = z.object({
  roundType: z.enum(["blackjack", "quick_eight", "holdem"]),
  roundEntityId: z.number().int().positive(),
  userId: z.number().int().positive().nullable(),
  eventIndex: z.number().int().nonnegative(),
  eventType: z.string().min(1).max(64),
  actor: z.enum(["player", "dealer", "system"]),
  payload: HandHistoryEventPayloadSchema,
  createdAt: z.date(),
});

const RoundEventRowsSchema = z.array(RoundEventRowSchema);

const TableEventRowSchema = z.object({
  tableType: z.literal("holdem"),
  tableId: z.number().int().positive(),
  seatIndex: z.number().int().nonnegative().nullable(),
  userId: z.number().int().positive().nullable(),
  handHistoryId: z.number().int().positive().nullable(),
  phase: z.string().nullable(),
  eventIndex: z.number().int().nonnegative(),
  eventType: z.string().min(1).max(64),
  actor: z.enum(["player", "dealer", "system"]),
  payload: HandHistoryEventPayloadSchema,
  createdAt: z.date(),
});

const TableEventRowsSchema = z.array(TableEventRowSchema);

const ParticipantUserIdsSchema = z.preprocess(
  parseMaybeJsonString,
  z.array(z.number().int().positive()),
);

const HoldemHandHistoryRowSchema = z.object({
  id: z.number().int().positive(),
  roundType: z.literal("holdem"),
  referenceId: z.number().int().positive(),
  participantUserIds: ParticipantUserIdsSchema,
  status: z.string().min(1).max(32),
  summary: z.preprocess(parseMaybeJsonString, HandHistoryEventPayloadSchema),
  fairness: z.preprocess(
    parseMaybeJsonString,
    HandHistoryEventPayloadSchema.nullable(),
  ),
  startedAt: z.date(),
  settledAt: z.date().nullable(),
});

type AppendRoundEventInput = {
  type: string;
  actor: HandHistoryEventActor;
  payload: HandHistoryEventPayload;
  userId?: number | null;
  createdAt?: Date;
};

const parseRoundEventRows = (rows: unknown) => {
  const parsed = parseSchema(RoundEventRowsSchema, rows);
  if (!parsed.isValid) {
    throw notFoundError("Hand history not found.");
  }
  return parsed.data;
};

const parseTableEventRows = (rows: unknown) => {
  const parsed = parseSchema(TableEventRowsSchema, rows);
  if (!parsed.isValid) {
    throw notFoundError("Hand history not found.");
  }
  return parsed.data;
};

const asObject = (
  value: unknown,
): HandHistoryEventPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as HandHistoryEventPayload;
};

const readStringField = (
  payload: HandHistoryEventPayload | null,
  key: string,
) => {
  const value = payload?.[key];
  return typeof value === "string" ? value : null;
};

const readNumberArrayField = (
  payload: HandHistoryEventPayload | null,
  key: string,
) => {
  const value = payload?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is number =>
      typeof entry === "number" && Number.isInteger(entry) && entry >= 0,
  );
};

const readObjectArrayField = (
  payload: HandHistoryEventPayload | null,
  key: string,
) => {
  const value = payload?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
};

const sanitizeHoldemParticipants = (
  summary: HandHistoryEventPayload | null,
  viewerUserId: number,
) => {
  const visibleSeatIndexes = new Set(readNumberArrayField(summary, "revealedSeatIndexes"));
  const participants = readObjectArrayField(summary, "participants");
  const viewerParticipant = participants.find(
    (participant) => participant.userId === viewerUserId,
  );
  const viewerSeatIndex =
    typeof viewerParticipant?.seatIndex === "number"
      ? viewerParticipant.seatIndex
      : null;
  if (viewerSeatIndex !== null) {
    visibleSeatIndexes.add(viewerSeatIndex);
  }

  return participants.map((participant) => {
    const seatIndex =
      typeof participant.seatIndex === "number" ? participant.seatIndex : null;
    if (seatIndex !== null && visibleSeatIndexes.has(seatIndex)) {
      return participant;
    }

    if (!("holeCards" in participant)) {
      return participant;
    }

    const next = { ...participant };
    delete next.holeCards;
    return next;
  });
};

const sanitizeHoldemSummary = (
  summary: HandHistoryEventPayload | null,
  viewerUserId: number,
) => {
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    participants: sanitizeHoldemParticipants(summary, viewerUserId),
  } satisfies HandHistoryEventPayload;
};

const sanitizeHoldemEventPayload = (params: {
  payload: HandHistoryEventPayload;
  viewerUserId: number;
  summary: HandHistoryEventPayload | null;
}) => {
  const { payload, viewerUserId, summary } = params;
  const visibleSeatIndexes = new Set(
    sanitizeHoldemParticipants(summary, viewerUserId)
      .map((participant) =>
        typeof participant.seatIndex === "number" ? participant.seatIndex : null,
      )
      .filter((seatIndex): seatIndex is number => seatIndex !== null),
  );

  const seats = readObjectArrayField(payload, "seats");
  const participants = readObjectArrayField(payload, "participants");
  const nextPayload: HandHistoryEventPayload = { ...payload };

  if (seats.length > 0) {
    nextPayload.seats = seats.map((seat) => {
      const seatIndex = typeof seat.seatIndex === "number" ? seat.seatIndex : null;
      if (seatIndex !== null && visibleSeatIndexes.has(seatIndex)) {
        return seat;
      }
      if (!("holeCards" in seat)) {
        return seat;
      }
      const nextSeat = { ...seat };
      delete nextSeat.holeCards;
      return nextSeat;
    });
  }

  if (participants.length > 0) {
    nextPayload.participants = sanitizeHoldemParticipants(summary, viewerUserId);
  }

  return nextPayload;
};

const buildHistorySummary = (params: {
  roundType: HandHistoryRoundType;
  roundEntityId: number;
  userId: number;
  rows: ReturnType<typeof parseRoundEventRows>;
}): HandHistory => {
  const { roundType, roundEntityId, userId, rows } = params;
  const events = rows.map((row) => ({
    sequence: row.eventIndex,
    type: row.eventType,
    actor: row.actor,
    payload: row.payload,
    createdAt: row.createdAt,
  }));
  const startRow =
    rows.find((row) => row.eventType === "round_started") ?? rows[0];
  const settledRow = [...rows]
    .reverse()
    .find((row) => row.eventType === "round_settled");
  const lastStakeRow = [...rows]
    .reverse()
    .find((row) => row.eventType === "stake_debited");
  const startPayload = asObject(startRow?.payload);
  const settledPayload = asObject(settledRow?.payload);
  const lastStakePayload = asObject(lastStakeRow?.payload);
  const fairness = asObject(startPayload?.fairness);

  const parsed = parseSchema(HandHistorySchema, {
    roundId: buildRoundId({ roundType, roundEntityId }),
    roundType,
    referenceId: roundEntityId,
    userId,
    status: readStringField(settledPayload, "status") ?? "active",
    stakeAmount: readStringField(startPayload, "stakeAmount") ?? "0.00",
    totalStake:
      readStringField(settledPayload, "totalStake") ??
      readStringField(lastStakePayload, "totalStake") ??
      readStringField(startPayload, "totalStake") ??
      readStringField(startPayload, "stakeAmount") ??
      "0.00",
    payoutAmount: readStringField(settledPayload, "payoutAmount") ?? "0.00",
    fairness,
    startedAt: startRow?.createdAt ?? rows[0]?.createdAt ?? new Date(),
    settledAt: settledRow?.createdAt ?? null,
    events,
    tableEvents: [],
  });

  if (!parsed.isValid) {
    throw notFoundError("Hand history not found.");
  }

  return parsed.data;
};

const buildHoldemHistory = (params: {
  row: z.infer<typeof HoldemHandHistoryRowSchema>;
  userId: number;
  rows: ReturnType<typeof parseRoundEventRows>;
  tableRows: ReturnType<typeof parseTableEventRows>;
}): HandHistory => {
  const summary = sanitizeHoldemSummary(params.row.summary, params.userId);
  const participantSummaries = readObjectArrayField(summary, "participants");
  const viewerParticipant =
    participantSummaries.find(
      (participant) => participant.userId === params.userId,
    ) ?? null;
  const stakeAmount =
    typeof viewerParticipant?.contributionAmount === "string"
      ? viewerParticipant.contributionAmount
      : "0.00";
  const payoutAmount =
    typeof viewerParticipant?.payoutAmount === "string"
      ? viewerParticipant.payoutAmount
      : "0.00";

  const parsed = parseSchema(HandHistorySchema, {
    roundId: buildRoundId({
      roundType: params.row.roundType,
      roundEntityId: params.row.id,
    }),
    roundType: params.row.roundType,
    referenceId: params.row.referenceId,
    userId: params.userId,
    status: params.row.status,
    stakeAmount,
    totalStake: stakeAmount,
    payoutAmount,
    fairness: params.row.fairness,
    summary,
    startedAt: params.row.startedAt,
    settledAt: params.row.settledAt,
    events: params.rows.map((row) => ({
      sequence: row.eventIndex,
      type: row.eventType,
      actor: row.actor,
      payload: sanitizeHoldemEventPayload({
        payload: row.payload,
        viewerUserId: params.userId,
        summary,
      }),
      createdAt: row.createdAt,
    })),
    tableEvents: params.tableRows.map((row) => ({
      sequence: row.eventIndex,
      type: row.eventType,
      actor: row.actor,
      seatIndex: row.seatIndex,
      userId: row.userId,
      handHistoryId: row.handHistoryId,
      phase: row.phase,
      payload: sanitizeHoldemEventPayload({
        payload: row.payload,
        viewerUserId: params.userId,
        summary,
      }),
      createdAt: row.createdAt,
    })),
  });

  if (!parsed.isValid) {
    throw notFoundError("Hand history not found.");
  }

  return parsed.data;
};

export const appendRoundEvents = async (
  tx: DbTransaction,
  params: {
    roundType: HandHistoryRoundType;
    roundEntityId: number;
    userId?: number | null;
    events: AppendRoundEventInput[];
  },
) => {
  if (params.events.length === 0) {
    return;
  }

  const [row] = await tx
    .select({
      maxEventIndex: sql<number>`coalesce(max(${roundEvents.eventIndex}), -1)`,
    })
    .from(roundEvents)
    .where(
      and(
        eq(roundEvents.roundType, params.roundType),
        eq(roundEvents.roundEntityId, params.roundEntityId),
      ),
    );

  const nextEventIndex = Number(row?.maxEventIndex ?? -1) + 1;

  await tx.insert(roundEvents).values(
    params.events.map((event, index) => ({
      roundType: params.roundType,
      roundEntityId: params.roundEntityId,
      userId: event.userId ?? params.userId ?? null,
      eventIndex: nextEventIndex + index,
      eventType: event.type,
      actor: event.actor,
      payload: event.payload,
      createdAt: event.createdAt ?? new Date(),
    })),
  );
};

export const appendRoundEvent = async (
  tx: DbTransaction,
  params: {
    roundType: HandHistoryRoundType;
    roundEntityId: number;
    userId?: number | null;
    event: AppendRoundEventInput;
  },
) =>
  appendRoundEvents(tx, {
    roundType: params.roundType,
    roundEntityId: params.roundEntityId,
    userId: params.userId ?? null,
    events: [params.event],
  });

const loadRoundEventRows = async (
  executor: DbExecutor,
  params: {
    roundType: HandHistoryRoundType;
    roundEntityId: number;
    userId?: number;
  },
) => {
  const conditions = [
    eq(roundEvents.roundType, params.roundType),
    eq(roundEvents.roundEntityId, params.roundEntityId),
  ];
  if (typeof params.userId === "number") {
    conditions.push(eq(roundEvents.userId, params.userId));
  }

  const rows = await executor
    .select({
      roundType: roundEvents.roundType,
      roundEntityId: roundEvents.roundEntityId,
      userId: roundEvents.userId,
      eventIndex: roundEvents.eventIndex,
      eventType: roundEvents.eventType,
      actor: roundEvents.actor,
      payload: roundEvents.payload,
      createdAt: roundEvents.createdAt,
    })
    .from(roundEvents)
    .where(
      and(...conditions),
    )
    .orderBy(asc(roundEvents.eventIndex));

  return parseRoundEventRows(rows);
};

const loadHoldemHandHistoryRow = async (
  executor: DbExecutor,
  handHistoryId: number,
) => {
  const [row] = await executor
    .select({
      id: handHistories.id,
      roundType: handHistories.roundType,
      referenceId: handHistories.referenceId,
      participantUserIds: handHistories.participantUserIds,
      status: handHistories.status,
      summary: handHistories.summary,
      fairness: handHistories.fairness,
      startedAt: handHistories.startedAt,
      settledAt: handHistories.settledAt,
    })
    .from(handHistories)
    .where(eq(handHistories.id, handHistoryId))
    .limit(1);

  const parsed = parseSchema(HoldemHandHistoryRowSchema, row ?? null);
  if (!parsed.isValid) {
    throw notFoundError("Hand history not found.");
  }

  return parsed.data;
};

const loadHoldemTableEventRows = async (
  executor: DbExecutor,
  handHistoryId: number,
) => {
  const rows = await executor
    .select({
      tableType: tableEvents.tableType,
      tableId: tableEvents.tableId,
      seatIndex: tableEvents.seatIndex,
      userId: tableEvents.userId,
      handHistoryId: tableEvents.handHistoryId,
      phase: tableEvents.phase,
      eventIndex: tableEvents.eventIndex,
      eventType: tableEvents.eventType,
      actor: tableEvents.actor,
      payload: tableEvents.payload,
      createdAt: tableEvents.createdAt,
    })
    .from(tableEvents)
    .where(
      and(
        eq(tableEvents.tableType, "holdem"),
        eq(tableEvents.handHistoryId, handHistoryId),
      ),
    )
    .orderBy(asc(tableEvents.eventIndex));

  return parseTableEventRows(rows);
};

export const getHandHistory = async (
  userId: number,
  roundId: string,
): Promise<HandHistory> => {
  const { roundType, roundEntityId } = parseRoundId(roundId);
  if (roundType === "holdem") {
    const handHistoryRow = await loadHoldemHandHistoryRow(db, roundEntityId);
    if (!handHistoryRow.participantUserIds.includes(userId)) {
      throw notFoundError("Hand history not found.");
    }

    const rows = await loadRoundEventRows(db, {
      roundType,
      roundEntityId,
    });
    const tableRows = await loadHoldemTableEventRows(db, roundEntityId);

    return buildHoldemHistory({
      row: handHistoryRow,
      userId,
      rows,
      tableRows,
    });
  }

  const rows = await loadRoundEventRows(db, {
    roundType,
    roundEntityId,
    userId,
  });

  if (rows.length === 0) {
    throw notFoundError("Hand history not found.");
  }

  return buildHistorySummary({
    roundType,
    roundEntityId,
    userId,
    rows,
  });
};
