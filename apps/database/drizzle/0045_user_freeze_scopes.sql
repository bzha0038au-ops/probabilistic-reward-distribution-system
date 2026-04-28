ALTER TABLE "freeze_records"
  ADD COLUMN IF NOT EXISTS "category" varchar(32) NOT NULL DEFAULT 'risk',
  ADD COLUMN IF NOT EXISTS "scope" varchar(32) NOT NULL DEFAULT 'account_lock',
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;
--> statement-breakpoint
UPDATE "freeze_records"
SET
  "reason" = CASE
    WHEN "reason" IN ('account_lock', 'withdrawal_lock', 'gameplay_lock', 'pending_kyc', 'aml_review', 'auth_failure', 'manual_admin')
      THEN "reason"
    WHEN "reason" IN ('auth_failure_threshold', 'admin_auth_failure_threshold')
      THEN 'auth_failure'
    WHEN "reason" IN ('suspicious_activity')
      THEN 'aml_review'
    ELSE 'manual_admin'
  END,
  "scope" = CASE
    WHEN "scope" IN ('account', 'withdraw', 'game', 'topup')
      THEN "scope"
    ELSE 'account'
  END;
--> statement-breakpoint
ALTER TABLE "freeze_records"
  ALTER COLUMN "reason" TYPE varchar(64),
  ALTER COLUMN "reason" SET DEFAULT 'manual_admin',
  ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "scope" TYPE varchar(32),
  ALTER COLUMN "scope" SET DEFAULT 'account',
  ALTER COLUMN "scope" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "freeze_records_scope_idx"
  ON "freeze_records" ("scope");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "freeze_records_user_scope_status_idx"
  ON "freeze_records" ("user_id", "scope", "status");
