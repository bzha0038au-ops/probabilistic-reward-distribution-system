CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ledger_mutation_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_event_id" varchar(191) NOT NULL,
  "order_type" varchar(32) NOT NULL,
  "order_id" integer NOT NULL,
  "user_id" integer,
  "provider_id" integer,
  "mutation_type" varchar(64) NOT NULL,
  "source_type" varchar(32) NOT NULL,
  "source_event_key" varchar(191),
  "amount" numeric(14, 2) NOT NULL,
  "currency" varchar(16),
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ledger_mutation_events"
  ADD CONSTRAINT "ledger_mutation_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_mutation_events"
  ADD CONSTRAINT "ledger_mutation_events_provider_id_payment_providers_id_fk"
  FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_mutation_events_business_event_unique"
  ON "ledger_mutation_events" ("business_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_mutation_events_order_idx"
  ON "ledger_mutation_events" ("order_type","order_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_mutation_events_source_idx"
  ON "ledger_mutation_events" ("source_type","source_event_key");
--> statement-breakpoint

ALTER TABLE "ledger_entries"
  ADD COLUMN IF NOT EXISTS "ledger_mutation_event_id" integer;
--> statement-breakpoint
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_mutation_event_fk"
  FOREIGN KEY ("ledger_mutation_event_id") REFERENCES "public"."ledger_mutation_events"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_mutation_event_idx"
  ON "ledger_entries" ("ledger_mutation_event_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_outbound_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_type" varchar(32) NOT NULL,
  "order_id" integer NOT NULL,
  "provider_id" integer NOT NULL,
  "action" varchar(64) NOT NULL,
  "idempotency_key" varchar(191) NOT NULL,
  "request_payload" jsonb NOT NULL,
  "request_payload_hash" varchar(64) NOT NULL,
  "send_status" varchar(32) NOT NULL DEFAULT 'prepared',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "first_sent_at" timestamp with time zone,
  "last_sent_at" timestamp with time zone,
  "next_retry_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "response_http_status" integer,
  "provider_order_id" varchar(128),
  "response_payload" jsonb,
  "last_error_code" varchar(64),
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payment_outbound_requests"
  ADD CONSTRAINT "payment_outbound_requests_provider_id_payment_providers_id_fk"
  FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_outbound_requests_provider_idem_unique"
  ON "payment_outbound_requests" ("provider_id","action","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_outbound_requests_order_action_unique"
  ON "payment_outbound_requests" ("order_type","order_id","action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_outbound_requests_retry_idx"
  ON "payment_outbound_requests" ("send_status","next_retry_at","created_at");
--> statement-breakpoint

ALTER TABLE "payment_webhook_events"
  ADD COLUMN IF NOT EXISTS "provider_event_id" varchar(191),
  ADD COLUMN IF NOT EXISTS "provider_trade_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "provider_order_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "event_type" varchar(64),
  ADD COLUMN IF NOT EXISTS "dedupe_key" varchar(191),
  ADD COLUMN IF NOT EXISTS "payload_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "order_type" varchar(32),
  ADD COLUMN IF NOT EXISTS "order_id" integer;
--> statement-breakpoint

UPDATE "payment_webhook_events"
SET
  "provider_event_id" = coalesce("provider_event_id", "event_id"),
  "dedupe_key" = coalesce("dedupe_key", 'event:' || "event_id"),
  "payload_hash" = coalesce("payload_hash", encode(digest("payload_raw", 'sha256'), 'hex'));
--> statement-breakpoint

ALTER TABLE "payment_webhook_events"
  ALTER COLUMN "dedupe_key" SET NOT NULL,
  ALTER COLUMN "payload_hash" SET NOT NULL;
--> statement-breakpoint

DROP INDEX IF EXISTS "payment_webhook_events_provider_event_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_dedupe_unique"
  ON "payment_webhook_events" ("provider","dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_trade_idx"
  ON "payment_webhook_events" ("provider","provider_trade_id","event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_webhook_events_order_idx"
  ON "payment_webhook_events" ("order_type","order_id","received_at");
