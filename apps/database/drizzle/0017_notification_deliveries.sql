CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" varchar(32) NOT NULL,
  "channel" varchar(16) NOT NULL,
  "recipient" varchar(255) NOT NULL,
  "recipient_key" varchar(255) NOT NULL,
  "provider" varchar(32) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "provider_message_id" varchar(255),
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_delivery_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "delivery_id" integer NOT NULL,
  "attempt_number" integer NOT NULL,
  "provider" varchar(32) NOT NULL,
  "status" varchar(16) NOT NULL,
  "response_code" integer,
  "provider_message_id" varchar(255),
  "latency_ms" integer,
  "error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_attempts_delivery_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_status_next_attempt_idx" ON "notification_deliveries" ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_recipient_kind_created_idx" ON "notification_deliveries" ("recipient_key", "kind", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_created_idx" ON "notification_deliveries" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_attempts_delivery_created_idx" ON "notification_delivery_attempts" ("delivery_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_attempts_status_created_idx" ON "notification_delivery_attempts" ("status", "created_at");
