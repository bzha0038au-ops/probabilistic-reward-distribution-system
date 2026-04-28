CREATE TABLE IF NOT EXISTS "holdem_tables" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'waiting' NOT NULL,
  "small_blind" numeric(14, 2) DEFAULT '1' NOT NULL,
  "big_blind" numeric(14, 2) DEFAULT '2' NOT NULL,
  "minimum_buy_in" numeric(14, 2) DEFAULT '40' NOT NULL,
  "maximum_buy_in" numeric(14, 2) DEFAULT '200' NOT NULL,
  "max_seats" integer DEFAULT 6 NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holdem_table_seats" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" integer NOT NULL,
  "seat_index" integer NOT NULL,
  "user_id" integer NOT NULL,
  "stack_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "committed_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "total_committed_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "status" varchar(16) DEFAULT 'waiting' NOT NULL,
  "turn_deadline_at" timestamp with time zone,
  "hole_cards" jsonb NOT NULL,
  "last_action" varchar(32),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdem_table_seats"
  ADD COLUMN IF NOT EXISTS "turn_deadline_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holdem_table_seats" ADD CONSTRAINT "holdem_table_seats_table_id_holdem_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."holdem_tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holdem_table_seats" ADD CONSTRAINT "holdem_table_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_tables_status_updated_idx" ON "holdem_tables" ("status","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_tables_created_idx" ON "holdem_tables" ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "holdem_table_seats_table_seat_unique" ON "holdem_table_seats" ("table_id","seat_index");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "holdem_table_seats_user_unique" ON "holdem_table_seats" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_seats_table_status_idx" ON "holdem_table_seats" ("table_id","status","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_seats_status_turn_deadline_idx" ON "holdem_table_seats" ("status","turn_deadline_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_seats_user_table_idx" ON "holdem_table_seats" ("user_id","table_id");
