import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./user.js";

export const referralStatusValues = [
  "pending",
  "qualified",
  "rejected",
] as const;

export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: integer("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredId: integer("referred_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", {
      length: 24,
      enum: referralStatusValues,
    })
      .notNull()
      .default("pending"),
    rewardId: varchar("reward_id", { length: 128 }).notNull(),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    referredUnique: uniqueIndex("referrals_referred_id_unique").on(
      table.referredId,
    ),
    referrerRewardStatusIdx: index("referrals_referrer_reward_status_idx").on(
      table.referrerId,
      table.rewardId,
      table.status,
    ),
    rewardStatusQualifiedIdx: index("referrals_reward_status_qualified_idx").on(
      table.rewardId,
      table.status,
      table.qualifiedAt,
    ),
    referredStatusIdx: index("referrals_referred_status_idx").on(
      table.referredId,
      table.status,
    ),
    noSelfReferral: check(
      "referrals_referrer_referred_check",
      sql`${table.referrerId} <> ${table.referredId}`,
    ),
  }),
);
