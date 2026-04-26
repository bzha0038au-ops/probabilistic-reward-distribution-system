ALTER TABLE "payment_providers"
  ADD COLUMN IF NOT EXISTS "channel_type" varchar(16),
  ADD COLUMN IF NOT EXISTS "asset_type" varchar(16),
  ADD COLUMN IF NOT EXISTS "asset_code" varchar(64),
  ADD COLUMN IF NOT EXISTS "network" varchar(64);

ALTER TABLE "deposits"
  ADD COLUMN IF NOT EXISTS "channel_type" varchar(16) NOT NULL DEFAULT 'fiat',
  ADD COLUMN IF NOT EXISTS "asset_type" varchar(16) NOT NULL DEFAULT 'fiat',
  ADD COLUMN IF NOT EXISTS "asset_code" varchar(64),
  ADD COLUMN IF NOT EXISTS "network" varchar(64),
  ADD COLUMN IF NOT EXISTS "provider_order_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "submitted_tx_hash" varchar(128);

UPDATE "deposits"
SET
  "status" = CASE lower(coalesce("status", ''))
    WHEN 'success' THEN 'credited'
    WHEN 'approved' THEN 'credited'
    WHEN 'processing' THEN 'provider_pending'
    WHEN 'failed' THEN 'provider_failed'
    WHEN 'rejected' THEN 'provider_failed'
    WHEN 'reversed' THEN 'reversed'
    WHEN 'provider_pending' THEN 'provider_pending'
    WHEN 'provider_succeeded' THEN 'provider_succeeded'
    WHEN 'provider_failed' THEN 'provider_failed'
    WHEN 'credited' THEN 'credited'
    WHEN 'requested' THEN 'requested'
    ELSE 'requested'
  END,
  "channel_type" = coalesce("channel_type", 'fiat'),
  "asset_type" = coalesce("asset_type", 'fiat');

ALTER TABLE "deposits"
  ALTER COLUMN "status" SET DEFAULT 'requested',
  ALTER COLUMN "channel_type" SET DEFAULT 'fiat',
  ALTER COLUMN "asset_type" SET DEFAULT 'fiat';

CREATE TABLE IF NOT EXISTS "payout_methods" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "method_type" varchar(32) NOT NULL DEFAULT 'bank_account',
  "channel_type" varchar(16) NOT NULL DEFAULT 'fiat',
  "asset_type" varchar(16) NOT NULL DEFAULT 'fiat',
  "asset_code" varchar(64),
  "network" varchar(64),
  "display_name" varchar(160),
  "is_default" boolean NOT NULL DEFAULT false,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "payout_methods"
    ADD CONSTRAINT "payout_methods_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "payout_methods_user_id_idx"
  ON "payout_methods" ("user_id");
CREATE INDEX IF NOT EXISTS "payout_methods_user_type_idx"
  ON "payout_methods" ("user_id", "method_type");

