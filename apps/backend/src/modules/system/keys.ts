export const DEFAULT_DRAW_COST_KEY = 'draw_cost';
export const RANDOM_WEIGHT_JITTER_ENABLED_KEY = 'random_weight_jitter_enabled';
export const RANDOM_WEIGHT_JITTER_PCT_KEY = 'random_weight_jitter_pct';
export const BONUS_AUTO_RELEASE_ENABLED_KEY = 'economy.bonus_auto_release_enabled';
export const BONUS_UNLOCK_WAGER_RATIO_KEY = 'economy.bonus_unlock_wager_ratio';
export const AUTH_FAILURE_WINDOW_MINUTES_KEY = 'security.auth_failure_window_minutes';
export const AUTH_FAILURE_THRESHOLD_KEY = 'security.auth_failure_freeze_threshold';
export const ADMIN_FAILURE_THRESHOLD_KEY = 'security.admin_failure_freeze_threshold';
export const SYSTEM_SITE_NAME_KEY = 'system.site_name';
export const SYSTEM_MAINTENANCE_MODE_KEY = 'system.maintenance_mode';
export const SYSTEM_REGISTRATION_ENABLED_KEY = 'system.registration_enabled';
export const SYSTEM_LOGIN_ENABLED_KEY = 'system.login_enabled';
export const SYSTEM_DEFAULT_LANGUAGE_KEY = 'system.default_language';
export const DRAW_ENABLED_KEY = 'draw_system.draw_enabled';
export const MIN_DRAW_COST_KEY = 'draw_system.min_draw_cost';
export const MAX_DRAW_COST_KEY = 'draw_system.max_draw_cost';
export const MAX_DRAW_PER_REQUEST_KEY = 'draw_system.max_draw_per_request';
export const MAX_DRAW_PER_DAY_KEY = 'draw_system.max_draw_per_day';
export const DRAW_COOLDOWN_SECONDS_KEY = 'draw_system.cooldown_seconds';
export const POOL_MIN_RESERVE_KEY = 'pool_system.pool_min_reserve';
export const POOL_MAX_PAYOUT_RATIO_KEY = 'pool_system.pool_max_payout_ratio';
export const POOL_NOISE_ENABLED_KEY = 'pool_system.pool_noise_enabled';
export const POOL_NOISE_RANGE_KEY = 'pool_system.pool_noise_range';
export const POOL_EPOCH_SECONDS_KEY = 'pool_system.pool_epoch_seconds';
export const PAYOUT_MAX_BIG_PER_HOUR_KEY = 'payout_control.max_big_prize_per_hour';
export const PAYOUT_MAX_BIG_PER_DAY_KEY = 'payout_control.max_big_prize_per_day';
export const PAYOUT_MAX_TOTAL_PER_HOUR_KEY = 'payout_control.max_total_payout_per_hour';
export const PAYOUT_COOLDOWN_SECONDS_KEY = 'payout_control.payout_cooldown_seconds';
export const PROB_WEIGHT_JITTER_ENABLED_KEY = 'probability_control.weight_jitter_enabled';
export const PROB_WEIGHT_JITTER_RANGE_KEY = 'probability_control.weight_jitter_range';
export const PROBABILITY_SCALE_KEY = 'probability_control.probability_scale';
export const JACKPOT_PROB_BOOST_KEY = 'probability_control.jackpot_probability_boost';
export const PITY_ENABLED_KEY = 'probability_control.pity_enabled';
export const PITY_THRESHOLD_KEY = 'probability_control.pity_threshold';
export const PITY_BOOST_PCT_KEY = 'probability_control.pity_boost_pct';
export const PITY_MAX_BOOST_PCT_KEY = 'probability_control.pity_max_boost_pct';
export const ECONOMY_HOUSE_BANKROLL_KEY = 'economy.house_bankroll';
export const ECONOMY_MARKETING_BUDGET_KEY = 'economy.marketing_budget';
export const ECONOMY_BONUS_EXPIRE_DAYS_KEY = 'economy.bonus_expire_days';
export const ANTI_ABUSE_MAX_ACCOUNTS_PER_IP_KEY = 'anti_abuse.max_accounts_per_ip';
export const ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY = 'anti_abuse.min_wager_before_withdraw';
export const ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY = 'anti_abuse.suspicious_activity_threshold';
export const ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY = 'anti_abuse.auto_freeze_enabled';
export const PAYMENT_DEPOSIT_ENABLED_KEY = 'payment.deposit_enabled';
export const PAYMENT_WITHDRAW_ENABLED_KEY = 'payment.withdraw_enabled';
export const PAYMENT_MIN_DEPOSIT_KEY = 'payment.min_deposit_amount';
export const PAYMENT_MAX_DEPOSIT_KEY = 'payment.max_deposit_amount';
export const PAYMENT_MIN_WITHDRAW_KEY = 'payment.min_withdraw_amount';
export const PAYMENT_MAX_WITHDRAW_KEY = 'payment.max_withdraw_amount';
export const WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY =
  'withdraw_risk.new_card_first_withdrawal_review_enabled';
