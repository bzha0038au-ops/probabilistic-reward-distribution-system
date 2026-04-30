CREATE TABLE IF NOT EXISTS "saas_billing_account_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"billing_account_id" integer NOT NULL,
	"plan_code" varchar(32) DEFAULT 'starter' NOT NULL,
	"stripe_customer_id" varchar(128),
	"collection_method" varchar(32) DEFAULT 'send_invoice' NOT NULL,
	"auto_billing_enabled" boolean DEFAULT false NOT NULL,
	"portal_configuration_id" varchar(128),
	"base_monthly_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"draw_fee" numeric(14, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"is_billable" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"effective_at" timestamp with time zone NOT NULL,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_billing_runs" ADD COLUMN IF NOT EXISTS "billing_account_version_id" integer;
--> statement-breakpoint
ALTER TABLE "saas_usage_events" ADD COLUMN IF NOT EXISTS "reference_type" varchar(64);
--> statement-breakpoint
ALTER TABLE "saas_usage_events" ADD COLUMN IF NOT EXISTS "reference_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_account_versions" ADD CONSTRAINT "saas_billing_account_versions_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_account_versions" ADD CONSTRAINT "saas_billing_account_versions_billing_account_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_account_versions" ADD CONSTRAINT "saas_billing_account_versions_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_billing_runs" ADD CONSTRAINT "saas_billing_runs_billing_account_version_fk" FOREIGN KEY ("billing_account_version_id") REFERENCES "public"."saas_billing_account_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "saas_billing_account_versions" (
	"tenant_id",
	"billing_account_id",
	"plan_code",
	"stripe_customer_id",
	"collection_method",
	"auto_billing_enabled",
	"portal_configuration_id",
	"base_monthly_fee",
	"draw_fee",
	"currency",
	"is_billable",
	"metadata",
	"effective_at",
	"created_by_admin_id",
	"created_at"
)
SELECT
	accounts."tenant_id",
	accounts."id",
	accounts."plan_code",
	accounts."stripe_customer_id",
	accounts."collection_method",
	accounts."auto_billing_enabled",
	accounts."portal_configuration_id",
	accounts."base_monthly_fee",
	accounts."draw_fee",
	accounts."currency",
	accounts."is_billable",
	accounts."metadata",
	COALESCE(accounts."updated_at", accounts."created_at", now()),
	NULL,
	COALESCE(accounts."created_at", now())
FROM "saas_billing_accounts" AS accounts
WHERE NOT EXISTS (
	SELECT 1
	FROM "saas_billing_account_versions" AS versions
	WHERE versions."billing_account_id" = accounts."id"
);
--> statement-breakpoint
UPDATE "saas_billing_runs" AS runs
SET "billing_account_version_id" = COALESCE(
	(
		SELECT versions."id"
		FROM "saas_billing_account_versions" AS versions
		WHERE
			versions."billing_account_id" = runs."billing_account_id"
			AND versions."effective_at" <= runs."period_start"
		ORDER BY versions."effective_at" DESC, versions."id" DESC
		LIMIT 1
	),
	(
		SELECT versions."id"
		FROM "saas_billing_account_versions" AS versions
		WHERE
			versions."billing_account_id" = runs."billing_account_id"
			AND versions."effective_at" > runs."period_start"
			AND versions."effective_at" < runs."period_end"
		ORDER BY versions."effective_at" ASC, versions."id" ASC
		LIMIT 1
	)
)
WHERE runs."billing_account_version_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_billing_account_versions_account_effective_idx" ON "saas_billing_account_versions" ("billing_account_id","effective_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_billing_account_versions_tenant_effective_idx" ON "saas_billing_account_versions" ("tenant_id","effective_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_usage_events_event_reference_unique" ON "saas_usage_events" ("event_type","reference_type","reference_id");
