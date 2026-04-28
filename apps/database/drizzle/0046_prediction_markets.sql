CREATE TABLE IF NOT EXISTS "prediction_markets" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(64) NOT NULL,
  "round_key" varchar(64) NOT NULL,
  "title" varchar(160) NOT NULL,
  "description" text,
  "mechanism" varchar(32) DEFAULT 'pari_mutuel' NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "outcomes" jsonb NOT NULL,
  "total_pool_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "winning_outcome_key" varchar(64),
  "winning_pool_amount" numeric(14, 2),
  "oracle_source" varchar(64),
  "oracle_external_ref" varchar(128),
  "oracle_reported_at" timestamp with time zone,
  "metadata" jsonb,
  "opens_at" timestamp with time zone NOT NULL,
  "locks_at" timestamp with time zone NOT NULL,
  "resolves_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prediction_markets_slug_unique"
  ON "prediction_markets" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_markets_status_locks_idx"
  ON "prediction_markets" ("status", "locks_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_markets_round_status_idx"
  ON "prediction_markets" ("round_key", "status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prediction_positions" (
  "id" serial PRIMARY KEY NOT NULL,
  "market_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "outcome_key" varchar(64) NOT NULL,
  "stake_amount" numeric(14, 2) NOT NULL,
  "payout_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prediction_positions"
  ADD CONSTRAINT "prediction_positions_market_id_prediction_markets_id_fk"
  FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prediction_positions"
  ADD CONSTRAINT "prediction_positions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_positions_market_created_idx"
  ON "prediction_positions" ("market_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_positions_market_outcome_idx"
  ON "prediction_positions" ("market_id", "outcome_key", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_positions_user_created_idx"
  ON "prediction_positions" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_positions_market_status_idx"
  ON "prediction_positions" ("market_id", "status", "created_at");
