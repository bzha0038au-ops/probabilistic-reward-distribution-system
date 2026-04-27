CREATE TABLE IF NOT EXISTS "deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"provider_id" integer,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reference_id" varchar(64),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_account" (
	"id" serial PRIMARY KEY NOT NULL,
	"house_bankroll" numeric(14, 2) DEFAULT '0' NOT NULL,
	"prize_pool_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"marketing_budget" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reserve_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"house_account_id" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"reference_type" varchar(64),
	"reference_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"house_account_id" integer,
	"type" varchar(64) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"reference_type" varchar(64),
	"reference_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"provider_type" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_wallets" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"withdrawable_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bonus_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"locked_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"wagered_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "freeze_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suspicious_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawal_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" varchar(16) DEFAULT 'global' NOT NULL,
	"user_id" integer,
	"max_withdraw_per_day" numeric(14, 2) DEFAULT '0' NOT NULL,
	"min_withdraw_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"max_withdraw_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(64),
	"target_id" integer,
	"ip" varchar(64),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deposits" ADD CONSTRAINT "deposits_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_house_account_id_house_account_id_fk" FOREIGN KEY ("house_account_id") REFERENCES "public"."house_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_house_account_id_house_account_id_fk" FOREIGN KEY ("house_account_id") REFERENCES "public"."house_account"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "freeze_records" ADD CONSTRAINT "freeze_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspicious_accounts" ADD CONSTRAINT "suspicious_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_limits" ADD CONSTRAINT "withdrawal_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deposits_user_status_idx" ON "deposits" ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deposits_provider_idx" ON "deposits" ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "house_transactions_house_created_idx" ON "house_transactions" ("house_account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "house_transactions_type_created_idx" ON "house_transactions" ("type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_user_created_idx" ON "ledger_entries" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_house_created_idx" ON "ledger_entries" ("house_account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_type_created_idx" ON "ledger_entries" ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_providers_name_unique" ON "payment_providers" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_wallets_user_id_idx" ON "user_wallets" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "freeze_records_user_idx" ON "freeze_records" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "freeze_records_status_idx" ON "freeze_records" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspicious_accounts_user_idx" ON "suspicious_accounts" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspicious_accounts_status_idx" ON "suspicious_accounts" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_limits_scope_idx" ON "withdrawal_limits" ("scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_limits_user_idx" ON "withdrawal_limits" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_actions_admin_idx" ON "admin_actions" ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_actions_action_idx" ON "admin_actions" ("action");
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('system.site_name', NULL, '{"value":"Prize Pool & Probability Engine System"}'::jsonb, 'Site name'),
  ('system.maintenance_mode', 0, NULL, 'Maintenance mode'),
  ('system.registration_enabled', 1, NULL, 'Registration enabled'),
  ('system.login_enabled', 1, NULL, 'Login enabled'),
  ('system.default_language', NULL, '{"value":"en"}'::jsonb, 'Default language')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('draw_system.draw_enabled', 1, NULL, 'Draw enabled'),
  ('draw_system.min_draw_cost', 0, NULL, 'Minimum draw cost'),
  ('draw_system.max_draw_cost', 0, NULL, 'Maximum draw cost'),
  ('draw_system.max_draw_per_request', 1, NULL, 'Max draws per request'),
  ('draw_system.max_draw_per_day', 0, NULL, 'Max draws per day'),
  ('draw_system.cooldown_seconds', 0, NULL, 'Draw cooldown in seconds'),
  ('draw_cost', 0, NULL, 'Draw cost')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('pool_system.pool_min_reserve', 0, NULL, 'Pool minimum reserve'),
  ('pool_system.pool_max_payout_ratio', 1, NULL, 'Pool max payout ratio'),
  ('pool_system.pool_noise_enabled', 0, NULL, 'Pool noise enabled'),
  ('pool_system.pool_noise_range', NULL, '{"min":0,"max":0}'::jsonb, 'Pool noise range'),
  ('pool_system.pool_epoch_seconds', 0, NULL, 'Pool epoch seconds')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('payout_control.max_big_prize_per_hour', 0, NULL, 'Max big prizes per hour'),
  ('payout_control.max_big_prize_per_day', 0, NULL, 'Max big prizes per day'),
  ('payout_control.max_total_payout_per_hour', 0, NULL, 'Max total payout per hour'),
  ('payout_control.payout_cooldown_seconds', 0, NULL, 'Payout cooldown seconds')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('probability_control.weight_jitter_enabled', 0, NULL, 'Weight jitter enabled'),
  ('probability_control.weight_jitter_range', NULL, '{"min":0,"max":0.1}'::jsonb, 'Weight jitter range'),
  ('probability_control.probability_scale', 1, NULL, 'Probability scale'),
  ('probability_control.jackpot_probability_boost', 0, NULL, 'Jackpot probability boost'),
  ('random_weight_jitter_enabled', 0, NULL, 'Legacy weight jitter enabled'),
  ('random_weight_jitter_pct', 0, NULL, 'Legacy weight jitter pct')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('economy.house_bankroll', 0, NULL, 'House bankroll'),
  ('economy.prize_pool', 0, NULL, 'Prize pool'),
  ('economy.marketing_budget', 0, NULL, 'Marketing budget'),
  ('economy.reserve_fund', 0, NULL, 'Reserve fund'),
  ('economy.bonus_unlock_wager_ratio', 1, NULL, 'Bonus unlock wager ratio'),
  ('economy.bonus_expire_days', 0, NULL, 'Bonus expire days')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('anti_abuse.max_accounts_per_ip', 0, NULL, 'Max accounts per IP'),
  ('anti_abuse.max_withdraw_per_day', 0, NULL, 'Max withdraw per day'),
  ('anti_abuse.min_wager_before_withdraw', 0, NULL, 'Min wager before withdraw'),
  ('anti_abuse.suspicious_activity_threshold', 0, NULL, 'Suspicious activity threshold'),
  ('anti_abuse.auto_freeze_enabled', 0, NULL, 'Auto freeze enabled')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('payment.deposit_enabled', 1, NULL, 'Deposit enabled'),
  ('payment.withdraw_enabled', 1, NULL, 'Withdraw enabled'),
  ('payment.min_deposit_amount', 0, NULL, 'Minimum deposit amount'),
  ('payment.max_deposit_amount', 0, NULL, 'Maximum deposit amount'),
  ('payment.min_withdraw_amount', 0, NULL, 'Minimum withdraw amount'),
  ('payment.max_withdraw_amount', 0, NULL, 'Maximum withdraw amount')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('reward_events.signup_bonus_enabled', 0, NULL, 'Signup bonus enabled'),
  ('reward_events.signup_bonus_amount', 0, NULL, 'Signup bonus amount'),
  ('reward_events.referral_bonus_enabled', 0, NULL, 'Referral bonus enabled'),
  ('reward_events.referral_bonus_amount', 0, NULL, 'Referral bonus amount'),
  ('reward_events.daily_bonus_enabled', 0, NULL, 'Daily bonus enabled')
ON CONFLICT ("config_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('analytics.stats_visibility_delay_minutes', 0, NULL, 'Stats visibility delay'),
  ('analytics.public_stats_enabled', 0, NULL, 'Public stats enabled'),
  ('analytics.pool_balance_public', 0, NULL, 'Pool balance public')
ON CONFLICT ("config_key") DO NOTHING;
