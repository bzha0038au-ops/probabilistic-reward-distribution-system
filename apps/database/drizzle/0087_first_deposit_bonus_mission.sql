INSERT INTO "missions" ("id", "type", "params", "reward", "is_active")
SELECT
  'top_up_starter',
  'metric_threshold',
  jsonb_build_object(
    'title', 'First deposit bonus',
    'description', 'Complete your first credited deposit to receive an automatic starter bonus.',
    'metric', 'deposit_credited_count',
    'target', 1,
    'cadence', 'one_time',
    'awardMode', 'auto_grant',
    'bonusUnlockWagerRatio', COALESCE(
      (
        SELECT "config_number"
        FROM "system_config"
        WHERE "config_key" = 'economy.bonus_unlock_wager_ratio'
        LIMIT 1
      ),
      1
    ),
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
UPDATE "missions"
SET
  "params" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE("params", '{}'::jsonb),
            '{title}',
            to_jsonb('First deposit bonus'::text),
            true
          ),
          '{description}',
          to_jsonb('Complete your first credited deposit to receive an automatic starter bonus.'::text),
          true
        ),
        '{metric}',
        to_jsonb('deposit_credited_count'::text),
        true
      ),
      '{awardMode}',
      to_jsonb('auto_grant'::text),
      true
    ),
    '{bonusUnlockWagerRatio}',
    to_jsonb(
      COALESCE(
        (
          SELECT "config_number"
          FROM "system_config"
          WHERE "config_key" = 'economy.bonus_unlock_wager_ratio'
          LIMIT 1
        ),
        1
      )
    ),
    true
  ),
  "updated_at" = now()
WHERE "id" = 'top_up_starter'
  AND "type" = 'metric_threshold';
