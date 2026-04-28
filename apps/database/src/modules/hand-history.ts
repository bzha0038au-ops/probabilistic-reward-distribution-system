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
import { handHistoryRoundTypeValues } from "@reward/shared-types/hand-history";

import { users } from "./user.js";

export const handHistories = pgTable(
  "hand_histories",
  {
    id: serial("id").primaryKey(),
    roundType: varchar("round_type", {
      length: 32,
      enum: handHistoryRoundTypeValues,
    }).notNull(),
    gameType: varchar("game_type", { length: 64 }),
    tableId: integer("table_id"),
    referenceId: integer("reference_id").notNull(),
    primaryUserId: integer("primary_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    participantUserIds: jsonb("participant_user_ids").notNull(),
    handNumber: integer("hand_number"),
    status: varchar("status", { length: 32 }).notNull(),
    summary: jsonb("summary").notNull(),
    fairness: jsonb("fairness"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roundTypeCreatedIdx: index("hand_histories_round_type_created_idx").on(
      table.roundType,
      table.createdAt,
    ),
    tableLookupIdx: index("hand_histories_table_lookup_idx").on(
      table.gameType,
      table.tableId,
      table.handNumber,
    ),
    primaryUserCreatedIdx: index("hand_histories_primary_user_created_idx").on(
      table.primaryUserId,
      table.createdAt,
    ),
    statusCreatedIdx: index("hand_histories_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    holdemTableHandUniqueIdx: uniqueIndex(
      "hand_histories_holdem_table_hand_unique_idx",
    ).on(table.roundType, table.tableId, table.handNumber),
  }),
);
