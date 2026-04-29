CREATE TABLE IF NOT EXISTS "security_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" varchar(64) NOT NULL,
  "event_type" varchar(96) NOT NULL,
  "severity" varchar(16) DEFAULT 'info' NOT NULL,
  "source_table" varchar(64),
  "source_record_id" integer,
  "user_id" integer,
  "admin_id" integer,
  "email" varchar(255),
  "ip" varchar(64),
  "user_agent" varchar(255),
  "session_id" varchar(255),
  "fingerprint" varchar(160),
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "security_events"
  ADD CONSTRAINT "security_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id")
  ON DELETE set null
  ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
 ALTER TABLE "security_events"
  ADD CONSTRAINT "security_events_admin_id_admins_id_fk"
  FOREIGN KEY ("admin_id")
  REFERENCES "public"."admins"("id")
  ON DELETE set null
  ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "security_events_category_occurred_idx"
  ON "security_events" ("category", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_type_occurred_idx"
  ON "security_events" ("event_type", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_user_occurred_idx"
  ON "security_events" ("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_admin_occurred_idx"
  ON "security_events" ("admin_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_email_occurred_idx"
  ON "security_events" ("email", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_ip_occurred_idx"
  ON "security_events" ("ip", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_fingerprint_idx"
  ON "security_events" ("fingerprint");
CREATE INDEX IF NOT EXISTS "security_events_source_occurred_idx"
  ON "security_events" ("source_table", "source_record_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "security_events_occurred_idx"
  ON "security_events" ("occurred_at");
