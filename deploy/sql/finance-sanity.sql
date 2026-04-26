\set ON_ERROR_STOP on

\echo 'Wallet balance summary'
SELECT
  count(*) AS wallet_rows,
  coalesce(sum(withdrawable_balance), 0) AS total_withdrawable_balance,
  coalesce(sum(bonus_balance), 0) AS total_bonus_balance,
  coalesce(sum(locked_balance), 0) AS total_locked_balance,
  coalesce(sum(wagered_amount), 0) AS total_wagered_amount
FROM user_wallets;

\echo 'House account snapshot'
SELECT
  id,
  house_bankroll,
  prize_pool_balance,
  marketing_budget,
  reserve_balance,
  updated_at
FROM house_account
ORDER BY id;

\echo 'Operational queue summary'
SELECT 'open_deposits' AS metric, count(*) AS value
FROM deposits
WHERE status IN ('requested', 'provider_pending', 'provider_succeeded')
UNION ALL
SELECT 'approved_withdrawals', count(*)
FROM withdrawals
WHERE status = 'approved'
UNION ALL
SELECT 'processing_withdrawals', count(*)
FROM withdrawals
WHERE status IN ('provider_submitted', 'provider_processing')
UNION ALL
SELECT 'failed_notifications', count(*)
FROM notification_deliveries
WHERE status = 'failed'
UNION ALL
SELECT 'pending_notifications', count(*)
FROM notification_deliveries
WHERE status = 'pending'
ORDER BY metric;

\echo 'Recent financial activity'
SELECT
  'ledger_entries' AS table_name,
  count(*) AS row_count,
  max(created_at) AS latest_created_at
FROM ledger_entries
UNION ALL
SELECT
  'house_transactions',
  count(*),
  max(created_at)
FROM house_transactions
UNION ALL
SELECT
  'draw_records',
  count(*),
  max(created_at)
FROM draw_records
ORDER BY table_name;

\echo 'Negative balance scan'
SELECT
  count(*) AS bad_wallet_rows
FROM user_wallets
WHERE withdrawable_balance < 0
   OR bonus_balance < 0
   OR locked_balance < 0
   OR wagered_amount < 0;
