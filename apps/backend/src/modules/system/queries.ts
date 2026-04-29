import type Decimal from "decimal.js";
import {
  BLACKJACK_CONFIG,
  type BlackjackConfig,
} from "@reward/shared-types/blackjack";

import { getConfig } from "../../shared/config";
import { toDecimal } from "../../shared/money";
import {
  ANALYTICS_POOL_PUBLIC_KEY,
  ANALYTICS_PUBLIC_STATS_KEY,
  ANALYTICS_STATS_DELAY_KEY,
  ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
  ANTI_ABUSE_MAX_ACCOUNTS_PER_IP_KEY,
  ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY,
  ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
  AUTH_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_WINDOW_MINUTES_KEY,
  ADMIN_FAILURE_THRESHOLD_KEY,
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
  BONUS_AUTO_RELEASE_ENABLED_KEY,
  BONUS_UNLOCK_WAGER_RATIO_KEY,
  DRAW_COOLDOWN_SECONDS_KEY,
  DRAW_ENABLED_KEY,
  ECONOMY_BONUS_EXPIRE_DAYS_KEY,
  ECONOMY_HOUSE_BANKROLL_KEY,
  ECONOMY_MARKETING_BUDGET_KEY,
  JACKPOT_PROB_BOOST_KEY,
  MAX_DRAW_COST_KEY,
  MAX_DRAW_PER_DAY_KEY,
  MAX_DRAW_PER_REQUEST_KEY,
  MIN_DRAW_COST_KEY,
  PAYOUT_COOLDOWN_SECONDS_KEY,
  PAYOUT_MAX_BIG_PER_DAY_KEY,
  PAYOUT_MAX_BIG_PER_HOUR_KEY,
  PAYOUT_MAX_TOTAL_PER_HOUR_KEY,
  PAYMENT_DEPOSIT_ENABLED_KEY,
  PAYMENT_MAX_DEPOSIT_KEY,
  PAYMENT_MAX_WITHDRAW_KEY,
  PAYMENT_MIN_DEPOSIT_KEY,
  PAYMENT_MIN_WITHDRAW_KEY,
  PAYMENT_WITHDRAW_ENABLED_KEY,
  PITY_BOOST_PCT_KEY,
  PITY_ENABLED_KEY,
  PITY_MAX_BOOST_PCT_KEY,
  PITY_THRESHOLD_KEY,
  POOL_EPOCH_SECONDS_KEY,
  POOL_MAX_PAYOUT_RATIO_KEY,
  POOL_MIN_RESERVE_KEY,
  POOL_NOISE_ENABLED_KEY,
  POOL_NOISE_RANGE_KEY,
  PROBABILITY_SCALE_KEY,
  PROB_WEIGHT_JITTER_ENABLED_KEY,
  PROB_WEIGHT_JITTER_RANGE_KEY,
  RANDOM_WEIGHT_JITTER_ENABLED_KEY,
  RANDOM_WEIGHT_JITTER_PCT_KEY,
  REWARD_DAILY_AMOUNT_KEY,
  REWARD_DAILY_ENABLED_KEY,
  REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
  REWARD_FIRST_DRAW_AMOUNT_KEY,
  REWARD_PROFILE_SECURITY_AMOUNT_KEY,
  REWARD_REFERRAL_AMOUNT_KEY,
  REWARD_REFERRAL_ENABLED_KEY,
  REWARD_SIGNUP_AMOUNT_KEY,
  REWARD_SIGNUP_ENABLED_KEY,
  REWARD_TOP_UP_STARTER_AMOUNT_KEY,
  SAAS_USAGE_ALERT_MAX_ANTI_EXPLOIT_RATE_PCT_KEY,
  SAAS_USAGE_ALERT_MAX_MINUTE_QPS_KEY,
  SAAS_USAGE_ALERT_MAX_SINGLE_PAYOUT_AMOUNT_KEY,
  SAAS_STATUS_API_ERROR_RATE_OUTAGE_KEY,
  SAAS_STATUS_API_ERROR_RATE_WARN_KEY,
  SAAS_STATUS_API_P95_MS_OUTAGE_KEY,
  SAAS_STATUS_API_P95_MS_WARN_KEY,
  SAAS_STATUS_MONTHLY_SLA_TARGET_PCT_KEY,
  SAAS_STATUS_WORKER_LAG_MS_OUTAGE_KEY,
  SAAS_STATUS_WORKER_LAG_MS_WARN_KEY,
  SYSTEM_DEFAULT_LANGUAGE_KEY,
  SYSTEM_LOGIN_ENABLED_KEY,
  SYSTEM_MAINTENANCE_MODE_KEY,
  SYSTEM_REGISTRATION_ENABLED_KEY,
  SYSTEM_SITE_NAME_KEY,
  WITHDRAW_RISK_LARGE_AMOUNT_SECOND_APPROVAL_THRESHOLD_KEY,
  WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY,
  WITHDRAW_RISK_SHARED_DEVICE_USER_THRESHOLD_KEY,
  WITHDRAW_RISK_SHARED_IP_USER_THRESHOLD_KEY,
  WITHDRAW_RISK_SHARED_PAYOUT_USER_THRESHOLD_KEY,
} from "./keys";
import {
  type DbExecutor,
  getConfigDecimal,
  getConfigBoolFromRows,
  getConfigDecimalFromRows,
  getConfigJsonFromRows,
  getConfigRowsByKeys,
  getConfigStringFromRows,
  setConfigDecimal,
} from "./store";

