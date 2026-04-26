import convict from 'convict';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppConfig = {
  databaseUrl: string;
  drawCost: number;
  logLevel: LogLevel;
  nodeEnv: 'development' | 'production' | 'test';
  webBaseUrl: string;
  adminBaseUrl: string;
  port: number;
  redisUrl: string;
  rateLimitRedisPrefix: string;
  rateLimitGlobalMax: number;
  rateLimitGlobalWindowMs: number;
  rateLimitAuthMax: number;
  rateLimitAuthWindowMs: number;
  rateLimitAdminAuthMax: number;
  rateLimitAdminAuthWindowMs: number;
  rateLimitDrawMax: number;
  rateLimitDrawWindowMs: number;
  rateLimitFinanceMax: number;
  rateLimitFinanceWindowMs: number;
  rateLimitAdminMax: number;
  rateLimitAdminWindowMs: number;
  authFailureDelayMs: number;
  authFailureJitterMs: number;
  authFailureWindowMinutes: number;
  authFailureFreezeThreshold: number;
  adminFailureFreezeThreshold: number;
  passwordResetTtlMinutes: number;
  emailVerificationTtlMinutes: number;
  phoneVerificationTtlMinutes: number;
  anomalousLoginLookbackDays: number;
  authNotificationWebhookUrl: string;
  sysAuthFailureWindowMinutes: number;
  sysAuthFailureFreezeThreshold: number;
  sysAdminFailureFreezeThreshold: number;
  drawPoolCacheTtlSeconds: number;
};

let cachedConfig: AppConfig | null = null;

