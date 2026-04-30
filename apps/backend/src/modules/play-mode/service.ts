import { deferredPayouts, playModeSessions, userPlayModes } from "@reward/database";
import { and, desc, eq, inArray, sql } from "@reward/database/orm";
import {
  PlayModeGameKeySchema,
  PlayModeRequestSchema,
  PlayModeSnapshotSchema,
  PlayModeTypeSchema,
  type PlayModeOutcome,
  type PlayModeGameKey,
  type PlayModeRequest,
  type PlayModeSnapshot,
  type PlayModeType,
} from "@reward/shared-types/play-mode";
import { z } from "zod";

import type { DbClient, DbTransaction } from "../../db";
import { readSqlRows } from "../../shared/sql-result";
import { parseSchema } from "../../shared/validation";

type DbExecutor = DbClient | DbTransaction;

const playModeSessionStatusValues = ["active", "settled", "cancelled"] as const;
const PlayModeSessionStatusSchema = z.enum(playModeSessionStatusValues);
type PlayModeSessionStatus = z.infer<typeof PlayModeSessionStatusSchema>;
const deferredPayoutStatusValues = ["pending", "released", "cancelled"] as const;
const DeferredPayoutStatusSchema = z.enum(deferredPayoutStatusValues);
const DeferredPayoutBalanceTypeSchema = z.enum(["bonus", "withdrawable"]);
export type DeferredPayoutBalanceType = z.infer<typeof DeferredPayoutBalanceTypeSchema>;

const MAX_SNOWBALL_MULTIPLIER = 5;

const UserPlayModeRowSchema = z.object({
  id: z.number().int().positive(),
  gameKey: PlayModeGameKeySchema.optional(),
  mode: PlayModeTypeSchema,
  state: z.unknown().nullable().optional(),
});

const UserPlayModeRowsSchema = z.array(UserPlayModeRowSchema);

const PlayModeSessionRowSchema = z.object({
  id: z.number().int().positive(),
  parentSessionId: z.number().int().positive().nullable().optional(),
  gameKey: PlayModeGameKeySchema,
  mode: PlayModeTypeSchema,
  status: PlayModeSessionStatusSchema,
  outcome: z
    .enum(["win", "lose", "push", "miss"])
    .nullable()
    .optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  executionIndex: z.number().int().nonnegative().optional(),
  snapshot: z.unknown(),
  metadata: z.unknown().nullable().optional(),
});

const PlayModeSessionRowsSchema = z.array(PlayModeSessionRowSchema);
export type PlayModeSessionRow = z.infer<typeof PlayModeSessionRowSchema>;

const DeferredPayoutRowSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  gameKey: PlayModeGameKeySchema,
  mode: PlayModeTypeSchema,
  status: DeferredPayoutStatusSchema,
  balanceType: DeferredPayoutBalanceTypeSchema,
  amount: z.union([z.string(), z.number()]),
  sourceSessionId: z.number().int().positive().nullable().optional(),
  sourceReferenceType: z.string().nullable().optional(),
  sourceReferenceId: z.number().int().nullable().optional(),
  triggerReferenceType: z.string().nullable().optional(),
  triggerReferenceId: z.number().int().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});
const DeferredPayoutRowsSchema = z.array(DeferredPayoutRowSchema);
export type DeferredPayoutRow = z.infer<typeof DeferredPayoutRowSchema>;

const STATIC_MODE_MULTIPLIERS: Record<PlayModeType, number> = {
  standard: 1,
  dual_bet: 2,
  deferred_double: 1,
  snowball: 1,
};

