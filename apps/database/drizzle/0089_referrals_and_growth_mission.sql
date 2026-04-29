CREATE TABLE IF NOT EXISTS "referrals" (
  "id" serial PRIMARY KEY NOT NULL,
  "referrer_id" integer NOT NULL,
  "referred_id" integer NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "reward_id" varchar(128) NOT NULL,
  "qualified_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "referrals_referrer_referred_check" CHECK ("referrer_id" <> "referred_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_id_unique" ON "referrals" ("referred_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referrer_reward_status_idx" ON "referrals" ("referrer_id","reward_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_reward_status_qualified_idx" ON "referrals" ("reward_id","status","qualified_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referred_status_idx" ON "referrals" ("referred_id","status");
--> statement-breakpoint
INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'referral_starter',
  'metric_threshold',
  jsonb_build_object(
    'title', 'Invite a friend',
    'description', 'Invite one friend who completes Tier 1 KYC to unlock a referral reward.',
    'metric', 'referral_success_count',
    'target', 1,
    'cadence', 'one_time',
    'rewardId', 'referral_program',
    'sortOrder', 60
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.referral_bonus_amount'
      LIMIT 1
    ),
    0
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.referral_bonus_enabled'
      LIMIT 1
    ),
    0
  ) > 0
  AND COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.referral_bonus_amount'
      LIMIT 1
    ),
    0
  ) > 0
WHERE NOT EXISTS (
  SELECT 1 FROM "missions" WHERE "id" = 'referral_starter'
);
