ALTER TABLE "prediction_markets"
  ADD COLUMN IF NOT EXISTS "resolution_rules" text,
  ADD COLUMN IF NOT EXISTS "source_of_truth" text,
  ADD COLUMN IF NOT EXISTS "category" varchar(32),
  ADD COLUMN IF NOT EXISTS "tags" jsonb,
  ADD COLUMN IF NOT EXISTS "invalid_policy" varchar(32);
--> statement-breakpoint
UPDATE "prediction_markets"
SET "resolution_rules" = COALESCE(
      "resolution_rules",
      NULLIF(BTRIM("metadata"->>'resolutionRules'), '')
    ),
    "source_of_truth" = COALESCE(
      "source_of_truth",
      NULLIF(BTRIM("metadata"->>'sourceOfTruth'), '')
    ),
    "category" = COALESCE(
      "category",
      NULLIF(BTRIM("metadata"->>'category'), '')
    ),
    "tags" = COALESCE(
      "tags",
      CASE
        WHEN jsonb_typeof("metadata"->'tags') = 'array' THEN "metadata"->'tags'
        ELSE NULL
      END
    ),
    "invalid_policy" = COALESCE(
      "invalid_policy",
      NULLIF(BTRIM("metadata"->>'invalidPolicy'), '')
    )
WHERE "metadata" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "prediction_markets" pm
    WHERE pm."resolution_rules" IS NULL
      OR char_length(BTRIM(pm."resolution_rules")) < 20
      OR char_length(BTRIM(pm."resolution_rules")) > 4000
      OR pm."source_of_truth" IS NULL
      OR char_length(BTRIM(pm."source_of_truth")) < 3
      OR char_length(BTRIM(pm."source_of_truth")) > 500
      OR pm."category" IS NULL
      OR pm."category" NOT IN (
        'crypto',
        'finance',
        'sports',
        'politics',
        'technology',
        'culture',
        'other'
      )
      OR pm."invalid_policy" IS NULL
      OR pm."invalid_policy" NOT IN ('refund_all', 'manual_review')
      OR pm."tags" IS NULL
      OR jsonb_typeof(pm."tags") <> 'array'
      OR jsonb_array_length(pm."tags") < 1
      OR jsonb_array_length(pm."tags") > 8
      OR CASE
        WHEN jsonb_typeof(pm."tags") = 'array' THEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(pm."tags") AS tag(value)
          WHERE char_length(BTRIM(tag.value)) < 1
            OR char_length(BTRIM(tag.value)) > 32
            OR BTRIM(tag.value) !~ '^[a-z0-9][a-z0-9-]*$'
        )
        ELSE false
      END
      OR CASE
        WHEN jsonb_typeof(pm."tags") = 'array' THEN (
          SELECT count(*)
          FROM jsonb_array_elements_text(pm."tags") AS tag(value)
        ) <> (
          SELECT count(DISTINCT BTRIM(tag.value))
          FROM jsonb_array_elements_text(pm."tags") AS tag(value)
        )
        ELSE false
      END
  ) THEN
    RAISE EXCEPTION
      'prediction_markets contains rows without valid explicit rule fields; backfill metadata or clean the data before applying this migration.';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "prediction_markets"
  ALTER COLUMN "resolution_rules" SET NOT NULL,
  ALTER COLUMN "source_of_truth" SET NOT NULL,
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "tags" SET NOT NULL,
  ALTER COLUMN "invalid_policy" SET NOT NULL;
