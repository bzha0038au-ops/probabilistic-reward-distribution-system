CREATE TABLE IF NOT EXISTS "agent_blocklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"mode" varchar(32) DEFAULT 'blocked' NOT NULL,
	"reason" varchar(255) NOT NULL,
	"budget_multiplier" numeric(5,4),
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_blocklist" ADD CONSTRAINT "agent_blocklist_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_blocklist" ADD CONSTRAINT "agent_blocklist_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_blocklist_tenant_agent_unique" ON "agent_blocklist" ("tenant_id","agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_blocklist_tenant_mode_idx" ON "agent_blocklist" ("tenant_id","mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_blocklist_tenant_updated_idx" ON "agent_blocklist" ("tenant_id","updated_at");
