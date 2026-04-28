UPDATE "freeze_records"
SET "reason" = CASE "reason"
  WHEN 'auth_failure_threshold' THEN 'auth_failure'
  WHEN 'admin_auth_failure_threshold' THEN 'auth_failure'
  WHEN 'manual_review' THEN 'manual_admin'
  WHEN 'manual_review_again' THEN 'manual_admin'
  WHEN 'ignored' THEN 'manual_admin'
  WHEN 'suspicious_activity' THEN 'aml_review'
  ELSE "reason"
END
WHERE "reason" IN (
  'auth_failure_threshold',
  'admin_auth_failure_threshold',
  'manual_review',
  'manual_review_again',
  'ignored',
  'suspicious_activity'
);
--> statement-breakpoint
UPDATE "freeze_records"
SET "scope" = CASE "scope"
  WHEN 'account' THEN 'account_lock'
  WHEN 'withdraw' THEN 'withdrawal_lock'
  WHEN 'game' THEN 'gameplay_lock'
  WHEN 'topup' THEN 'topup_lock'
  ELSE COALESCE("scope", 'account_lock')
END
WHERE "scope" IS NULL
   OR "scope" IN ('account', 'withdraw', 'game', 'topup');
--> statement-breakpoint
ALTER TABLE "freeze_records"
  ALTER COLUMN "scope" SET DEFAULT 'account_lock';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL REFERENCES "community_posts"("id") ON DELETE cascade,
  "reporter_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "reason" varchar(64) NOT NULL,
  "detail" text,
  "status" varchar(16) NOT NULL DEFAULT 'open',
  "resolution_note" text,
  "resolved_by_admin_id" integer REFERENCES "admins"("id") ON DELETE set null,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_reports_post_status_idx"
  ON "community_reports" ("post_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_reports_status_created_idx"
  ON "community_reports" ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_reports_reporter_idx"
  ON "community_reports" ("reporter_user_id");
