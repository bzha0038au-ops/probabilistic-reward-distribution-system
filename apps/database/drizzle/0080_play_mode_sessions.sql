CREATE TABLE IF NOT EXISTS "play_mode_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"game_key" varchar(32) NOT NULL,
	"mode" varchar(32) DEFAULT 'standard' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"outcome" varchar(16),
	"reference_type" varchar(64),
	"reference_id" integer,
	"snapshot" jsonb NOT NULL,
	"metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "play_mode_sessions" ADD CONSTRAINT "play_mode_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_mode_sessions_user_game_started_idx" ON "play_mode_sessions" ("user_id","game_key","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_mode_sessions_user_game_mode_started_idx" ON "play_mode_sessions" ("user_id","game_key","mode","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_mode_sessions_reference_idx" ON "play_mode_sessions" ("reference_type","reference_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_mode_sessions_status_idx" ON "play_mode_sessions" ("status","game_key","updated_at");
