CREATE TABLE IF NOT EXISTS "agent_risk_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "project_id" integer NOT NULL,
  "api_key_id" integer NOT NULL,
  "agent_id" varchar(128),
  "player_external_id" varchar(128),
  "identity_type" varchar(32) NOT NULL,
  "identity_value_hash" varchar(128) NOT NULL,
  "identity_hint" varchar(160),
  "risk_score" integer DEFAULT 0 NOT NULL,
  "hit_count" integer DEFAULT 0 NOT NULL,
  "severe_hit_count" integer DEFAULT 0 NOT NULL,
  "last_severity" varchar(16) DEFAULT 'low' NOT NULL,
  "last_plugin" varchar(64) NOT NULL,
  "last_reason" varchar(255) NOT NULL,
  "metadata" jsonb,
  "first_hit_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_hit_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_risk_state" ADD CONSTRAINT "agent_risk_state_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_risk_state" ADD CONSTRAINT "agent_risk_state_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_risk_state" ADD CONSTRAINT "agent_risk_state_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_risk_state_project_identity_unique" ON "agent_risk_state" ("project_id","identity_type","identity_value_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_risk_state_tenant_agent_idx" ON "agent_risk_state" ("tenant_id","agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_risk_state_project_risk_idx" ON "agent_risk_state" ("project_id","risk_score","last_hit_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_risk_state_api_key_hit_idx" ON "agent_risk_state" ("api_key_id","last_hit_at");
