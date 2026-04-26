CREATE TABLE IF NOT EXISTS "payment_reconciliation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider_id" integer,
  "trigger" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'running' NOT NULL,
  "adapter" varchar(64),
  "window_started_at" timestamp with time zone,
  "window_ended_at" timestamp with time zone,
  "summary" jsonb,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_reconciliation_runs"
  ADD CONSTRAINT "payment_reconciliation_runs_provider_id_payment_providers_id_fk"
  FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reconciliation_runs_provider_created_idx"
  ON "payment_reconciliation_runs" ("provider_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reconciliation_runs_status_created_idx"
  ON "payment_reconciliation_runs" ("status","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_reconciliation_issues" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer,
  "provider_id" integer,
  "fingerprint" varchar(96) NOT NULL,
  "flow" varchar(32) NOT NULL,
  "order_type" varchar(32),
  "order_id" integer,
  "local_status" varchar(32),
  "remote_status" varchar(32),
  "ledger_status" varchar(64),
  "local_reference" varchar(128),
  "remote_reference" varchar(128),
  "issue_type" varchar(64) NOT NULL,
  "severity" varchar(16) DEFAULT 'error' NOT NULL,
  "requires_manual_review" boolean DEFAULT true NOT NULL,
  "auto_recheck_eligible" boolean DEFAULT false NOT NULL,
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "metadata" jsonb,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_reconciliation_issues"
  ADD CONSTRAINT "payment_recon_issues_run_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."payment_reconciliation_runs"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_reconciliation_issues"
  ADD CONSTRAINT "payment_recon_issues_provider_fk"
  FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_reconciliation_issues_fingerprint_unique"
  ON "payment_reconciliation_issues" ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reconciliation_issues_provider_status_idx"
  ON "payment_reconciliation_issues" ("provider_id","status","last_detected_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reconciliation_issues_manual_queue_idx"
  ON "payment_reconciliation_issues" ("requires_manual_review","status","last_detected_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reconciliation_issues_order_idx"
  ON "payment_reconciliation_issues" ("order_type","order_id","last_detected_at");