const readNumericRange = (value: unknown) => {
  if (typeof value !== "object" || value === null) {
    return { min: 0, max: 0 };
  }

  const min = Reflect.get(value, "min");
  const max = Reflect.get(value, "max");

  return {
    min: typeof min === "number" ? min : 0,
    max: typeof max === "number" ? max : 0,
  };
};

export async function getRandomizationConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    RANDOM_WEIGHT_JITTER_ENABLED_KEY,
    RANDOM_WEIGHT_JITTER_PCT_KEY,
  ]);
  const enabledValue = await getConfigDecimalFromRows(
    db,
    rows,
    RANDOM_WEIGHT_JITTER_ENABLED_KEY,
    0,
  );
  const pctValue = await getConfigDecimalFromRows(
    db,
    rows,
    RANDOM_WEIGHT_JITTER_PCT_KEY,
    0,
  );

  return {
    weightJitterEnabled: enabledValue.gt(0),
    weightJitterPct: pctValue,
  };
}

export async function getBonusReleaseConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    BONUS_AUTO_RELEASE_ENABLED_KEY,
    BONUS_UNLOCK_WAGER_RATIO_KEY,
  ]);
  const enabledValue = await getConfigDecimalFromRows(
    db,
    rows,
    BONUS_AUTO_RELEASE_ENABLED_KEY,
    0,
  );
  const ratioValue = await getConfigDecimalFromRows(
    db,
    rows,
    BONUS_UNLOCK_WAGER_RATIO_KEY,
    1,
  );

  return {
    bonusAutoReleaseEnabled: enabledValue.gt(0),
    bonusUnlockWagerRatio: ratioValue,
  };
}

export async function getSystemFlags(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    SYSTEM_SITE_NAME_KEY,
    SYSTEM_MAINTENANCE_MODE_KEY,
    SYSTEM_REGISTRATION_ENABLED_KEY,
    SYSTEM_LOGIN_ENABLED_KEY,
    SYSTEM_DEFAULT_LANGUAGE_KEY,
  ]);
  const siteName = await getConfigStringFromRows(
    db,
    rows,
    SYSTEM_SITE_NAME_KEY,
    "Prize Pool & Probability Engine System",
  );
  const maintenanceMode = await getConfigBoolFromRows(
    db,
    rows,
    SYSTEM_MAINTENANCE_MODE_KEY,
    false,
  );
  const registrationEnabled = await getConfigBoolFromRows(
    db,
    rows,
    SYSTEM_REGISTRATION_ENABLED_KEY,
    true,
  );
  const loginEnabled = await getConfigBoolFromRows(
    db,
    rows,
    SYSTEM_LOGIN_ENABLED_KEY,
    true,
  );
  const defaultLanguage = await getConfigStringFromRows(
    db,
    rows,
    SYSTEM_DEFAULT_LANGUAGE_KEY,
    "en",
  );

  return {
    siteName,
    maintenanceMode,
    registrationEnabled,
    loginEnabled,
    defaultLanguage,
  };
}

