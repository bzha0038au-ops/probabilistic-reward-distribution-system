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
import { playModeTypeValues } from "@reward/shared-types/play-mode";

import { users } from "./user.js";

export const userPlayModes = pgTable(
  "user_play_modes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameKey: varchar("game_key", { length: 32, enum: ["draw", "blackjack"] })
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
