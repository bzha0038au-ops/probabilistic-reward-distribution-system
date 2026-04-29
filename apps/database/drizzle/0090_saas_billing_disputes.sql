CREATE TABLE "saas_billing_disputes" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "saas_tenants"("id") ON DELETE cascade ON UPDATE no action,
  "billing_run_id" integer NOT NULL REFERENCES "saas_billing_runs"("id") ON DELETE cascade ON UPDATE no action,
  "billing_account_id" integer REFERENCES "saas_billing_accounts"("id") ON DELETE set null ON UPDATE no action,
  "status" varchar(32) DEFAULT 'submitted' NOT NULL,
  "reason" varchar(32) NOT NULL,
  "summary" varchar(160) NOT NULL,
  "description" text NOT NULL,
  "requested_refund_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "approved_refund_amount" numeric(14, 2),
  "currency" varchar(16) DEFAULT 'USD' NOT NULL,
  "resolution_type" varchar(32),
  "resolution_notes" text,
  "stripe_credit_note_id" varchar(128),
  "stripe_credit_note_status" varchar(64),
  "stripe_credit_note_pdf" text,
  "metadata" jsonb,
  "created_by_admin_id" integer REFERENCES "admins"("id") ON DELETE set null ON UPDATE no action,
  "resolved_by_admin_id" integer REFERENCES "admins"("id") ON DELETE set null ON UPDATE no action,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "saas_billing_disputes_stripe_credit_note_unique"
  ON "saas_billing_disputes" ("stripe_credit_note_id");
CREATE INDEX "saas_billing_disputes_tenant_created_idx"
  ON "saas_billing_disputes" ("tenant_id", "created_at");
CREATE INDEX "saas_billing_disputes_billing_run_idx"
  ON "saas_billing_disputes" ("billing_run_id", "created_at");
CREATE INDEX "saas_billing_disputes_status_created_idx"
  ON "saas_billing_disputes" ("status", "created_at");

CREATE TABLE "saas_billing_ledger_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "saas_tenants"("id") ON DELETE cascade ON UPDATE no action,
  "billing_run_id" integer REFERENCES "saas_billing_runs"("id") ON DELETE set null ON UPDATE no action,
  "dispute_id" integer REFERENCES "saas_billing_disputes"("id") ON DELETE set null ON UPDATE no action,
  "entry_type" varchar(64) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "balance_before" numeric(14, 2) NOT NULL,
  "balance_after" numeric(14, 2) NOT NULL,
  "currency" varchar(16) DEFAULT 'USD' NOT NULL,
  "reference_type" varchar(64),
  "reference_id" integer,
  "metadata" jsonb,
  "created_by_admin_id" integer REFERENCES "admins"("id") ON DELETE set null ON UPDATE no action,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "saas_billing_ledger_entries_tenant_created_idx"
  ON "saas_billing_ledger_entries" ("tenant_id", "created_at");
CREATE INDEX "saas_billing_ledger_entries_billing_run_created_idx"
  ON "saas_billing_ledger_entries" ("billing_run_id", "created_at");
CREATE INDEX "saas_billing_ledger_entries_dispute_created_idx"
  ON "saas_billing_ledger_entries" ("dispute_id", "created_at");
