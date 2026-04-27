import convict from 'convict';
import { internalInvariantError } from './errors';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppConfig = {
  databaseUrl: string;
  drawCost: number;
  logLevel: LogLevel;
  nodeEnv: 'development' | 'production' | 'test';
  observabilityServiceName: string;
  observabilityEnvironment: string;
  observabilityRelease: string;
  observabilityCommitSha: string;
  sentryDsn: string;
  sentryTracesSampleRate: number;
  otelExporterOtlpEndpoint: string;
  otelExporterOtlpHeaders: string;
  otelTraceSampleRatio: number;
  telegramBotToken: string;
  telegramPageChatId: string;
  telegramTicketChatId: string;
  telegramDigestChatId: string;
  observabilityWithdrawStuckThresholdMinutes: number;
  paymentOperatingMode: 'manual_review' | 'automated';
  paymentAutomatedModeOptIn: boolean;
  paymentReconciliationEnabled: boolean;
  paymentReconciliationIntervalMs: number;
  paymentReconciliationLookbackMinutes: number;
  paymentReconciliationPendingTimeoutMinutes: number;
  paymentReconciliationMaxOrdersPerProvider: number;
  paymentOperationsEnabled: boolean;
  paymentOperationsIntervalMs: number;
  paymentOperationsTimeoutMinutes: number;
  paymentOperationsBatchSize: number;
  paymentWebhookWorkerIntervalMs: number;
  paymentWebhookBatchSize: number;
  paymentWebhookLockTimeoutMs: number;
  paymentOutboundWorkerIntervalMs: number;
  paymentOutboundBatchSize: number;
  paymentOutboundLockTimeoutMs: number;
  paymentOutboundUnknownRetryDelayMs: number;
  saasBillingWorkerEnabled: boolean;
  saasBillingWorkerIntervalMs: number;
  saasBillingWebhookBatchSize: number;
  saasBillingWebhookLockTimeoutMs: number;
  saasBillingAutomationEnabled: boolean;
  saasBillingAutomationBatchSize: number;
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
  authNotificationRequestTimeoutMs: number;
  authNotificationWorkerIntervalMs: number;
  authNotificationBatchSize: number;
  authNotificationRetryBaseMs: number;
  authNotificationRetryMaxMs: number;
  authNotificationMaxAttempts: number;
  authNotificationLockTimeoutMs: number;
  authNotificationEmailThrottleMax: number;
  authNotificationEmailThrottleWindowMs: number;
  authNotificationSmsThrottleMax: number;
  authNotificationSmsThrottleWindowMs: number;
  authNotificationAlertThrottleMax: number;
  authNotificationAlertThrottleWindowMs: number;
  authSmtpHost: string;
  authSmtpPort: number;
  authSmtpSecure: boolean;
  authSmtpUser: string;
  authSmtpPass: string;
  authEmailFrom: string;
  authTwilioAccountSid: string;
  authTwilioAuthToken: string;
  authTwilioFromNumber: string;
  authTwilioMessagingServiceSid: string;
  sysAuthFailureWindowMinutes: number;
  sysAuthFailureFreezeThreshold: number;
  sysAdminFailureFreezeThreshold: number;
  drawPoolCacheTtlSeconds: number;
};

let cachedConfig: AppConfig | null = null;

