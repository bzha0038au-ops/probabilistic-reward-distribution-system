DO $$
BEGIN
  DELETE FROM "house_account" WHERE "id" <> 1;
  INSERT INTO "house_account" (
    "id",
    "house_bankroll",
    "prize_pool_balance",
    "marketing_budget",
    "reserve_balance"
  )
  VALUES (1, '0', '0', '0', '0')
  ON CONFLICT ("id") DO NOTHING;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "house_account"
    ADD CONSTRAINT "house_account_singleton"
    CHECK ("id" = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "users_balance_idx";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "balance";
