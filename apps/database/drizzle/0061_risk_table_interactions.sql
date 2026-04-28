CREATE TABLE IF NOT EXISTS "risk_table_interaction_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" varchar(128) NOT NULL,
  "participant_user_ids" jsonb NOT NULL,
  "pair_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_table_interaction_events_table_recorded_idx"
  ON "risk_table_interaction_events" ("table_id","recorded_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_table_interaction_events_recorded_at_idx"
  ON "risk_table_interaction_events" ("recorded_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risk_table_interaction_pairs" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" varchar(128) NOT NULL,
  "user_a_id" integer NOT NULL,
  "user_b_id" integer NOT NULL,
  "interaction_count" integer DEFAULT 0 NOT NULL,
  "shared_ip_count" integer DEFAULT 0 NOT NULL,
  "shared_device_count" integer DEFAULT 0 NOT NULL,
  "suspicion_score" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_table_interaction_pairs" ADD CONSTRAINT "risk_table_interaction_pairs_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_table_interaction_pairs" ADD CONSTRAINT "risk_table_interaction_pairs_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "risk_table_interaction_pairs_table_users_unique"
  ON "risk_table_interaction_pairs" ("table_id","user_a_id","user_b_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_table_interaction_pairs_table_suspicion_idx"
  ON "risk_table_interaction_pairs" ("table_id","suspicion_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_table_interaction_pairs_interaction_count_idx"
  ON "risk_table_interaction_pairs" ("interaction_count","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_table_interaction_pairs_user_a_last_seen_idx"
  ON "risk_table_interaction_pairs" ("user_a_id","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_table_interaction_pairs_user_b_last_seen_idx"
  ON "risk_table_interaction_pairs" ("user_b_id","last_seen_at");
