ALTER TABLE "community_reports"
  ADD COLUMN IF NOT EXISTS "source" varchar(24) DEFAULT 'user_report' NOT NULL;

ALTER TABLE "community_reports"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;
