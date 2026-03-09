ALTER TABLE "users" ADD COLUMN "user_pool_balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "user_pool_threshold" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "payout_budget" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "payout_spent" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "payout_period_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "payout_period_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_user_pool_balance_idx" ON "users" ("user_pool_balance");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prizes_user_pool_threshold_idx" ON "prizes" ("user_pool_threshold");