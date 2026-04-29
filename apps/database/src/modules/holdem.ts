import {
  boolean,
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
import { sql } from "drizzle-orm";
import {
  HOLDEM_TABLE_MESSAGE_MAX_LENGTH,
  holdemTableEmojiValues,
  holdemTableMessageKindValues,
  holdemSeatStatusValues,
  holdemTableStatusValues,
} from "@reward/shared-types/holdem";

import { users } from "./user.js";

export const holdemTables = pgTable(
  "holdem_tables",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    status: varchar("status", {
      length: 16,
      enum: holdemTableStatusValues,
    })
      .notNull()
      .default("waiting"),
    smallBlind: numeric("small_blind", { precision: 14, scale: 2 })
      .notNull()
      .default("1"),
    bigBlind: numeric("big_blind", { precision: 14, scale: 2 })
      .notNull()
      .default("2"),
    minimumBuyIn: numeric("minimum_buy_in", { precision: 14, scale: 2 })
      .notNull()
      .default("40"),
    maximumBuyIn: numeric("maximum_buy_in", { precision: 14, scale: 2 })
      .notNull()
      .default("200"),
    maxSeats: integer("max_seats").notNull().default(6),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusUpdatedIdx: index("holdem_tables_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    createdIdx: index("holdem_tables_created_idx").on(table.createdAt),
  }),
);

export const holdemTableSeats = pgTable(
  "holdem_table_seats",
  {
    id: serial("id").primaryKey(),
    tableId: integer("table_id")
      .notNull()
      .references(() => holdemTables.id, { onDelete: "cascade" }),
    seatIndex: integer("seat_index").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedGroupId: varchar("linked_group_id", { length: 128 }),
    stackAmount: numeric("stack_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    committedAmount: numeric("committed_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalCommittedAmount: numeric("total_committed_amount", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    status: varchar("status", {
      length: 16,
      enum: holdemSeatStatusValues,
    })
      .notNull()
      .default("waiting"),
    presenceHeartbeatAt: timestamp("presence_heartbeat_at", {
      withTimezone: true,
    }),
    disconnectGraceExpiresAt: timestamp("disconnect_grace_expires_at", {
      withTimezone: true,
    }),
    seatLeaseExpiresAt: timestamp("seat_lease_expires_at", {
      withTimezone: true,
    }),
    autoCashOutPending: boolean("auto_cash_out_pending")
      .notNull()
      .default(false),
    turnDeadlineAt: timestamp("turn_deadline_at", { withTimezone: true }),
    holeCards: jsonb("hole_cards").notNull(),
    lastAction: varchar("last_action", { length: 32 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableSeatUnique: uniqueIndex("holdem_table_seats_table_seat_unique").on(
      table.tableId,
      table.seatIndex,
    ),
    userSoloUnique: uniqueIndex("holdem_table_seats_user_solo_unique")
      .on(table.userId)
      .where(sql`${table.linkedGroupId} IS NULL`),
    tableStatusIdx: index("holdem_table_seats_table_status_idx").on(
      table.tableId,
      table.status,
      table.updatedAt,
    ),
    statusTurnDeadlineIdx: index(
      "holdem_table_seats_status_turn_deadline_idx",
    ).on(table.status, table.turnDeadlineAt),
    disconnectGraceIdx: index(
      "holdem_table_seats_disconnect_grace_idx",
    ).on(table.disconnectGraceExpiresAt),
    seatLeaseIdx: index("holdem_table_seats_seat_lease_idx").on(
      table.seatLeaseExpiresAt,
      table.autoCashOutPending,
    ),
    userTableUnique: uniqueIndex("holdem_table_seats_user_table_unique").on(
      table.userId,
      table.tableId,
    ),
  }),
);

export const holdemTableMessages = pgTable(
  "holdem_table_messages",
  {
    id: serial("id").primaryKey(),
    tableId: integer("table_id")
      .notNull()
      .references(() => holdemTables.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seatIndex: integer("seat_index").notNull(),
    kind: varchar("kind", {
      length: 16,
      enum: holdemTableMessageKindValues,
    }).notNull(),
    text: varchar("text", {
      length: HOLDEM_TABLE_MESSAGE_MAX_LENGTH,
    }),
    emoji: varchar("emoji", {
      length: 16,
      enum: holdemTableEmojiValues,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableCreatedIdx: index("holdem_table_messages_table_created_idx").on(
      table.tableId,
      table.createdAt,
      table.id,
    ),
    userCreatedIdx: index("holdem_table_messages_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);