export async function getDrawSystemConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    DRAW_ENABLED_KEY,
    MIN_DRAW_COST_KEY,
    MAX_DRAW_COST_KEY,
    MAX_DRAW_PER_REQUEST_KEY,
    MAX_DRAW_PER_DAY_KEY,
    DRAW_COOLDOWN_SECONDS_KEY,
  ]);
  const drawEnabled = await getConfigBoolFromRows(
    db,
    rows,
    DRAW_ENABLED_KEY,
    true,
  );
  const minDrawCost = await getConfigDecimalFromRows(
    db,
    rows,
    MIN_DRAW_COST_KEY,
    0,
  );
  const maxDrawCost = await getConfigDecimalFromRows(
    db,
    rows,
    MAX_DRAW_COST_KEY,
    0,
  );
  const maxDrawPerRequest = await getConfigDecimalFromRows(
    db,
    rows,
    MAX_DRAW_PER_REQUEST_KEY,
    1,
  );
  const maxDrawPerDay = await getConfigDecimalFromRows(
    db,
    rows,
    MAX_DRAW_PER_DAY_KEY,
    0,
  );
  const cooldownSeconds = await getConfigDecimalFromRows(
    db,
    rows,
    DRAW_COOLDOWN_SECONDS_KEY,
    0,
  );

  return {
    drawEnabled,
    minDrawCost,
    maxDrawCost,
    maxDrawPerRequest,
    maxDrawPerDay,
    cooldownSeconds,
  };
}

export async function getPoolSystemConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    POOL_MIN_RESERVE_KEY,
    POOL_MAX_PAYOUT_RATIO_KEY,
    POOL_NOISE_ENABLED_KEY,
    POOL_NOISE_RANGE_KEY,
    POOL_EPOCH_SECONDS_KEY,
  ]);
  const minReserve = await getConfigDecimalFromRows(
    db,
    rows,
    POOL_MIN_RESERVE_KEY,
    0,
  );
  const maxPayoutRatio = await getConfigDecimalFromRows(
    db,
    rows,
    POOL_MAX_PAYOUT_RATIO_KEY,
    0,
  );
  const noiseEnabled = await getConfigBoolFromRows(
    db,
    rows,
    POOL_NOISE_ENABLED_KEY,
    false,
  );
  const noiseRange = await getConfigJsonFromRows(
    db,
    rows,
    POOL_NOISE_RANGE_KEY,
    {
      min: 0,
      max: 0,
    },
  );
  const epochSeconds = await getConfigDecimalFromRows(
    db,
    rows,
    POOL_EPOCH_SECONDS_KEY,
    0,
  );

  return {
    minReserve,
    maxPayoutRatio,
    noiseEnabled,
    noiseRange: readNumericRange(noiseRange),
    epochSeconds,
  };
}

export async function getPayoutControlConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    PAYOUT_MAX_BIG_PER_HOUR_KEY,
    PAYOUT_MAX_BIG_PER_DAY_KEY,
    PAYOUT_MAX_TOTAL_PER_HOUR_KEY,
    PAYOUT_COOLDOWN_SECONDS_KEY,
  ]);
  const maxBigPerHour = await getConfigDecimalFromRows(
    db,
    rows,
    PAYOUT_MAX_BIG_PER_HOUR_KEY,
    0,
  );
  const maxBigPerDay = await getConfigDecimalFromRows(
    db,
    rows,
    PAYOUT_MAX_BIG_PER_DAY_KEY,
    0,
  );
  const maxTotalPerHour = await getConfigDecimalFromRows(
    db,
    rows,
    PAYOUT_MAX_TOTAL_PER_HOUR_KEY,
    0,
  );
  const cooldownSeconds = await getConfigDecimalFromRows(
    db,
    rows,
    PAYOUT_COOLDOWN_SECONDS_KEY,
    0,
  );

  return {
    maxBigPerHour,
    maxBigPerDay,
    maxTotalPerHour,
    cooldownSeconds,
  };
}

