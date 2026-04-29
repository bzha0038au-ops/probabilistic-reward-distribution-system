CREATE TABLE IF NOT EXISTS "saas_report_exports" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "saas_tenants"("id") ON DELETE cascade,
  "project_id" integer REFERENCES "saas_projects"("id") ON DELETE set null,
  "created_by_admin_id" integer REFERENCES "admins"("id") ON DELETE set null,
  "resource" varchar(64) NOT NULL,
  "format" varchar(16) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "row_count" integer,
  "content_type" varchar(128),
  "file_name" varchar(255),
  "content" text,
  "from_at" timestamp with time zone NOT NULL,
  "to_at" timestamp with time zone NOT NULL,
  "last_error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "locked_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "saas_report_exports_tenant_created_idx"
  ON "saas_report_exports" ("tenant_id","created_at");

CREATE INDEX IF NOT EXISTS "saas_report_exports_tenant_status_created_idx"
  ON "saas_report_exports" ("tenant_id","status","created_at");

CREATE INDEX IF NOT EXISTS "saas_report_exports_status_created_idx"
  ON "saas_report_exports" ("status","created_at");

CREATE INDEX IF NOT EXISTS "saas_report_exports_status_locked_idx"
  ON "saas_report_exports" ("status","locked_at");
