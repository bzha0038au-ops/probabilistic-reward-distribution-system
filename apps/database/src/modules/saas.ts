import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
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
import { sql } from "drizzle-orm";
import { drawStatusValues } from "@reward/shared-types/draw";
import {
  saasAgentControlModeValues,
  saasBillingCollectionMethodValues,
  saasBillingDisputeReasonValues,
  saasBillingDisputeResolutionValues,
  saasBillingDisputeStatusValues,
  saasBillingRunExternalSyncActionValues,
  saasBillingRunExternalSyncStageValues,
  saasBillingRunExternalSyncStatusValues,
  prizeEngineApiKeyScopeValues,
  saasDecisionTypeValues,
  saasBillingPlanValues,
  saasBillingRunStatusValues,
  saasBillingTopUpStatusValues,
  saasEnvironmentValues,
  saasOutboundWebhookDeliveryStatusValues,
  saasOutboundWebhookEventValues,
  saasReportExportFormatValues,
  saasReportExportResourceValues,
  saasReportExportStatusValues,
  saasRewardEnvelopeCapHitStrategyValues,
  saasRewardEnvelopeWindowValues,
  saasProjectStrategyValues,
  saasResourceStatusValues,
  saasStripeWebhookEventStatusValues,
  saasTenantInviteStatusValues,
  saasTenantLinkTypeValues,
  saasTenantRoleValues,
} from "@reward/shared-types/saas";

import { admins } from "./user.js";

const antiExploitSeverityValues = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

const antiExploitIdentityTypeValues = [
  "agent_id",
  "fingerprint",
  "player_external_id",
  "api_key",
] as const;

const antiExploitEventTypeValues = [
  "anti_exploit_hit",
  "agent_blocklist_applied",
] as const;

const antiExploitPluginValues = [
  "idempotency_check",
  "signature_anomaly",
  "fingerprint_dedup",
  "behavior_template_anomaly",
  "group_correlation_spike",
  "reward_risk_score",
] as const;

export const saasTenants = pgTable(
  "saas_tenants",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    billingEmail: varchar("billing_email", { length: 255 }),
    riskEnvelopeDailyBudgetCap: numeric("risk_envelope_daily_budget_cap", {
      precision: 14,
      scale: 2,
    }),
    riskEnvelopeMaxSinglePayout: numeric("risk_envelope_max_single_payout", {
      precision: 14,
      scale: 2,
    }),
    riskEnvelopeVarianceCap: numeric("risk_envelope_variance_cap", {
      precision: 14,
      scale: 2,
    }),
    riskEnvelopeEmergencyStop: boolean("risk_envelope_emergency_stop")
      .notNull()
      .default(false),
    status: varchar("status", {
      length: 32,
      enum: saasResourceStatusValues,
    })
      .notNull()
      .default("active"),
    metadata: jsonb("metadata"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("saas_tenants_slug_unique").on(table.slug),
    statusIdx: index("saas_tenants_status_idx").on(table.status),
  }),
);

export const saasProjects = pgTable(
  "saas_projects",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    environment: varchar("environment", {
      length: 16,
      enum: saasEnvironmentValues,
    })
      .notNull()
      .default("sandbox"),
    status: varchar("status", {
      length: 32,
      enum: saasResourceStatusValues,
    })
      .notNull()
      .default("active"),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    drawCost: numeric("draw_cost", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    prizePoolBalance: numeric("prize_pool_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    strategy: varchar("strategy", {
      length: 32,
      enum: saasProjectStrategyValues,
    })
      .notNull()
      .default("weighted_gacha"),
    strategyParams: jsonb("strategy_params").notNull().default({}),
    fairnessEpochSeconds: integer("fairness_epoch_seconds")
      .notNull()
      .default(3600),
    maxDrawCount: integer("max_draw_count").notNull().default(1),
    missWeight: integer("miss_weight").notNull().default(0),
    apiRateLimitBurst: integer("api_rate_limit_burst").notNull().default(120),
    apiRateLimitHourly: integer("api_rate_limit_hourly")
      .notNull()
      .default(3600),
    apiRateLimitDaily: integer("api_rate_limit_daily").notNull().default(86400),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantSlugEnvUnique: uniqueIndex("saas_projects_tenant_slug_env_unique").on(
      table.tenantId,
      table.slug,
      table.environment,
    ),
    tenantIdx: index("saas_projects_tenant_idx").on(
      table.tenantId,
      table.environment,
    ),
    statusIdx: index("saas_projects_status_idx").on(table.status),
  }),
);

export const saasProjectPrizes = pgTable(
  "saas_project_prizes",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    stock: integer("stock").notNull().default(0),
    weight: integer("weight").notNull().default(1),
    rewardAmount: numeric("reward_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectIdx: index("saas_project_prizes_project_idx").on(table.projectId),
    activeStockIdx: index("saas_project_prizes_active_stock_idx").on(
      table.projectId,
      table.isActive,
      table.stock,
    ),
    deletedIdx: index("saas_project_prizes_deleted_idx").on(table.deletedAt),
  }),
);

