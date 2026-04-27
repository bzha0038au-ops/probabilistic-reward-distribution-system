import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { quickEightRoundStatusValues } from "@reward/shared-types/quick-eight";

import { users } from "./user.js";

export const quickEightRounds = pgTable(
  "quick_eight_rounds",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    selectedNumbers: jsonb("selected_numbers").notNull(),
    drawnNumbers: jsonb("drawn_numbers").notNull(),
    matchedNumbers: jsonb("matched_numbers").notNull(),
    hitCount: integer("hit_count").notNull(),
    multiplier: numeric("multiplier", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    stakeAmount: numeric("stake_amount", { precision: 14, scale: 2 }).notNull(),
    payoutAmount: numeric("payout_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    status: varchar("status", {
      length: 32,
      enum: quickEightRoundStatusValues,
    }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("quick_eight_rounds_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    statusCreatedIdx: index("quick_eight_rounds_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);
