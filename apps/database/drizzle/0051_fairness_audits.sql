CREATE TABLE IF NOT EXISTS "fairness_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"epoch" integer NOT NULL,
	"epoch_seconds" integer NOT NULL,
	"commit_hash" varchar(128),
	"computed_hash" varchar(128),
	"matches" boolean DEFAULT false NOT NULL,
	"failure_code" varchar(64),
	"revealed_at" timestamp with time zone,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fairness_audits_epoch_unique" ON "fairness_audits" ("epoch","epoch_seconds");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fairness_audits_epoch_idx" ON "fairness_audits" ("epoch_seconds","epoch");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fairness_audits_match_idx" ON "fairness_audits" ("epoch_seconds","matches","audited_at");
