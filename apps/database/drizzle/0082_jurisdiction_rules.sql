ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "birth_date" date,
  ADD COLUMN IF NOT EXISTS "registration_country_code" varchar(2),
  ADD COLUMN IF NOT EXISTS "country_tier" varchar(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "country_resolved_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "users_registration_country_idx"
  ON "users" ("registration_country_code");

CREATE TABLE IF NOT EXISTS "jurisdiction_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "country_code" varchar(2) NOT NULL,
  "minimum_age" integer NOT NULL DEFAULT 18,
  "allowed_features" jsonb NOT NULL DEFAULT '["real_money_gameplay","topup","withdrawal"]'::jsonb,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "jurisdiction_rules_country_code_unique"
  ON "jurisdiction_rules" ("country_code");