export async function getProbabilityControlConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    PROB_WEIGHT_JITTER_ENABLED_KEY,
    PROB_WEIGHT_JITTER_RANGE_KEY,
    PROBABILITY_SCALE_KEY,
    JACKPOT_PROB_BOOST_KEY,
    PITY_ENABLED_KEY,
    PITY_THRESHOLD_KEY,
    PITY_BOOST_PCT_KEY,
    PITY_MAX_BOOST_PCT_KEY,
  ]);
  const weightJitterEnabled = await getConfigBoolFromRows(
    db,
    rows,
    PROB_WEIGHT_JITTER_ENABLED_KEY,
    false,
  );
  const weightJitterRange = await getConfigJsonFromRows(
    db,
    rows,
    PROB_WEIGHT_JITTER_RANGE_KEY,
    { min: 0, max: 0 },
  );
  const probabilityScale = await getConfigDecimalFromRows(
    db,
    rows,
    PROBABILITY_SCALE_KEY,
    1,
  );
  const jackpotBoost = await getConfigDecimalFromRows(
    db,
    rows,
    JACKPOT_PROB_BOOST_KEY,
    0,
  );
  const pityEnabled = await getConfigBoolFromRows(
    db,
    rows,
    PITY_ENABLED_KEY,
    false,
  );
  const pityThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    PITY_THRESHOLD_KEY,
    0,
  );
  const pityBoostPct = await getConfigDecimalFromRows(
    db,
    rows,
    PITY_BOOST_PCT_KEY,
    0,
  );
  const pityMaxBoostPct = await getConfigDecimalFromRows(
    db,
    rows,
    PITY_MAX_BOOST_PCT_KEY,
    0,
  );

  return {
    weightJitterEnabled,
    weightJitterRange: readNumericRange(weightJitterRange),
    probabilityScale,
    jackpotProbabilityBoost: jackpotBoost,
    pityEnabled,
    pityThreshold,
    pityBoostPct,
    pityMaxBoostPct,
  };
}

export async function getEconomyConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    ECONOMY_HOUSE_BANKROLL_KEY,
    ECONOMY_MARKETING_BUDGET_KEY,
    ECONOMY_BONUS_EXPIRE_DAYS_KEY,
  ]);
  const houseBankroll = await getConfigDecimalFromRows(
    db,
    rows,
    ECONOMY_HOUSE_BANKROLL_KEY,
    0,
  );
  const marketingBudget = await getConfigDecimalFromRows(
    db,
    rows,
    ECONOMY_MARKETING_BUDGET_KEY,
    0,
  );
  const bonusExpireDays = await getConfigDecimalFromRows(
    db,
    rows,
    ECONOMY_BONUS_EXPIRE_DAYS_KEY,
    0,
  );

  return {
    houseBankroll,
    marketingBudget,
    bonusExpireDays,
  };
}

export async function consumeMarketingBudget(
  db: DbExecutor,
  amount: Decimal.Value,
) {
  const current = await getConfigDecimal(
    db,
    ECONOMY_MARKETING_BUDGET_KEY,
    0,
    true,
  );
  const requested = toDecimal(amount);
  if (current.lte(0)) {
    return { allowed: true, remaining: current };
  }
  if (requested.gt(current)) {
    return { allowed: false, remaining: current };
  }
  const next = current.minus(requested);
  await setConfigDecimal(
    db,
    ECONOMY_MARKETING_BUDGET_KEY,
    next,
    "Marketing budget",
  );
  return { allowed: true, remaining: next };
}

export async function getAntiAbuseConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    ANTI_ABUSE_MAX_ACCOUNTS_PER_IP_KEY,
    ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY,
    ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
    ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
  ]);
  const maxAccountsPerIp = await getConfigDecimalFromRows(
    db,
    rows,
    ANTI_ABUSE_MAX_ACCOUNTS_PER_IP_KEY,
    0,
  );
  const minWagerBeforeWithdraw = await getConfigDecimalFromRows(
    db,
    rows,
    ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY,
    0,
  );
  const suspiciousThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
    0,
  );
  const autoFreeze = await getConfigBoolFromRows(
    db,
    rows,
    ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
    false,
  );

  return {
    maxAccountsPerIp,
    minWagerBeforeWithdraw,
    suspiciousThreshold,
    autoFreeze,
  };
}

