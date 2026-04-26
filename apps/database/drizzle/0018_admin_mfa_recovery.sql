ALTER TABLE "admins"
  ADD COLUMN IF NOT EXISTS "mfa_recovery_code_hashes" jsonb,
  ADD COLUMN IF NOT EXISTS "mfa_recovery_codes_generated_at" timestamp with time zone;
