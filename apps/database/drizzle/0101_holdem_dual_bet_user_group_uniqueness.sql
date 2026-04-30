-- deploy-plan: expand
-- rollback-plan: restore_from_snapshot_or_pitr
-- blast-radius: high

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.holdem_table_seats'::regclass
      AND attname = 'linked_group_id'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "holdem_table_seats"
      ADD COLUMN "linked_group_id" varchar(128);
  END IF;
END
$$;

UPDATE "holdem_table_seats" AS s
SET "linked_group_id" = NULLIF(t."metadata"->'linkedGroup'->>'groupId', '')
FROM "holdem_tables" AS t
WHERE t."id" = s."table_id"
  AND COALESCE(s."linked_group_id", '') = '';

DO $$
BEGIN
  IF to_regclass('public.holdem_table_seats_user_unique') IS NOT NULL THEN
    DROP INDEX "holdem_table_seats_user_unique";
  END IF;

  IF to_regclass('public.holdem_table_seats_user_group_unique') IS NOT NULL THEN
    DROP INDEX "holdem_table_seats_user_group_unique";
  END IF;

  IF to_regclass('public.holdem_table_seats_user_table_idx') IS NOT NULL THEN
    DROP INDEX "holdem_table_seats_user_table_idx";
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.holdem_table_seats_user_solo_unique') IS NULL THEN
    CREATE UNIQUE INDEX "holdem_table_seats_user_solo_unique"
      ON "holdem_table_seats" ("user_id")
      WHERE "linked_group_id" IS NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.holdem_table_seats_user_table_unique') IS NULL THEN
    CREATE UNIQUE INDEX "holdem_table_seats_user_table_unique"
      ON "holdem_table_seats" ("user_id", "table_id");
  END IF;
END
$$;