export const WITHDRAW_RISK_LARGE_AMOUNT_SECOND_APPROVAL_THRESHOLD_KEY =
  'withdraw_risk.large_amount_second_approval_threshold';
export const WITHDRAW_RISK_SHARED_IP_USER_THRESHOLD_KEY =
  'withdraw_risk.shared_ip_user_threshold';
export const WITHDRAW_RISK_SHARED_DEVICE_USER_THRESHOLD_KEY =
  'withdraw_risk.shared_device_user_threshold';
export const WITHDRAW_RISK_SHARED_PAYOUT_USER_THRESHOLD_KEY =
  'withdraw_risk.shared_payout_user_threshold';
export const KYC_TIER_1_MAX_STAKE_AMOUNT_KEY =
  'kyc.tier_1_max_stake_amount';
export const KYC_TIER_2_MAX_DAILY_WITHDRAWAL_AMOUNT_KEY =
  'kyc.tier_2_max_daily_withdrawal_amount';
export const REWARD_SIGNUP_ENABLED_KEY = 'reward_events.signup_bonus_enabled';
export const REWARD_SIGNUP_AMOUNT_KEY = 'reward_events.signup_bonus_amount';
export const REWARD_REFERRAL_ENABLED_KEY = 'reward_events.referral_bonus_enabled';
export const REWARD_REFERRAL_AMOUNT_KEY = 'reward_events.referral_bonus_amount';
export const REWARD_DAILY_ENABLED_KEY = 'reward_events.daily_bonus_enabled';
export const REWARD_DAILY_AMOUNT_KEY = 'reward_events.daily_bonus_amount';
export const REWARD_PROFILE_SECURITY_AMOUNT_KEY =
  'reward_events.profile_security_bonus_amount';
export const REWARD_FIRST_DRAW_AMOUNT_KEY =
  'reward_events.first_draw_bonus_amount';
export const REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY =
  'reward_events.draw_streak_daily_bonus_amount';
export const REWARD_TOP_UP_STARTER_AMOUNT_KEY =
  'reward_events.top_up_starter_bonus_amount';
export const BLACKJACK_MIN_STAKE_KEY = 'blackjack.min_stake';
export const BLACKJACK_MAX_STAKE_KEY = 'blackjack.max_stake';
export const BLACKJACK_WIN_PAYOUT_MULTIPLIER_KEY =
  'blackjack.win_payout_multiplier';
export const BLACKJACK_PUSH_PAYOUT_MULTIPLIER_KEY =
  'blackjack.push_payout_multiplier';
export const BLACKJACK_NATURAL_PAYOUT_MULTIPLIER_KEY =
  'blackjack.natural_payout_multiplier';
export const BLACKJACK_DEALER_HITS_SOFT_17_KEY =
  'blackjack.dealer_hits_soft_17';
export const BLACKJACK_DOUBLE_DOWN_ALLOWED_KEY =
  'blackjack.double_down_allowed';
export const BLACKJACK_SPLIT_ACES_ALLOWED_KEY =
  'blackjack.split_aces_allowed';
export const BLACKJACK_HIT_SPLIT_ACES_ALLOWED_KEY =
  'blackjack.hit_split_aces_allowed';
