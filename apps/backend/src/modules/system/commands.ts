import type Decimal from 'decimal.js';

import {
  ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
  BLACKJACK_DEALER_HITS_SOFT_17_KEY,
  BLACKJACK_DOUBLE_DOWN_ALLOWED_KEY,
  BLACKJACK_HIT_SPLIT_ACES_ALLOWED_KEY,
  BLACKJACK_MAX_SPLIT_HANDS_KEY,
  BLACKJACK_MAX_STAKE_KEY,
  BLACKJACK_MIN_STAKE_KEY,
  BLACKJACK_NATURAL_PAYOUT_MULTIPLIER_KEY,
  BLACKJACK_PUSH_PAYOUT_MULTIPLIER_KEY,
  BLACKJACK_RESPLIT_ALLOWED_KEY,
  BLACKJACK_SPLIT_ACES_ALLOWED_KEY,
  BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED_KEY,
  BLACKJACK_WIN_PAYOUT_MULTIPLIER_KEY,
  ADMIN_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_WINDOW_MINUTES_KEY,
  BONUS_AUTO_RELEASE_ENABLED_KEY,
  BONUS_UNLOCK_WAGER_RATIO_KEY,
  DRAW_ENABLED_KEY,
  PAYMENT_DEPOSIT_ENABLED_KEY,
  PAYMENT_WITHDRAW_ENABLED_KEY,
  RANDOM_WEIGHT_JITTER_ENABLED_KEY,
  RANDOM_WEIGHT_JITTER_PCT_KEY,
  REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
  REWARD_FIRST_DRAW_AMOUNT_KEY,
  REWARD_PROFILE_SECURITY_AMOUNT_KEY,
  REWARD_TOP_UP_STARTER_AMOUNT_KEY,
  SAAS_USAGE_ALERT_MAX_ANTI_EXPLOIT_RATE_PCT_KEY,
  SAAS_USAGE_ALERT_MAX_MINUTE_QPS_KEY,
  SAAS_USAGE_ALERT_MAX_SINGLE_PAYOUT_AMOUNT_KEY,
  SYSTEM_LOGIN_ENABLED_KEY,
  SYSTEM_MAINTENANCE_MODE_KEY,
  SYSTEM_REGISTRATION_ENABLED_KEY,
  WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY,
} from './keys';
import { type DbExecutor, setConfigDecimal } from './store';

export async function setSystemFlagsConfig(
  db: DbExecutor,
  config: {
    maintenanceMode?: boolean;
    registrationEnabled?: boolean;
    loginEnabled?: boolean;
  }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.maintenanceMode === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        SYSTEM_MAINTENANCE_MODE_KEY,
        config.maintenanceMode ? 1 : 0,
        'System maintenance mode'
      )
    );
  }

  if (typeof config.registrationEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        SYSTEM_REGISTRATION_ENABLED_KEY,
        config.registrationEnabled ? 1 : 0,
        'System registration enabled'
      )
    );
  }

  if (typeof config.loginEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        SYSTEM_LOGIN_ENABLED_KEY,
        config.loginEnabled ? 1 : 0,
        'System login enabled'
      )
    );
  }

  await Promise.all(updates);
}

export async function setDrawSystemControls(
  db: DbExecutor,
  config: { drawEnabled?: boolean }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.drawEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        DRAW_ENABLED_KEY,
        config.drawEnabled ? 1 : 0,
        'Draw system enabled'
      )
    );
  }

  await Promise.all(updates);
}

export async function setPaymentConfig(
  db: DbExecutor,
  config: { depositEnabled?: boolean; withdrawEnabled?: boolean }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.depositEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        PAYMENT_DEPOSIT_ENABLED_KEY,
        config.depositEnabled ? 1 : 0,
        'Payment deposit enabled'
      )
    );
  }

  if (typeof config.withdrawEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        PAYMENT_WITHDRAW_ENABLED_KEY,
        config.withdrawEnabled ? 1 : 0,
        'Payment withdraw enabled'
      )
    );
  }

  await Promise.all(updates);
}

export async function setAntiAbuseConfig(
  db: DbExecutor,
  config: { autoFreezeEnabled?: boolean }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.autoFreezeEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
        config.autoFreezeEnabled ? 1 : 0,
        'Anti-abuse auto freeze enabled'
      )
    );
  }

  await Promise.all(updates);
}