const schema = {
  databaseUrl: {
    doc: 'Primary database connection string',
    format: String,
    default: '',
    env: 'DATABASE_URL',
  },
  drawCost: {
    doc: 'Default draw cost (used to seed system_config)',
    format: 'int',
    default: 10,
    env: 'DRAW_COST',
  },
  logLevel: {
    doc: 'Application log level',
    format: ['debug', 'info', 'warn', 'error'],
    default: 'info',
    env: 'LOG_LEVEL',
  },
  nodeEnv: {
    doc: 'Runtime environment',
    format: ['development', 'production', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  webBaseUrl: {
    doc: 'Web frontend base URL',
    format: String,
    default: 'http://localhost:3000',
    env: 'WEB_BASE_URL',
  },
  adminBaseUrl: {
    doc: 'Admin frontend base URL',
    format: String,
    default: 'http://localhost:5173',
    env: 'ADMIN_BASE_URL',
  },
  port: {
    doc: 'Backend listening port',
    format: 'port',
    default: 4000,
    env: 'PORT',
  },
  redisUrl: {
    doc: 'Redis connection string',
    format: String,
    default: '',
    env: 'REDIS_URL',
  },
  rateLimitRedisPrefix: {
    doc: 'Redis key prefix for rate limiting',
    format: String,
    default: 'reward:ratelimit',
    env: 'RATE_LIMIT_REDIS_PREFIX',
  },
  rateLimitGlobalMax: {
    doc: 'Global rate limit max requests per window',
    format: 'int',
    default: 120,
    env: 'RATE_LIMIT_GLOBAL_MAX',
  },
  rateLimitGlobalWindowMs: {
    doc: 'Global rate limit window in ms',
    format: 'int',
    default: 60_000,
    env: 'RATE_LIMIT_GLOBAL_WINDOW_MS',
  },
  rateLimitAuthMax: {
    doc: 'Auth rate limit max requests per window',
    format: 'int',
    default: 10,
    env: 'RATE_LIMIT_AUTH_MAX',
  },
  rateLimitAuthWindowMs: {
    doc: 'Auth rate limit window in ms',
    format: 'int',
    default: 300_000,
    env: 'RATE_LIMIT_AUTH_WINDOW_MS',
  },
  rateLimitAdminAuthMax: {
    doc: 'Admin auth rate limit max requests per window',
    format: 'int',
    default: 5,
    env: 'RATE_LIMIT_ADMIN_AUTH_MAX',
  },
  rateLimitAdminAuthWindowMs: {
    doc: 'Admin auth rate limit window in ms',
    format: 'int',
    default: 300_000,
    env: 'RATE_LIMIT_ADMIN_AUTH_WINDOW_MS',
  },
  rateLimitDrawMax: {
    doc: 'Draw rate limit max requests per window',
    format: 'int',
    default: 30,
    env: 'RATE_LIMIT_DRAW_MAX',
  },
  rateLimitDrawWindowMs: {
    doc: 'Draw rate limit window in ms',
    format: 'int',
    default: 60_000,
    env: 'RATE_LIMIT_DRAW_WINDOW_MS',
  },
  rateLimitFinanceMax: {
    doc: 'Finance rate limit max requests per window',
    format: 'int',
    default: 20,
    env: 'RATE_LIMIT_FINANCE_MAX',
  },
  rateLimitFinanceWindowMs: {
    doc: 'Finance rate limit window in ms',
    format: 'int',
    default: 60_000,
    env: 'RATE_LIMIT_FINANCE_WINDOW_MS',
  },
  rateLimitAdminMax: {
    doc: 'Admin mutation rate limit max requests per window',
    format: 'int',
    default: 60,
    env: 'RATE_LIMIT_ADMIN_MAX',
  },
  rateLimitAdminWindowMs: {
    doc: 'Admin mutation rate limit window in ms',
    format: 'int',
    default: 60_000,
    env: 'RATE_LIMIT_ADMIN_WINDOW_MS',
  },
  authFailureDelayMs: {
    doc: 'Base delay in ms for failed auth responses',
    format: 'int',
    default: 400,
    env: 'AUTH_FAILURE_DELAY_MS',
  },
  authFailureJitterMs: {
    doc: 'Jitter in ms added to failed auth responses',
    format: 'int',
    default: 250,
    env: 'AUTH_FAILURE_JITTER_MS',
  },
  authFailureWindowMinutes: {
    doc: 'Auth failure counting window in minutes',
    format: 'int',
    default: 15,
    env: 'AUTH_FAILURE_WINDOW_MINUTES',
  },
  authFailureFreezeThreshold: {
    doc: 'User login failure threshold before freeze',
    format: 'int',
    default: 8,
    env: 'AUTH_FAILURE_FREEZE_THRESHOLD',
  },
  adminFailureFreezeThreshold: {
    doc: 'Admin login failure threshold before freeze',
    format: 'int',
    default: 5,
    env: 'ADMIN_FAILURE_FREEZE_THRESHOLD',
  },
  passwordResetTtlMinutes: {
    doc: 'Password reset token TTL in minutes',
    format: 'int',
    default: 30,
    env: 'PASSWORD_RESET_TTL_MINUTES',
  },
  emailVerificationTtlMinutes: {
    doc: 'Email verification token TTL in minutes',
    format: 'int',
    default: 24 * 60,
    env: 'EMAIL_VERIFICATION_TTL_MINUTES',
  },
  phoneVerificationTtlMinutes: {
    doc: 'Phone verification code TTL in minutes',
    format: 'int',
    default: 10,
    env: 'PHONE_VERIFICATION_TTL_MINUTES',
  },
  anomalousLoginLookbackDays: {
    doc: 'Lookback window in days for anomalous login comparisons',
    format: 'int',
    default: 30,
    env: 'ANOMALOUS_LOGIN_LOOKBACK_DAYS',
  },
  authNotificationWebhookUrl: {
    doc: 'Optional webhook URL for auth notifications and security alerts',
    format: String,
    default: '',
    env: 'AUTH_NOTIFICATION_WEBHOOK_URL',
  },
  sysAuthFailureWindowMinutes: {
    doc: 'System-config override for auth failure window',
    format: 'int',
    default: 0,
    env: 'SYS_AUTH_FAILURE_WINDOW_MINUTES',
  },
  sysAuthFailureFreezeThreshold: {
    doc: 'System-config override for user auth failure threshold',
    format: 'int',
    default: 0,
    env: 'SYS_AUTH_FAILURE_FREEZE_THRESHOLD',
  },
  sysAdminFailureFreezeThreshold: {
    doc: 'System-config override for admin auth failure threshold',
    format: 'int',
    default: 0,
    env: 'SYS_ADMIN_FAILURE_FREEZE_THRESHOLD',
  },
  drawPoolCacheTtlSeconds: {
    doc: 'Probability pool cache TTL in seconds (0 disables caching)',
    format: 'int',
    default: 30,
    env: 'DRAW_POOL_CACHE_TTL_SECONDS',
  },
};

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const config = convict(schema);
  if (!config.get('databaseUrl') && process.env.POSTGRES_URL) {
    config.set('databaseUrl', process.env.POSTGRES_URL);
  }

  config.validate({ allowed: 'strict' });

  const properties = config.getProperties() as AppConfig;
  if (!properties.databaseUrl) {
    throw new Error('DATABASE_URL or POSTGRES_URL is not set');
  }

  cachedConfig = properties;

  return cachedConfig;
}

export function resetConfig() {
  cachedConfig = null;
}
