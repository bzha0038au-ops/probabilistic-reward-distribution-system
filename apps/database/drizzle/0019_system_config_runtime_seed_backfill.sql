INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('economy.bonus_auto_release_enabled', 0, NULL, 'Auto release bonus balance'),
  (
    'security.auth_failure_window_minutes',
    15,
    NULL,
    'Auth failure window minutes'
  ),
  (
    'security.auth_failure_freeze_threshold',
    8,
    NULL,
    'Auth failure threshold (user)'
  ),
  (
    'security.admin_failure_freeze_threshold',
    5,
    NULL,
    'Auth failure threshold (admin)'
  )
ON CONFLICT ("config_key") DO NOTHING;
