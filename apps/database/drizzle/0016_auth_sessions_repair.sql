CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "session_kind" varchar(16) NOT NULL,
  "subject_role" varchar(20) NOT NULL,
  "jti" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "ip" varchar(64),
  "user_agent" varchar(255),
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_reason" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_jti_unique" ON "auth_sessions" ("jti");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user_kind_status_idx" ON "auth_sessions" ("user_id", "session_kind", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_idx" ON "auth_sessions" ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_last_seen_idx" ON "auth_sessions" ("last_seen_at");
