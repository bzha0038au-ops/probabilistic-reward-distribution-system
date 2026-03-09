ALTER TABLE "prizes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prizes_deleted_at_idx" ON "prizes" ("deleted_at");