export const saasRewardEnvelopes = pgTable(
  "saas_reward_envelopes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => saasProjects.id, {
      onDelete: "cascade",
    }),
    window: varchar("window", {
      length: 16,
      enum: saasRewardEnvelopeWindowValues,
    }).notNull(),
    onCapHitStrategy: varchar("on_cap_hit_strategy", {
      length: 16,
      enum: saasRewardEnvelopeCapHitStrategyValues,
    })
      .notNull()
      .default("reject"),
    budgetCap: numeric("budget_cap", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    expectedPayoutPerCall: numeric("expected_payout_per_call", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    varianceCap: numeric("variance_cap", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    currentConsumed: numeric("current_consumed", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    currentCallCount: integer("current_call_count").notNull().default(0),
    currentWindowStartedAt: timestamp("current_window_started_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantProjectIdx: index("saas_reward_envelopes_tenant_project_idx").on(
      table.tenantId,
      table.projectId,
    ),
    tenantWindowIdx: index("saas_reward_envelopes_tenant_window_idx").on(
      table.tenantId,
      table.window,
    ),
    projectWindowIdx: index("saas_reward_envelopes_project_window_idx").on(
      table.projectId,
      table.window,
    ),
  }),
);

export const saasAgents = pgTable(
  "saas_agents",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 128 }).notNull(),
    groupId: varchar("group_id", { length: 128 }),
    ownerMetadata: jsonb("owner_metadata"),
    fingerprint: varchar("fingerprint", { length: 255 }),
    status: varchar("status", {
      length: 32,
      enum: saasResourceStatusValues,
    })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectExternalUnique: uniqueIndex(
      "saas_agents_project_external_unique",
    ).on(table.projectId, table.externalId),
    projectGroupIdx: index("saas_agents_project_group_idx").on(
      table.projectId,
      table.groupId,
    ),
    projectStatusIdx: index("saas_agents_project_status_idx").on(
      table.projectId,
      table.status,
    ),
    fingerprintIdx: index("saas_agents_fingerprint_idx").on(
      table.projectId,
      table.fingerprint,
    ),
  }),
);

export const saasPlayers = pgTable(
  "saas_players",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    externalPlayerId: varchar("external_player_id", { length: 128 }).notNull(),
    displayName: varchar("display_name", { length: 160 }),
    balance: numeric("balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    pityStreak: integer("pity_streak").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectExternalUnique: uniqueIndex(
      "saas_players_project_external_unique",
    ).on(table.projectId, table.externalPlayerId),
    projectIdx: index("saas_players_project_idx").on(table.projectId),
  }),
);

export const saasDrawRecords = pgTable(
  "saas_draw_records",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => saasPlayers.id, { onDelete: "cascade" }),
    environment: varchar("environment", {
      length: 16,
      enum: saasEnvironmentValues,
    }).notNull(),
    agentId: varchar("agent_id", { length: 128 }).notNull(),
    groupId: varchar("group_id", { length: 128 }),
    prizeId: integer("prize_id").references(() => saasProjectPrizes.id, {
      onDelete: "set null",
    }),
    drawCost: numeric("draw_cost", { precision: 14, scale: 2 }).notNull(),
    rewardAmount: numeric("reward_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    expectedRewardAmount: numeric("expected_reward_amount", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    status: varchar("status", { length: 32, enum: drawStatusValues }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectPlayerCreatedIdx: index(
      "saas_draw_records_project_player_created_idx",
    ).on(table.projectId, table.playerId, table.createdAt),
    projectPlayerEnvironmentCreatedIdx: index(
      "saas_draw_records_project_player_env_created_idx",
    ).on(table.projectId, table.playerId, table.environment, table.createdAt),
    projectStatusCreatedIdx: index(
      "saas_draw_records_project_status_created_idx",
    ).on(table.projectId, table.status, table.createdAt),
    projectAgentCreatedIdx: index(
      "saas_draw_records_project_agent_created_idx",
    ).on(table.projectId, table.agentId, table.createdAt),
    projectEnvironmentAgentCreatedIdx: index(
      "saas_draw_records_project_env_agent_created_idx",
    ).on(table.projectId, table.environment, table.agentId, table.createdAt),
    projectGroupCreatedIdx: index(
      "saas_draw_records_project_group_created_idx",
    ).on(table.projectId, table.groupId, table.createdAt),
    projectEnvironmentGroupCreatedIdx: index(
      "saas_draw_records_project_env_group_created_idx",
    ).on(table.projectId, table.environment, table.groupId, table.createdAt),
  }),
);

