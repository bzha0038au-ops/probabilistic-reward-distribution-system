CREATE TABLE IF NOT EXISTS "round_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_type" varchar(32) NOT NULL,
  "round_entity_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "event_index" integer NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor" varchar(16) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "round_events" ADD CONSTRAINT "round_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "round_events_round_event_unique_idx" ON "round_events" ("round_type","round_entity_id","event_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "round_events_round_lookup_idx" ON "round_events" ("round_type","round_entity_id","event_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "round_events_user_created_idx" ON "round_events" ("user_id","created_at");