const clampMultiplier = (value: unknown, fallback: number) => {
  const parsed = Math.floor(Number(value ?? fallback));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const hasPendingPayout = (snapshot: PlayModeSnapshot) =>
  snapshot.pendingPayoutCount > 0 ||
  snapshot.pendingPayoutAmount !== "0.00" ||
  snapshot.snowballCarryAmount !== "0.00" ||
  snapshot.snowballEnvelopeAmount !== "0.00";

export const hasPendingPlayModePayout = hasPendingPayout;

const parseStoredSnapshotValue = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export const createDefaultPlayModeSnapshot = (
  type: PlayModeType = "standard",
): PlayModeSnapshot => {
  const multiplier = STATIC_MODE_MULTIPLIERS[type];
  return {
    type,
    appliedMultiplier: multiplier,
    nextMultiplier: multiplier,
    streak: 0,
    lastOutcome: null,
    carryActive: false,
    pendingPayoutAmount: "0.00",
    pendingPayoutCount: 0,
    snowballCarryAmount: "0.00",
    snowballEnvelopeAmount: "0.00",
  };
};

const parseStoredSnapshot = (
  type: PlayModeType,
  value: unknown,
): PlayModeSnapshot => {
  const parsed = parseSchema(
    PlayModeSnapshotSchema,
    parseStoredSnapshotValue(value) ?? {},
  );
  if (!parsed.isValid) {
    return createDefaultPlayModeSnapshot(type);
  }

  const snapshot = parsed.data;
  if (snapshot.type !== type) {
    return createDefaultPlayModeSnapshot(type);
  }

  return snapshot;
};

export const resolveRequestedPlayMode = (params: {
  requestedMode?: PlayModeRequest | null;
  storedMode?: PlayModeType | null;
  storedState?: unknown;
}): PlayModeSnapshot => {
  const type = params.requestedMode?.type ?? params.storedMode ?? "standard";
  const storedSnapshot = parseStoredSnapshot(type, params.storedState);
  const baseMultiplier = STATIC_MODE_MULTIPLIERS[type];

  if (type === "standard" || type === "dual_bet") {
    return {
      ...storedSnapshot,
      type,
      appliedMultiplier: baseMultiplier,
      nextMultiplier: baseMultiplier,
      carryActive: false,
    };
  }

  return {
    ...storedSnapshot,
    type,
    appliedMultiplier: 1,
    nextMultiplier:
      type === "snowball"
        ? clampMultiplier(storedSnapshot.nextMultiplier, 1)
        : 1,
    carryActive: hasPendingPayout(storedSnapshot),
  };
};

export const resolveSettledPlayMode = (params: {
  snapshot: PlayModeSnapshot;
  outcome: PlayModeOutcome;
}): PlayModeSnapshot => {
  const { snapshot, outcome } = params;

  if (snapshot.type === "standard") {
    return {
      ...createDefaultPlayModeSnapshot("standard"),
      lastOutcome: outcome,
    };
  }

  if (snapshot.type === "dual_bet") {
    return {
      ...createDefaultPlayModeSnapshot("dual_bet"),
      lastOutcome: outcome,
      streak: outcome === "win" ? snapshot.streak + 1 : 0,
    };
  }

  if (snapshot.type === "deferred_double") {
    return {
      type: "deferred_double",
      appliedMultiplier: 1,
      nextMultiplier: 1,
      streak: 0,
      lastOutcome: outcome,
      carryActive: hasPendingPayout(snapshot),
      pendingPayoutAmount: snapshot.pendingPayoutAmount,
      pendingPayoutCount: snapshot.pendingPayoutCount,
      snowballCarryAmount: snapshot.snowballCarryAmount,
      snowballEnvelopeAmount: snapshot.snowballEnvelopeAmount,
    };
  }

  const nextStreak =
    outcome === "win"
      ? snapshot.streak + 1
      : outcome === "push"
        ? snapshot.streak
        : 0;

  if (outcome === "win") {
    return {
      type: "snowball",
      appliedMultiplier: 1,
      nextMultiplier: Math.min(Math.max(1, nextStreak + 1), MAX_SNOWBALL_MULTIPLIER),
      streak: nextStreak,
      lastOutcome: outcome,
      carryActive: hasPendingPayout(snapshot),
      pendingPayoutAmount: snapshot.pendingPayoutAmount,
      pendingPayoutCount: snapshot.pendingPayoutCount,
      snowballCarryAmount: snapshot.snowballCarryAmount,
      snowballEnvelopeAmount: snapshot.snowballEnvelopeAmount,
    };
  }

  if (outcome === "push") {
    return {
      type: "snowball",
      appliedMultiplier: 1,
      nextMultiplier: Math.min(Math.max(1, nextStreak + 1), MAX_SNOWBALL_MULTIPLIER),
      streak: nextStreak,
      lastOutcome: outcome,
      carryActive: hasPendingPayout(snapshot),
      pendingPayoutAmount: snapshot.pendingPayoutAmount,
      pendingPayoutCount: snapshot.pendingPayoutCount,
      snowballCarryAmount: snapshot.snowballCarryAmount,
      snowballEnvelopeAmount: snapshot.snowballEnvelopeAmount,
    };
  }

  return {
    type: "snowball",
    appliedMultiplier: 1,
    nextMultiplier: 1,
    streak: 0,
    lastOutcome: outcome,
    carryActive: hasPendingPayout(snapshot),
    pendingPayoutAmount: snapshot.pendingPayoutAmount,
    pendingPayoutCount: snapshot.pendingPayoutCount,
    snowballCarryAmount: snapshot.snowballCarryAmount,
    snowballEnvelopeAmount: snapshot.snowballEnvelopeAmount,
  };
};

const parsePlayModeRows = (result: unknown) => {
  const parsed = parseSchema(UserPlayModeRowsSchema, readSqlRows(result));
  if (!parsed.isValid) {
    return [];
  }
  return parsed.data;
};

const parsePlayModeSessionRows = (result: unknown) => {
  const parsed = parseSchema(PlayModeSessionRowsSchema, readSqlRows(result));
  if (!parsed.isValid) {
    return [];
  }
  return parsed.data;
};

const parseDeferredPayoutRows = (result: unknown) => {
  const parsed = parseSchema(DeferredPayoutRowsSchema, readSqlRows(result));
  if (!parsed.isValid) {
    return [];
  }
  return parsed.data;
};

const selectPlayModeSessionColumns = sql`
  id,
  parent_session_id AS "parentSessionId",
  game_key AS "gameKey",
  mode,
  status,
  outcome,
  reference_type AS "referenceType",
  reference_id AS "referenceId",
  execution_index AS "executionIndex",
  snapshot,
  metadata
`;

const loadLatestSnapshotForMode = async (
  db: DbExecutor,
  params: {
    userId: number;
    gameKey: PlayModeGameKey;
    mode: PlayModeType;
  },
) => {
  const [sessionRow] = await db
    .select({
      snapshot: playModeSessions.snapshot,
    })
    .from(playModeSessions)
    .where(
      and(
        eq(playModeSessions.userId, params.userId),
        eq(playModeSessions.gameKey, params.gameKey),
        eq(playModeSessions.mode, params.mode),
      ),
    )
    .orderBy(desc(playModeSessions.startedAt), desc(playModeSessions.id))
    .limit(1);

  return sessionRow?.snapshot ?? null;
};

export const loadPlayModeSnapshotForMode = async (
  db: DbExecutor,
  params: {
    userId: number;
    gameKey: PlayModeGameKey;
    mode: PlayModeType;
  },
) =>
  resolveRequestedPlayMode({
    storedMode: params.mode,
    storedState: await loadLatestSnapshotForMode(db, params),
  });

export const lockUserPlayModeState = async (
  tx: DbTransaction,
  userId: number,
  gameKey: PlayModeGameKey,
) => {
  await tx
    .insert(userPlayModes)
    .values({
      userId,
      gameKey,
      mode: "standard",
      state: createDefaultPlayModeSnapshot("standard"),
    })
    .onConflictDoNothing();

  const result = await tx.execute(sql`
    SELECT id,
           mode,
           state
    FROM ${userPlayModes}
    WHERE user_id = ${userId}
      AND game_key = ${gameKey}
    FOR UPDATE
  `);

  const rows = parsePlayModeRows(result);
  return rows[0] ?? null;
};

export const saveUserPlayModeState = async (params: {
  tx: DbTransaction;
  rowId: number;
  snapshot: PlayModeSnapshot;
}) => {
  await params.tx
    .update(userPlayModes)
    .set({
      mode: params.snapshot.type,
      state: params.snapshot,
      updatedAt: new Date(),
    })
    .where(eq(userPlayModes.id, params.rowId));
};

export const startPlayModeSession = async (params: {
  tx: DbTransaction;
  userId: number;
  gameKey: PlayModeGameKey;
  mode: PlayModeType;
  snapshot: PlayModeSnapshot;
  parentSessionId?: number | null;
  referenceType?: string | null;
  referenceId?: number | null;
  executionIndex?: number;
  metadata?: Record<string, unknown> | null;
}) => {
  const [session] = await params.tx
    .insert(playModeSessions)
    .values({
      parentSessionId: params.parentSessionId ?? null,
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.mode,
      status: "active",
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      executionIndex: params.executionIndex ?? 0,
      snapshot: params.snapshot,
      metadata: params.metadata ?? null,
    })
    .returning({
      id: playModeSessions.id,
    });

  return session ?? null;
};

export const loadActivePlayModeSession = async (
  tx: DbTransaction,
  params: {
    userId: number;
    gameKey: PlayModeGameKey;
    parentSessionId?: number | null;
    referenceType?: string | null;
    referenceId?: number | null;
    includeChildSessions?: boolean;
    lock?: boolean;
  },
) => {
  const parentSessionClause =
    params.includeChildSessions
      ? sql``
      : params.parentSessionId === undefined
      ? sql`AND parent_session_id IS NULL`
      : params.parentSessionId === null
        ? sql`AND parent_session_id IS NULL`
        : sql`AND parent_session_id = ${params.parentSessionId}`;
  const referenceTypeClause =
    params.referenceType === undefined
      ? sql``
      : sql`AND reference_type = ${params.referenceType}`;
  const referenceIdClause =
    params.referenceId === undefined
      ? sql``
      : sql`AND reference_id = ${params.referenceId}`;
  const lockClause = params.lock === false ? sql`` : sql`FOR UPDATE`;

  const result = await tx.execute(sql`
    SELECT ${selectPlayModeSessionColumns}
    FROM ${playModeSessions}
    WHERE user_id = ${params.userId}
      AND game_key = ${params.gameKey}
      AND status = ${"active"}
      ${parentSessionClause}
      ${referenceTypeClause}
      ${referenceIdClause}
    ORDER BY started_at DESC, id DESC
    LIMIT 1
    ${lockClause}
  `);

  const rows = parsePlayModeSessionRows(result);
  return rows[0] ?? null;
};

export const loadPlayModeSessionById = async (
  tx: DbTransaction,
  params: {
    sessionId: number;
    lock?: boolean;
  },
) => {
  const lockClause = params.lock === false ? sql`` : sql`FOR UPDATE`;
  const result = await tx.execute(sql`
    SELECT ${selectPlayModeSessionColumns}
    FROM ${playModeSessions}
    WHERE id = ${params.sessionId}
    LIMIT 1
    ${lockClause}
  `);

  const rows = parsePlayModeSessionRows(result);
  return rows[0] ?? null;
};

export const loadPlayModeSessionsByParent = async (
  tx: DbTransaction,
  params: {
    parentSessionId: number;
    lock?: boolean;
  },
) => {
  const lockClause = params.lock === false ? sql`` : sql`FOR UPDATE`;
  const result = await tx.execute(sql`
    SELECT ${selectPlayModeSessionColumns}
    FROM ${playModeSessions}
    WHERE parent_session_id = ${params.parentSessionId}
    ORDER BY execution_index ASC, started_at ASC, id ASC
    ${lockClause}
  `);

  return parsePlayModeSessionRows(result);
};

export const updatePlayModeSessionReference = async (params: {
  tx: DbTransaction;
  sessionId: number;
  referenceType?: string | null;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const values: {
    referenceType?: string | null;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (params.referenceType !== undefined) {
    values.referenceType = params.referenceType;
  }
  if (params.referenceId !== undefined) {
    values.referenceId = params.referenceId;
  }
  if (params.metadata !== undefined) {
    values.metadata = params.metadata;
  }

  await params.tx
    .update(playModeSessions)
    .set(values)
    .where(eq(playModeSessions.id, params.sessionId));
};

export const settlePlayModeSession = async (params: {
  tx: DbTransaction;
  sessionId: number;
  snapshot: PlayModeSnapshot;
  outcome: PlayModeOutcome;
  referenceType?: string | null;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const values: {
    status: PlayModeSessionStatus;
    outcome: PlayModeOutcome;
    snapshot: PlayModeSnapshot;
    settledAt: Date;
    updatedAt: Date;
    referenceType?: string | null;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
  } = {
    status: "settled",
    outcome: params.outcome,
    snapshot: params.snapshot,
    settledAt: new Date(),
    updatedAt: new Date(),
  };

  if (params.referenceType !== undefined) {
    values.referenceType = params.referenceType;
  }
  if (params.referenceId !== undefined) {
    values.referenceId = params.referenceId;
  }
  if (params.metadata !== undefined) {
    values.metadata = params.metadata;
  }

  await params.tx
    .update(playModeSessions)
    .set(values)
    .where(eq(playModeSessions.id, params.sessionId));
};

export const cancelPlayModeSession = async (params: {
  tx: DbTransaction;
  sessionId: number;
  snapshot: PlayModeSnapshot;
  metadata?: Record<string, unknown> | null;
}) => {
  await params.tx
    .update(playModeSessions)
    .set({
      status: "cancelled",
      snapshot: params.snapshot,
      metadata: params.metadata ?? null,
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playModeSessions.id, params.sessionId));
};

export const loadDeferredPayoutRows = async (
  tx: DbTransaction,
  params: {
    userId: number;
    gameKey: PlayModeGameKey;
    mode: PlayModeType;
    status?: z.infer<typeof DeferredPayoutStatusSchema>;
    lock?: boolean;
  },
) => {
  const statusClause =
    params.status === undefined ? sql`` : sql`AND status = ${params.status}`;
  const lockClause = params.lock === false ? sql`` : sql`FOR UPDATE`;

  const result = await tx.execute(sql`
    SELECT
      id,
      user_id AS "userId",
      game_key AS "gameKey",
      mode,
      status,
      balance_type AS "balanceType",
      amount,
      source_session_id AS "sourceSessionId",
      source_reference_type AS "sourceReferenceType",
      source_reference_id AS "sourceReferenceId",
      trigger_reference_type AS "triggerReferenceType",
      trigger_reference_id AS "triggerReferenceId",
      metadata
    FROM ${deferredPayouts}
    WHERE user_id = ${params.userId}
      AND game_key = ${params.gameKey}
      AND mode = ${params.mode}
      ${statusClause}
    ORDER BY created_at ASC, id ASC
    ${lockClause}
  `);

  return parseDeferredPayoutRows(result);
};

export const createDeferredPayout = async (params: {
  tx: DbTransaction;
  userId: number;
  gameKey: PlayModeGameKey;
  mode: PlayModeType;
  balanceType: DeferredPayoutBalanceType;
  amount: string;
  sourceSessionId?: number | null;
  sourceReferenceType?: string | null;
  sourceReferenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const [row] = await params.tx
    .insert(deferredPayouts)
    .values({
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.mode,
      status: "pending",
      balanceType: params.balanceType,
      amount: params.amount,
      sourceSessionId: params.sourceSessionId ?? null,
      sourceReferenceType: params.sourceReferenceType ?? null,
      sourceReferenceId: params.sourceReferenceId ?? null,
      metadata: params.metadata ?? null,
    })
    .returning({
      id: deferredPayouts.id,
    });

  return row?.id ?? null;
};

export const markDeferredPayoutsReleased = async (params: {
  tx: DbTransaction;
  payoutIds: number[];
  triggerReferenceType?: string | null;
  triggerReferenceId?: number | null;
  metadataPatch?: Record<string, unknown> | null;
}) => {
  if (params.payoutIds.length === 0) {
    return;
  }

  const rows = await params.tx
    .select({
      id: deferredPayouts.id,
      metadata: deferredPayouts.metadata,
    })
    .from(deferredPayouts)
    .where(inArray(deferredPayouts.id, params.payoutIds));

  const metadataById = new Map(
    rows.map((row) => [row.id, row.metadata] as const),
  );
  const releasedAt = new Date();
  for (const payoutId of params.payoutIds) {
    const existingMetadata = metadataById.get(payoutId);
    await params.tx
      .update(deferredPayouts)
      .set({
        status: "released",
        triggerReferenceType: params.triggerReferenceType ?? null,
        triggerReferenceId: params.triggerReferenceId ?? null,
        releasedAt,
        updatedAt: releasedAt,
        metadata:
          params.metadataPatch === undefined
            ? existingMetadata ?? null
            : {
                ...((existingMetadata &&
                  typeof existingMetadata === "object" &&
                  !Array.isArray(existingMetadata)
                  ? existingMetadata
                  : {}) as Record<string, unknown>),
                ...params.metadataPatch,
              },
      })
      .where(eq(deferredPayouts.id, payoutId));
  }
};

export const loadUserPlayModeSnapshot = async (
  db: DbExecutor,
  userId: number,
  gameKey: PlayModeGameKey,
): Promise<PlayModeSnapshot> => {
  const [row] = await db
    .select({
      mode: userPlayModes.mode,
      state: userPlayModes.state,
    })
    .from(userPlayModes)
    .where(
        and(eq(userPlayModes.userId, userId), eq(userPlayModes.gameKey, gameKey)),
    )
    .limit(1);

  const modeParsed = parseSchema(
    PlayModeTypeSchema,
    row?.mode ?? createDefaultPlayModeSnapshot("standard").type,
  );
  const mode = modeParsed.isValid ? modeParsed.data : "standard";
  const latestSnapshot = await loadLatestSnapshotForMode(db, {
    userId,
    gameKey,
    mode,
  });

  return resolveRequestedPlayMode({
    storedMode: mode,
    storedState: latestSnapshot ?? row?.state,
  });
};

export const parseRequestedPlayMode = (payload: unknown) => {
  const parsed = parseSchema(PlayModeRequestSchema, payload);
  return parsed.isValid ? parsed.data : null;
};

export const setUserPlayModePreference = async (params: {
  db: DbExecutor;
  userId: number;
  gameKey: PlayModeGameKey;
  mode: PlayModeType;
}) => {
  const executeUpdate = async (executor: DbExecutor) => {
    if (typeof executor.transaction === "function") {
      return executor.transaction(async (tx) => {
        const row = await lockUserPlayModeState(tx, params.userId, params.gameKey);
        if (!row) {
          return createDefaultPlayModeSnapshot(params.mode);
        }

        const latestSnapshot = await loadLatestSnapshotForMode(tx, {
          userId: params.userId,
          gameKey: params.gameKey,
          mode: params.mode,
        });
        const snapshot = resolveRequestedPlayMode({
          storedMode: params.mode,
          storedState: latestSnapshot,
        });

        await saveUserPlayModeState({
          tx,
          rowId: row.id,
          snapshot,
        });

        return snapshot;
      });
    }

    const latestSnapshot = await loadLatestSnapshotForMode(executor, {
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.mode,
    });
    return resolveRequestedPlayMode({
      storedMode: params.mode,
      storedState: latestSnapshot,
    });
  };

  return executeUpdate(params.db);
};
