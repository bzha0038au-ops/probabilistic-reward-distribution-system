INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  (
    'blackjack.split_aces_allowed',
    1,
    NULL,
    'Blackjack split aces allowed'
  ),
  (
    'blackjack.hit_split_aces_allowed',
    1,
    NULL,
    'Blackjack hit split aces allowed'
  ),
  (
    'blackjack.resplit_allowed',
    0,
    NULL,
    'Blackjack resplit allowed'
  ),
  (
    'blackjack.max_split_hands',
    4,
    NULL,
    'Blackjack maximum split hands'
  ),
  (
    'blackjack.split_ten_value_cards_allowed',
    0,
    NULL,
    'Blackjack split ten-value cards allowed'
  )
ON CONFLICT ("config_key") DO NOTHING;
