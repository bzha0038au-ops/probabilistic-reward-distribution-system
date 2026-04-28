CREATE TABLE IF NOT EXISTS "saas_distribution_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "window_key" varchar(16) NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "draw_count" integer DEFAULT 0 NOT NULL,
  "tracked_draw_count" integer DEFAULT 0 NOT NULL,
  "tracking_coverage_ratio" numeric(12, 6) DEFAULT '0' NOT NULL,
  "actual_payout_sum" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expected_payout_sum" numeric(14, 2) DEFAULT '0' NOT NULL,
  "payout_deviation_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "payout_deviation_ratio" numeric(12, 6) DEFAULT '0' NOT NULL,
  "max_bucket_deviation_ratio" numeric(12, 6) DEFAULT '0' NOT NULL,
  "actual_payout_histogram" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected_payout_histogram" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actual_bucket_histogram" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected_bucket_histogram" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "breach_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_distribution_snapshots"
  ADD CONSTRAINT "saas_distribution_snapshots_project_id_saas_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_distribution_snapshots_project_window_captured_unique"
  ON "saas_distribution_snapshots" ("project_id", "window_key", "captured_at");
--> statement-breakpoint
CREATE INDEX "saas_distribution_snapshots_project_captured_idx"
  ON "saas_distribution_snapshots" ("project_id", "captured_at");
--> statement-breakpoint
CREATE INDEX "saas_distribution_snapshots_window_captured_idx"
  ON "saas_distribution_snapshots" ("window_key", "captured_at");
