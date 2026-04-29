CREATE TABLE IF NOT EXISTS "notification_push_devices" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" varchar(255) NOT NULL,
  "platform" varchar(16) NOT NULL,
  "device_fingerprint" varchar(255),
  "active" boolean DEFAULT true NOT NULL,
  "last_registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_delivered_at" timestamp with time zone,
  "last_error" text,
  "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_push_devices_user_active_idx"
  ON "notification_push_devices" ("user_id", "active", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_push_devices_token_unique"
  ON "notification_push_devices" ("token");
