DO $$
BEGIN
  CREATE TYPE "aml_review_status" AS ENUM (
    'pending',
    'cleared',
    'confirmed',
    'escalated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aml_checks" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "checkpoint" varchar(32) NOT NULL,
  "provider_key" varchar(32) DEFAULT 'mock' NOT NULL,
  "result" varchar(32) NOT NULL,
  "risk_level" varchar(16) DEFAULT 'low' NOT NULL,
  "provider_reference" varchar(128),
  "provider_payload" jsonb,
  "metadata" jsonb,
  "review_status" "aml_review_status",
  "reviewed_by_admin_id" integer,
  "reviewed_at" timestamp with time zone,
  "review_notes" text,
  "escalated_at" timestamp with time zone,
  "sla_due_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'aml_checks_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "aml_checks"
      ADD CONSTRAINT "aml_checks_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'aml_checks_reviewed_by_admin_id_admins_id_fk'
  ) THEN
    ALTER TABLE "aml_checks"
      ADD CONSTRAINT "aml_checks_reviewed_by_admin_id_admins_id_fk"
      FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admins"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'provider_payload'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "provider_payload" jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'review_status'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "review_status" "aml_review_status";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'reviewed_by_admin_id'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "reviewed_by_admin_id" integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'reviewed_at'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "reviewed_at" timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'review_notes'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "review_notes" text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'escalated_at'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "escalated_at" timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.aml_checks'::regclass
      AND attname = 'sla_due_at'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "aml_checks" ADD COLUMN "sla_due_at" timestamp with time zone;
  END IF;
END
$$;
--> statement-breakpoint
UPDATE "aml_checks"
SET "result" = 'hit'
WHERE "result" = 'review_required';
--> statement-breakpoint
UPDATE "aml_checks"
SET
  "provider_payload" = COALESCE("provider_payload", "metadata"->'provider'),
  "review_status" = COALESCE("review_status", 'pending'),
  "sla_due_at" = COALESCE("sla_due_at", "created_at" + INTERVAL '60 minutes')
WHERE "result" = 'hit'
  AND "review_status" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aml_checks_user_checkpoint_created_idx"
  ON "aml_checks" ("user_id", "checkpoint", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aml_checks_result_created_idx"
  ON "aml_checks" ("result", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aml_checks_review_queue_idx"
  ON "aml_checks" ("review_status", "result", "sla_due_at");
