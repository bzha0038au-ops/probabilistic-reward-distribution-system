INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('reward_events.profile_security_bonus_amount', 8, NULL, 'Profile security reward amount'),
  ('reward_events.first_draw_bonus_amount', 3, NULL, 'First draw reward amount'),
  ('reward_events.draw_streak_daily_bonus_amount', 5, NULL, 'Daily draw streak reward amount'),
  ('reward_events.top_up_starter_bonus_amount', 10, NULL, 'Top-up starter reward amount')
ON CONFLICT ("config_key") DO NOTHING;
