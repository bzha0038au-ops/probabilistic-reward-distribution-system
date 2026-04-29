ALTER TABLE "play_mode_sessions"
ADD COLUMN IF NOT EXISTS "parent_session_id" integer;
--> statement-breakpoint
ALTER TABLE "play_mode_sessions"
ADD COLUMN IF NOT EXISTS "execution_index" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "play_mode_sessions" ADD CONSTRAINT "play_mode_sessions_parent_session_id_play_mode_sessions_id_fk" FOREIGN KEY ("parent_session_id") REFERENCES "public"."play_mode_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_mode_sessions_parent_session_idx" ON "play_mode_sessions" ("parent_session_id","execution_index","started_at");
