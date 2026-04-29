CREATE TABLE "user_asset_balances" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "asset_code" varchar(32) NOT NULL,
  "available_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "locked_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "lifetime_earned" numeric(14, 2) DEFAULT '0' NOT NULL,
  "lifetime_spent" numeric(14, 2) DEFAULT '0' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "economy_ledger_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "asset_code" varchar(32) NOT NULL,
  "entry_type" varchar(64) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "balance_before" numeric(14, 2) NOT NULL,
  "balance_after" numeric(14, 2) NOT NULL,
  "reference_type" varchar(64),
  "reference_id" integer,
  "actor_type" varchar(32),
  "actor_id" integer,
  "source_app" varchar(64),
  "device_fingerprint" varchar(255),
  "request_id" varchar(191),
  "idempotency_key" varchar(191),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "gift_energy_accounts" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "current_energy" integer DEFAULT 10 NOT NULL,
  "max_energy" integer DEFAULT 10 NOT NULL,
  "refill_policy" jsonb NOT NULL,
  "last_refill_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "gift_transfers" (
  "id" serial PRIMARY KEY NOT NULL,
  "sender_user_id" integer NOT NULL,
  "receiver_user_id" integer NOT NULL,
  "asset_code" varchar(32) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "energy_cost" integer DEFAULT 0 NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "idempotency_key" varchar(191) NOT NULL,
  "source_app" varchar(64),
  "device_fingerprint" varchar(255),
  "request_id" varchar(191),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "iap_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "sku" varchar(128) NOT NULL,
  "store_channel" varchar(16) NOT NULL,
  "delivery_type" varchar(32) NOT NULL,
  "asset_code" varchar(32),
  "asset_amount" numeric(14, 2),
  "delivery_content" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "gift_pack_catalog" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(128) NOT NULL,
  "iap_product_id" integer NOT NULL,
  "reward_asset_code" varchar(32) NOT NULL,
  "reward_amount" numeric(14, 2) NOT NULL,
  "delivery_content" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "store_purchase_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "recipient_user_id" integer,
  "iap_product_id" integer NOT NULL,
  "store_channel" varchar(16) NOT NULL,
  "status" varchar(32) DEFAULT 'created' NOT NULL,
  "idempotency_key" varchar(191) NOT NULL,
  "external_order_id" varchar(191),
  "source_app" varchar(64),
  "device_fingerprint" varchar(255),
  "request_id" varchar(191),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "store_purchase_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "store_channel" varchar(16) NOT NULL,
  "external_transaction_id" varchar(191),
  "purchase_token" varchar(255),
  "raw_payload" jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "user_asset_balances"
  ADD CONSTRAINT "user_asset_balances_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "economy_ledger_entries"
  ADD CONSTRAINT "economy_ledger_entries_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "gift_energy_accounts"
  ADD CONSTRAINT "gift_energy_accounts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "gift_transfers"
  ADD CONSTRAINT "gift_transfers_sender_user_id_users_id_fk"
  FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "gift_transfers"
  ADD CONSTRAINT "gift_transfers_receiver_user_id_users_id_fk"
  FOREIGN KEY ("receiver_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "gift_pack_catalog"
  ADD CONSTRAINT "gift_pack_catalog_iap_product_id_iap_products_id_fk"
  FOREIGN KEY ("iap_product_id") REFERENCES "public"."iap_products"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "store_purchase_orders"
  ADD CONSTRAINT "store_purchase_orders_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "store_purchase_orders"
  ADD CONSTRAINT "store_purchase_orders_recipient_user_id_users_id_fk"
  FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "store_purchase_orders"
  ADD CONSTRAINT "store_purchase_orders_iap_product_id_iap_products_id_fk"
  FOREIGN KEY ("iap_product_id") REFERENCES "public"."iap_products"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "store_purchase_receipts"
  ADD CONSTRAINT "store_purchase_receipts_order_id_store_purchase_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."store_purchase_orders"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "user_asset_balances_user_asset_unique"
  ON "user_asset_balances" USING btree ("user_id", "asset_code");
CREATE INDEX "user_asset_balances_user_asset_created_idx"
  ON "user_asset_balances" USING btree ("user_id", "asset_code", "created_at");
CREATE INDEX "user_asset_balances_asset_updated_idx"
  ON "user_asset_balances" USING btree ("asset_code", "updated_at");

CREATE INDEX "economy_ledger_entries_user_created_idx"
  ON "economy_ledger_entries" USING btree ("user_id", "created_at", "id");
CREATE INDEX "economy_ledger_entries_asset_created_idx"
  ON "economy_ledger_entries" USING btree ("asset_code", "created_at", "id");
CREATE INDEX "economy_ledger_entries_reference_idx"
  ON "economy_ledger_entries" USING btree ("reference_type", "reference_id", "created_at");
CREATE INDEX "economy_ledger_entries_request_idx"
  ON "economy_ledger_entries" USING btree ("request_id", "created_at");
CREATE UNIQUE INDEX "economy_ledger_entries_user_asset_idempotency_unique"
  ON "economy_ledger_entries" USING btree ("user_id", "asset_code", "idempotency_key");

CREATE INDEX "gift_energy_accounts_updated_idx"
  ON "gift_energy_accounts" USING btree ("updated_at", "user_id");

CREATE UNIQUE INDEX "gift_transfers_idempotency_unique"
  ON "gift_transfers" USING btree ("idempotency_key");
CREATE INDEX "gift_transfers_sender_created_idx"
  ON "gift_transfers" USING btree ("sender_user_id", "created_at");
CREATE INDEX "gift_transfers_receiver_created_idx"
  ON "gift_transfers" USING btree ("receiver_user_id", "created_at");
CREATE INDEX "gift_transfers_status_created_idx"
  ON "gift_transfers" USING btree ("status", "created_at");

CREATE UNIQUE INDEX "iap_products_sku_channel_unique"
  ON "iap_products" USING btree ("sku", "store_channel");
CREATE INDEX "iap_products_delivery_type_idx"
  ON "iap_products" USING btree ("delivery_type", "store_channel");

CREATE UNIQUE INDEX "gift_pack_catalog_code_unique"
  ON "gift_pack_catalog" USING btree ("code");
CREATE UNIQUE INDEX "gift_pack_catalog_iap_product_unique"
  ON "gift_pack_catalog" USING btree ("iap_product_id");

CREATE UNIQUE INDEX "store_purchase_orders_idempotency_unique"
  ON "store_purchase_orders" USING btree ("idempotency_key");
CREATE INDEX "store_purchase_orders_user_created_idx"
  ON "store_purchase_orders" USING btree ("user_id", "created_at");
CREATE INDEX "store_purchase_orders_status_created_idx"
  ON "store_purchase_orders" USING btree ("status", "created_at");

CREATE INDEX "store_purchase_receipts_order_created_idx"
  ON "store_purchase_receipts" USING btree ("order_id", "created_at");
CREATE UNIQUE INDEX "store_purchase_receipts_transaction_unique"
  ON "store_purchase_receipts" USING btree ("store_channel", "external_transaction_id");
CREATE UNIQUE INDEX "store_purchase_receipts_purchase_token_unique"
  ON "store_purchase_receipts" USING btree ("store_channel", "purchase_token");

INSERT INTO "user_asset_balances" (
  "user_id",
  "asset_code",
  "available_balance",
  "locked_balance",
  "lifetime_earned",
  "lifetime_spent"
)
SELECT "id", "asset_code", '0', '0', '0', '0'
FROM "users"
CROSS JOIN (
  VALUES ('B_LUCK'), ('IAP_VOUCHER')
) AS asset_seed("asset_code")
ON CONFLICT ("user_id", "asset_code") DO NOTHING;

INSERT INTO "gift_energy_accounts" (
  "user_id",
  "current_energy",
  "max_energy",
  "refill_policy",
  "last_refill_at"
)
SELECT
  "id",
  10,
  10,
  '{"type":"daily_reset","intervalHours":24,"refillAmount":10}'::jsonb,
  now()
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;