export const saasAgentGroupCorrelations = pgTable(
  "saas_agent_group_correlations",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 128 }).notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => saasPlayers.id, { onDelete: "cascade" }),
    drawRecordId: integer("draw_record_id").notNull(),
    groupId: varchar("group_id", { length: 128 }).notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    groupDrawCountWindow: integer("group_draw_count_window")
      .notNull()
      .default(0),
    groupDistinctPlayerCountWindow: integer(
      "group_distinct_player_count_window",
    )
      .notNull()
      .default(0),
    groupRewardAmountWindow: numeric("group_reward_amount_window", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    groupExpectedRewardAmountWindow: numeric(
      "group_expected_reward_amount_window",
      {
        precision: 14,
        scale: 4,
      },
    )
      .notNull()
      .default("0"),
    groupPositiveVarianceWindow: numeric("group_positive_variance_window", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    agentDrawCountWindow: integer("agent_draw_count_window")
      .notNull()
      .default(0),
    agentRewardAmountWindow: numeric("agent_reward_amount_window", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    agentExpectedRewardAmountWindow: numeric(
      "agent_expected_reward_amount_window",
      {
        precision: 14,
        scale: 4,
      },
    )
      .notNull()
      .default("0"),
    agentPositiveVarianceWindow: numeric("agent_positive_variance_window", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    drawRecordFk: foreignKey({
      name: "saas_agent_group_correlations_draw_record_fk",
      columns: [table.drawRecordId],
      foreignColumns: [saasDrawRecords.id],
    }).onDelete("cascade"),
    projectGroupCreatedIdx: index(
      "saas_agent_group_corr_project_group_created_idx",
    ).on(table.projectId, table.groupId, table.createdAt),
    agentCreatedIdx: index("saas_agent_group_corr_agent_created_idx").on(
      table.agentId,
      table.createdAt,
    ),
    drawRecordUnique: uniqueIndex(
      "saas_agent_group_corr_draw_record_unique",
    ).on(table.drawRecordId),
  }),
);

export const saasDistributionSnapshots = pgTable(
  "saas_distribution_snapshots",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    windowKey: varchar("window_key", { length: 16 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    drawCount: integer("draw_count").notNull().default(0),
    trackedDrawCount: integer("tracked_draw_count").notNull().default(0),
    trackingCoverageRatio: numeric("tracking_coverage_ratio", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    actualPayoutSum: numeric("actual_payout_sum", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    expectedPayoutSum: numeric("expected_payout_sum", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    payoutDeviationAmount: numeric("payout_deviation_amount", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    payoutDeviationRatio: numeric("payout_deviation_ratio", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    maxBucketDeviationRatio: numeric("max_bucket_deviation_ratio", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    actualPayoutHistogram: jsonb("actual_payout_histogram")
      .notNull()
      .default(sql`'{}'::jsonb`),
    expectedPayoutHistogram: jsonb("expected_payout_histogram")
      .notNull()
      .default(sql`'{}'::jsonb`),
    actualBucketHistogram: jsonb("actual_bucket_histogram")
      .notNull()
      .default(sql`'{}'::jsonb`),
    expectedBucketHistogram: jsonb("expected_bucket_histogram")
      .notNull()
      .default(sql`'{}'::jsonb`),
    breachReasons: jsonb("breach_reasons")
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectWindowCapturedUnique: uniqueIndex(
      "saas_distribution_snapshots_project_window_captured_unique",
    ).on(table.projectId, table.windowKey, table.capturedAt),
    projectCapturedIdx: index(
      "saas_distribution_snapshots_project_captured_idx",
    ).on(table.projectId, table.capturedAt),
    windowCapturedIdx: index(
      "saas_distribution_snapshots_window_captured_idx",
    ).on(table.windowKey, table.capturedAt),
  }),
);

export const saasLedgerEntries = pgTable(
  "saas_ledger_entries",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => saasPlayers.id, { onDelete: "cascade" }),
    environment: varchar("environment", {
      length: 16,
      enum: saasEnvironmentValues,
    }).notNull(),
    entryType: varchar("entry_type", { length: 64 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", {
      precision: 14,
      scale: 2,
    }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 14,
      scale: 2,
    }).notNull(),
    referenceType: varchar("reference_type", { length: 64 }),
    referenceId: integer("reference_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectPlayerCreatedIdx: index(
      "saas_ledger_entries_project_player_created_idx",
    ).on(table.projectId, table.playerId, table.createdAt),
    entryTypeIdx: index("saas_ledger_entries_entry_type_idx").on(
      table.projectId,
      table.entryType,
      table.createdAt,
    ),
  }),
);

export const saasFairnessSeeds = pgTable(
  "saas_fairness_seeds",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    environment: varchar("environment", {
      length: 16,
      enum: saasEnvironmentValues,
    }).notNull(),
    epoch: integer("epoch").notNull(),
    epochSeconds: integer("epoch_seconds").notNull(),
    commitHash: varchar("commit_hash", { length: 128 }).notNull(),
    seed: varchar("seed", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
  },
  (table) => ({
    projectEpochUnique: uniqueIndex(
      "saas_fairness_seeds_project_epoch_unique",
    ).on(table.projectId, table.epoch, table.epochSeconds),
    projectCommitIdx: index("saas_fairness_seeds_project_commit_idx").on(
      table.projectId,
      table.commitHash,
    ),
  }),
);

export const saasApiKeys = pgTable(
  "saas_api_keys",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 64 }).notNull(),
    keyHash: varchar("key_hash", { length: 128 }).notNull(),
    scopes: jsonb("scopes").notNull(),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedFromApiKeyId: integer("rotated_from_api_key_id").references(
      (): AnyPgColumn => saasApiKeys.id,
      {
        onDelete: "set null",
      },
    ),
    rotatedToApiKeyId: integer("rotated_to_api_key_id").references(
      (): AnyPgColumn => saasApiKeys.id,
      {
        onDelete: "set null",
      },
    ),
    revokedByAdminId: integer("revoked_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    revokeReason: varchar("revoke_reason", { length: 255 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    prefixUnique: uniqueIndex("saas_api_keys_prefix_unique").on(
      table.keyPrefix,
    ),
    hashUnique: uniqueIndex("saas_api_keys_hash_unique").on(table.keyHash),
    projectIdx: index("saas_api_keys_project_idx").on(table.projectId),
    expiresIdx: index("saas_api_keys_expires_idx").on(table.expiresAt),
    rotatedFromUnique: uniqueIndex("saas_api_keys_rotated_from_unique").on(
      table.rotatedFromApiKeyId,
    ),
    rotatedToUnique: uniqueIndex("saas_api_keys_rotated_to_unique").on(
      table.rotatedToApiKeyId,
    ),
  }),
);