CREATE TABLE IF NOT EXISTS "fiat_payout_methods" (
  "payout_method_id" integer PRIMARY KEY NOT NULL,
  "account_name" varchar(160) NOT NULL,
  "bank_name" varchar(160),
  "account_no_masked" varchar(64),
  "routing_code" varchar(64),
  "provider_code" varchar(64),
  "currency" varchar(16),
  "brand" varchar(60),
  "account_last4" varchar(4),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "fiat_payout_methods"
    ADD CONSTRAINT "fiat_payout_methods_payout_method_id_payout_methods_id_fk"
    FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "fiat_payout_methods_currency_idx"
  ON "fiat_payout_methods" ("currency");
CREATE INDEX IF NOT EXISTS "fiat_payout_methods_provider_code_idx"
  ON "fiat_payout_methods" ("provider_code");

INSERT INTO "payout_methods" (
  "id",
  "user_id",
  "method_type",
  "channel_type",
  "asset_type",
  "asset_code",
  "network",
  "display_name",
  "is_default",
  "status",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "user_id",
  'bank_account',
  'fiat',
  'fiat',
  NULL,
  NULL,
  "cardholder_name",
  "is_default",
  CASE lower(coalesce("status", ''))
    WHEN 'inactive' THEN 'inactive'
    ELSE 'active'
  END,
  NULL,
  "created_at",
  "updated_at"
FROM "bank_cards"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "fiat_payout_methods" (
  "payout_method_id",
  "account_name",
  "bank_name",
  "account_no_masked",
  "routing_code",
  "provider_code",
  "currency",
  "brand",
  "account_last4",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "cardholder_name",
  "bank_name",
  CASE
    WHEN "last4" IS NULL OR "last4" = '' THEN NULL
    ELSE '****' || "last4"
  END,
  NULL,
  NULL,
  NULL,
  "brand",
  "last4",
  "created_at",
  "updated_at"
FROM "bank_cards"
ON CONFLICT ("payout_method_id") DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('payout_methods', 'id'),
  coalesce((SELECT max("id") FROM "payout_methods"), 1),
  (SELECT max("id") IS NOT NULL FROM "payout_methods")
);

INSERT INTO "deposits" (
  "id",
  "user_id",
  "amount",
  "provider_id",
  "channel_type",
  "asset_type",
  "asset_code",
  "network",
  "status",
  "reference_id",
  "provider_order_id",
  "submitted_tx_hash",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  "top_ups"."id",
  "top_ups"."user_id",
  "top_ups"."amount",
  NULL,
  'fiat',
  'fiat',
  NULL,
  NULL,
  CASE lower(coalesce("top_ups"."status", ''))
    WHEN 'success' THEN 'credited'
    WHEN 'approved' THEN 'credited'
    WHEN 'processing' THEN 'provider_pending'
    WHEN 'failed' THEN 'provider_failed'
    WHEN 'rejected' THEN 'provider_failed'
    WHEN 'reversed' THEN 'reversed'
    ELSE 'requested'
  END,
  "top_ups"."reference_id",
  NULL,
  NULL,
  "top_ups"."metadata",
  "top_ups"."created_at",
  "top_ups"."updated_at"
FROM "top_ups"
LEFT JOIN "deposits" ON "deposits"."id" = "top_ups"."id"
WHERE "deposits"."id" IS NULL;

SELECT setval(
  pg_get_serial_sequence('deposits', 'id'),
  coalesce((SELECT max("id") FROM "deposits"), 1),
  (SELECT max("id") IS NOT NULL FROM "deposits")
);

ALTER TABLE "withdrawals"
  ADD COLUMN IF NOT EXISTS "provider_id" integer,
  ADD COLUMN IF NOT EXISTS "payout_method_id" integer,
  ADD COLUMN IF NOT EXISTS "channel_type" varchar(16) NOT NULL DEFAULT 'fiat',
  ADD COLUMN IF NOT EXISTS "asset_type" varchar(16) NOT NULL DEFAULT 'fiat',
  ADD COLUMN IF NOT EXISTS "asset_code" varchar(64),
  ADD COLUMN IF NOT EXISTS "network" varchar(64),
  ADD COLUMN IF NOT EXISTS "provider_order_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "submitted_tx_hash" varchar(128);

UPDATE "withdrawals"
SET
  "payout_method_id" = coalesce("payout_method_id", "bank_card_id"),
  "status" = CASE lower(coalesce("status", ''))
    WHEN 'pending' THEN 'requested'
    WHEN 'processing' THEN 'provider_processing'
    WHEN 'success' THEN 'paid'
    WHEN 'failed' THEN 'provider_failed'
    WHEN 'requested' THEN 'requested'
    WHEN 'approved' THEN 'approved'
    WHEN 'provider_submitted' THEN 'provider_submitted'
    WHEN 'provider_processing' THEN 'provider_processing'
    WHEN 'provider_failed' THEN 'provider_failed'
    WHEN 'paid' THEN 'paid'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'reversed' THEN 'reversed'
    ELSE 'requested'
  END,
  "channel_type" = coalesce("channel_type", 'fiat'),
  "asset_type" = coalesce("asset_type", 'fiat');

ALTER TABLE "withdrawals"
  ALTER COLUMN "status" SET DEFAULT 'requested',
  ALTER COLUMN "channel_type" SET DEFAULT 'fiat',
  ALTER COLUMN "asset_type" SET DEFAULT 'fiat';

DO $$ BEGIN
  ALTER TABLE "withdrawals"
    ADD CONSTRAINT "withdrawals_provider_id_payment_providers_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "withdrawals"
    ADD CONSTRAINT "withdrawals_payout_method_id_payout_methods_id_fk"
    FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "deposits_channel_status_idx"
  ON "deposits" ("channel_type", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "deposits_submitted_tx_hash_unique"
  ON "deposits" ("submitted_tx_hash");
CREATE INDEX IF NOT EXISTS "withdrawals_provider_idx"
  ON "withdrawals" ("provider_id");
CREATE INDEX IF NOT EXISTS "withdrawals_payout_method_idx"
  ON "withdrawals" ("payout_method_id");
CREATE INDEX IF NOT EXISTS "withdrawals_channel_status_idx"
  ON "withdrawals" ("channel_type", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_submitted_tx_hash_unique"
  ON "withdrawals" ("submitted_tx_hash");

CREATE TABLE IF NOT EXISTS "crypto_deposit_channels" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider_id" integer,
  "chain" varchar(64) NOT NULL,
  "network" varchar(64) NOT NULL,
  "token" varchar(64) NOT NULL,
  "receive_address" varchar(191) NOT NULL,
  "qr_code_url" text,
  "memo_required" boolean NOT NULL DEFAULT false,
  "memo_value" varchar(191),
  "min_confirmations" integer NOT NULL DEFAULT 1,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "crypto_deposit_channels"
    ADD CONSTRAINT "crypto_deposit_channels_provider_id_payment_providers_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "crypto_deposit_channels_provider_idx"
  ON "crypto_deposit_channels" ("provider_id");
CREATE INDEX IF NOT EXISTS "crypto_deposit_channels_network_token_idx"
  ON "crypto_deposit_channels" ("network", "token");
CREATE UNIQUE INDEX IF NOT EXISTS "crypto_deposit_channels_receive_address_unique"
  ON "crypto_deposit_channels" ("receive_address");

CREATE TABLE IF NOT EXISTS "crypto_withdraw_addresses" (
  "payout_method_id" integer PRIMARY KEY NOT NULL,
  "chain" varchar(64) NOT NULL,
  "network" varchar(64) NOT NULL,
  "token" varchar(64) NOT NULL,
  "address" varchar(191) NOT NULL,
  "label" varchar(120),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "crypto_withdraw_addresses"
    ADD CONSTRAINT "crypto_withdraw_addresses_payout_method_id_payout_methods_id_fk"
    FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "crypto_withdraw_addresses_address_unique"
  ON "crypto_withdraw_addresses" ("address");
CREATE INDEX IF NOT EXISTS "crypto_withdraw_addresses_network_token_idx"
  ON "crypto_withdraw_addresses" ("network", "token");

CREATE TABLE IF NOT EXISTS "crypto_chain_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tx_hash" varchar(191) NOT NULL,
  "direction" varchar(16) NOT NULL,
  "chain" varchar(64) NOT NULL,
  "network" varchar(64) NOT NULL,
  "token" varchar(64) NOT NULL,
  "from_address" varchar(191),
  "to_address" varchar(191),
  "amount" numeric(36, 18) NOT NULL,
  "confirmations" integer NOT NULL DEFAULT 0,
  "raw_payload" jsonb,
  "consumed_by_deposit_id" integer,
  "consumed_by_withdrawal_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "crypto_chain_transactions"
    ADD CONSTRAINT "crypto_chain_transactions_consumed_by_deposit_id_deposits_id_fk"
    FOREIGN KEY ("consumed_by_deposit_id") REFERENCES "public"."deposits"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "crypto_chain_transactions"
    ADD CONSTRAINT "crypto_chain_tx_withdrawal_fk"
    FOREIGN KEY ("consumed_by_withdrawal_id") REFERENCES "public"."withdrawals"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "crypto_chain_transactions_tx_hash_unique"
  ON "crypto_chain_transactions" ("tx_hash");
CREATE INDEX IF NOT EXISTS "crypto_chain_transactions_direction_idx"
  ON "crypto_chain_transactions" ("direction", "created_at");
CREATE INDEX IF NOT EXISTS "crypto_chain_transactions_deposit_idx"
  ON "crypto_chain_transactions" ("consumed_by_deposit_id");
CREATE INDEX IF NOT EXISTS "crypto_chain_transactions_withdrawal_idx"
  ON "crypto_chain_transactions" ("consumed_by_withdrawal_id");

CREATE TABLE IF NOT EXISTS "crypto_review_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "target_type" varchar(32) NOT NULL,
  "target_id" integer NOT NULL,
  "action" varchar(64) NOT NULL,
  "reviewer_admin_id" integer,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "crypto_review_events"
    ADD CONSTRAINT "crypto_review_events_reviewer_admin_id_admins_id_fk"
    FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."admins"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "crypto_review_events_target_idx"
  ON "crypto_review_events" ("target_type", "target_id", "created_at");
CREATE INDEX IF NOT EXISTS "crypto_review_events_reviewer_idx"
  ON "crypto_review_events" ("reviewer_admin_id", "created_at");

CREATE TABLE IF NOT EXISTS "finance_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_type" varchar(32) NOT NULL,
  "order_id" integer NOT NULL,
  "action" varchar(64) NOT NULL,
  "review_stage" varchar(16) NOT NULL,
  "admin_id" integer,
  "operator_note" varchar(500) NOT NULL,
  "settlement_reference" varchar(128),
  "processing_channel" varchar(64),
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "finance_reviews"
    ADD CONSTRAINT "finance_reviews_admin_id_admins_id_fk"
    FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "finance_reviews_order_idx"
  ON "finance_reviews" ("order_type", "order_id", "created_at");
CREATE INDEX IF NOT EXISTS "finance_reviews_admin_idx"
  ON "finance_reviews" ("admin_id", "created_at");

CREATE TABLE IF NOT EXISTS "payment_provider_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_type" varchar(32) NOT NULL,
  "order_id" integer NOT NULL,
  "user_id" integer,
  "provider_id" integer,
  "event_type" varchar(64) NOT NULL,
  "provider_status" varchar(32) NOT NULL,
  "external_reference" varchar(128),
  "processing_channel" varchar(64),
  "payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_provider_id_payment_providers_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "payment_provider_events_order_idx"
  ON "payment_provider_events" ("order_type", "order_id", "created_at");
CREATE INDEX IF NOT EXISTS "payment_provider_events_provider_idx"
  ON "payment_provider_events" ("provider_id", "created_at");

CREATE TABLE IF NOT EXISTS "payment_settlement_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_type" varchar(32) NOT NULL,
  "order_id" integer NOT NULL,
  "user_id" integer,
  "event_type" varchar(64) NOT NULL,
  "settlement_status" varchar(32) NOT NULL,
  "settlement_reference" varchar(128),
  "failure_reason" varchar(255),
  "payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "payment_settlement_events"
    ADD CONSTRAINT "payment_settlement_events_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "payment_settlement_events_order_idx"
  ON "payment_settlement_events" ("order_type", "order_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_settlement_events_reference_unique"
  ON "payment_settlement_events" ("settlement_reference");

UPDATE "deposits"
SET "metadata" =
  coalesce("metadata", '{}'::jsonb) ||
  jsonb_build_object(
    'financeCurrentStatus', "status",
    'manualFallbackStatus', "status"
  )
WHERE "metadata" IS NULL OR NOT ("metadata" ? 'financeCurrentStatus');

UPDATE "withdrawals"
SET "metadata" =
  coalesce("metadata", '{}'::jsonb) ||
  jsonb_build_object(
    'financeCurrentStatus', "status",
    'manualFallbackStatus', "status"
  )
WHERE "metadata" IS NULL OR NOT ("metadata" ? 'financeCurrentStatus');

ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_bank_card_id_bank_cards_id_fk";
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "bank_card_id";

DROP TABLE IF EXISTS "top_ups";
DROP TABLE IF EXISTS "bank_cards";
