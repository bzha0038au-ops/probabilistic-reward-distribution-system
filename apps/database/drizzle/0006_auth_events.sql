CREATE TABLE IF NOT EXISTS "auth_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" varchar(255),
	"event_type" varchar(64) NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_user_idx" ON "auth_events" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_email_idx" ON "auth_events" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_type_idx" ON "auth_events" ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_created_idx" ON "auth_events" ("created_at");
