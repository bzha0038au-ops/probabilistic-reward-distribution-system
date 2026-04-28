DROP INDEX IF EXISTS "kyc_profiles_user_id_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_profiles_user_idx" ON "kyc_profiles" ("user_id");