export async function getPaymentConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    PAYMENT_DEPOSIT_ENABLED_KEY,
    PAYMENT_WITHDRAW_ENABLED_KEY,
    PAYMENT_MIN_DEPOSIT_KEY,
    PAYMENT_MAX_DEPOSIT_KEY,
    PAYMENT_MIN_WITHDRAW_KEY,
    PAYMENT_MAX_WITHDRAW_KEY,
  ]);
  const depositEnabled = await getConfigBoolFromRows(
    db,
    rows,
    PAYMENT_DEPOSIT_ENABLED_KEY,
    true,
  );
  const withdrawEnabled = await getConfigBoolFromRows(
    db,
    rows,
    PAYMENT_WITHDRAW_ENABLED_KEY,
    true,
  );
  const minDepositAmount = await getConfigDecimalFromRows(
    db,
    rows,
    PAYMENT_MIN_DEPOSIT_KEY,
    0,
  );
  const maxDepositAmount = await getConfigDecimalFromRows(
    db,
    rows,
    PAYMENT_MAX_DEPOSIT_KEY,
    0,
  );
  const minWithdrawAmount = await getConfigDecimalFromRows(
    db,
    rows,
    PAYMENT_MIN_WITHDRAW_KEY,
    0,
  );
  const maxWithdrawAmount = await getConfigDecimalFromRows(
    db,
    rows,
    PAYMENT_MAX_WITHDRAW_KEY,
    0,
  );

  return {
    depositEnabled,
    withdrawEnabled,
    minDepositAmount,
    maxDepositAmount,
    minWithdrawAmount,
    maxWithdrawAmount,
  };
}

export async function getWithdrawalRiskConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY,
    WITHDRAW_RISK_LARGE_AMOUNT_SECOND_APPROVAL_THRESHOLD_KEY,
    WITHDRAW_RISK_SHARED_IP_USER_THRESHOLD_KEY,
    WITHDRAW_RISK_SHARED_DEVICE_USER_THRESHOLD_KEY,
    WITHDRAW_RISK_SHARED_PAYOUT_USER_THRESHOLD_KEY,
  ]);
  const newCardFirstWithdrawalReviewEnabled = await getConfigBoolFromRows(
    db,
    rows,
    WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY,
    true,
  );
  const largeAmountSecondApprovalThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    WITHDRAW_RISK_LARGE_AMOUNT_SECOND_APPROVAL_THRESHOLD_KEY,
    500,
  );
  const sharedIpUserThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    WITHDRAW_RISK_SHARED_IP_USER_THRESHOLD_KEY,
    3,
  );
  const sharedDeviceUserThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    WITHDRAW_RISK_SHARED_DEVICE_USER_THRESHOLD_KEY,
    2,
  );
  const sharedPayoutUserThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    WITHDRAW_RISK_SHARED_PAYOUT_USER_THRESHOLD_KEY,
    2,
  );

  return {
    newCardFirstWithdrawalReviewEnabled,
    largeAmountSecondApprovalThreshold,
    sharedIpUserThreshold,
    sharedDeviceUserThreshold,
    sharedPayoutUserThreshold,
  };
}

