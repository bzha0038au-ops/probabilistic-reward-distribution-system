CREATE TABLE "payment_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" varchar(120) NOT NULL,
  "event_id" varchar(191) NOT NULL,
  "signature" text,
  "signature_status" varchar(32) NOT NULL DEFAULT 'skipped',
  "payload_raw" text NOT NULL,
  "payload_json" jsonb,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "receive_count" integer NOT NULL DEFAULT 1,
  "processing_status" varchar(32) NOT NULL DEFAULT 'pending',
  "processing_attempts" integer NOT NULL DEFAULT 0,
  "processing_result" jsonb,
  "processing_error" text,
  "processing_locked_at" timestamp with time zone,
  "processed_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_unique"
  ON "payment_webhook_events" ("provider", "event_id");
--> statement-breakpoint
CREATE INDEX "payment_webhook_events_processing_idx"
  ON "payment_webhook_events" ("processing_status", "last_received_at");
--> statement-breakpoint
CREATE INDEX "payment_webhook_events_provider_received_idx"
  ON "payment_webhook_events" ("provider", "received_at");
