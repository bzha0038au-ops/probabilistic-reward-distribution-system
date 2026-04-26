ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamp with time zone;
