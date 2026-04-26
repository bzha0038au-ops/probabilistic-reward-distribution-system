ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone varchar(32),
  ADD COLUMN IF NOT EXISTS email_verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON users (phone);

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamp with time zone;