export const saasTenantMemberships = pgTable(
  "saas_tenant_memberships",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    adminId: integer("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    role: varchar("role", {
      length: 32,
      enum: saasTenantRoleValues,
    }).notNull(),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantAdminUnique: uniqueIndex(
      "saas_tenant_memberships_tenant_admin_unique",
    ).on(table.tenantId, table.adminId),
    tenantRoleIdx: index("saas_tenant_memberships_tenant_role_idx").on(
      table.tenantId,
      table.role,
    ),
    adminIdx: index("saas_tenant_memberships_admin_idx").on(table.adminId),
  }),
);

export const saasBillingAccounts = pgTable(
  "saas_billing_accounts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    planCode: varchar("plan_code", {
      length: 32,
      enum: saasBillingPlanValues,
    })
      .notNull()
      .default("starter"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
    collectionMethod: varchar("collection_method", {
      length: 32,
      enum: saasBillingCollectionMethodValues,
    })
      .notNull()
      .default("send_invoice"),
    autoBillingEnabled: boolean("auto_billing_enabled")
      .notNull()
      .default(false),
    portalConfigurationId: varchar("portal_configuration_id", { length: 128 }),
    baseMonthlyFee: numeric("base_monthly_fee", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    drawFee: numeric("draw_fee", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    isBillable: boolean("is_billable").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantUnique: uniqueIndex("saas_billing_accounts_tenant_unique").on(
      table.tenantId,
    ),
  }),
);

