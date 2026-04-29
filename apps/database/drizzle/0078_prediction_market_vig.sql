ALTER TABLE "prediction_markets"
  ADD COLUMN IF NOT EXISTS "vig_bps" integer DEFAULT 0 NOT NULL;
