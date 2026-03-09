CREATE TABLE IF NOT EXISTS "draw_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"prize_id" integer,
	"draw_cost" numeric(14, 2) NOT NULL,
	"reward_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" varchar(32) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"pool_threshold" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reward_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_key" varchar(128) NOT NULL,
	"config_value" jsonb,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_id" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"reference_type" varchar(64),
	"reference_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draw_records" ADD CONSTRAINT "draw_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draw_records" ADD CONSTRAINT "draw_records_prize_id_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."prizes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "draw_records_user_created_idx" ON "draw_records" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "draw_records_prize_status_idx" ON "draw_records" ("prize_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "draw_records_status_idx" ON "draw_records" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prizes_active_stock_idx" ON "prizes" ("is_active","stock");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prizes_pool_threshold_idx" ON "prizes" ("pool_threshold");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "system_config_key_unique" ON "system_config" ("config_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_created_idx" ON "transactions" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_type_created_idx" ON "transactions" ("type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_reference_idx" ON "transactions" ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_id_unique" ON "wallets" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_balance_idx" ON "wallets" ("balance");