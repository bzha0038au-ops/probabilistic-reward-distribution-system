ALTER TABLE "saas_draw_records"
ADD COLUMN IF NOT EXISTS "agent_id" varchar(128);
--> statement-breakpoint
UPDATE "saas_draw_records" AS "draws"
SET "agent_id" = coalesce("draws"."metadata"->>'agentId', "players"."external_player_id")
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
ADD COLUMN IF NOT EXISTS "expected_reward_amount" numeric(14, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_draw_records_project_agent_created_idx"
ON "saas_draw_records" ("project_id", "agent_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_draw_records_project_group_created_idx"
ON "saas_draw_records" ("project_id", "group_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_agent_group_correlations" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"player_id" integer NOT NULL,
	"draw_record_id" integer NOT NULL,
	"group_id" varchar(128) NOT NULL,
	"window_seconds" integer NOT NULL,
	"group_draw_count_window" integer DEFAULT 0 NOT NULL,
	"group_distinct_player_count_window" integer DEFAULT 0 NOT NULL,
	"group_reward_amount_window" numeric(14, 4) DEFAULT '0' NOT NULL,
	"group_expected_reward_amount_window" numeric(14, 4) DEFAULT '0' NOT NULL,
	"group_positive_variance_window" numeric(14, 4) DEFAULT '0' NOT NULL,
	"agent_draw_count_window" integer DEFAULT 0 NOT NULL,
	"agent_reward_amount_window" numeric(14, 4) DEFAULT '0' NOT NULL,
	"agent_expected_reward_amount_window" numeric(14, 4) DEFAULT '0' NOT NULL,
	"agent_positive_variance_window" numeric(14, 4) DEFAULT '0' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_agent_group_corr_project_group_created_idx"
ON "saas_agent_group_correlations" ("project_id", "group_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_agent_group_corr_agent_created_idx"
ON "saas_agent_group_correlations" ("agent_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_agent_group_corr_draw_record_unique"
ON "saas_agent_group_correlations" ("draw_record_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_agent_group_correlations" ADD CONSTRAINT "saas_agent_group_correlations_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_agent_group_correlations" ADD CONSTRAINT "saas_agent_group_correlations_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_agent_group_correlations" ADD CONSTRAINT "saas_agent_group_correlations_draw_record_fk" FOREIGN KEY ("draw_record_id") REFERENCES "public"."saas_draw_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
