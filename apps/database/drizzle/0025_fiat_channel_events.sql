CREATE TABLE IF NOT EXISTS "fiat_deposit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "deposit_id" integer NOT NULL,
  "provider_trade_no" varchar(128),
  "client_reference" varchar(128),
  "webhook_id" varchar(128),
  "raw_payload" jsonb,
  "signature_verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "fiat_deposit_events"
    ADD CONSTRAINT "fiat_deposit_events_deposit_id_deposits_id_fk"
    FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "fiat_deposit_events_deposit_idx"
  ON "fiat_deposit_events" ("deposit_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "fiat_deposit_events_trade_no_unique"
  ON "fiat_deposit_events" ("provider_trade_no");
CREATE UNIQUE INDEX IF NOT EXISTS "fiat_deposit_events_webhook_id_unique"
  ON "fiat_deposit_events" ("webhook_id");

CREATE TABLE IF NOT EXISTS "fiat_withdraw_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "withdrawal_id" integer NOT NULL,
  "provider_payout_no" varchar(128),
  "settlement_reference" varchar(128),
  "raw_payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "fiat_withdraw_events"
    ADD CONSTRAINT "fiat_withdraw_events_withdrawal_id_withdrawals_id_fk"
    FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "fiat_withdraw_events_withdrawal_idx"
  ON "fiat_withdraw_events" ("withdrawal_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "fiat_withdraw_events_payout_no_unique"
  ON "fiat_withdraw_events" ("provider_payout_no");