const configViewHandler: ProxyHandler<AppConfig> = {
  get(_target, property) {
    return getConfig()[property as keyof AppConfig];
  },
  has(_target, property) {
    return property in getConfig();
  },
  ownKeys() {
    return Reflect.ownKeys(getConfig());
  },
  getOwnPropertyDescriptor(_target, property) {
    const descriptor = Object.getOwnPropertyDescriptor(getConfig(), property);
    if (!descriptor) {
      return undefined;
    }

    return {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      writable: false,
      value: getConfig()[property as keyof AppConfig],
    };
  },
};

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
  observabilityServiceName: {
    doc: 'Logical service name for logs, traces, and error aggregation',
    format: String,
    default: 'reward-backend',
    env: 'OBSERVABILITY_SERVICE_NAME',
  },
  observabilityEnvironment: {
    doc: 'Deployment environment label for logs, traces, and error aggregation',
    format: String,
    default: '',
    env: 'OBSERVABILITY_ENVIRONMENT',
  },
  observabilityRelease: {
    doc: 'Release version identifier attached to logs, traces, and error events',
    format: String,
    default: '',
    env: 'OBSERVABILITY_RELEASE',
  },
  observabilityCommitSha: {
    doc: 'Commit SHA attached to logs, traces, and error events',
    format: String,
    default: '',
    env: 'OBSERVABILITY_COMMIT_SHA',
  },
  sentryDsn: {
    doc: 'Optional Sentry DSN for backend exception aggregation',
    format: String,
    default: '',
    env: 'SENTRY_DSN',
  },
  sentryTracesSampleRate: {
    doc: 'Optional Sentry trace sampling rate when backend tracing is enabled',
    format: Number,
    default: 0,
    env: 'SENTRY_TRACES_SAMPLE_RATE',
  },
  otelExporterOtlpEndpoint: {
    doc: 'Optional OTLP HTTP endpoint for exporting backend traces',
    format: String,
    default: '',
    env: 'OTEL_EXPORTER_OTLP_ENDPOINT',
  },
  otelExporterOtlpHeaders: {
    doc: 'Optional OTLP HTTP headers in k=v,k2=v2 form',
    format: String,
    default: '',
    env: 'OTEL_EXPORTER_OTLP_HEADERS',
  },
  otelTraceSampleRatio: {
    doc: 'Trace sampling ratio for backend OpenTelemetry spans',
    format: Number,
    default: 1,
    env: 'OTEL_TRACE_SAMPLE_RATIO',
  },
  telegramBotToken: {
    doc: 'Optional Telegram bot token used by the internal notification relay routes',
    format: String,
    default: '',
    env: 'TELEGRAM_BOT_TOKEN',
  },
  telegramPageChatId: {
    doc: 'Telegram chat id for paging and urgent operational alerts',
    format: String,
    default: '',
    env: 'TELEGRAM_PAGE_CHAT_ID',
  },
  telegramTicketChatId: {
    doc: 'Telegram chat id for ticket level operational alerts',
    format: String,
    default: '',
    env: 'TELEGRAM_TICKET_CHAT_ID',
  },
  telegramDigestChatId: {
    doc: 'Telegram chat id for low priority digest style operational alerts',
    format: String,
    default: '',
    env: 'TELEGRAM_DIGEST_CHAT_ID',
  },
  observabilityWithdrawStuckThresholdMinutes: {
    doc: 'Age in minutes after which requested, approved, provider_submitted, or provider_processing withdrawals are considered stuck',
    format: 'int',
    default: 60,
    env: 'OBSERVABILITY_WITHDRAW_STUCK_THRESHOLD_MINUTES',
  },
  paymentOperatingMode: {
    doc: 'Choose between manual finance review and the automated payment execution path backed by registered adapters and workers',
    format: ['manual_review', 'automated'],
    default: 'manual_review',
    env: 'PAYMENT_OPERATING_MODE',
  },
  paymentAutomatedModeOptIn: {
    doc: 'Require an explicit runtime opt-in before PAYMENT_OPERATING_MODE=automated can execute real payment automation',
    format: Boolean,
    default: false,
    env: 'PAYMENT_AUTOMATED_MODE_OPT_IN',
  },
  paymentReconciliationEnabled: {
    doc: 'Enable scheduled provider reconciliation jobs',
    format: Boolean,
    default: true,
    env: 'PAYMENT_RECONCILIATION_ENABLED',
  },
  paymentReconciliationIntervalMs: {
    doc: 'Interval in ms between scheduled reconciliation cycles',
    format: 'int',
    default: 300_000,
    env: 'PAYMENT_RECONCILIATION_INTERVAL_MS',
  },
  paymentReconciliationLookbackMinutes: {
    doc: 'How far back reconciliation pulls provider orders for each run',
    format: 'int',
    default: 1_440,
    env: 'PAYMENT_RECONCILIATION_LOOKBACK_MINUTES',
  },
  paymentReconciliationPendingTimeoutMinutes: {
    doc: 'Age in minutes after which non-terminal orders are force-rechecked',
    format: 'int',
    default: 15,
    env: 'PAYMENT_RECONCILIATION_PENDING_TIMEOUT_MINUTES',
  },
  paymentReconciliationMaxOrdersPerProvider: {
    doc: 'Maximum number of local orders scanned per provider reconciliation run',
    format: 'int',
    default: 200,
    env: 'PAYMENT_RECONCILIATION_MAX_ORDERS_PER_PROVIDER',
  },
  paymentOperationsEnabled: {
    doc: 'Enable scheduled timeout cleanup and stuck-order compensation jobs',
    format: Boolean,
    default: true,
    env: 'PAYMENT_OPERATIONS_ENABLED',
  },
  paymentOperationsIntervalMs: {
    doc: 'Interval in ms between scheduled payment cleanup and compensation cycles',
    format: 'int',
    default: 300_000,
    env: 'PAYMENT_OPERATIONS_INTERVAL_MS',
  },
  paymentOperationsTimeoutMinutes: {
    doc: 'Age in minutes after which non-terminal finance orders are considered timed out',
    format: 'int',
    default: 60,
    env: 'PAYMENT_OPERATIONS_TIMEOUT_MINUTES',
  },
  paymentOperationsBatchSize: {
    doc: 'Maximum stale finance orders handled in each cleanup or compensation scan',
    format: 'int',
    default: 100,
    env: 'PAYMENT_OPERATIONS_BATCH_SIZE',
  },
  paymentWebhookWorkerIntervalMs: {
    doc: 'Worker poll interval in ms for queued payment webhook events',
    format: 'int',
    default: 1_000,
    env: 'PAYMENT_WEBHOOK_WORKER_INTERVAL_MS',
  },
  paymentWebhookBatchSize: {
    doc: 'Maximum queued payment webhook events processed per worker tick',
    format: 'int',
    default: 25,
    env: 'PAYMENT_WEBHOOK_BATCH_SIZE',
  },
  paymentWebhookLockTimeoutMs: {
    doc: 'Time in ms before an in-flight payment webhook event can be reclaimed',
    format: 'int',
    default: 120_000,
    env: 'PAYMENT_WEBHOOK_LOCK_TIMEOUT_MS',
  },
  paymentOutboundWorkerIntervalMs: {
    doc: 'Worker poll interval in ms for queued outbound payment requests',
    format: 'int',
    default: 1_000,
    env: 'PAYMENT_OUTBOUND_WORKER_INTERVAL_MS',
  },
  paymentOutboundBatchSize: {
    doc: 'Maximum outbound payment requests processed per worker tick',
    format: 'int',
    default: 25,
    env: 'PAYMENT_OUTBOUND_BATCH_SIZE',
  },
  paymentOutboundLockTimeoutMs: {
    doc: 'Time in ms before an in-flight outbound payment request can be reclaimed',
    format: 'int',
    default: 120_000,
    env: 'PAYMENT_OUTBOUND_LOCK_TIMEOUT_MS',
  },
  paymentOutboundUnknownRetryDelayMs: {
    doc: 'Delay in ms before retrying outbound requests whose delivery status is unknown',
    format: 'int',
    default: 30_000,
    env: 'PAYMENT_OUTBOUND_UNKNOWN_RETRY_DELAY_MS',
  },
  saasBillingWorkerEnabled: {
    doc: 'Enable the dedicated B2B SaaS billing worker',
    format: Boolean,
    default: true,
    env: 'SAAS_BILLING_WORKER_ENABLED',
  },
  saasBillingWorkerIntervalMs: {
    doc: 'Interval in ms between SaaS billing worker cycles',
    format: 'int',
    default: 5_000,
    env: 'SAAS_BILLING_WORKER_INTERVAL_MS',
  },
  saasBillingWebhookBatchSize: {
    doc: 'Maximum queued SaaS Stripe webhook events processed per worker cycle',
    format: 'int',
    default: 25,
    env: 'SAAS_BILLING_WEBHOOK_BATCH_SIZE',
  },
  saasBillingWebhookLockTimeoutMs: {
    doc: 'Time in ms before an in-flight SaaS Stripe webhook event can be reclaimed',
    format: 'int',
    default: 120_000,
    env: 'SAAS_BILLING_WEBHOOK_LOCK_TIMEOUT_MS',
  },
  saasBillingAutomationEnabled: {
    doc: 'Enable automatic prior-month billing close for billable SaaS tenants',
    format: Boolean,
    default: true,
    env: 'SAAS_BILLING_AUTOMATION_ENABLED',
  },
  saasBillingAutomationBatchSize: {
    doc: 'Maximum auto-billable SaaS tenants processed per worker cycle',
    format: 'int',
    default: 100,
    env: 'SAAS_BILLING_AUTOMATION_BATCH_SIZE',
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
  authNotificationRequestTimeoutMs: {
    doc: 'Provider request timeout in ms for auth notifications',
    format: 'int',
    default: 10_000,
    env: 'AUTH_NOTIFICATION_REQUEST_TIMEOUT_MS',
  },
  authNotificationWorkerIntervalMs: {
    doc: 'Worker poll interval in ms for auth notification deliveries',
    format: 'int',
    default: 1_000,
    env: 'AUTH_NOTIFICATION_WORKER_INTERVAL_MS',
  },
  authNotificationBatchSize: {
    doc: 'Maximum queued auth notifications processed per worker tick',
    format: 'int',
    default: 25,
    env: 'AUTH_NOTIFICATION_BATCH_SIZE',
  },
  authNotificationRetryBaseMs: {
    doc: 'Base retry delay in ms for auth notification redelivery',
    format: 'int',
    default: 5_000,
    env: 'AUTH_NOTIFICATION_RETRY_BASE_MS',
  },
  authNotificationRetryMaxMs: {
    doc: 'Maximum retry delay in ms for auth notification redelivery',
    format: 'int',
    default: 300_000,
    env: 'AUTH_NOTIFICATION_RETRY_MAX_MS',
  },
  authNotificationMaxAttempts: {
    doc: 'Maximum delivery attempts before a notification is marked failed',
    format: 'int',
    default: 6,
    env: 'AUTH_NOTIFICATION_MAX_ATTEMPTS',
  },
  authNotificationLockTimeoutMs: {
    doc: 'Time in ms before an in-flight auth notification can be reclaimed',
    format: 'int',
    default: 120_000,
    env: 'AUTH_NOTIFICATION_LOCK_TIMEOUT_MS',
  },
  authNotificationEmailThrottleMax: {
    doc: 'Per-email limit for password reset and verification messages',
    format: 'int',
    default: 3,
    env: 'AUTH_NOTIFICATION_EMAIL_THROTTLE_MAX',
  },
  authNotificationEmailThrottleWindowMs: {
    doc: 'Window in ms for per-email auth notification throttling',
    format: 'int',
    default: 900_000,
    env: 'AUTH_NOTIFICATION_EMAIL_THROTTLE_WINDOW_MS',
  },
  authNotificationSmsThrottleMax: {
    doc: 'Per-phone limit for verification codes',
    format: 'int',
    default: 3,
    env: 'AUTH_NOTIFICATION_SMS_THROTTLE_MAX',
  },
  authNotificationSmsThrottleWindowMs: {
    doc: 'Window in ms for per-phone verification code throttling',
    format: 'int',
    default: 600_000,
    env: 'AUTH_NOTIFICATION_SMS_THROTTLE_WINDOW_MS',
  },
  authNotificationAlertThrottleMax: {
    doc: 'Per-email limit for anomalous login alerts',
    format: 'int',
    default: 2,
    env: 'AUTH_NOTIFICATION_ALERT_THROTTLE_MAX',
  },
  authNotificationAlertThrottleWindowMs: {
    doc: 'Window in ms for per-email anomalous login alert throttling',
    format: 'int',
    default: 3_600_000,
    env: 'AUTH_NOTIFICATION_ALERT_THROTTLE_WINDOW_MS',
  },
  authSmtpHost: {
    doc: 'SMTP hostname used for auth email delivery',
    format: String,
    default: '',
    env: 'AUTH_SMTP_HOST',
  },
  authSmtpPort: {
    doc: 'SMTP port used for auth email delivery',
    format: 'port',
    default: 587,
    env: 'AUTH_SMTP_PORT',
  },
  authSmtpSecure: {
    doc: 'Whether SMTP uses an implicit TLS connection',
    format: Boolean,
    default: false,
    env: 'AUTH_SMTP_SECURE',
  },
  authSmtpUser: {
    doc: 'SMTP username used for auth email delivery',
    format: String,
    default: '',
    env: 'AUTH_SMTP_USER',
  },
  authSmtpPass: {
    doc: 'SMTP password used for auth email delivery',
    format: String,
    default: '',
    env: 'AUTH_SMTP_PASS',
  },
  authEmailFrom: {
    doc: 'From address used for auth email delivery',
    format: String,
    default: '',
    env: 'AUTH_EMAIL_FROM',
  },
  authTwilioAccountSid: {
    doc: 'Twilio Account SID used for auth SMS delivery',
    format: String,
    default: '',
    env: 'AUTH_TWILIO_ACCOUNT_SID',
  },
  authTwilioAuthToken: {
    doc: 'Twilio Auth Token used for auth SMS delivery',
    format: String,
    default: '',
    env: 'AUTH_TWILIO_AUTH_TOKEN',
  },
  authTwilioFromNumber: {
    doc: 'Twilio sender number used for auth SMS delivery',
    format: String,
    default: '',
    env: 'AUTH_TWILIO_FROM_NUMBER',
  },
  authTwilioMessagingServiceSid: {
    doc: 'Optional Twilio Messaging Service SID used for auth SMS delivery',
    format: String,
    default: '',
    env: 'AUTH_TWILIO_MESSAGING_SERVICE_SID',
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
    throw internalInvariantError('DATABASE_URL or POSTGRES_URL is not set');
  }

  cachedConfig = properties;

  return cachedConfig;
}

export function resetConfig() {
  cachedConfig = null;
}

export function getConfigView<T extends AppConfig = AppConfig>() {
  return new Proxy({} as AppConfig, configViewHandler) as T;
}
