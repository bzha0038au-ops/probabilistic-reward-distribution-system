import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const missions = pgTable(
  "missions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    params: jsonb("params").notNull(),
    reward: numeric("reward", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    typeIdx: index("missions_type_idx").on(table.type),
    activeIdx: index("missions_active_idx").on(table.isActive),
    singleDailyCheckInUnique: uniqueIndex(
      "missions_single_daily_checkin_unique",
    )
      .on(table.type)
      .where(sql`${table.type} = 'daily_checkin'`),
  }),
);
