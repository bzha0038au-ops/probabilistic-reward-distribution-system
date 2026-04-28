CREATE TABLE IF NOT EXISTS "saas_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"group_id" varchar(128),
	"owner_metadata" jsonb,
	"fingerprint" varchar(255),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_agents" ADD CONSTRAINT "saas_agents_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_agents_project_external_unique" ON "saas_agents" ("project_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_agents_project_group_idx" ON "saas_agents" ("project_id","group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_agents_project_status_idx" ON "saas_agents" ("project_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_agents_fingerprint_idx" ON "saas_agents" ("project_id","fingerprint");
--> statement-breakpoint
INSERT INTO "saas_agents" (
	"project_id",
	"external_id",
	"owner_metadata",
	"status",
	"created_at"
)
SELECT
	"project_id",
	"external_player_id",
	"metadata",
	'active',
	"created_at"
FROM "saas_players"
ON CONFLICT ("project_id","external_id") DO NOTHING;
