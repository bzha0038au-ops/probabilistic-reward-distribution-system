ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "strategy" varchar(32);
--> statement-breakpoint
UPDATE "saas_projects"
SET "strategy" = COALESCE("strategy", 'weighted_gacha');
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy" SET DEFAULT 'weighted_gacha';
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "strategy_params" jsonb;
--> statement-breakpoint
UPDATE "saas_projects"
SET "strategy_params" = COALESCE("strategy_params", '{}'::jsonb);
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy_params" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy_params" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "saas_draw_records"
ADD COLUMN IF NOT EXISTS "agent_id" varchar(128);
--> statement-breakpoint
UPDATE "saas_draw_records" AS "draws"
SET "agent_id" = COALESCE(
  "draws"."agent_id",
  "draws"."metadata"->>'agentId',
  "players"."external_player_id"
)
FROM "saas_players" AS "players"
WHERE "draws"."player_id" = "players"."id"
  AND "draws"."agent_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ALTER COLUMN "agent_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ADD COLUMN IF NOT EXISTS "group_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ADD COLUMN IF NOT EXISTS "expected_reward_amount" numeric(14, 4);
--> statement-breakpoint
UPDATE "saas_draw_records"
SET "expected_reward_amount" = COALESCE("expected_reward_amount", "reward_amount", 0)
WHERE "expected_reward_amount" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ALTER COLUMN "expected_reward_amount" SET DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ALTER COLUMN "expected_reward_amount" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ADD COLUMN IF NOT EXISTS "environment" varchar(16);
--> statement-breakpoint
UPDATE "saas_draw_records" AS "records"
SET "environment" = COALESCE("records"."environment", "projects"."environment")
FROM "saas_projects" AS "projects"
WHERE "records"."project_id" = "projects"."id"
  AND "records"."environment" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_draw_records"
ALTER COLUMN "environment" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_draw_records_project_agent_created_idx"
ON "saas_draw_records" ("project_id", "agent_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_draw_records_project_group_created_idx"
ON "saas_draw_records" ("project_id", "group_id", "created_at");
--> statement-breakpoint

ALTER TABLE "saas_ledger_entries"
ADD COLUMN IF NOT EXISTS "environment" varchar(16);
--> statement-breakpoint
UPDATE "saas_ledger_entries" AS "entries"
SET "environment" = COALESCE("entries"."environment", "projects"."environment")
FROM "saas_projects" AS "projects"
WHERE "entries"."project_id" = "projects"."id"
  AND "entries"."environment" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_ledger_entries"
ALTER COLUMN "environment" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "saas_fairness_seeds"
ADD COLUMN IF NOT EXISTS "environment" varchar(16);
--> statement-breakpoint
UPDATE "saas_fairness_seeds" AS "seeds"
SET "environment" = COALESCE("seeds"."environment", "projects"."environment")
FROM "saas_projects" AS "projects"
WHERE "seeds"."project_id" = "projects"."id"
  AND "seeds"."environment" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_fairness_seeds"
ALTER COLUMN "environment" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "saas_usage_events"
ADD COLUMN IF NOT EXISTS "environment" varchar(16);
--> statement-breakpoint
UPDATE "saas_usage_events" AS "events"
SET "environment" = COALESCE("events"."environment", "projects"."environment")
FROM "saas_projects" AS "projects"
WHERE "events"."project_id" = "projects"."id"
  AND "events"."environment" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_usage_events"
ALTER COLUMN "environment" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_usage_events"
ADD COLUMN IF NOT EXISTS "decision_type" varchar(32);
--> statement-breakpoint
UPDATE "saas_usage_events"
SET "decision_type" = CASE
  WHEN "event_type" IN ('reward:write', 'draw:write')
    AND COALESCE("metadata"->>'status', '') = 'won'
    THEN 'payout'
  WHEN "event_type" IN ('reward:write', 'draw:write')
    THEN 'mute'
  ELSE "decision_type"
END
WHERE "decision_type" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_usage_events_billing_run_decision_idx"
ON "saas_usage_events" ("billing_run_id", "decision_type");
