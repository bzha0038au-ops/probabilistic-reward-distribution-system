CREATE TABLE IF NOT EXISTS "wallet_reconciliation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "trigger" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'running' NOT NULL,
  "scanned_users" integer DEFAULT 0 NOT NULL,
  "mismatched_users" integer DEFAULT 0 NOT NULL,
  "summary" jsonb,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "wallet_reconciliation_runs_status_created_idx"
  ON "wallet_reconciliation_runs" ("status","created_at");

CREATE TABLE IF NOT EXISTS "reconciliation_alerts" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer,
  "user_id" integer,
  "fingerprint" varchar(96) NOT NULL,
  "alert_type" varchar(64) NOT NULL,
  "severity" varchar(16) DEFAULT 'error' NOT NULL,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "expected_withdrawable_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "actual_withdrawable_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expected_bonus_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "actual_bonus_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expected_locked_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "actual_locked_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expected_wagered_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "actual_wagered_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expected_total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "actual_total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "metadata" jsonb,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "reconciliation_alerts"
  ADD CONSTRAINT "reconciliation_alerts_run_id_wallet_reconciliation_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."wallet_reconciliation_runs"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "reconciliation_alerts"
  ADD CONSTRAINT "reconciliation_alerts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "reconciliation_alerts"
  ALTER COLUMN "status" TYPE varchar(32);

CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_alerts_fingerprint_unique"
  ON "reconciliation_alerts" ("fingerprint");

CREATE INDEX IF NOT EXISTS "reconciliation_alerts_type_status_idx"
  ON "reconciliation_alerts" ("alert_type","status","last_detected_at");

CREATE INDEX IF NOT EXISTS "reconciliation_alerts_user_status_idx"
  ON "reconciliation_alerts" ("user_id","status","last_detected_at");
