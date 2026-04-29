import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  playModeGameKeyValues,
  playModeTypeValues,
} from "@reward/shared-types/play-mode";

import { users } from "./user.js";

const playModeSessionStatusValues = ["active", "settled", "cancelled"] as const;

export const userPlayModes = pgTable(
  "user_play_modes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameKey: varchar("game_key", {
      length: 32,
      enum: playModeGameKeyValues,
    })
      .notNull(),
    mode: varchar("mode", { length: 32, enum: playModeTypeValues })
      .notNull()
      .default("standard"),
    state: jsonb("state"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userGameUnique: uniqueIndex("user_play_modes_user_game_unique").on(
      table.userId,
      table.gameKey,
    ),
    gameUpdatedIdx: index("user_play_modes_game_updated_idx").on(
      table.gameKey,
      table.updatedAt,
    ),
  }),
);

export const playModeSessions = pgTable(
  "play_mode_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameKey: varchar("game_key", {
      length: 32,
      enum: playModeGameKeyValues,
    })
      .notNull(),
    mode: varchar("mode", { length: 32, enum: playModeTypeValues })
      .notNull()
      .default("standard"),
    status: varchar("status", {
      length: 16,
      enum: playModeSessionStatusValues,
    })
      .notNull()
      .default("active"),
    outcome: varchar("outcome", {
      length: 16,
      enum: ["win", "lose", "push", "miss"],
    }),
    referenceType: varchar("reference_type", { length: 64 }),
    referenceId: integer("reference_id"),
    snapshot: jsonb("snapshot").notNull(),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userGameStartedIdx: index("play_mode_sessions_user_game_started_idx").on(
      table.userId,
      table.gameKey,
      table.startedAt,
    ),
    userGameModeStartedIdx: index(
      "play_mode_sessions_user_game_mode_started_idx",
    ).on(table.userId, table.gameKey, table.mode, table.startedAt),
    referenceIdx: index("play_mode_sessions_reference_idx").on(
      table.referenceType,
      table.referenceId,
      table.startedAt,
    ),
    activeStatusIdx: index("play_mode_sessions_status_idx").on(
      table.status,
      table.gameKey,
      table.updatedAt,
    ),
  }),
);
