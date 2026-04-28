import { userPlayModes } from "@reward/database";
import { and, eq, sql } from "@reward/database/orm";
import {
  PlayModeRequestSchema,
  PlayModeSnapshotSchema,
  PlayModeTypeSchema,
  type PlayModeOutcome,
  type PlayModeRequest,
  type PlayModeSnapshot,
  type PlayModeType,
} from "@reward/shared-types/play-mode";
import { z } from "zod";

import type { DbClient, DbTransaction } from "../../db";
import { readSqlRows } from "../../shared/sql-result";
import { parseSchema } from "../../shared/validation";

type DbExecutor = DbClient | DbTransaction;

export type PlayModeGameKey = "draw" | "blackjack";

const MAX_SNOWBALL_MULTIPLIER = 5;

const UserPlayModeRowSchema = z.object({
  id: z.number().int().positive(),
  mode: PlayModeTypeSchema,
  state: z.unknown().nullable().optional(),
});

const UserPlayModeRowsSchema = z.array(UserPlayModeRowSchema);

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
  return resolveRequestedPlayMode({
    storedMode: mode,
    storedState: row?.state,
  });
};

export const parseRequestedPlayMode = (payload: unknown) => {
  const parsed = parseSchema(PlayModeRequestSchema, payload);
  return parsed.isValid ? parsed.data : null;
};
