CREATE TABLE IF NOT EXISTS "saas_tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"billing_email" varchar(255),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"environment" varchar(16) DEFAULT 'sandbox' NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"draw_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"prize_pool_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fairness_epoch_seconds" integer DEFAULT 3600 NOT NULL,
	"max_draw_count" integer DEFAULT 1 NOT NULL,
	"miss_weight" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_project_prizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"reward_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"external_player_id" varchar(128) NOT NULL,
	"display_name" varchar(160),
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pity_streak" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_draw_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"prize_id" integer,
	"draw_cost" numeric(14, 2) NOT NULL,
	"reward_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" varchar(32) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"entry_type" varchar(64) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"reference_type" varchar(64),
	"reference_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_fairness_seeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"epoch" integer NOT NULL,
	"epoch_seconds" integer NOT NULL,
	"commit_hash" varchar(128) NOT NULL,
	"seed" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"key_prefix" varchar(64) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by_admin_id" integer,
	"last_used_at" timestamp with time zone,
	"revoked_by_admin_id" integer,
	"revoke_reason" varchar(255),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_tenant_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"role" varchar(32) NOT NULL,
	"created_by_admin_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_billing_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_code" varchar(32) DEFAULT 'starter' NOT NULL,
	"stripe_customer_id" varchar(128),
	"collection_method" varchar(32) DEFAULT 'send_invoice' NOT NULL,
	"auto_billing_enabled" boolean DEFAULT false NOT NULL,
	"portal_configuration_id" varchar(128),
	"base_monthly_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"draw_fee" numeric(14, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"is_billable" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_billing_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"billing_account_id" integer,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"base_fee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"usage_fee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit_applied_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"draw_count" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" varchar(128),
	"stripe_invoice_id" varchar(128),
	"stripe_invoice_status" varchar(64),
	"stripe_hosted_invoice_url" text,
	"stripe_invoice_pdf" text,
	"synced_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"metadata" jsonb,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_billing_top_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"billing_account_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"note" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"stripe_customer_id" varchar(128),
	"stripe_balance_transaction_id" varchar(128),
	"synced_at" timestamp with time zone,
	"metadata" jsonb,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_tenant_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(32) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_by_admin_id" integer,
	"accepted_by_admin_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_tenant_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_tenant_id" integer NOT NULL,
	"child_tenant_id" integer NOT NULL,
	"link_type" varchar(32) DEFAULT 'agent_client' NOT NULL,
	"created_by_admin_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_stripe_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"billing_run_id" integer,
	"event_id" varchar(128) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"api_key_id" integer NOT NULL,
	"billing_run_id" integer,
	"player_id" integer,
	"event_type" varchar(64) NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_projects" ADD CONSTRAINT "saas_projects_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_project_prizes" ADD CONSTRAINT "saas_project_prizes_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_players" ADD CONSTRAINT "saas_players_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_draw_records" ADD CONSTRAINT "saas_draw_records_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_draw_records" ADD CONSTRAINT "saas_draw_records_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_draw_records" ADD CONSTRAINT "saas_draw_records_prize_id_saas_project_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."saas_project_prizes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_ledger_entries" ADD CONSTRAINT "saas_ledger_entries_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_ledger_entries" ADD CONSTRAINT "saas_ledger_entries_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_fairness_seeds" ADD CONSTRAINT "saas_fairness_seeds_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_api_keys" ADD CONSTRAINT "saas_api_keys_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_api_keys" ADD CONSTRAINT "saas_api_keys_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_api_keys" ADD CONSTRAINT "saas_api_keys_revoked_by_admin_id_admins_id_fk" FOREIGN KEY ("revoked_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_memberships" ADD CONSTRAINT "saas_tenant_memberships_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_memberships" ADD CONSTRAINT "saas_tenant_memberships_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_memberships" ADD CONSTRAINT "saas_tenant_memberships_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_accounts" ADD CONSTRAINT "saas_billing_accounts_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_runs" ADD CONSTRAINT "saas_billing_runs_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_runs" ADD CONSTRAINT "saas_billing_runs_billing_account_id_saas_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_runs" ADD CONSTRAINT "saas_billing_runs_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_top_ups" ADD CONSTRAINT "saas_billing_top_ups_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_top_ups" ADD CONSTRAINT "saas_billing_top_ups_billing_account_id_saas_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_top_ups" ADD CONSTRAINT "saas_billing_top_ups_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_invites" ADD CONSTRAINT "saas_tenant_invites_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_invites" ADD CONSTRAINT "saas_tenant_invites_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_invites" ADD CONSTRAINT "saas_tenant_invites_accepted_by_admin_id_admins_id_fk" FOREIGN KEY ("accepted_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_links" ADD CONSTRAINT "saas_tenant_links_parent_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("parent_tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_links" ADD CONSTRAINT "saas_tenant_links_child_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("child_tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_tenant_links" ADD CONSTRAINT "saas_tenant_links_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_stripe_webhook_events" ADD CONSTRAINT "saas_stripe_webhook_events_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_stripe_webhook_events" ADD CONSTRAINT "saas_stripe_webhook_events_billing_run_id_saas_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."saas_billing_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_usage_events" ADD CONSTRAINT "saas_usage_events_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_usage_events" ADD CONSTRAINT "saas_usage_events_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_usage_events" ADD CONSTRAINT "saas_usage_events_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_usage_events" ADD CONSTRAINT "saas_usage_events_billing_run_id_saas_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."saas_billing_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_usage_events" ADD CONSTRAINT "saas_usage_events_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_tenants_slug_unique" ON "saas_tenants" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenants_status_idx" ON "saas_tenants" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_projects_tenant_slug_env_unique" ON "saas_projects" ("tenant_id","slug","environment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_projects_tenant_idx" ON "saas_projects" ("tenant_id","environment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_projects_status_idx" ON "saas_projects" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_project_prizes_project_idx" ON "saas_project_prizes" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_project_prizes_active_stock_idx" ON "saas_project_prizes" ("project_id","is_active","stock");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_project_prizes_deleted_idx" ON "saas_project_prizes" ("deleted_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_players_project_external_unique" ON "saas_players" ("project_id","external_player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_players_project_idx" ON "saas_players" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_draw_records_project_player_created_idx" ON "saas_draw_records" ("project_id","player_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_draw_records_project_status_created_idx" ON "saas_draw_records" ("project_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_ledger_entries_project_player_created_idx" ON "saas_ledger_entries" ("project_id","player_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_ledger_entries_entry_type_idx" ON "saas_ledger_entries" ("project_id","entry_type","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_fairness_seeds_project_epoch_unique" ON "saas_fairness_seeds" ("project_id","epoch","epoch_seconds");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_fairness_seeds_project_commit_idx" ON "saas_fairness_seeds" ("project_id","commit_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_api_keys_prefix_unique" ON "saas_api_keys" ("key_prefix");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_api_keys_hash_unique" ON "saas_api_keys" ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_api_keys_project_idx" ON "saas_api_keys" ("project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_tenant_memberships_tenant_admin_unique" ON "saas_tenant_memberships" ("tenant_id","admin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenant_memberships_tenant_role_idx" ON "saas_tenant_memberships" ("tenant_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenant_memberships_admin_idx" ON "saas_tenant_memberships" ("admin_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_billing_accounts_tenant_unique" ON "saas_billing_accounts" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_billing_runs_tenant_period_unique" ON "saas_billing_runs" ("tenant_id","period_start","period_end");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_billing_runs_stripe_invoice_unique" ON "saas_billing_runs" ("stripe_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_billing_runs_tenant_status_idx" ON "saas_billing_runs" ("tenant_id","status","period_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_billing_top_ups_tenant_created_idx" ON "saas_billing_top_ups" ("tenant_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_billing_top_ups_stripe_balance_transaction_unique" ON "saas_billing_top_ups" ("stripe_balance_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_tenant_invites_token_hash_unique" ON "saas_tenant_invites" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenant_invites_tenant_email_status_idx" ON "saas_tenant_invites" ("tenant_id","email","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenant_invites_expires_idx" ON "saas_tenant_invites" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_tenant_links_parent_child_unique" ON "saas_tenant_links" ("parent_tenant_id","child_tenant_id","link_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenant_links_parent_idx" ON "saas_tenant_links" ("parent_tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_tenant_links_child_idx" ON "saas_tenant_links" ("child_tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_stripe_webhook_events_event_id_unique" ON "saas_stripe_webhook_events" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_stripe_webhook_events_status_next_attempt_idx" ON "saas_stripe_webhook_events" ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_stripe_webhook_events_tenant_created_idx" ON "saas_stripe_webhook_events" ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_usage_events_tenant_created_idx" ON "saas_usage_events" ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_usage_events_project_created_idx" ON "saas_usage_events" ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_usage_events_billing_run_idx" ON "saas_usage_events" ("billing_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_usage_events_api_key_created_idx" ON "saas_usage_events" ("api_key_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_usage_events_player_created_idx" ON "saas_usage_events" ("player_id","created_at");