export async function setWithdrawalRiskConfig(
  db: DbExecutor,
  config: {
    newCardFirstWithdrawalReviewEnabled?: boolean;
  }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.newCardFirstWithdrawalReviewEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY,
        config.newCardFirstWithdrawalReviewEnabled ? 1 : 0,
        'New-card first withdrawal review enabled'
      )
    );
  }

  await Promise.all(updates);
}

export async function setRandomizationConfig(
  db: DbExecutor,
  config: { weightJitterEnabled?: boolean; weightJitterPct?: Decimal.Value }
) {
  const updates: Promise<void>[] = [];
  if (typeof config.weightJitterEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        RANDOM_WEIGHT_JITTER_ENABLED_KEY,
        config.weightJitterEnabled ? 1 : 0,
        'Enable weight jitter randomization'
      )
    );
  }
  if (config.weightJitterPct !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        RANDOM_WEIGHT_JITTER_PCT_KEY,
        config.weightJitterPct,
        'Weight jitter percentage'
      )
    );
  }

  await Promise.all(updates);
}

export async function setBonusReleaseConfig(
  db: DbExecutor,
  config: { bonusAutoReleaseEnabled?: boolean; bonusUnlockWagerRatio?: Decimal.Value }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.bonusAutoReleaseEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BONUS_AUTO_RELEASE_ENABLED_KEY,
        config.bonusAutoReleaseEnabled ? 1 : 0,
        'Auto release bonus balance'
      )
    );
  }

  if (config.bonusUnlockWagerRatio !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BONUS_UNLOCK_WAGER_RATIO_KEY,
        config.bonusUnlockWagerRatio,
        'Bonus unlock wager ratio'
      )
    );
  }

  await Promise.all(updates);
}

export async function setAuthFailureConfig(
  db: DbExecutor,
  config: {
    authFailureWindowMinutes?: Decimal.Value;
    authFailureFreezeThreshold?: Decimal.Value;
    adminFailureFreezeThreshold?: Decimal.Value;
  }
) {
  const updates: Promise<void>[] = [];

  if (config.authFailureWindowMinutes !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        AUTH_FAILURE_WINDOW_MINUTES_KEY,
        config.authFailureWindowMinutes,
        'Auth failure window minutes'
      )
    );
  }
  if (config.authFailureFreezeThreshold !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        AUTH_FAILURE_THRESHOLD_KEY,
        config.authFailureFreezeThreshold,
        'Auth failure threshold (user)'
      )
    );
  }
  if (config.adminFailureFreezeThreshold !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        ADMIN_FAILURE_THRESHOLD_KEY,
        config.adminFailureFreezeThreshold,
        'Auth failure threshold (admin)'
      )
    );
  }

  await Promise.all(updates);
}

export async function setGamificationRewardConfig(
  db: DbExecutor,
  config: {
    profileSecurityRewardAmount?: Decimal.Value;
    firstDrawRewardAmount?: Decimal.Value;
    drawStreakDailyRewardAmount?: Decimal.Value;
    topUpStarterRewardAmount?: Decimal.Value;
  }
) {
  const updates: Promise<void>[] = [];

  if (config.profileSecurityRewardAmount !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        REWARD_PROFILE_SECURITY_AMOUNT_KEY,
        config.profileSecurityRewardAmount,
        'Profile security reward amount'
      )
    );
  }

  if (config.firstDrawRewardAmount !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        REWARD_FIRST_DRAW_AMOUNT_KEY,
        config.firstDrawRewardAmount,
        'First draw reward amount'
      )
    );
  }

  if (config.drawStreakDailyRewardAmount !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
        config.drawStreakDailyRewardAmount,
        'Daily draw streak reward amount'
      )
    );
  }

  if (config.topUpStarterRewardAmount !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        REWARD_TOP_UP_STARTER_AMOUNT_KEY,
        config.topUpStarterRewardAmount,
        'Top-up starter reward amount'
      )
    );
  }

  await Promise.all(updates);
}

