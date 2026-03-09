ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pity_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_draw_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_win_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fairness_seeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"epoch" integer NOT NULL,
	"epoch_seconds" integer NOT NULL,
	"commit_hash" varchar(128) NOT NULL,
	"seed" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fairness_seeds_epoch_unique" ON "fairness_seeds" ("epoch","epoch_seconds");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fairness_seeds_commit_idx" ON "fairness_seeds" ("commit_hash");
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('probability_control.pity_enabled', 0, NULL, 'Pity system enabled'),
  ('probability_control.pity_threshold', 5, NULL, 'Pity streak threshold'),
  ('probability_control.pity_boost_pct', 0.05, NULL, 'Pity boost percentage'),
  ('probability_control.pity_max_boost_pct', 0.5, NULL, 'Pity max boost percentage')
ON CONFLICT ("config_key") DO NOTHING;
