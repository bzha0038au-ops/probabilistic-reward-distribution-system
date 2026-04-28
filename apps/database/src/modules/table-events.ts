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
import { handHistoryEventActorValues } from "@reward/shared-types/hand-history";

import { handHistories } from "./hand-history.js";
import { users } from "./user.js";

const tableEventTableTypeValues = ["holdem"] as const;

export const tableEvents = pgTable(
  "table_events",
  {
    id: serial("id").primaryKey(),
    tableType: varchar("table_type", {
      length: 32,
      enum: tableEventTableTypeValues,
    }).notNull(),
    tableId: integer("table_id").notNull(),
    seatIndex: integer("seat_index"),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    handHistoryId: integer("hand_history_id").references(() => handHistories.id, {
      onDelete: "set null",
    }),
    phase: varchar("phase", { length: 64 }),
    eventIndex: integer("event_index").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actor: varchar("actor", {
      length: 16,
      enum: handHistoryEventActorValues,
    }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableEventUniqueIdx: uniqueIndex("table_events_table_event_unique_idx").on(
      table.tableType,
      table.tableId,
      table.eventIndex,
    ),
    tableLookupIdx: index("table_events_table_lookup_idx").on(
      table.tableType,
      table.tableId,
      table.createdAt,
    ),
    handHistoryCreatedIdx: index("table_events_hand_history_created_idx").on(
      table.handHistoryId,
      table.createdAt,
    ),
    userCreatedIdx: index("table_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);