export const saasBillingAccountVersions = pgTable(
  "saas_billing_account_versions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    billingAccountId: integer("billing_account_id").notNull(),
    planCode: varchar("plan_code", {
      length: 32,
      enum: saasBillingPlanValues,
    })
      .notNull()
      .default("starter"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
    collectionMethod: varchar("collection_method", {
      length: 32,
      enum: saasBillingCollectionMethodValues,
    })
      .notNull()
      .default("send_invoice"),
    autoBillingEnabled: boolean("auto_billing_enabled")
      .notNull()
      .default(false),
    portalConfigurationId: varchar("portal_configuration_id", { length: 128 }),
    baseMonthlyFee: numeric("base_monthly_fee", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    drawFee: numeric("draw_fee", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    isBillable: boolean("is_billable").notNull().default(true),
    metadata: jsonb("metadata"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    billingAccountFk: foreignKey({
      name: "saas_billing_account_versions_billing_account_fk",
      columns: [table.billingAccountId],
      foreignColumns: [saasBillingAccounts.id],
    }).onDelete("cascade"),
    accountEffectiveIdx: index(
      "saas_billing_account_versions_account_effective_idx",
    ).on(table.billingAccountId, table.effectiveAt),
    tenantEffectiveIdx: index(
      "saas_billing_account_versions_tenant_effective_idx",
    ).on(table.tenantId, table.effectiveAt),
  }),
);

export const saasBillingRuns = pgTable(
  "saas_billing_runs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    billingAccountId: integer("billing_account_id"),
    billingAccountVersionId: integer("billing_account_version_id"),
    status: varchar("status", {
      length: 32,
      enum: saasBillingRunStatusValues,
    })
      .notNull()
      .default("draft"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    baseFeeAmount: numeric("base_fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    usageFeeAmount: numeric("usage_fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    creditAppliedAmount: numeric("credit_applied_amount", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    drawCount: integer("draw_count").notNull().default(0),
    stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 128 }),
    stripeInvoiceStatus: varchar("stripe_invoice_status", { length: 64 }),
    stripeHostedInvoiceUrl: text("stripe_hosted_invoice_url"),
    stripeInvoicePdf: text("stripe_invoice_pdf"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    externalSyncStatus: varchar("external_sync_status", {
      length: 32,
      enum: saasBillingRunExternalSyncStatusValues,
    })
      .notNull()
      .default("idle"),
    externalSyncAction: varchar("external_sync_action", {
      length: 64,
      enum: saasBillingRunExternalSyncActionValues,
    }),
    externalSyncStage: varchar("external_sync_stage", {
      length: 64,
      enum: saasBillingRunExternalSyncStageValues,
    }),
    externalSyncError: text("external_sync_error"),
    externalSyncRecoveryPath: varchar("external_sync_recovery_path", {
      length: 128,
    }),
    externalSyncObservedInvoiceStatus: varchar(
      "external_sync_observed_invoice_status",
      {
        length: 64,
      },
    ),
    externalSyncEventType: varchar("external_sync_event_type", { length: 128 }),
    externalSyncRevision: integer("external_sync_revision")
      .notNull()
      .default(0),
    externalSyncAttemptedAt: timestamp("external_sync_attempted_at", {
      withTimezone: true,
    }),
    externalSyncCompletedAt: timestamp("external_sync_completed_at", {
      withTimezone: true,
    }),
    metadata: jsonb("metadata"),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    billingAccountFk: foreignKey({
      name: "saas_billing_runs_billing_account_fk",
      columns: [table.billingAccountId],
      foreignColumns: [saasBillingAccounts.id],
    }).onDelete("set null"),
    billingAccountVersionFk: foreignKey({
      name: "saas_billing_runs_billing_account_version_fk",
      columns: [table.billingAccountVersionId],
      foreignColumns: [saasBillingAccountVersions.id],
    }).onDelete("set null"),
    tenantPeriodUnique: uniqueIndex(
      "saas_billing_runs_tenant_period_unique",
    ).on(table.tenantId, table.periodStart, table.periodEnd),
    stripeInvoiceUnique: uniqueIndex(
      "saas_billing_runs_stripe_invoice_unique",
    ).on(table.stripeInvoiceId),
    tenantStatusIdx: index("saas_billing_runs_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.periodEnd,
    ),
    externalSyncStatusUpdatedIdx: index(
      "saas_billing_runs_external_sync_status_updated_idx",
    ).on(table.externalSyncStatus, table.updatedAt),
    externalSyncStateCheck: check(
      "saas_billing_runs_external_sync_state_check",
      sql`(
        (${table.externalSyncStatus} = 'idle'
          AND ${table.externalSyncAction} IS NULL
          AND ${table.externalSyncStage} IS NULL
          AND ${table.externalSyncError} IS NULL
          AND ${table.externalSyncRecoveryPath} IS NULL
          AND ${table.externalSyncAttemptedAt} IS NULL
          AND ${table.externalSyncCompletedAt} IS NULL)
        OR
        (${table.externalSyncStatus} = 'processing'
          AND ${table.externalSyncAction} IS NOT NULL
          AND ${table.externalSyncStage} IS NOT NULL
          AND ${table.externalSyncError} IS NULL
          AND ${table.externalSyncRecoveryPath} IS NULL
          AND ${table.externalSyncAttemptedAt} IS NOT NULL
          AND ${table.externalSyncCompletedAt} IS NULL)
        OR
        (${table.externalSyncStatus} = 'succeeded'
          AND ${table.externalSyncAction} IS NOT NULL
          AND ${table.externalSyncStage} IS NOT NULL
          AND ${table.externalSyncError} IS NULL
          AND ${table.externalSyncRecoveryPath} IS NULL
          AND ${table.externalSyncAttemptedAt} IS NOT NULL
          AND ${table.externalSyncCompletedAt} IS NOT NULL)
        OR
        (${table.externalSyncStatus} = 'failed'
          AND ${table.externalSyncAction} IS NOT NULL
          AND ${table.externalSyncStage} IS NOT NULL
          AND ${table.externalSyncError} IS NOT NULL
          AND ${table.externalSyncRecoveryPath} IS NOT NULL
          AND ${table.externalSyncAttemptedAt} IS NOT NULL
          AND ${table.externalSyncCompletedAt} IS NOT NULL)
      )`,
    ),
    externalSyncCompletedOrderCheck: check(
      "saas_billing_runs_external_sync_completed_order_check",
      sql`${table.externalSyncCompletedAt} IS NULL
        OR (
          ${table.externalSyncAttemptedAt} IS NOT NULL
          AND ${table.externalSyncCompletedAt} >= ${table.externalSyncAttemptedAt}
        )`,
    ),
  }),
);

export const saasBillingTopUps = pgTable(
  "saas_billing_top_ups",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    billingAccountId: integer("billing_account_id"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    note: varchar("note", { length: 255 }),
    status: varchar("status", {
      length: 32,
      enum: saasBillingTopUpStatusValues,
    })
      .notNull()
      .default("pending"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
    stripeBalanceTransactionId: varchar("stripe_balance_transaction_id", {
      length: 128,
    }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    billingAccountFk: foreignKey({
      name: "saas_billing_top_ups_billing_account_fk",
      columns: [table.billingAccountId],
      foreignColumns: [saasBillingAccounts.id],
    }).onDelete("set null"),
    tenantCreatedIdx: index("saas_billing_top_ups_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    stripeBalanceUnique: uniqueIndex(
      "saas_billing_top_ups_stripe_balance_transaction_unique",
    ).on(table.stripeBalanceTransactionId),
  }),
);

export const saasBillingDisputes = pgTable(
  "saas_billing_disputes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    billingRunId: integer("billing_run_id")
      .notNull()
      .references(() => saasBillingRuns.id, { onDelete: "cascade" }),
    billingAccountId: integer("billing_account_id").references(
      () => saasBillingAccounts.id,
      { onDelete: "set null" },
    ),
    status: varchar("status", {
      length: 32,
      enum: saasBillingDisputeStatusValues,
    })
      .notNull()
      .default("submitted"),
    reason: varchar("reason", {
      length: 32,
      enum: saasBillingDisputeReasonValues,
    }).notNull(),
    summary: varchar("summary", { length: 160 }).notNull(),
    description: text("description").notNull(),
    requestedRefundAmount: numeric("requested_refund_amount", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    approvedRefundAmount: numeric("approved_refund_amount", {
      precision: 14,
      scale: 2,
    }),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    resolutionType: varchar("resolution_type", {
      length: 32,
      enum: saasBillingDisputeResolutionValues,
    }),
    resolutionNotes: text("resolution_notes"),
    stripeCreditNoteId: varchar("stripe_credit_note_id", { length: 128 }),
    stripeCreditNoteStatus: varchar("stripe_credit_note_status", {
      length: 64,
    }),
    stripeCreditNotePdf: text("stripe_credit_note_pdf"),
    metadata: jsonb("metadata"),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    resolvedByAdminId: integer("resolved_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("saas_billing_disputes_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    billingRunIdx: index("saas_billing_disputes_billing_run_idx").on(
      table.billingRunId,
      table.createdAt,
    ),
    statusCreatedIdx: index("saas_billing_disputes_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    stripeCreditNoteUnique: uniqueIndex(
      "saas_billing_disputes_stripe_credit_note_unique",
    ).on(table.stripeCreditNoteId),
  }),
);

export const saasBillingLedgerEntries = pgTable(
  "saas_billing_ledger_entries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    billingRunId: integer("billing_run_id").references(
      () => saasBillingRuns.id,
      { onDelete: "set null" },
    ),
    disputeId: integer("dispute_id").references(() => saasBillingDisputes.id, {
      onDelete: "set null",
    }),
    entryType: varchar("entry_type", { length: 64 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", {
      precision: 14,
      scale: 2,
    }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 14,
      scale: 2,
    }).notNull(),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    referenceType: varchar("reference_type", { length: 64 }),
    referenceId: integer("reference_id"),
    metadata: jsonb("metadata"),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index(
      "saas_billing_ledger_entries_tenant_created_idx",
    ).on(table.tenantId, table.createdAt),
    billingRunCreatedIdx: index(
      "saas_billing_ledger_entries_billing_run_created_idx",
    ).on(table.billingRunId, table.createdAt),
    disputeCreatedIdx: index(
      "saas_billing_ledger_entries_dispute_created_idx",
    ).on(table.disputeId, table.createdAt),
  }),
);

