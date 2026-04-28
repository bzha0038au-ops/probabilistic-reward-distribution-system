CREATE TABLE IF NOT EXISTS "tables" (
  "id" serial PRIMARY KEY NOT NULL,
  "definition_key" varchar(64) NOT NULL,
  "game_type" varchar(64) NOT NULL,
  "settlement_model" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "min_seats" integer NOT NULL,
  "max_seats" integer NOT NULL,
  "time_bank_ms" integer DEFAULT 0 NOT NULL,
  "current_phase" varchar(64),
  "phase_order" jsonb NOT NULL,
  "metadata" jsonb,
  "started_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seats" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" integer NOT NULL,
  "seat_number" integer NOT NULL,
  "user_id" integer,
  "status" varchar(32) DEFAULT 'empty' NOT NULL,
  "buy_in_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "stack_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "metadata" jsonb,
  "joined_at" timestamp with time zone,
  "left_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rounds" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" integer NOT NULL,
  "round_number" integer NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "phase" varchar(64) NOT NULL,
  "metadata" jsonb,
  "result" jsonb,
  "phase_deadline_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "settled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tables"
  ADD CONSTRAINT "tables_min_max_seats_check"
  CHECK ("min_seats" <= "max_seats");
--> statement-breakpoint
ALTER TABLE "tables"
  ADD CONSTRAINT "tables_time_bank_non_negative_check"
  CHECK ("time_bank_ms" >= 0);
--> statement-breakpoint
ALTER TABLE "seats"
  ADD CONSTRAINT "seats_buy_in_amount_non_negative_check"
  CHECK ("buy_in_amount" >= 0);
--> statement-breakpoint
ALTER TABLE "seats"
  ADD CONSTRAINT "seats_stack_amount_non_negative_check"
  CHECK ("stack_amount" >= 0);
--> statement-breakpoint
ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_round_number_positive_check"
  CHECK ("round_number" > 0);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seats" ADD CONSTRAINT "seats_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seats" ADD CONSTRAINT "seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rounds" ADD CONSTRAINT "rounds_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tables_status_updated_idx" ON "tables" ("status","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tables_game_type_status_idx" ON "tables" ("game_type","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tables_definition_idx" ON "tables" ("definition_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seats_table_seat_unique" ON "seats" ("table_id","seat_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seats_table_user_unique" ON "seats" ("table_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seats_table_status_idx" ON "seats" ("table_id","status","seat_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seats_user_status_idx" ON "seats" ("user_id","status","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rounds_table_round_unique" ON "rounds" ("table_id","round_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rounds_table_status_created_idx" ON "rounds" ("table_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rounds_status_created_idx" ON "rounds" ("status","created_at");
--> statement-breakpoint
ALTER TABLE "round_events"
  ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "round_events"
  ADD COLUMN IF NOT EXISTS "table_id" integer;
--> statement-breakpoint
ALTER TABLE "round_events"
  ADD COLUMN IF NOT EXISTS "seat_id" integer;
--> statement-breakpoint
ALTER TABLE "round_events"
  ADD COLUMN IF NOT EXISTS "table_round_id" integer;
--> statement-breakpoint
ALTER TABLE "round_events"
  ADD COLUMN IF NOT EXISTS "phase" varchar(64);
--> statement-breakpoint
ALTER TABLE "round_events"
  DROP CONSTRAINT IF EXISTS "round_events_user_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "round_events" ADD CONSTRAINT "round_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "round_events" ADD CONSTRAINT "round_events_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "round_events" ADD CONSTRAINT "round_events_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "round_events" ADD CONSTRAINT "round_events_table_round_id_rounds_id_fk" FOREIGN KEY ("table_round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "round_events_table_round_event_unique_idx" ON "round_events" ("table_round_id","event_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "round_events_table_round_lookup_idx" ON "round_events" ("table_round_id","event_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "round_events_table_phase_created_idx" ON "round_events" ("table_id","phase","created_at");
