CREATE TABLE IF NOT EXISTS "device_fingerprints" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "fingerprint" varchar(128) NOT NULL,
  "entrypoint" varchar(32) NOT NULL,
  "activity_type" varchar(64) NOT NULL,
  "session_id" varchar(64),
  "ip" varchar(64),
  "user_agent" varchar(255),
  "event_count" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_fingerprints_user_fp_activity_unique" ON "device_fingerprints" ("user_id","fingerprint","activity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_fingerprints_user_last_seen_idx" ON "device_fingerprints" ("user_id","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_fingerprints_fingerprint_last_seen_idx" ON "device_fingerprints" ("fingerprint","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_fingerprints_ip_last_seen_idx" ON "device_fingerprints" ("ip","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_fingerprints_entrypoint_last_seen_idx" ON "device_fingerprints" ("entrypoint","last_seen_at");
