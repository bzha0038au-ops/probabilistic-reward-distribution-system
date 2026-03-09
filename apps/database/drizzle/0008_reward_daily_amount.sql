INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES ('reward_events.daily_bonus_amount', 0, NULL, 'Daily bonus amount')
ON CONFLICT ("config_key") DO NOTHING;
