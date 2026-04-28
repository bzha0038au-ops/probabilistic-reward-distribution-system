CREATE TABLE IF NOT EXISTS "missions" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "type" varchar(64) NOT NULL,
  "params" jsonb NOT NULL,
  "reward" numeric(14,2) DEFAULT '0' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "missions_type_idx" ON "missions" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "missions_active_idx" ON "missions" ("is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "missions_single_daily_checkin_unique" ON "missions" ("type") WHERE "type" = 'daily_checkin';
--> statement-breakpoint
INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'daily_checkin',
  'daily_checkin',
  jsonb_build_object(
    'title', 'Daily check-in',
    'description', 'Sign in each day to keep the streak active and receive the daily auto bonus.',
    'sortOrder', 10
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.daily_bonus_amount'
      LIMIT 1
    ),
    0
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.daily_bonus_enabled'
      LIMIT 1
    ),
    0
  ) > 0
  AND COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.daily_bonus_amount'
      LIMIT 1
    ),
    0
  ) > 0
WHERE NOT EXISTS (
  SELECT 1 FROM "missions" WHERE "id" = 'daily_checkin'
);
--> statement-breakpoint
INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'profile_security',
  'metric_threshold',
  jsonb_build_object(
    'title', 'Security setup',
    'description', 'Verify email and phone to unlock finance tools and earn a profile setup bonus.',
    'metric', 'verified_contacts',
    'target', 2,
    'cadence', 'one_time',
    'sortOrder', 20
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.profile_security_bonus_amount'
      LIMIT 1
    ),
    8
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.profile_security_bonus_amount'
      LIMIT 1
    ),
    8
  ) > 0
WHERE NOT EXISTS (
  SELECT 1 FROM "missions" WHERE "id" = 'profile_security'
);
--> statement-breakpoint
INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'first_draw',
  'metric_threshold',
  jsonb_build_object(
    'title', 'First draw',
    'description', 'Complete your first draw to start the engagement ladder.',
    'metric', 'draw_count_all',
    'target', 1,
    'cadence', 'one_time',
    'sortOrder', 30
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.first_draw_bonus_amount'
      LIMIT 1
    ),
    3
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.first_draw_bonus_amount'
      LIMIT 1
    ),
    3
  ) > 0
WHERE NOT EXISTS (
  SELECT 1 FROM "missions" WHERE "id" = 'first_draw'
);
--> statement-breakpoint
INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'draw_streak_daily',
  'metric_threshold',
  jsonb_build_object(
    'title', 'Draw sprint',
    'description', 'Finish 3 draws in one day to unlock the daily sprint payout.',
    'metric', 'draw_count_today',
    'target', 3,
    'cadence', 'daily',
    'sortOrder', 40
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.draw_streak_daily_bonus_amount'
      LIMIT 1
    ),
    5
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.draw_streak_daily_bonus_amount'
      LIMIT 1
    ),
    5
  ) > 0
WHERE NOT EXISTS (
  SELECT 1 FROM "missions" WHERE "id" = 'draw_streak_daily'
);
--> statement-breakpoint
INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'top_up_starter',
  'metric_threshold',
  jsonb_build_object(
    'title', 'Top-up starter',
    'description', 'Create your first deposit request to unlock a starter economy reward.',
    'metric', 'deposit_count',
    'target', 1,
    'cadence', 'one_time',
    'sortOrder', 50
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.top_up_starter_bonus_amount'
      LIMIT 1
    ),
    10
  ),
  COALESCE(
    (
      SELECT "config_number"
      FROM "system_config"
      WHERE "config_key" = 'reward_events.top_up_starter_bonus_amount'
      LIMIT 1
    ),
    10
  ) > 0
WHERE NOT EXISTS (
  SELECT 1 FROM "missions" WHERE "id" = 'top_up_starter'
);
--> statement-breakpoint
INSERT INTO "admin_permissions" ("admin_id", "permission_key")
SELECT "admins"."id", permissions.permission_key
FROM "admins"
CROSS JOIN (
  VALUES
    ('missions.read'),
    ('missions.create'),
    ('missions.update'),
    ('missions.delete')
) AS permissions(permission_key)
ON CONFLICT ("admin_id", "permission_key") DO NOTHING;
