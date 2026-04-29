import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  predictionMarketCategoryValues,
  predictionMarketAppealReasonValues,
  predictionMarketAppealStatusValues,
  predictionMarketInvalidPolicyValues,
  predictionMarketMechanismValues,
  predictionMarketOracleBindingStatusValues,
  predictionMarketOracleProviderValues,
  predictionMarketStatusValues,
  predictionPositionStatusValues,
} from "@reward/shared-types/prediction-market";

import { admins, users } from "./user.js";

export const predictionMarkets = pgTable(
  "prediction_markets",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    roundKey: varchar("round_key", { length: 64 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    resolutionRules: text("resolution_rules").notNull(),
    sourceOfTruth: text("source_of_truth").notNull(),
    category: varchar("category", {
      length: 32,
      enum: predictionMarketCategoryValues,
    }).notNull(),
    tags: jsonb("tags").notNull(),
    invalidPolicy: varchar("invalid_policy", {
      length: 32,
      enum: predictionMarketInvalidPolicyValues,
    }).notNull(),
    mechanism: varchar("mechanism", {
      length: 32,
      enum: predictionMarketMechanismValues,
    })
      .notNull()
      .default("pari_mutuel"),
    vigBps: integer("vig_bps").notNull().default(0),
    status: varchar("status", {
      length: 32,
      enum: predictionMarketStatusValues,
    })
      .notNull()
      .default("draft"),
    outcomes: jsonb("outcomes").notNull(),
    totalPoolAmount: numeric("total_pool_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    winningOutcomeKey: varchar("winning_outcome_key", { length: 64 }),
    winningPoolAmount: numeric("winning_pool_amount", {
      precision: 14,
      scale: 2,
    }),
    oracleSource: varchar("oracle_source", { length: 64 }),
    oracleExternalRef: varchar("oracle_external_ref", { length: 128 }),
    oracleReportedAt: timestamp("oracle_reported_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    locksAt: timestamp("locks_at", { withTimezone: true }).notNull(),
    resolvesAt: timestamp("resolves_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("prediction_markets_slug_unique").on(table.slug),
    statusLocksIdx: index("prediction_markets_status_locks_idx").on(
      table.status,
      table.locksAt,
    ),
    roundStatusIdx: index("prediction_markets_round_status_idx").on(
      table.roundKey,
      table.status,
      table.createdAt,
    ),
  }),
);

export const predictionPositions = pgTable(
  "prediction_positions",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    outcomeKey: varchar("outcome_key", { length: 64 }).notNull(),
    stakeAmount: numeric("stake_amount", { precision: 14, scale: 2 }).notNull(),
    payoutAmount: numeric("payout_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    status: varchar("status", {
      length: 32,
      enum: predictionPositionStatusValues,
    })
      .notNull()
      .default("open"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => ({
    marketCreatedIdx: index("prediction_positions_market_created_idx").on(
      table.marketId,
      table.createdAt,
    ),
    marketOutcomeIdx: index("prediction_positions_market_outcome_idx").on(
      table.marketId,
      table.outcomeKey,
      table.createdAt,
    ),
    userCreatedIdx: index("prediction_positions_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    marketStatusIdx: index("prediction_positions_market_status_idx").on(
      table.marketId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const predictionMarketOracles = pgTable(
  "prediction_market_oracles",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    provider: varchar("provider", {
      length: 32,
      enum: predictionMarketOracleProviderValues,
    }).notNull(),
    name: varchar("name", { length: 160 }),
    status: varchar("status", {
      length: 32,
      enum: predictionMarketOracleBindingStatusValues,
    })
      .notNull()
      .default("active"),
    config: jsonb("config").notNull(),
    metadata: jsonb("metadata"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastReportedAt: timestamp("last_reported_at", { withTimezone: true }),
    lastResolvedOutcomeKey: varchar("last_resolved_outcome_key", {
      length: 64,
    }),
    lastPayloadHash: varchar("last_payload_hash", { length: 191 }),
    lastPayload: jsonb("last_payload"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    marketUnique: uniqueIndex("prediction_market_oracles_market_unique").on(
      table.marketId,
    ),
    providerStatusIdx: index("prediction_market_oracles_provider_status_idx").on(
      table.provider,
      table.status,
      table.lastCheckedAt,
    ),
  }),
);

export const predictionMarketAppeals = pgTable(
  "prediction_market_appeals",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    oracleBindingId: integer("oracle_binding_id").references(
      () => predictionMarketOracles.id,
      { onDelete: "set null" },
    ),
    resolvedByAdminId: integer("resolved_by_admin_id").references(
      () => admins.id,
      { onDelete: "set null" },
    ),
    appealKey: varchar("appeal_key", { length: 191 }).notNull(),
    provider: varchar("provider", {
      length: 32,
      enum: predictionMarketOracleProviderValues,
    }),
    reason: varchar("reason", {
      length: 64,
      enum: predictionMarketAppealReasonValues,
    }).notNull(),
    status: varchar("status", {
      length: 32,
      enum: predictionMarketAppealStatusValues,
    })
      .notNull()
      .default("open"),
    title: varchar("title", { length: 191 }).notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata"),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    appealKeyUnique: uniqueIndex("prediction_market_appeals_key_unique").on(
      table.appealKey,
    ),
    marketStatusIdx: index("prediction_market_appeals_market_status_idx").on(
      table.marketId,
      table.status,
      table.lastDetectedAt,
    ),
    reasonStatusIdx: index("prediction_market_appeals_reason_status_idx").on(
      table.reason,
      table.status,
      table.lastDetectedAt,
    ),
  }),
);
