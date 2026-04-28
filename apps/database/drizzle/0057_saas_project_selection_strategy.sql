ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "strategy" varchar(32);
--> statement-breakpoint
UPDATE "saas_projects"
SET "strategy" = COALESCE("strategy", 'weighted_gacha');
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy" SET DEFAULT 'weighted_gacha';
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_projects"
ADD COLUMN IF NOT EXISTS "strategy_params" jsonb;
--> statement-breakpoint
UPDATE "saas_projects"
SET "strategy_params" = COALESCE("strategy_params", '{}'::jsonb);
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy_params" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "saas_projects"
ALTER COLUMN "strategy_params" SET NOT NULL;