export const saasTenantInvites = pgTable(
  "saas_tenant_invites",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", {
      length: 32,
      enum: saasTenantRoleValues,
    }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    status: varchar("status", {
      length: 32,
      enum: saasTenantInviteStatusValues,
    })
      .notNull()
      .default("pending"),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    acceptedByAdminId: integer("accepted_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("saas_tenant_invites_token_hash_unique").on(
      table.tokenHash,
    ),
    tenantEmailStatusIdx: index(
      "saas_tenant_invites_tenant_email_status_idx",
    ).on(table.tenantId, table.email, table.status),
    expiresIdx: index("saas_tenant_invites_expires_idx").on(table.expiresAt),
  }),
);

export const saasTenantLinks = pgTable(
  "saas_tenant_links",
  {
    id: serial("id").primaryKey(),
    parentTenantId: integer("parent_tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    childTenantId: integer("child_tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    linkType: varchar("link_type", {
      length: 32,
      enum: saasTenantLinkTypeValues,
    })
      .notNull()
      .default("agent_client"),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    parentChildUnique: uniqueIndex("saas_tenant_links_parent_child_unique").on(
      table.parentTenantId,
      table.childTenantId,
      table.linkType,
    ),
    parentIdx: index("saas_tenant_links_parent_idx").on(table.parentTenantId),
    childIdx: index("saas_tenant_links_child_idx").on(table.childTenantId),
  }),
);

