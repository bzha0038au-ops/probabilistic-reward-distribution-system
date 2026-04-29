CREATE TABLE IF NOT EXISTS "prediction_market_oracles" (
  "id" serial PRIMARY KEY NOT NULL,
  "market_id" integer NOT NULL,
  "provider" varchar(32) NOT NULL,
  "name" varchar(160),
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "config" jsonb NOT NULL,
  "metadata" jsonb,
  "last_checked_at" timestamp with time zone,
  "last_reported_at" timestamp with time zone,
  "last_resolved_outcome_key" varchar(64),
  "last_payload_hash" varchar(191),
  "last_payload" jsonb,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "prediction_market_oracles_market_id_prediction_markets_id_fk"
    FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prediction_market_oracles_market_unique"
  ON "prediction_market_oracles" ("market_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_market_oracles_provider_status_idx"
  ON "prediction_market_oracles" ("provider", "status", "last_checked_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prediction_market_appeals" (
  "id" serial PRIMARY KEY NOT NULL,
  "market_id" integer NOT NULL,
  "oracle_binding_id" integer,
  "resolved_by_admin_id" integer,
  "appeal_key" varchar(191) NOT NULL,
  "provider" varchar(32),
  "reason" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "title" varchar(191) NOT NULL,
  "description" text NOT NULL,
  "metadata" jsonb,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "prediction_market_appeals_market_id_prediction_markets_id_fk"
    FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "prediction_market_appeals_oracle_binding_id_prediction_market_oracles_id_fk"
    FOREIGN KEY ("oracle_binding_id") REFERENCES "public"."prediction_market_oracles"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "prediction_market_appeals_resolved_by_admin_id_admins_id_fk"
    FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id")
    ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prediction_market_appeals_key_unique"
  ON "prediction_market_appeals" ("appeal_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_market_appeals_market_status_idx"
  ON "prediction_market_appeals" ("market_id", "status", "last_detected_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_market_appeals_reason_status_idx"
  ON "prediction_market_appeals" ("reason", "status", "last_detected_at");
