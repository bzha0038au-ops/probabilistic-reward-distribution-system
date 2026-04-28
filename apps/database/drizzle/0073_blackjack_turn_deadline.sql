ALTER TABLE "blackjack_games"
  ADD COLUMN IF NOT EXISTS "turn_deadline_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blackjack_games_status_turn_deadline_idx"
  ON "blackjack_games" ("status","turn_deadline_at");
