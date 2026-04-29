CREATE TABLE IF NOT EXISTS "deferred_payouts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "game_key" varchar(32) NOT NULL,
  "mode" varchar(32) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "balance_type" varchar(16) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "source_session_id" integer,
  "source_reference_type" varchar(64),
  "source_reference_id" integer,
  "trigger_reference_type" varchar(64),
  "trigger_reference_id" integer,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deferred_payouts" ADD CONSTRAINT "deferred_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deferred_payouts" ADD CONSTRAINT "deferred_payouts_source_session_id_play_mode_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."play_mode_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deferred_payouts_user_game_status_idx" ON "deferred_payouts" ("user_id","game_key","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deferred_payouts_user_mode_status_idx" ON "deferred_payouts" ("user_id","mode","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deferred_payouts_source_reference_idx" ON "deferred_payouts" ("source_reference_type","source_reference_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deferred_payouts_trigger_reference_idx" ON "deferred_payouts" ("trigger_reference_type","trigger_reference_id","created_at");
