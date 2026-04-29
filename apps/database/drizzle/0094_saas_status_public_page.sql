CREATE TABLE IF NOT EXISTS "saas_status_minutes" (
  "id" serial PRIMARY KEY NOT NULL,
  "minute_start" timestamp with time zone NOT NULL,
  "total_request_count" integer DEFAULT 0 NOT NULL,
  "availability_eligible_request_count" integer DEFAULT 0 NOT NULL,
  "availability_error_count" integer DEFAULT 0 NOT NULL,
  "error_rate_pct" numeric(8, 4) DEFAULT '0' NOT NULL,
  "api_p95_ms" integer DEFAULT 0 NOT NULL,
  "worker_lag_ms" integer DEFAULT 0 NOT NULL,
  "stripe_webhook_ready_count" integer DEFAULT 0 NOT NULL,
  "stripe_webhook_lag_ms" integer DEFAULT 0 NOT NULL,
  "outbound_webhook_ready_count" integer DEFAULT 0 NOT NULL,
  "outbound_webhook_lag_ms" integer DEFAULT 0 NOT NULL,
  "api_status" varchar(16) DEFAULT 'operational' NOT NULL,
  "worker_status" varchar(16) DEFAULT 'operational' NOT NULL,
  "overall_status" varchar(16) DEFAULT 'operational' NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_status_minutes_minute_start_unique"
  ON "saas_status_minutes" ("minute_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_status_minutes_minute_start_idx"
  ON "saas_status_minutes" ("minute_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_status_minutes_overall_status_minute_idx"
  ON "saas_status_minutes" ("overall_status", "minute_start");
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  (
    'saas_status.api_error_rate_pct_warn',
    2.00,
    NULL,
    'Public SaaS status warning threshold for API error rate percentage'
  ),
  (
    'saas_status.api_error_rate_pct_outage',
    10.00,
    NULL,
    'Public SaaS status outage threshold for API error rate percentage'
  ),
  (
    'saas_status.api_p95_ms_warn',
    1000.00,
    NULL,
    'Public SaaS status warning threshold for API P95 in milliseconds'
  ),
  (
    'saas_status.api_p95_ms_outage',
    2500.00,
    NULL,
    'Public SaaS status outage threshold for API P95 in milliseconds'
  ),
  (
    'saas_status.worker_lag_ms_warn',
    60000.00,
    NULL,
    'Public SaaS status warning threshold for worker lag in milliseconds'
  ),
  (
    'saas_status.worker_lag_ms_outage',
    300000.00,
    NULL,
    'Public SaaS status outage threshold for worker lag in milliseconds'
  ),
  (
    'saas_status.monthly_sla_target_pct',
    99.90,
    NULL,
    'Public SaaS status monthly SLA target percentage'
  )
ON CONFLICT ("config_key") DO NOTHING;
