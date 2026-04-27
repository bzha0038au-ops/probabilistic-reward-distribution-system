INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('blackjack.min_stake', 1.00, NULL, 'Blackjack minimum stake'),
  ('blackjack.max_stake', 100.00, NULL, 'Blackjack maximum stake'),
  (
    'blackjack.win_payout_multiplier',
    2.00,
    NULL,
    'Blackjack win payout multiplier'
  ),
  (
    'blackjack.push_payout_multiplier',
    1.00,
    NULL,
    'Blackjack push payout multiplier'
  ),
  (
    'blackjack.natural_payout_multiplier',
    2.50,
    NULL,
    'Blackjack natural payout multiplier'
  ),
  (
    'blackjack.dealer_hits_soft_17',
    0,
    NULL,
    'Blackjack dealer hits soft 17'
  ),
  (
    'blackjack.double_down_allowed',
    1,
    NULL,
    'Blackjack double down allowed'
  )
ON CONFLICT ("config_key") DO NOTHING;