export async function setSaasUsageAlertConfig(
  db: DbExecutor,
  config: {
    maxMinuteQps?: Decimal.Value;
    maxSinglePayoutAmount?: Decimal.Value;
    maxAntiExploitRatePct?: Decimal.Value;
  }
) {
  const updates: Promise<void>[] = [];

  if (config.maxMinuteQps !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        SAAS_USAGE_ALERT_MAX_MINUTE_QPS_KEY,
        config.maxMinuteQps,
        'SaaS usage alert maximum minute QPS'
      )
    );
  }

  if (config.maxSinglePayoutAmount !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        SAAS_USAGE_ALERT_MAX_SINGLE_PAYOUT_AMOUNT_KEY,
        config.maxSinglePayoutAmount,
        'SaaS usage alert maximum single payout amount'
      )
    );
  }

  if (config.maxAntiExploitRatePct !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        SAAS_USAGE_ALERT_MAX_ANTI_EXPLOIT_RATE_PCT_KEY,
        config.maxAntiExploitRatePct,
        'SaaS usage alert maximum anti-exploit hit rate percentage'
      )
    );
  }

  await Promise.all(updates);
}

export async function setBlackjackConfig(
  db: DbExecutor,
  config: {
    minStake?: Decimal.Value;
    maxStake?: Decimal.Value;
    winPayoutMultiplier?: Decimal.Value;
    pushPayoutMultiplier?: Decimal.Value;
    naturalPayoutMultiplier?: Decimal.Value;
    dealerHitsSoft17?: boolean;
    doubleDownAllowed?: boolean;
    splitAcesAllowed?: boolean;
    hitSplitAcesAllowed?: boolean;
    resplitAllowed?: boolean;
    maxSplitHands?: Decimal.Value;
    splitTenValueCardsAllowed?: boolean;
  }
) {
  const updates: Promise<void>[] = [];

  if (config.minStake !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_MIN_STAKE_KEY,
        config.minStake,
        'Blackjack minimum stake'
      )
    );
  }

  if (config.maxStake !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_MAX_STAKE_KEY,
        config.maxStake,
        'Blackjack maximum stake'
      )
    );
  }

  if (config.winPayoutMultiplier !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_WIN_PAYOUT_MULTIPLIER_KEY,
        config.winPayoutMultiplier,
        'Blackjack win payout multiplier'
      )
    );
  }

  if (config.pushPayoutMultiplier !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_PUSH_PAYOUT_MULTIPLIER_KEY,
        config.pushPayoutMultiplier,
        'Blackjack push payout multiplier'
      )
    );
  }

  if (config.naturalPayoutMultiplier !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_NATURAL_PAYOUT_MULTIPLIER_KEY,
        config.naturalPayoutMultiplier,
        'Blackjack natural payout multiplier'
      )
    );
  }

  if (typeof config.dealerHitsSoft17 === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_DEALER_HITS_SOFT_17_KEY,
        config.dealerHitsSoft17 ? 1 : 0,
        'Blackjack dealer hits soft 17'
      )
    );
  }

  if (typeof config.doubleDownAllowed === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_DOUBLE_DOWN_ALLOWED_KEY,
        config.doubleDownAllowed ? 1 : 0,
        'Blackjack double down allowed'
      )
    );
  }

  if (typeof config.splitAcesAllowed === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_SPLIT_ACES_ALLOWED_KEY,
        config.splitAcesAllowed ? 1 : 0,
        'Blackjack split aces allowed'
      )
    );
  }

  if (typeof config.hitSplitAcesAllowed === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_HIT_SPLIT_ACES_ALLOWED_KEY,
        config.hitSplitAcesAllowed ? 1 : 0,
        'Blackjack hit split aces allowed'
      )
    );
  }

  if (typeof config.resplitAllowed === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_RESPLIT_ALLOWED_KEY,
        config.resplitAllowed ? 1 : 0,
        'Blackjack resplit allowed'
      )
    );
  }

  if (config.maxSplitHands !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_MAX_SPLIT_HANDS_KEY,
        config.maxSplitHands,
        'Blackjack maximum split hands'
      )
    );
  }

  if (typeof config.splitTenValueCardsAllowed === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED_KEY,
        config.splitTenValueCardsAllowed ? 1 : 0,
        'Blackjack split ten-value cards allowed'
      )
    );
  }

  await Promise.all(updates);
}
