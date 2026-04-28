CREATE TABLE IF NOT EXISTS "saas_reward_envelopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"project_id" integer,
	"window" varchar(16) NOT NULL,
	"on_cap_hit_strategy" varchar(16) DEFAULT 'reject' NOT NULL,
	"budget_cap" numeric(14, 4) DEFAULT '0' NOT NULL,
	"expected_payout_per_call" numeric(14, 4) DEFAULT '0' NOT NULL,
	"variance_cap" numeric(14, 4) DEFAULT '0' NOT NULL,
	"current_consumed" numeric(14, 4) DEFAULT '0' NOT NULL,
	"current_call_count" integer DEFAULT 0 NOT NULL,
	"current_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_reward_envelopes" ADD CONSTRAINT "saas_reward_envelopes_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_reward_envelopes" ADD CONSTRAINT "saas_reward_envelopes_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_reward_envelopes_tenant_project_idx" ON "saas_reward_envelopes" ("tenant_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_reward_envelopes_tenant_window_idx" ON "saas_reward_envelopes" ("tenant_id","window");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_reward_envelopes_project_window_idx" ON "saas_reward_envelopes" ("project_id","window");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_reward_envelopes_tenant_window_unique" ON "saas_reward_envelopes" ("tenant_id","window") WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_reward_envelopes_project_window_unique" ON "saas_reward_envelopes" ("tenant_id","project_id","window") WHERE "project_id" IS NOT NULL;
