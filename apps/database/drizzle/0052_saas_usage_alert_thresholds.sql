INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  (
    'saas_usage_alert.max_minute_qps',
    5.00,
    NULL,
    'SaaS usage alert threshold for peak minute QPS'
  ),
  (
    'saas_usage_alert.max_single_payout_amount',
    100.00,
    NULL,
    'SaaS usage alert threshold for max single payout amount'
  ),
  (
    'saas_usage_alert.max_anti_exploit_rate_pct',
    20.00,
    NULL,
    'SaaS usage alert threshold for anti-exploit hit rate percentage'
  )
ON CONFLICT ("config_key") DO NOTHING;