export const agentBlocklist = pgTable(
  "agent_blocklist",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 128 }).notNull(),
    mode: varchar("mode", {
      length: 32,
      enum: saasAgentControlModeValues,
    })
      .notNull()
      .default("blocked"),
    reason: varchar("reason", { length: 255 }).notNull(),
    budgetMultiplier: numeric("budget_multiplier", {
      precision: 5,
      scale: 4,
    }),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantAgentUnique: uniqueIndex("agent_blocklist_tenant_agent_unique").on(
      table.tenantId,
      table.agentId,
    ),
    tenantModeIdx: index("agent_blocklist_tenant_mode_idx").on(
      table.tenantId,
      table.mode,
    ),
    tenantUpdatedIdx: index("agent_blocklist_tenant_updated_idx").on(
      table.tenantId,
      table.updatedAt,
    ),
  }),
);

export const agentRiskState = pgTable(
  "agent_risk_state",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => saasApiKeys.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 128 }),
    playerExternalId: varchar("player_external_id", { length: 128 }),
    identityType: varchar("identity_type", {
      length: 32,
      enum: antiExploitIdentityTypeValues,
    }).notNull(),
    identityValueHash: varchar("identity_value_hash", {
      length: 128,
    }).notNull(),
    identityHint: varchar("identity_hint", { length: 160 }),
    riskScore: integer("risk_score").notNull().default(0),
    hitCount: integer("hit_count").notNull().default(0),
    severeHitCount: integer("severe_hit_count").notNull().default(0),
    lastSeverity: varchar("last_severity", {
      length: 16,
      enum: antiExploitSeverityValues,
    })
      .notNull()
      .default("low"),
    lastPlugin: varchar("last_plugin", {
      length: 64,
      enum: antiExploitPluginValues,
    }).notNull(),
    lastReason: varchar("last_reason", { length: 255 }).notNull(),
    metadata: jsonb("metadata"),
    firstHitAt: timestamp("first_hit_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "agent_risk_state_project_identity_unique",
    ).on(table.projectId, table.identityType, table.identityValueHash),
    tenantAgentIdx: index("agent_risk_state_tenant_agent_idx").on(
      table.tenantId,
      table.agentId,
    ),
    projectRiskIdx: index("agent_risk_state_project_risk_idx").on(
      table.projectId,
      table.riskScore,
      table.lastHitAt,
    ),
    apiKeyHitIdx: index("agent_risk_state_api_key_hit_idx").on(
      table.apiKeyId,
      table.lastHitAt,
    ),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => saasApiKeys.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 128 }),
    playerExternalId: varchar("player_external_id", { length: 128 }),
    eventType: varchar("event_type", {
      length: 32,
      enum: antiExploitEventTypeValues,
    }).notNull(),
    severity: varchar("severity", {
      length: 16,
      enum: antiExploitSeverityValues,
    }).notNull(),
    plugin: varchar("plugin", {
      length: 64,
      enum: antiExploitPluginValues,
    }).notNull(),
    identityType: varchar("identity_type", {
      length: 32,
      enum: antiExploitIdentityTypeValues,
    }).notNull(),
    identityValueHash: varchar("identity_value_hash", {
      length: 128,
    }).notNull(),
    identityHint: varchar("identity_hint", { length: 160 }),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectCreatedIdx: index("audit_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    eventTypeCreatedIdx: index("audit_events_event_type_created_idx").on(
      table.eventType,
      table.createdAt,
    ),
    agentCreatedIdx: index("audit_events_agent_created_idx").on(
      table.agentId,
      table.createdAt,
    ),
    identityCreatedIdx: index("audit_events_identity_created_idx").on(
      table.identityType,
      table.identityValueHash,
      table.createdAt,
    ),
  }),
);

export const saasOutboundWebhooks = pgTable(
  "saas_outbound_webhooks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: varchar("secret", { length: 255 }).notNull(),
    events: jsonb("events").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectUrlUnique: uniqueIndex(
      "saas_outbound_webhooks_project_url_unique",
    ).on(table.projectId, table.url),
    projectActiveIdx: index("saas_outbound_webhooks_project_active_idx").on(
      table.projectId,
      table.isActive,
    ),
  }),
);

