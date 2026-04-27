ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "api_rate_limit_burst" integer DEFAULT 120 NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "api_rate_limit_hourly" integer DEFAULT 3600 NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "api_rate_limit_daily" integer DEFAULT 86400 NOT NULL;
