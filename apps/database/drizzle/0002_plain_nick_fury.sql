CREATE TABLE IF NOT EXISTS "admin_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"permission_key" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"display_name" varchar(160),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"cardholder_name" varchar(160) NOT NULL,
	"bank_name" varchar(160),
	"brand" varchar(60),
	"last4" varchar(4),
	"is_default" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "top_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reference_id" varchar(64),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"bank_card_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_wallet_id_wallets_id_fk";--> statement-breakpoint
UPDATE "users"
SET "balance" = "wallets"."balance"
FROM "wallets"
WHERE "wallets"."user_id" = "users"."id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_cards" ADD CONSTRAINT "bank_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "top_ups" ADD CONSTRAINT "top_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_bank_card_id_bank_cards_id_fk" FOREIGN KEY ("bank_card_id") REFERENCES "public"."bank_cards"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_permissions_unique" ON "admin_permissions" ("admin_id","permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admins_user_id_unique" ON "admins" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_cards_user_id_idx" ON "bank_cards" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "top_ups_user_status_idx" ON "top_ups" ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_user_status_idx" ON "withdrawals" ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_balance_idx" ON "users" ("balance");--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "wallet_id";--> statement-breakpoint
DROP TABLE IF EXISTS "wallets";
