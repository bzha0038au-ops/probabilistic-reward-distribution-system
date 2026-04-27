import {
  type AnyPgColumn,
  boolean,
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
import { drawStatusValues } from "@reward/shared-types/draw";
import {
  saasBillingCollectionMethodValues,
  prizeEngineApiKeyScopeValues,
  saasBillingPlanValues,
  saasBillingRunStatusValues,
  saasBillingTopUpStatusValues,
  saasEnvironmentValues,
  saasResourceStatusValues,
  saasStripeWebhookEventStatusValues,
  saasTenantInviteStatusValues,
  saasTenantLinkTypeValues,
  saasTenantRoleValues,
} from "@reward/shared-types/saas";

import { admins } from "./user.js";

export const saasTenants = pgTable(
  "saas_tenants",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    billingEmail: varchar("billing_email", { length: 255 }),
    status: varchar("status", {
      length: 32,
      enum: saasResourceStatusValues,
    })
      .notNull()
      .default("active"),
    metadata: jsonb("metadata"),
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
    prizeId: integer("prize_id").references(() => saasProjectPrizes.id, {
      onDelete: "set null",
    }),
    drawCost: numeric("draw_cost", { precision: 14, scale: 2 }).notNull(),
    rewardAmount: numeric("reward_amount", { precision: 14, scale: 2 })
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
    projectStatusCreatedIdx: index(
      "saas_draw_records_project_status_created_idx",
    ).on(table.projectId, table.status, table.createdAt),
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
    billingAccountId: integer("billing_account_id")
      .notNull()
      .references(() => saasBillingAccounts.id, { onDelete: "cascade" }),
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
    billingAccountId: integer("billing_account_id").references(
      () => saasBillingAccounts.id,
      { onDelete: "set null" },
    ),
    billingAccountVersionId: integer("billing_account_version_id").references(
      () => saasBillingAccountVersions.id,
      { onDelete: "set null" },
    ),
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
  }),
);

export const saasBillingTopUps = pgTable(
  "saas_billing_top_ups",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    billingAccountId: integer("billing_account_id").references(
      () => saasBillingAccounts.id,
      { onDelete: "set null" },
    ),
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
    tenantCreatedIdx: index("saas_billing_top_ups_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    stripeBalanceUnique: uniqueIndex(
      "saas_billing_top_ups_stripe_balance_transaction_unique",
    ).on(table.stripeBalanceTransactionId),
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

export const saasStripeWebhookEvents = pgTable(
  "saas_stripe_webhook_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => saasTenants.id, {
      onDelete: "set null",
    }),
    billingRunId: integer("billing_run_id").references(
      () => saasBillingRuns.id,
      {
        onDelete: "set null",
      },
    ),
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
    billingRunId: integer("billing_run_id").references(
      () => saasBillingRuns.id,
      {
        onDelete: "set null",
      },
    ),
    playerId: integer("player_id").references(() => saasPlayers.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", {
      length: 64,
      enum: prizeEngineApiKeyScopeValues,
    }).notNull(),
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
    tenantCreatedIdx: index("saas_usage_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    projectCreatedIdx: index("saas_usage_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    billingRunIdx: index("saas_usage_events_billing_run_idx").on(
      table.billingRunId,
    ),
    eventReferenceUnique: uniqueIndex(
      "saas_usage_events_event_reference_unique",
    ).on(table.eventType, table.referenceType, table.referenceId),
    apiKeyCreatedIdx: index("saas_usage_events_api_key_created_idx").on(
      table.apiKeyId,
      table.createdAt,
    ),
    playerCreatedIdx: index("saas_usage_events_player_created_idx").on(
      table.playerId,
      table.createdAt,
    ),
  }),
);