export const BLACKJACK_RESPLIT_ALLOWED_KEY = 'blackjack.resplit_allowed';
export const BLACKJACK_MAX_SPLIT_HANDS_KEY = 'blackjack.max_split_hands';
export const BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED_KEY =
  'blackjack.split_ten_value_cards_allowed';
export const HOLDEM_RAKE_BPS_KEY = 'holdem.rake_bps';
export const HOLDEM_RAKE_CAP_AMOUNT_KEY = 'holdem.rake_cap_amount';
export const HOLDEM_RAKE_NO_FLOP_NO_DROP_KEY = 'holdem.rake_no_flop_no_drop';
export const HOLDEM_TIME_BANK_MS_KEY = 'holdem.time_bank_ms';
export const HOLDEM_DISCONNECT_GRACE_SECONDS_KEY =
  'holdem.disconnect_grace_seconds';
export const HOLDEM_SEAT_LEASE_SECONDS_KEY = 'holdem.seat_lease_seconds';
export const DEALER_BOT_ENABLED_KEY = 'dealer_bot.enabled';
export const DEALER_BOT_LANGUAGE_PROVIDER_KEY = 'dealer_bot.language_provider';
export const DEALER_BOT_TABLE_RATE_LIMIT_COUNT_KEY =
  'dealer_bot.table_rate_limit_count';
export const DEALER_BOT_TABLE_RATE_LIMIT_WINDOW_SECONDS_KEY =
  'dealer_bot.table_rate_limit_window_seconds';
export const DEALER_BOT_BUDGET_TENANT_ID_KEY = 'dealer_bot.budget_tenant_id';
export const DEALER_BOT_BUDGET_PROJECT_ID_KEY = 'dealer_bot.budget_project_id';
export const DEALER_BOT_LANGUAGE_CALL_COST_KEY = 'dealer_bot.language_call_cost';
export const DEALER_BOT_OPENAI_MODEL_KEY = 'dealer_bot.openai_model';
export const DEALER_BOT_OPENAI_BASE_URL_KEY = 'dealer_bot.openai_base_url';
export const DEALER_BOT_OPENAI_TIMEOUT_MS_KEY = 'dealer_bot.openai_timeout_ms';
export const DEALER_BOT_BLOCKED_TERMS_KEY = 'dealer_bot.blocked_terms';
export const SAAS_USAGE_ALERT_MAX_MINUTE_QPS_KEY =
  'saas_usage_alert.max_minute_qps';
export const SAAS_USAGE_ALERT_MAX_SINGLE_PAYOUT_AMOUNT_KEY =
  'saas_usage_alert.max_single_payout_amount';
export const SAAS_USAGE_ALERT_MAX_ANTI_EXPLOIT_RATE_PCT_KEY =
  'saas_usage_alert.max_anti_exploit_rate_pct';
export const SAAS_STATUS_API_ERROR_RATE_WARN_KEY =
  'saas_status.api_error_rate_pct_warn';
export const SAAS_STATUS_API_ERROR_RATE_OUTAGE_KEY =
  'saas_status.api_error_rate_pct_outage';
export const SAAS_STATUS_API_P95_MS_WARN_KEY =
  'saas_status.api_p95_ms_warn';
export const SAAS_STATUS_API_P95_MS_OUTAGE_KEY =
  'saas_status.api_p95_ms_outage';
export const SAAS_STATUS_WORKER_LAG_MS_WARN_KEY =
  'saas_status.worker_lag_ms_warn';
export const SAAS_STATUS_WORKER_LAG_MS_OUTAGE_KEY =
  'saas_status.worker_lag_ms_outage';
export const SAAS_STATUS_MONTHLY_SLA_TARGET_PCT_KEY =
  'saas_status.monthly_sla_target_pct';
export const ANALYTICS_STATS_DELAY_KEY = 'analytics.stats_visibility_delay_minutes';
export const ANALYTICS_PUBLIC_STATS_KEY = 'analytics.public_stats_enabled';
export const ANALYTICS_POOL_PUBLIC_KEY = 'analytics.pool_balance_public';
export const DEFAULT_DRAW_COST = Number(process.env.DRAW_COST ?? '10');
