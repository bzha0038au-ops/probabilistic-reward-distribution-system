ALTER TABLE "saas_draw_records"
  ADD COLUMN IF NOT EXISTS "environment" varchar(16);

ALTER TABLE "saas_ledger_entries"
  ADD COLUMN IF NOT EXISTS "environment" varchar(16);

ALTER TABLE "saas_fairness_seeds"
  ADD COLUMN IF NOT EXISTS "environment" varchar(16);

ALTER TABLE "saas_usage_events"
  ADD COLUMN IF NOT EXISTS "environment" varchar(16);

UPDATE "saas_draw_records" AS records
SET "environment" = projects."environment"
FROM "saas_projects" AS projects
WHERE records."project_id" = projects."id"
  AND records."environment" IS NULL;

UPDATE "saas_ledger_entries" AS entries
SET "environment" = projects."environment"
FROM "saas_projects" AS projects
WHERE entries."project_id" = projects."id"
  AND entries."environment" IS NULL;

UPDATE "saas_fairness_seeds" AS seeds
SET "environment" = projects."environment"
FROM "saas_projects" AS projects
WHERE seeds."project_id" = projects."id"
  AND seeds."environment" IS NULL;

UPDATE "saas_usage_events" AS events
SET "environment" = projects."environment"
FROM "saas_projects" AS projects
WHERE events."project_id" = projects."id"
  AND events."environment" IS NULL;

ALTER TABLE "saas_draw_records"
  ALTER COLUMN "environment" SET NOT NULL;

ALTER TABLE "saas_ledger_entries"
  ALTER COLUMN "environment" SET NOT NULL;

ALTER TABLE "saas_fairness_seeds"
  ALTER COLUMN "environment" SET NOT NULL;

ALTER TABLE "saas_usage_events"
  ALTER COLUMN "environment" SET NOT NULL;