export async function getRewardEventConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    REWARD_SIGNUP_ENABLED_KEY,
    REWARD_SIGNUP_AMOUNT_KEY,
    REWARD_REFERRAL_ENABLED_KEY,
    REWARD_REFERRAL_AMOUNT_KEY,
    REWARD_DAILY_ENABLED_KEY,
    REWARD_DAILY_AMOUNT_KEY,
  ]);
  const signupEnabled = await getConfigBoolFromRows(
    db,
    rows,
    REWARD_SIGNUP_ENABLED_KEY,
    false,
  );
  const signupAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_SIGNUP_AMOUNT_KEY,
    0,
  );
  const referralEnabled = await getConfigBoolFromRows(
    db,
    rows,
    REWARD_REFERRAL_ENABLED_KEY,
    false,
  );
  const referralAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_REFERRAL_AMOUNT_KEY,
    0,
  );
  const dailyEnabled = await getConfigBoolFromRows(
    db,
    rows,
    REWARD_DAILY_ENABLED_KEY,
    false,
  );
  const dailyAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_DAILY_AMOUNT_KEY,
    0,
  );

  return {
    signupEnabled,
    signupAmount,
    referralEnabled,
    referralAmount,
    dailyEnabled,
    dailyAmount,
  };
}

export async function getGamificationRewardConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    REWARD_PROFILE_SECURITY_AMOUNT_KEY,
    REWARD_FIRST_DRAW_AMOUNT_KEY,
    REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
    REWARD_TOP_UP_STARTER_AMOUNT_KEY,
  ]);
  const profileSecurityRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_PROFILE_SECURITY_AMOUNT_KEY,
    8,
  );
  const firstDrawRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_FIRST_DRAW_AMOUNT_KEY,
    3,
  );
  const drawStreakDailyRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
    5,
  );
  const topUpStarterRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_TOP_UP_STARTER_AMOUNT_KEY,
    10,
  );

  return {
    profileSecurityRewardAmount,
    firstDrawRewardAmount,
    drawStreakDailyRewardAmount,
    topUpStarterRewardAmount,
  };
}

export async function getRewardCenterConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    REWARD_DAILY_ENABLED_KEY,
    REWARD_DAILY_AMOUNT_KEY,
    REWARD_PROFILE_SECURITY_AMOUNT_KEY,
    REWARD_FIRST_DRAW_AMOUNT_KEY,
    REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
    REWARD_TOP_UP_STARTER_AMOUNT_KEY,
  ]);
  const dailyEnabled = await getConfigBoolFromRows(
    db,
    rows,
    REWARD_DAILY_ENABLED_KEY,
    false,
  );
  const dailyAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_DAILY_AMOUNT_KEY,
    0,
  );
  const profileSecurityRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_PROFILE_SECURITY_AMOUNT_KEY,
    8,
  );
  const firstDrawRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_FIRST_DRAW_AMOUNT_KEY,
    3,
  );
  const drawStreakDailyRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_DRAW_STREAK_DAILY_AMOUNT_KEY,
    5,
  );
  const topUpStarterRewardAmount = await getConfigDecimalFromRows(
    db,
    rows,
    REWARD_TOP_UP_STARTER_AMOUNT_KEY,
    10,
  );

  return {
    dailyEnabled,
    dailyAmount,
    profileSecurityRewardAmount,
    firstDrawRewardAmount,
    drawStreakDailyRewardAmount,
    topUpStarterRewardAmount,
  };
}

