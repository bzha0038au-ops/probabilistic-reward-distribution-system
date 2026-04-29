import { playModeSessions, userPlayModes } from "@reward/database";
import { and, desc, eq, sql } from "@reward/database/orm";
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
  gameKey: PlayModeGameKeySchema,
  mode: PlayModeTypeSchema,
  status: PlayModeSessionStatusSchema,
  outcome: z
    .enum(["win", "lose", "push", "miss"])
    .nullable()
    .optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  snapshot: z.unknown(),
  metadata: z.unknown().nullable().optional(),
});

const PlayModeSessionRowsSchema = z.array(PlayModeSessionRowSchema);

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

  const appliedMultiplier = clampMultiplier(
    storedSnapshot.nextMultiplier,
    baseMultiplier,
  );

  return {
    ...storedSnapshot,
    type,
    appliedMultiplier,
    nextMultiplier: appliedMultiplier,
    carryActive: appliedMultiplier > 1,
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
    if (outcome === "lose" || outcome === "miss") {
      return {
        type: "deferred_double",
        appliedMultiplier: snapshot.appliedMultiplier,
        nextMultiplier: 2,
        streak: snapshot.streak + 1,
        lastOutcome: outcome,
        carryActive: true,
      };
    }

    if (outcome === "push") {
      return {
        type: "deferred_double",
        appliedMultiplier: snapshot.appliedMultiplier,
        nextMultiplier: snapshot.appliedMultiplier,
        streak: snapshot.streak,
        lastOutcome: outcome,
        carryActive: snapshot.appliedMultiplier > 1,
      };
    }

    return {
      type: "deferred_double",
      appliedMultiplier: snapshot.appliedMultiplier,
      nextMultiplier: 1,
      streak: 0,
      lastOutcome: outcome,
      carryActive: false,
    };
  }

  if (outcome === "win") {
    const nextMultiplier = Math.min(
      snapshot.appliedMultiplier + 1,
      MAX_SNOWBALL_MULTIPLIER,
    );
    return {
      type: "snowball",
      appliedMultiplier: snapshot.appliedMultiplier,
      nextMultiplier,
      streak: snapshot.streak + 1,
      lastOutcome: outcome,
      carryActive: nextMultiplier > 1,
    };
  }

  if (outcome === "push") {
    return {
      type: "snowball",
      appliedMultiplier: snapshot.appliedMultiplier,
      nextMultiplier: snapshot.appliedMultiplier,
      streak: snapshot.streak,
      lastOutcome: outcome,
      carryActive: snapshot.appliedMultiplier > 1,
    };
  }

  return {
    type: "snowball",
    appliedMultiplier: snapshot.appliedMultiplier,
    nextMultiplier: 1,
    streak: 0,
    lastOutcome: outcome,
    carryActive: false,
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
  referenceType?: string | null;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const [session] = await params.tx
    .insert(playModeSessions)
    .values({
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.mode,
      status: "active",
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
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
    referenceType?: string | null;
    referenceId?: number | null;
    lock?: boolean;
  },
) => {
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
    SELECT id,
           game_key AS "gameKey",
           mode,
           status,
           outcome,
           reference_type AS "referenceType",
           reference_id AS "referenceId",
           snapshot,
           metadata
    FROM ${playModeSessions}
    WHERE user_id = ${params.userId}
      AND game_key = ${params.gameKey}
      AND status = ${"active"}
      ${referenceTypeClause}
      ${referenceIdClause}
    ORDER BY started_at DESC, id DESC
    LIMIT 1
    ${lockClause}
  `);

  const rows = parsePlayModeSessionRows(result);
  return rows[0] ?? null;
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
