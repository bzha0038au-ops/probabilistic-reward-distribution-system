CREATE TABLE IF NOT EXISTS "user_play_modes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"game_key" varchar(32) NOT NULL,
	"mode" varchar(32) DEFAULT 'standard' NOT NULL,
	"state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_play_modes" ADD CONSTRAINT "user_play_modes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_play_modes_user_game_unique" ON "user_play_modes" ("user_id","game_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_play_modes_game_updated_idx" ON "user_play_modes" ("game_key","updated_at");
