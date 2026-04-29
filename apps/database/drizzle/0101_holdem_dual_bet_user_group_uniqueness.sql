ALTER TABLE "holdem_table_seats"
  ADD COLUMN IF NOT EXISTS "linked_group_id" varchar(128);

UPDATE "holdem_table_seats" AS s
SET "linked_group_id" = NULLIF(t."metadata"->'linkedGroup'->>'groupId', '')
FROM "holdem_tables" AS t
WHERE t."id" = s."table_id"
  AND COALESCE(s."linked_group_id", '') = '';

DROP INDEX IF EXISTS "holdem_table_seats_user_unique";
DROP INDEX IF EXISTS "holdem_table_seats_user_group_unique";
DROP INDEX IF EXISTS "holdem_table_seats_user_table_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "holdem_table_seats_user_solo_unique"
  ON "holdem_table_seats" ("user_id")
  WHERE "linked_group_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "holdem_table_seats_user_table_unique"
  ON "holdem_table_seats" ("user_id", "table_id");
