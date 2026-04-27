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
import { blackjackGameStatusValues } from "@reward/shared-types/blackjack";

import { users } from "./user.js";

export const blackjackGames = pgTable(
  "blackjack_games",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stakeAmount: numeric("stake_amount", { precision: 14, scale: 2 }).notNull(),
    totalStake: numeric("total_stake", { precision: 14, scale: 2 }).notNull(),
    payoutAmount: numeric("payout_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    playerCards: jsonb("player_cards").notNull(),
    dealerCards: jsonb("dealer_cards").notNull(),
    deck: jsonb("deck").notNull(),
    nextCardIndex: integer("next_card_index").notNull().default(0),
    status: varchar("status", {
      length: 32,
      enum: blackjackGameStatusValues,
    })
      .notNull()
      .default("active"),
    metadata: jsonb("metadata"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStatusIdx: index("blackjack_games_user_status_idx").on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
    userCreatedIdx: index("blackjack_games_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    statusCreatedIdx: index("blackjack_games_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);
