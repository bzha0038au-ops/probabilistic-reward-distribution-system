CREATE TABLE IF NOT EXISTS "hand_histories" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_type" varchar(32) NOT NULL,
  "game_type" varchar(64),
  "table_id" integer,
  "reference_id" integer NOT NULL,
  "primary_user_id" integer,
  "participant_user_ids" jsonb NOT NULL,
  "hand_number" integer,
  "status" varchar(32) NOT NULL,
  "summary" jsonb NOT NULL,
  "fairness" jsonb,
  "started_at" timestamp with time zone NOT NULL,
  "settled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "table_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_type" varchar(32) NOT NULL,
  "table_id" integer NOT NULL,
  "seat_index" integer,
  "user_id" integer,
  "hand_history_id" integer,
  "phase" varchar(64),
  "event_index" integer NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor" varchar(16) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hand_histories" ADD CONSTRAINT "hand_histories_primary_user_id_users_id_fk" FOREIGN KEY ("primary_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "table_events" ADD CONSTRAINT "table_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "table_events" ADD CONSTRAINT "table_events_hand_history_id_hand_histories_id_fk" FOREIGN KEY ("hand_history_id") REFERENCES "public"."hand_histories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hand_histories_round_type_created_idx" ON "hand_histories" ("round_type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hand_histories_table_lookup_idx" ON "hand_histories" ("game_type","table_id","hand_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hand_histories_primary_user_created_idx" ON "hand_histories" ("primary_user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hand_histories_status_created_idx" ON "hand_histories" ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hand_histories_holdem_table_hand_unique_idx" ON "hand_histories" ("round_type","table_id","hand_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "table_events_table_event_unique_idx" ON "table_events" ("table_type","table_id","event_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_events_table_lookup_idx" ON "table_events" ("table_type","table_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_events_hand_history_created_idx" ON "table_events" ("hand_history_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_events_user_created_idx" ON "table_events" ("user_id","created_at");
