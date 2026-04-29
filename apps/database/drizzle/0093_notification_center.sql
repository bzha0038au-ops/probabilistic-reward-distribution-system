ALTER TABLE "notification_deliveries"
  ALTER COLUMN "kind" TYPE varchar(64);
--> statement-breakpoint
ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "notification_record_id" integer;
--> statement-breakpoint
ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "body" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" varchar(64) NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "data" jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_records_user_created_idx"
  ON "notification_records" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_records_user_read_created_idx"
  ON "notification_records" ("user_id", "read_at", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" varchar(64) NOT NULL,
  "channel" varchar(16) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_preferences_user_kind_channel_idx"
  ON "notification_preferences" ("user_id", "kind", "channel");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_kind_channel_unique"
  ON "notification_preferences" ("user_id", "kind", "channel");
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_notification_record_fk"
    FOREIGN KEY ("notification_record_id")
    REFERENCES "notification_records"("id")
    ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