export const saasOutboundWebhookDeliveries = pgTable(
  "saas_outbound_webhook_deliveries",
  {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id").notNull(),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    drawRecordId: integer("draw_record_id"),
    eventType: varchar("event_type", {
      length: 64,
      enum: saasOutboundWebhookEventValues,
    }).notNull(),
    eventId: varchar("event_id", { length: 191 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", {
      length: 32,
      enum: saasOutboundWebhookDeliveryStatusValues,
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastHttpStatus: integer("last_http_status"),
    lastError: text("last_error"),
    lastResponseBody: text("last_response_body"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    webhookFk: foreignKey({
      name: "saas_outbound_webhook_deliveries_webhook_fk",
      columns: [table.webhookId],
      foreignColumns: [saasOutboundWebhooks.id],
    }).onDelete("cascade"),
    drawRecordFk: foreignKey({
      name: "saas_outbound_webhook_deliveries_draw_record_fk",
      columns: [table.drawRecordId],
      foreignColumns: [saasDrawRecords.id],
    }).onDelete("set null"),
    webhookEventUnique: uniqueIndex(
      "saas_outbound_webhook_deliveries_webhook_event_unique",
    ).on(table.webhookId, table.eventId),
    statusNextAttemptIdx: index(
      "saas_outbound_webhook_deliveries_status_next_attempt_idx",
    ).on(table.status, table.nextAttemptAt),
    projectCreatedIdx: index(
      "saas_outbound_webhook_deliveries_project_created_idx",
    ).on(table.projectId, table.createdAt),
    webhookCreatedIdx: index(
      "saas_outbound_webhook_deliveries_webhook_created_idx",
    ).on(table.webhookId, table.createdAt),
  }),
);

export const saasStripeWebhookEvents = pgTable(
  "saas_stripe_webhook_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => saasTenants.id, {
      onDelete: "set null",
    }),
    billingRunId: integer("billing_run_id"),
    eventId: varchar("event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    status: varchar("status", {
      length: 32,
      enum: saasStripeWebhookEventStatusValues,
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    payload: jsonb("payload").notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    billingRunFk: foreignKey({
      name: "saas_stripe_webhook_events_billing_run_fk",
      columns: [table.billingRunId],
      foreignColumns: [saasBillingRuns.id],
    }).onDelete("set null"),
    eventIdUnique: uniqueIndex("saas_stripe_webhook_events_event_id_unique").on(
      table.eventId,
    ),
    statusNextAttemptIdx: index(
      "saas_stripe_webhook_events_status_next_attempt_idx",
    ).on(table.status, table.nextAttemptAt),
    tenantCreatedIdx: index("saas_stripe_webhook_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);

export const saasUsageEvents = pgTable(
  "saas_usage_events",
  {
    id: serial("id").notNull(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => saasProjects.id, { onDelete: "cascade" }),
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => saasApiKeys.id, { onDelete: "cascade" }),
    billingRunId: integer("billing_run_id").references(
      () => saasBillingRuns.id,
      {
        onDelete: "set null",
      },
    ),
    playerId: integer("player_id").references(() => saasPlayers.id, {
      onDelete: "set null",
    }),
    environment: varchar("environment", {
      length: 16,
      enum: saasEnvironmentValues,
    }).notNull(),
    eventType: varchar("event_type", {
      length: 64,
      enum: prizeEngineApiKeyScopeValues,
    }).notNull(),
    decisionType: varchar("decision_type", {
      length: 32,
      enum: saasDecisionTypeValues,
    }),
    referenceType: varchar("reference_type", { length: 64 }),
    referenceId: integer("reference_id"),
    units: integer("units").notNull().default(1),
    amount: numeric("amount", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    currency: varchar("currency", { length: 16 }).notNull().default("USD"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idIdx: index("saas_usage_events_id_idx").on(table.id),
    tenantCreatedIdx: index("saas_usage_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
      table.id,
    ),
    projectCreatedIdx: index("saas_usage_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    billingRunIdx: index("saas_usage_events_billing_run_idx").on(
      table.billingRunId,
    ),
    billingRunDecisionIdx: index(
      "saas_usage_events_billing_run_decision_idx",
    ).on(table.billingRunId, table.decisionType),
    eventReferenceIdx: index("saas_usage_events_event_reference_idx").on(
      table.eventType,
      table.referenceType,
      table.referenceId,
    ),
    apiKeyCreatedIdx: index("saas_usage_events_api_key_created_idx").on(
      table.apiKeyId,
      table.createdAt,
      table.id,
    ),
    playerCreatedIdx: index("saas_usage_events_player_created_idx").on(
      table.playerId,
      table.createdAt,
      table.id,
    ),
  }),
);

export const saasReportExports = pgTable(
  "saas_report_exports",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => saasProjects.id, {
      onDelete: "set null",
    }),
    createdByAdminId: integer("created_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    resource: varchar("resource", {
      length: 64,
      enum: saasReportExportResourceValues,
    }).notNull(),
    format: varchar("format", {
      length: 16,
      enum: saasReportExportFormatValues,
    }).notNull(),
    status: varchar("status", {
      length: 32,
      enum: saasReportExportStatusValues,
    })
      .notNull()
      .default("pending"),
    rowCount: integer("row_count"),
    contentType: varchar("content_type", { length: 128 }),
    fileName: varchar("file_name", { length: 255 }),
    content: text("content"),
    fromAt: timestamp("from_at", { withTimezone: true }).notNull(),
    toAt: timestamp("to_at", { withTimezone: true }).notNull(),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("saas_report_exports_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    tenantStatusCreatedIdx: index(
      "saas_report_exports_tenant_status_created_idx",
    ).on(table.tenantId, table.status, table.createdAt),
    statusCreatedIdx: index("saas_report_exports_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    statusLockedIdx: index("saas_report_exports_status_locked_idx").on(
      table.status,
      table.lockedAt,
    ),
  }),
);