export async function getBlackjackConfig(
  db: DbExecutor,
): Promise<BlackjackConfig> {
  const rows = await getConfigRowsByKeys(db, [
    BLACKJACK_MIN_STAKE_KEY,
    BLACKJACK_MAX_STAKE_KEY,
    BLACKJACK_WIN_PAYOUT_MULTIPLIER_KEY,
    BLACKJACK_PUSH_PAYOUT_MULTIPLIER_KEY,
    BLACKJACK_NATURAL_PAYOUT_MULTIPLIER_KEY,
    BLACKJACK_DEALER_HITS_SOFT_17_KEY,
    BLACKJACK_DOUBLE_DOWN_ALLOWED_KEY,
    BLACKJACK_SPLIT_ACES_ALLOWED_KEY,
    BLACKJACK_HIT_SPLIT_ACES_ALLOWED_KEY,
    BLACKJACK_RESPLIT_ALLOWED_KEY,
    BLACKJACK_MAX_SPLIT_HANDS_KEY,
    BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED_KEY,
  ]);
  const minStake = await getConfigDecimalFromRows(
    db,
    rows,
    BLACKJACK_MIN_STAKE_KEY,
    BLACKJACK_CONFIG.minStake,
  );
  const maxStake = await getConfigDecimalFromRows(
    db,
    rows,
    BLACKJACK_MAX_STAKE_KEY,
    BLACKJACK_CONFIG.maxStake,
  );
  const winPayoutMultiplier = await getConfigDecimalFromRows(
    db,
    rows,
    BLACKJACK_WIN_PAYOUT_MULTIPLIER_KEY,
    BLACKJACK_CONFIG.winPayoutMultiplier,
  );
  const pushPayoutMultiplier = await getConfigDecimalFromRows(
    db,
    rows,
    BLACKJACK_PUSH_PAYOUT_MULTIPLIER_KEY,
    BLACKJACK_CONFIG.pushPayoutMultiplier,
  );
  const naturalPayoutMultiplier = await getConfigDecimalFromRows(
    db,
    rows,
    BLACKJACK_NATURAL_PAYOUT_MULTIPLIER_KEY,
    BLACKJACK_CONFIG.naturalPayoutMultiplier,
  );
  const dealerHitsSoft17 = await getConfigBoolFromRows(
    db,
    rows,
    BLACKJACK_DEALER_HITS_SOFT_17_KEY,
    BLACKJACK_CONFIG.dealerHitsSoft17,
  );
  const doubleDownAllowed = await getConfigBoolFromRows(
    db,
    rows,
    BLACKJACK_DOUBLE_DOWN_ALLOWED_KEY,
    BLACKJACK_CONFIG.doubleDownAllowed,
  );
  const splitAcesAllowed = await getConfigBoolFromRows(
    db,
    rows,
    BLACKJACK_SPLIT_ACES_ALLOWED_KEY,
    BLACKJACK_CONFIG.splitAcesAllowed,
  );
  const hitSplitAcesAllowed = await getConfigBoolFromRows(
    db,
    rows,
    BLACKJACK_HIT_SPLIT_ACES_ALLOWED_KEY,
    BLACKJACK_CONFIG.hitSplitAcesAllowed,
  );
  const resplitAllowed = await getConfigBoolFromRows(
    db,
    rows,
    BLACKJACK_RESPLIT_ALLOWED_KEY,
    BLACKJACK_CONFIG.resplitAllowed,
  );
  const maxSplitHands = await getConfigDecimalFromRows(
    db,
    rows,
    BLACKJACK_MAX_SPLIT_HANDS_KEY,
    BLACKJACK_CONFIG.maxSplitHands,
  );
  const splitTenValueCardsAllowed = await getConfigBoolFromRows(
    db,
    rows,
    BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED_KEY,
    BLACKJACK_CONFIG.splitTenValueCardsAllowed,
  );

  return {
    minStake: minStake.toFixed(2),
    maxStake: maxStake.toFixed(2),
    winPayoutMultiplier: winPayoutMultiplier.toFixed(2),
    pushPayoutMultiplier: pushPayoutMultiplier.toFixed(2),
    naturalPayoutMultiplier: naturalPayoutMultiplier.toFixed(2),
    dealerHitsSoft17,
    doubleDownAllowed,
    splitAcesAllowed,
    hitSplitAcesAllowed,
    resplitAllowed,
    maxSplitHands: Math.max(
      2,
      Math.min(8, Math.trunc(maxSplitHands.toNumber())),
    ),
    splitTenValueCardsAllowed,
  };
}

export async function getAnalyticsConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    ANALYTICS_STATS_DELAY_KEY,
    ANALYTICS_PUBLIC_STATS_KEY,
    ANALYTICS_POOL_PUBLIC_KEY,
  ]);
  const statsDelay = await getConfigDecimalFromRows(
    db,
    rows,
    ANALYTICS_STATS_DELAY_KEY,
    0,
  );
  const publicStatsEnabled = await getConfigBoolFromRows(
    db,
    rows,
    ANALYTICS_PUBLIC_STATS_KEY,
    false,
  );
  const poolBalancePublic = await getConfigBoolFromRows(
    db,
    rows,
    ANALYTICS_POOL_PUBLIC_KEY,
    false,
  );

  return {
    statsVisibilityDelayMinutes: statsDelay,
    publicStatsEnabled,
    poolBalancePublic,
  };
}

