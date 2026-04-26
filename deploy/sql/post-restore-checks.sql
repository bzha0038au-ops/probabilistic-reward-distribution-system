\set ON_ERROR_STOP on

\echo 'Running reward-system post-restore invariant checks'

DO $$
DECLARE
  house_account_count integer;
BEGIN
  SELECT count(*) INTO house_account_count FROM house_account;

  IF house_account_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly 1 row in house_account, found %',
      house_account_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM house_account WHERE id = 1) THEN
    RAISE EXCEPTION 'Expected house_account id=1 to exist after restore';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM system_config
    WHERE config_key = 'draw_cost'
  ) THEN
    RAISE EXCEPTION 'Missing required system_config row: draw_cost';
  END IF;
END
$$;

DO $$
DECLARE
  bad_wallet_rows integer;
  bad_house_rows integer;
  bad_prize_rows integer;
  bad_draw_rows integer;
BEGIN
  SELECT count(*)
  INTO bad_wallet_rows
  FROM user_wallets
  WHERE withdrawable_balance < 0
     OR bonus_balance < 0
     OR locked_balance < 0
     OR wagered_amount < 0;

  IF bad_wallet_rows > 0 THEN
    RAISE EXCEPTION
      'Found % user_wallet rows with negative balances',
      bad_wallet_rows;
  END IF;

  SELECT count(*)
  INTO bad_house_rows
  FROM house_account
  WHERE house_bankroll < 0
     OR prize_pool_balance < 0
     OR marketing_budget < 0
     OR reserve_balance < 0;

  IF bad_house_rows > 0 THEN
    RAISE EXCEPTION
      'Found % house_account rows with negative balances',
      bad_house_rows;
  END IF;

  SELECT count(*)
  INTO bad_prize_rows
  FROM prizes
  WHERE stock < 0
     OR reward_amount < 0
     OR payout_budget < 0
     OR payout_spent < 0;

  IF bad_prize_rows > 0 THEN
    RAISE EXCEPTION
      'Found % prize rows with invalid negative inventory or payout values',
      bad_prize_rows;
  END IF;

  SELECT count(*)
  INTO bad_draw_rows
  FROM draw_records
  WHERE draw_cost < 0
     OR reward_amount < 0;

  IF bad_draw_rows > 0 THEN
    RAISE EXCEPTION
      'Found % draw_records rows with negative draw_cost or reward_amount',
      bad_draw_rows;
  END IF;
END
$$;

\echo 'Critical table counts'
SELECT 'admins' AS table_name, count(*) AS row_count FROM admins
UNION ALL
SELECT 'deposits', count(*) FROM deposits
UNION ALL
SELECT 'draw_records', count(*) FROM draw_records
UNION ALL
SELECT 'house_account', count(*) FROM house_account
UNION ALL
SELECT 'house_transactions', count(*) FROM house_transactions
UNION ALL
SELECT 'ledger_entries', count(*) FROM ledger_entries
UNION ALL
SELECT 'notification_deliveries', count(*) FROM notification_deliveries
UNION ALL
SELECT 'prizes', count(*) FROM prizes
UNION ALL
SELECT 'system_config', count(*) FROM system_config
UNION ALL
SELECT 'user_wallets', count(*) FROM user_wallets
UNION ALL
SELECT 'users', count(*) FROM users
UNION ALL
SELECT 'withdrawals', count(*) FROM withdrawals
ORDER BY table_name;

\echo 'Latest financial activity timestamps'
SELECT 'ledger_entries' AS table_name, max(created_at) AS latest_created_at FROM ledger_entries
UNION ALL
SELECT 'house_transactions', max(created_at) FROM house_transactions
UNION ALL
SELECT 'draw_records', max(created_at) FROM draw_records
UNION ALL
SELECT 'deposits', max(updated_at) FROM deposits
UNION ALL
SELECT 'withdrawals', max(updated_at) FROM withdrawals
ORDER BY table_name;

\echo 'Open finance workload'
SELECT 'open_deposits' AS metric, count(*) AS value
FROM deposits
WHERE status IN ('requested', 'provider_pending', 'provider_succeeded')
UNION ALL
SELECT 'open_withdrawals', count(*)
FROM withdrawals
WHERE status IN (
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing'
)
UNION ALL
SELECT 'failed_notifications', count(*)
FROM notification_deliveries
WHERE status = 'failed'
ORDER BY metric;
