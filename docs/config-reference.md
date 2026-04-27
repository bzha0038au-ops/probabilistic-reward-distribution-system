# System Config Reference

This document distinguishes **active** keys (read or written at runtime) from **seeded/reserved**
keys that are currently **not** used by the backend. This avoids confusion when scanning the
seeded `system_config` table.

## Active Keys (Live)

These keys are read or written by the backend today.

### System
- `system.site_name`
- `system.maintenance_mode`
- `system.registration_enabled`
- `system.login_enabled`
- `system.default_language`

### Draw system
- `draw_cost`  
  Draw fee charged per request.
- `draw_system.draw_enabled`
- `draw_system.min_draw_cost`
- `draw_system.max_draw_cost`
- `draw_system.max_draw_per_request`
- `draw_system.max_draw_per_day`
- `draw_system.cooldown_seconds`

### Pool system
- `pool_system.pool_min_reserve`
- `pool_system.pool_max_payout_ratio`
- `pool_system.pool_noise_enabled`
- `pool_system.pool_noise_range`
- `pool_system.pool_epoch_seconds`

### Payout control
- `payout_control.max_big_prize_per_hour`
- `payout_control.max_big_prize_per_day`
- `payout_control.max_total_payout_per_hour`
- `payout_control.payout_cooldown_seconds`

### Probability control
- `probability_control.weight_jitter_enabled`
- `probability_control.weight_jitter_range`
- `probability_control.probability_scale`
- `probability_control.jackpot_probability_boost`
- `probability_control.pity_enabled`
- `probability_control.pity_threshold`
- `probability_control.pity_boost_pct`
- `probability_control.pity_max_boost_pct`

### Bonus release + economy
- `economy.bonus_auto_release_enabled`  
  Enables automatic bonus release.
- `economy.bonus_unlock_wager_ratio`  
  Wager ratio used to unlock bonus.
- `economy.house_bankroll`
- `economy.marketing_budget`
- `economy.bonus_expire_days`

### Auth failure thresholds
- `security.auth_failure_window_minutes`  
  Rolling window for auth failures.
- `security.auth_failure_freeze_threshold`  
  User freeze threshold within the window.
- `security.admin_failure_freeze_threshold`  
  Admin freeze threshold within the window.

### Anti-abuse + payment
- `anti_abuse.max_accounts_per_ip`
- `anti_abuse.max_withdraw_per_day`
- `anti_abuse.min_wager_before_withdraw`
- `anti_abuse.suspicious_activity_threshold`
- `anti_abuse.auto_freeze_enabled`
- `payment.deposit_enabled`
- `payment.withdraw_enabled`
- `payment.min_deposit_amount`
- `payment.max_deposit_amount`
- `payment.min_withdraw_amount`
- `payment.max_withdraw_amount`

### Reward events
- `reward_events.signup_bonus_enabled`
- `reward_events.signup_bonus_amount`
- `reward_events.referral_bonus_enabled`
- `reward_events.referral_bonus_amount`
- `reward_events.daily_bonus_enabled`
- `reward_events.daily_bonus_amount`

### Analytics
- `analytics.stats_visibility_delay_minutes`
- `analytics.public_stats_enabled`
- `analytics.pool_balance_public`

## Seeded/Reserved Keys (Not Yet Wired)

There are currently no seeded/reserved keys documented here.

## Notes
- Keys listed as **reserved** are safe to keep seeded, but should not be assumed to have
  runtime effect until explicitly wired in code.
- If a reserved key becomes active, move it to the **Active Keys** section.
