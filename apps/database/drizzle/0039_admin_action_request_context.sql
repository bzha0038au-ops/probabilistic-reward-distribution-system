ALTER TABLE "admin_actions" ADD COLUMN IF NOT EXISTS "session_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD COLUMN IF NOT EXISTS "user_agent" varchar(255);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_actions_admin_created_idx" ON "admin_actions" ("admin_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_actions_session_idx" ON "admin_actions" ("session_id");