export async function getAuthFailureConfig(db: DbExecutor) {
  const defaults = getConfig();
  const rows = await getConfigRowsByKeys(db, [
    AUTH_FAILURE_WINDOW_MINUTES_KEY,
    AUTH_FAILURE_THRESHOLD_KEY,
    ADMIN_FAILURE_THRESHOLD_KEY,
  ]);
  const windowMinutes = await getConfigDecimalFromRows(
    db,
    rows,
    AUTH_FAILURE_WINDOW_MINUTES_KEY,
    defaults.authFailureWindowMinutes,
  );
  const userThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    AUTH_FAILURE_THRESHOLD_KEY,
    defaults.authFailureFreezeThreshold,
  );
  const adminThreshold = await getConfigDecimalFromRows(
    db,
    rows,
    ADMIN_FAILURE_THRESHOLD_KEY,
    defaults.adminFailureFreezeThreshold,
  );

  return {
    authFailureWindowMinutes: windowMinutes,
    authFailureFreezeThreshold: userThreshold,
    adminFailureFreezeThreshold: adminThreshold,
  };
}

export async function getSaasUsageAlertConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    SAAS_USAGE_ALERT_MAX_MINUTE_QPS_KEY,
    SAAS_USAGE_ALERT_MAX_SINGLE_PAYOUT_AMOUNT_KEY,
    SAAS_USAGE_ALERT_MAX_ANTI_EXPLOIT_RATE_PCT_KEY,
  ]);
  const maxMinuteQps = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_USAGE_ALERT_MAX_MINUTE_QPS_KEY,
    5,
  );
  const maxSinglePayoutAmount = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_USAGE_ALERT_MAX_SINGLE_PAYOUT_AMOUNT_KEY,
    100,
  );
  const maxAntiExploitRatePct = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_USAGE_ALERT_MAX_ANTI_EXPLOIT_RATE_PCT_KEY,
    20,
  );

  return {
    maxMinuteQps,
    maxSinglePayoutAmount,
    maxAntiExploitRatePct,
  };
}

export async function getSaasStatusConfig(db: DbExecutor) {
  const rows = await getConfigRowsByKeys(db, [
    SAAS_STATUS_API_ERROR_RATE_WARN_KEY,
    SAAS_STATUS_API_ERROR_RATE_OUTAGE_KEY,
    SAAS_STATUS_API_P95_MS_WARN_KEY,
    SAAS_STATUS_API_P95_MS_OUTAGE_KEY,
    SAAS_STATUS_WORKER_LAG_MS_WARN_KEY,
    SAAS_STATUS_WORKER_LAG_MS_OUTAGE_KEY,
    SAAS_STATUS_MONTHLY_SLA_TARGET_PCT_KEY,
  ]);

  const apiErrorRateWarn = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_API_ERROR_RATE_WARN_KEY,
    2,
  );
  const apiErrorRateOutage = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_API_ERROR_RATE_OUTAGE_KEY,
    10,
  );
  const apiP95MsWarn = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_API_P95_MS_WARN_KEY,
    1000,
  );
  const apiP95MsOutage = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_API_P95_MS_OUTAGE_KEY,
    2500,
  );
  const workerLagMsWarn = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_WORKER_LAG_MS_WARN_KEY,
    60000,
  );
  const workerLagMsOutage = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_WORKER_LAG_MS_OUTAGE_KEY,
    300000,
  );
  const monthlySlaTargetPct = await getConfigDecimalFromRows(
    db,
    rows,
    SAAS_STATUS_MONTHLY_SLA_TARGET_PCT_KEY,
    99.9,
  );

  return {
    apiErrorRatePct: {
      degraded: apiErrorRateWarn,
      outage: apiErrorRateOutage,
    },
    apiP95Ms: {
      degraded: apiP95MsWarn,
      outage: apiP95MsOutage,
    },
    workerLagMs: {
      degraded: workerLagMsWarn,
      outage: workerLagMsOutage,
    },
    monthlySlaTargetPct,
  };
}
