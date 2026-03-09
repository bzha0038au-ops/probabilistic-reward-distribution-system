ALTER TABLE "system_config" ADD COLUMN "config_number" numeric(14, 2);
--> statement-breakpoint
UPDATE "system_config"
SET "config_number" = ("config_value"->>'value')::numeric
WHERE "config_number" IS NULL
  AND "config_value" ? 'value';
