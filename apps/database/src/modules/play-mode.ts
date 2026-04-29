import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  numeric,
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
const deferredPayoutStatusValues = ["pending", "released", "cancelled"] as const;
const deferredPayoutBalanceTypeValues = ["bonus", "withdrawable"] as const;

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
    parentSessionId: integer("parent_session_id").references(
      (): AnyPgColumn => playModeSessions.id,
      { onDelete: "cascade" },
    ),
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
    executionIndex: integer("execution_index").notNull().default(0),
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
    parentSessionIdx: index("play_mode_sessions_parent_session_idx").on(
      table.parentSessionId,
      table.executionIndex,
      table.startedAt,
    ),
    activeStatusIdx: index("play_mode_sessions_status_idx").on(
      table.status,
      table.gameKey,
      table.updatedAt,
    ),
  }),
);

export const deferredPayouts = pgTable(
  "deferred_payouts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameKey: varchar("game_key", {
      length: 32,
      enum: playModeGameKeyValues,
    }).notNull(),
    mode: varchar("mode", { length: 32, enum: playModeTypeValues }).notNull(),
    status: varchar("status", {
      length: 16,
      enum: deferredPayoutStatusValues,
    })
      .notNull()
      .default("pending"),
    balanceType: varchar("balance_type", {
      length: 16,
      enum: deferredPayoutBalanceTypeValues,
    }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    sourceSessionId: integer("source_session_id").references(
      (): AnyPgColumn => playModeSessions.id,
      { onDelete: "set null" },
    ),
    sourceReferenceType: varchar("source_reference_type", { length: 64 }),
    sourceReferenceId: integer("source_reference_id"),
    triggerReferenceType: varchar("trigger_reference_type", { length: 64 }),
    triggerReferenceId: integer("trigger_reference_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userGameStatusIdx: index("deferred_payouts_user_game_status_idx").on(
      table.userId,
      table.gameKey,
      table.status,
      table.createdAt,
    ),
    userModeStatusIdx: index("deferred_payouts_user_mode_status_idx").on(
      table.userId,
      table.mode,
      table.status,
      table.createdAt,
    ),
    sourceReferenceIdx: index("deferred_payouts_source_reference_idx").on(
      table.sourceReferenceType,
      table.sourceReferenceId,
      table.createdAt,
    ),
    triggerReferenceIdx: index("deferred_payouts_trigger_reference_idx").on(
      table.triggerReferenceType,
      table.triggerReferenceId,
      table.createdAt,
    ),
  }),
);
