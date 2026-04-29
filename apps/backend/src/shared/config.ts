import convict from "convict";
import {
  AmlProviderKeySchema,
  type AmlProviderKey,
} from "@reward/shared-types/aml";
import { internalInvariantError } from "./errors";

type LogLevel = "debug" | "info" | "warn" | "error";

export type AppConfig = {
  databaseUrl: string;
  databasePoolMax: number;
  databasePoolIdleTimeoutSeconds: number;
  databasePoolConnectTimeoutSeconds: number;
  databasePoolMaxLifetimeSeconds: number;
  drawCost: number;
  logLevel: LogLevel;
  nodeEnv: "development" | "production" | "test";
  observabilityServiceName: string;
  observabilityEnvironment: string;
  observabilityRelease: string;
  observabilityCommitSha: string;
  sentryDsn: string;
  sentryTracesSampleRate: number;
  otelExporterOtlpEndpoint: string;
  otelExporterOtlpHeaders: string;
  otelTraceSampleRatio: number;
  securityEventSinks: string;
  securityEventWebhookUrl: string;
  securityEventRequestTimeoutMs: number;
  securityEventElasticsearchUrl: string;
  securityEventElasticsearchApiKey: string;
  securityEventElasticsearchIndex: string;
  telegramBotToken: string;
  telegramPageChatId: string;
  telegramTicketChatId: string;
  telegramDigestChatId: string;
  amlProviderKey: AmlProviderKey;
  amlReviewSlaMinutes: number;
  observabilityWithdrawStuckThresholdMinutes: number;
  paymentOperatingMode: "manual_review" | "automated";
  paymentAutomatedModeOptIn: boolean;
  paymentReconciliationEnabled: boolean;
  paymentReconciliationIntervalMs: number;
  paymentReconciliationLookbackMinutes: number;
  paymentReconciliationPendingTimeoutMinutes: number;
  paymentReconciliationMaxOrdersPerProvider: number;
  walletReconciliationEnabled: boolean;
  walletReconciliationIntervalMs: number;
  walletReconciliationSlaHours: number;
  walletReconciliationSlackWebhookUrl: string;
  walletReconciliationPagerDutyRoutingKey: string;
  walletReconciliationNotifyRequestTimeoutMs: number;
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
  appleIapBundleId: string;
  appleIapAppAppleId: number;
  appleIapIssuerId: string;
  appleIapKeyId: string;
  appleIapPrivateKey: string;
  appleIapRootCertificatesPem: string;
  appleIapEnableOnlineChecks: boolean;
  appleIapDefaultEnvironment: "sandbox" | "production";
  googlePlayPackageName: string;
  googlePlayServiceAccountEmail: string;
  googlePlayServiceAccountPrivateKey: string;
  googlePlayOauthTokenUrl: string;
  googlePlayApiBaseUrl: string;
  googlePlayRtdnBearerToken: string;
  predictionMarketOracleWorkerEnabled: boolean;
  predictionMarketOracleWorkerIntervalMs: number;
  predictionMarketOracleBatchSize: number;
  predictionMarketOracleRequestTimeoutMs: number;
  saasBillingWorkerEnabled: boolean;
  saasBillingWorkerIntervalMs: number;
  saasBillingRunSyncLockTimeoutMs: number;
  saasBillingWebhookBatchSize: number;
  saasBillingWebhookLockTimeoutMs: number;
  saasBillingAutomationEnabled: boolean;
  saasBillingAutomationBatchSize: number;
  saasReportExportBatchSize: number;
  saasReportExportLockTimeoutMs: number;
  saasOutboundWebhookBatchSize: number;
  saasOutboundWebhookLockTimeoutMs: number;
  saasOutboundWebhookRequestTimeoutMs: number;
  saasOutboundWebhookMaxAttempts: number;
  dbPartitionMaintenanceEnabled: boolean;
  dbPartitionMaintenanceIntervalMs: number;
  dbPartitionMaintenanceFutureMonths: number;
  dbPartitionMaintenanceArchiveAfterMonths: number;
  dbPartitionMaintenanceArchiveSchema: string;
  fairnessAuditWorkerEnabled: boolean;
  fairnessAuditWorkerIntervalMs: number;
  holdemTurnTimeoutMs: number;
  holdemTimeoutWorkerEnabled: boolean;
  holdemTimeoutWorkerIntervalMs: number;
  holdemTimeoutWorkerBatchSize: number;
  blackjackTurnTimeoutMs: number;
  blackjackTimeoutWorkerEnabled: boolean;
  blackjackTimeoutWorkerIntervalMs: number;
  blackjackTimeoutWorkerBatchSize: number;
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
  kycReverificationWorkerEnabled: boolean;
  kycReverificationWorkerIntervalMs: number;
  kycReverificationNoticeDays: number;
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
  communityCaptchaProvider: "disabled" | "turnstile";
  communityCaptchaBypassMinTier: "tier_1" | "tier_2";
  communityCaptchaSecret: string;
  communityModerationProvider: "disabled" | "openai" | "perspective";
  communityModerationQueueThreshold: number;
  communityModerationAutoHideThreshold: number;
  communityModerationKeywordList: string;
  communityModerationOpenAiApiKey: string;
  communityModerationOpenAiModel: string;
  communityModerationPerspectiveApiKey: string;
  communityModerationTimeoutMs: number;
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
    doc: "Primary database connection string",
    format: String,
    default: "",
    env: "DATABASE_URL",
  },
  databasePoolMax: {
    doc: "Maximum postgres-js connections opened by the backend process",
    format: "int",
    default: 30,
    env: "DB_POOL_MAX",
  },
  databasePoolIdleTimeoutSeconds: {
    doc: "Idle connection timeout in seconds for postgres-js pool members",
    format: "int",
    default: 20,
    env: "DB_POOL_IDLE_TIMEOUT_SECONDS",
  },
  databasePoolConnectTimeoutSeconds: {
    doc: "Connection timeout in seconds for establishing new postgres-js connections",
    format: "int",
    default: 30,
    env: "DB_POOL_CONNECT_TIMEOUT_SECONDS",
  },
  databasePoolMaxLifetimeSeconds: {
    doc: "Maximum connection lifetime in seconds before postgres-js recycles a pool member",
    format: "int",
    default: 1800,
    env: "DB_POOL_MAX_LIFETIME_SECONDS",
  },
  drawCost: {
    doc: "Default draw cost (used to seed system_config)",
    format: "int",
    default: 10,
    env: "DRAW_COST",
  },
  logLevel: {
    doc: "Application log level",
    format: ["debug", "info", "warn", "error"],
    default: "info",
    env: "LOG_LEVEL",
  },
  nodeEnv: {
    doc: "Runtime environment",
    format: ["development", "production", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  observabilityServiceName: {
    doc: "Logical service name for logs, traces, and error aggregation",
    format: String,
    default: "reward-backend",
    env: "OBSERVABILITY_SERVICE_NAME",
  },
  observabilityEnvironment: {
    doc: "Deployment environment label for logs, traces, and error aggregation",
    format: String,
    default: "",
    env: "OBSERVABILITY_ENVIRONMENT",
  },
  observabilityRelease: {
    doc: "Release version identifier attached to logs, traces, and error events",
    format: String,
    default: "",
    env: "OBSERVABILITY_RELEASE",
  },
  observabilityCommitSha: {
    doc: "Commit SHA attached to logs, traces, and error events",
    format: String,
    default: "",
    env: "OBSERVABILITY_COMMIT_SHA",
  },
  sentryDsn: {
    doc: "Optional Sentry DSN for backend exception aggregation",
    format: String,
    default: "",
    env: "SENTRY_DSN",
  },
  sentryTracesSampleRate: {
    doc: "Optional Sentry trace sampling rate when backend tracing is enabled",
    format: Number,
    default: 0,
    env: "SENTRY_TRACES_SAMPLE_RATE",
  },
  otelExporterOtlpEndpoint: {
    doc: "Optional OTLP HTTP endpoint for exporting backend traces",
    format: String,
    default: "",
    env: "OTEL_EXPORTER_OTLP_ENDPOINT",
  },
  otelExporterOtlpHeaders: {
    doc: "Optional OTLP HTTP headers in k=v,k2=v2 form",
    format: String,
    default: "",
    env: "OTEL_EXPORTER_OTLP_HEADERS",
  },
  otelTraceSampleRatio: {
    doc: "Trace sampling ratio for backend OpenTelemetry spans",
    format: Number,
    default: 1,
    env: "OTEL_TRACE_SAMPLE_RATIO",
  },
  securityEventSinks: {
    doc: "Comma-separated sinks for the unified security event stream (log, webhook, elasticsearch)",
    format: String,
    default: "log",
    env: "SECURITY_EVENT_SINKS",
  },
  securityEventWebhookUrl: {
    doc: "Optional HTTP endpoint for forwarding normalized security events",
    format: String,
    default: "",
    env: "SECURITY_EVENT_WEBHOOK_URL",
  },
  securityEventRequestTimeoutMs: {
    doc: "HTTP timeout in ms for security event sink deliveries",
    format: "int",
    default: 5_000,
    env: "SECURITY_EVENT_REQUEST_TIMEOUT_MS",
  },
  securityEventElasticsearchUrl: {
    doc: "Optional Elasticsearch base URL for indexing normalized security events",
    format: String,
    default: "",
    env: "SECURITY_EVENT_ELASTICSEARCH_URL",
  },
  securityEventElasticsearchApiKey: {
    doc: "Optional Elasticsearch API key for security event indexing",
    format: String,
    default: "",
    env: "SECURITY_EVENT_ELASTICSEARCH_API_KEY",
  },
  securityEventElasticsearchIndex: {
    doc: "Target Elasticsearch index for normalized security events",
    format: String,
    default: "reward-security-events",
    env: "SECURITY_EVENT_ELASTICSEARCH_INDEX",
  },
  telegramBotToken: {
    doc: "Optional Telegram bot token used by the internal notification relay routes",
    format: String,
    default: "",
    env: "TELEGRAM_BOT_TOKEN",
  },
  telegramPageChatId: {
    doc: "Telegram chat id for paging and urgent operational alerts",
    format: String,
    default: "",
    env: "TELEGRAM_PAGE_CHAT_ID",
  },
  telegramTicketChatId: {
    doc: "Telegram chat id for ticket level operational alerts",
    format: String,
    default: "",
    env: "TELEGRAM_TICKET_CHAT_ID",
  },
  telegramDigestChatId: {
    doc: "Telegram chat id for low priority digest style operational alerts",
    format: String,
    default: "",
    env: "TELEGRAM_DIGEST_CHAT_ID",
  },
  amlProviderKey: {
    doc: "Select which registered AML screening provider implementation handles runtime checks",
    format: (value: unknown) => {
      const parsed = AmlProviderKeySchema.safeParse(value);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? "Invalid AML provider key."
        );
      }
    },
    default: "mock",
    env: "AML_PROVIDER_KEY",
  },
  amlReviewSlaMinutes: {
    doc: "Age in minutes after which a pending AML hit has breached operator SLA",
    format: "int",
    default: 60,
    env: "AML_REVIEW_SLA_MINUTES",
  },
  observabilityWithdrawStuckThresholdMinutes: {
    doc: "Age in minutes after which requested, approved, provider_submitted, or provider_processing withdrawals are considered stuck",
    format: "int",
    default: 60,
    env: "OBSERVABILITY_WITHDRAW_STUCK_THRESHOLD_MINUTES",
  },
  paymentOperatingMode: {
    doc: "Choose between manual finance review and the automated payment execution path backed by registered adapters and workers",
    format: ["manual_review", "automated"],
    default: "manual_review",
    env: "PAYMENT_OPERATING_MODE",
  },
  paymentAutomatedModeOptIn: {
    doc: "Require an explicit runtime opt-in before PAYMENT_OPERATING_MODE=automated can execute real payment automation",
    format: Boolean,
    default: false,
    env: "PAYMENT_AUTOMATED_MODE_OPT_IN",
  },
  paymentReconciliationEnabled: {
    doc: "Enable scheduled provider reconciliation jobs",
    format: Boolean,
    default: true,
    env: "PAYMENT_RECONCILIATION_ENABLED",
  },
  paymentReconciliationIntervalMs: {
    doc: "Interval in ms between scheduled reconciliation cycles",
    format: "int",
    default: 300_000,
    env: "PAYMENT_RECONCILIATION_INTERVAL_MS",
  },
  paymentReconciliationLookbackMinutes: {
    doc: "How far back reconciliation pulls provider orders for each run",
    format: "int",
    default: 1_440,
    env: "PAYMENT_RECONCILIATION_LOOKBACK_MINUTES",
  },
  paymentReconciliationPendingTimeoutMinutes: {
    doc: "Age in minutes after which non-terminal orders are force-rechecked",
    format: "int",
    default: 15,
    env: "PAYMENT_RECONCILIATION_PENDING_TIMEOUT_MINUTES",
  },
  paymentReconciliationMaxOrdersPerProvider: {
    doc: "Maximum number of local orders scanned per provider reconciliation run",
    format: "int",
    default: 200,
    env: "PAYMENT_RECONCILIATION_MAX_ORDERS_PER_PROVIDER",
  },
  walletReconciliationEnabled: {
    doc: "Enable scheduled wallet-vs-ledger reconciliation jobs",
    format: Boolean,
    default: true,
    env: "WALLET_RECONCILIATION_ENABLED",
  },
  walletReconciliationIntervalMs: {
    doc: "Interval in ms between scheduled wallet reconciliation cycles",
    format: "int",
    default: 86_400_000,
    env: "WALLET_RECONCILIATION_INTERVAL_MS",
  },
  walletReconciliationSlaHours: {
    doc: "Hours before an unresolved wallet reconciliation alert is auto-escalated",
    format: "int",
    default: 24,
    env: "WALLET_RECONCILIATION_SLA_HOURS",
  },
  walletReconciliationSlackWebhookUrl: {
    doc: "Optional Slack webhook URL for wallet reconciliation alert delivery",
    format: String,
    default: "",
    env: "WALLET_RECONCILIATION_SLACK_WEBHOOK_URL",
  },
  walletReconciliationPagerDutyRoutingKey: {
    doc: "Optional PagerDuty Events v2 routing key for wallet reconciliation alert delivery",
    format: String,
    default: "",
    env: "WALLET_RECONCILIATION_PAGERDUTY_ROUTING_KEY",
  },
  walletReconciliationNotifyRequestTimeoutMs: {
    doc: "Provider request timeout in ms for wallet reconciliation alert delivery",
    format: "int",
    default: 10_000,
    env: "WALLET_RECONCILIATION_NOTIFY_REQUEST_TIMEOUT_MS",
  },
  paymentOperationsEnabled: {
    doc: "Enable scheduled timeout cleanup and stuck-order compensation jobs",
    format: Boolean,
    default: true,
    env: "PAYMENT_OPERATIONS_ENABLED",
  },
  paymentOperationsIntervalMs: {
    doc: "Interval in ms between scheduled payment cleanup and compensation cycles",
    format: "int",
    default: 300_000,
    env: "PAYMENT_OPERATIONS_INTERVAL_MS",
  },
  paymentOperationsTimeoutMinutes: {
    doc: "Age in minutes after which non-terminal finance orders are considered timed out",
    format: "int",
    default: 60,
    env: "PAYMENT_OPERATIONS_TIMEOUT_MINUTES",
  },
  paymentOperationsBatchSize: {
    doc: "Maximum stale finance orders handled in each cleanup or compensation scan",
    format: "int",
    default: 100,
    env: "PAYMENT_OPERATIONS_BATCH_SIZE",
  },
  paymentWebhookWorkerIntervalMs: {
    doc: "Worker poll interval in ms for queued payment webhook events",
    format: "int",
    default: 1_000,
    env: "PAYMENT_WEBHOOK_WORKER_INTERVAL_MS",
  },
  paymentWebhookBatchSize: {
    doc: "Maximum queued payment webhook events processed per worker tick",
    format: "int",
    default: 25,
    env: "PAYMENT_WEBHOOK_BATCH_SIZE",
  },
  paymentWebhookLockTimeoutMs: {
    doc: "Time in ms before an in-flight payment webhook event can be reclaimed",
    format: "int",
    default: 120_000,
    env: "PAYMENT_WEBHOOK_LOCK_TIMEOUT_MS",
  },
  paymentOutboundWorkerIntervalMs: {
    doc: "Worker poll interval in ms for queued outbound payment requests",
    format: "int",
    default: 1_000,
    env: "PAYMENT_OUTBOUND_WORKER_INTERVAL_MS",
  },
  paymentOutboundBatchSize: {
    doc: "Maximum outbound payment requests processed per worker tick",
    format: "int",
    default: 25,
    env: "PAYMENT_OUTBOUND_BATCH_SIZE",
  },
  paymentOutboundLockTimeoutMs: {
    doc: "Time in ms before an in-flight outbound payment request can be reclaimed",
    format: "int",
    default: 120_000,
    env: "PAYMENT_OUTBOUND_LOCK_TIMEOUT_MS",
  },
  paymentOutboundUnknownRetryDelayMs: {
    doc: "Delay in ms before retrying outbound requests whose delivery status is unknown",
    format: "int",
    default: 30_000,
    env: "PAYMENT_OUTBOUND_UNKNOWN_RETRY_DELAY_MS",
  },
  appleIapBundleId: {
    doc: "Bundle identifier used for App Store Server API verification",
    format: String,
    default: "",
    env: "APPLE_IAP_BUNDLE_ID",
  },
  appleIapAppAppleId: {
    doc: "Numeric App Store app id required for production App Store notification verification",
    format: "nat",
    default: 0,
    env: "APPLE_IAP_APPLE_ID",
  },
  appleIapIssuerId: {
    doc: "App Store Connect issuer id for the In-App Purchase key",
    format: String,
    default: "",
    env: "APPLE_IAP_ISSUER_ID",
  },
  appleIapKeyId: {
    doc: "App Store Connect key id for the In-App Purchase key",
    format: String,
    default: "",
    env: "APPLE_IAP_KEY_ID",
  },
  appleIapPrivateKey: {
    doc: "PEM-encoded App Store Server API private key",
    format: String,
    default: "",
    env: "APPLE_IAP_PRIVATE_KEY",
  },
  appleIapRootCertificatesPem: {
    doc: "PEM bundle of Apple root certificates used to verify signed StoreKit JWS payloads",
    format: String,
    default: "",
    env: "APPLE_IAP_ROOT_CERTIFICATES_PEM",
  },
  appleIapEnableOnlineChecks: {
    doc: "Whether to enable OCSP and date checks when verifying Apple signed data",
    format: Boolean,
    default: true,
    env: "APPLE_IAP_ENABLE_ONLINE_CHECKS",
  },
  appleIapDefaultEnvironment: {
    doc: "Default App Store environment to target when incoming purchase payloads do not specify one",
    format: ["sandbox", "production"],
    default: "production",
    env: "APPLE_IAP_DEFAULT_ENVIRONMENT",
  },
  googlePlayPackageName: {
    doc: "Android package name used for Google Play purchase verification",
    format: String,
    default: "",
    env: "GOOGLE_PLAY_PACKAGE_NAME",
  },
  googlePlayServiceAccountEmail: {
    doc: "Google service account email with Android Publisher API access",
    format: String,
    default: "",
    env: "GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL",
  },
  googlePlayServiceAccountPrivateKey: {
    doc: "PEM-encoded Google service account private key for Android Publisher API access",
    format: String,
    default: "",
    env: "GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY",
  },
  googlePlayOauthTokenUrl: {
    doc: "OAuth token endpoint used to obtain Android Publisher API access tokens",
    format: String,
    default: "https://oauth2.googleapis.com/token",
    env: "GOOGLE_PLAY_OAUTH_TOKEN_URL",
  },
  googlePlayApiBaseUrl: {
    doc: "Base URL for Google Play Developer API requests",
    format: String,
    default: "https://androidpublisher.googleapis.com",
    env: "GOOGLE_PLAY_API_BASE_URL",
  },
  googlePlayRtdnBearerToken: {
    doc: "Optional bearer token expected on Google RTDN push requests",
    format: String,
    default: "",
    env: "GOOGLE_PLAY_RTDN_BEARER_TOKEN",
  },
  predictionMarketOracleWorkerEnabled: {
    doc: "Enable the dedicated prediction market oracle polling worker",
    format: Boolean,
    default: true,
    env: "PREDICTION_MARKET_ORACLE_WORKER_ENABLED",
  },
  predictionMarketOracleWorkerIntervalMs: {
    doc: "Interval in ms between prediction market oracle polling cycles",
    format: "int",
    default: 60_000,
    env: "PREDICTION_MARKET_ORACLE_WORKER_INTERVAL_MS",
  },
  predictionMarketOracleBatchSize: {
    doc: "Maximum prediction market oracle bindings processed per worker cycle",
    format: "int",
    default: 25,
    env: "PREDICTION_MARKET_ORACLE_BATCH_SIZE",
  },
  predictionMarketOracleRequestTimeoutMs: {
    doc: "Timeout in ms for a single prediction market oracle fetch or RPC call",
    format: "int",
    default: 10_000,
    env: "PREDICTION_MARKET_ORACLE_REQUEST_TIMEOUT_MS",
  },
  saasBillingWorkerEnabled: {
    doc: "Enable the dedicated B2B SaaS billing worker",
    format: Boolean,
    default: true,
    env: "SAAS_BILLING_WORKER_ENABLED",
  },
  saasBillingWorkerIntervalMs: {
    doc: "Interval in ms between SaaS billing worker cycles",
    format: "int",
    default: 5_000,
    env: "SAAS_BILLING_WORKER_INTERVAL_MS",
  },
  saasBillingRunSyncLockTimeoutMs: {
    doc: "Time in ms before an in-flight SaaS billing run sync claim can be reclaimed",
    format: "int",
    default: 120_000,
    env: "SAAS_BILLING_RUN_SYNC_LOCK_TIMEOUT_MS",
  },
  saasBillingWebhookBatchSize: {
    doc: "Maximum queued SaaS Stripe webhook events processed per worker cycle",
    format: "int",
    default: 25,
    env: "SAAS_BILLING_WEBHOOK_BATCH_SIZE",
  },
  saasBillingWebhookLockTimeoutMs: {
    doc: "Time in ms before an in-flight SaaS Stripe webhook event can be reclaimed",
    format: "int",
    default: 120_000,
    env: "SAAS_BILLING_WEBHOOK_LOCK_TIMEOUT_MS",
  },
  saasBillingAutomationEnabled: {
    doc: "Enable automatic prior-month billing close for billable SaaS tenants",
    format: Boolean,
    default: true,
    env: "SAAS_BILLING_AUTOMATION_ENABLED",
  },
  saasBillingAutomationBatchSize: {
    doc: "Maximum auto-billable SaaS tenants processed per worker cycle",
    format: "int",
    default: 100,
    env: "SAAS_BILLING_AUTOMATION_BATCH_SIZE",
  },
  saasReportExportBatchSize: {
    doc: "Maximum queued SaaS report export jobs processed per worker cycle",
    format: "int",
    default: 5,
    env: "SAAS_REPORT_EXPORT_BATCH_SIZE",
  },
  saasReportExportLockTimeoutMs: {
    doc: "Time in ms before an in-flight SaaS report export job can be reclaimed",
    format: "int",
    default: 120_000,
    env: "SAAS_REPORT_EXPORT_LOCK_TIMEOUT_MS",
  },
  saasOutboundWebhookBatchSize: {
    doc: "Maximum queued SaaS outbound webhook deliveries processed per worker cycle",
    format: "int",
    default: 25,
    env: "SAAS_OUTBOUND_WEBHOOK_BATCH_SIZE",
  },
  saasOutboundWebhookLockTimeoutMs: {
    doc: "Time in ms before an in-flight SaaS outbound webhook delivery can be reclaimed",
    format: "int",
    default: 120_000,
    env: "SAAS_OUTBOUND_WEBHOOK_LOCK_TIMEOUT_MS",
  },
  saasOutboundWebhookRequestTimeoutMs: {
    doc: "HTTP timeout in ms for each SaaS outbound webhook delivery attempt",
    format: "int",
    default: 10_000,
    env: "SAAS_OUTBOUND_WEBHOOK_REQUEST_TIMEOUT_MS",
  },
  saasOutboundWebhookMaxAttempts: {
    doc: "Maximum SaaS outbound webhook delivery attempts before retries stop",
    format: "int",
    default: 8,
    env: "SAAS_OUTBOUND_WEBHOOK_MAX_ATTEMPTS",
  },
  dbPartitionMaintenanceEnabled: {
    doc: "Enable scheduled creation and archival of monthly partitions for high-growth append-only tables",
    format: Boolean,
    default: true,
    env: "DB_PARTITION_MAINTENANCE_ENABLED",
  },
  dbPartitionMaintenanceIntervalMs: {
    doc: "Interval in ms between partition maintenance cycles",
    format: "int",
    default: 3_600_000,
    env: "DB_PARTITION_MAINTENANCE_INTERVAL_MS",
  },
  dbPartitionMaintenanceFutureMonths: {
    doc: "How many whole future months of partitions should be pre-created for managed tables",
    format: "int",
    default: 3,
    env: "DB_PARTITION_MAINTENANCE_FUTURE_MONTHS",
  },
  dbPartitionMaintenanceArchiveAfterMonths: {
    doc: "Detach monthly partitions older than this many months from the active partition tree",
    format: "int",
    default: 18,
    env: "DB_PARTITION_MAINTENANCE_ARCHIVE_AFTER_MONTHS",
  },
  dbPartitionMaintenanceArchiveSchema: {
    doc: "Schema name that receives detached historical partitions",
    format: String,
    default: "partition_archive",
    env: "DB_PARTITION_MAINTENANCE_ARCHIVE_SCHEMA",
  },
  webBaseUrl: {
    doc: "Web frontend base URL",
    format: String,
    default: "http://localhost:3000",
    env: "WEB_BASE_URL",
  },
  adminBaseUrl: {
    doc: "Admin frontend base URL",
    format: String,
    default: "http://localhost:5173",
    env: "ADMIN_BASE_URL",
  },
  port: {
    doc: "Backend listening port",
    format: "port",
    default: 4000,
    env: "PORT",
  },
  redisUrl: {
    doc: "Redis connection string",
    format: String,
    default: "",
    env: "REDIS_URL",
  },
  rateLimitRedisPrefix: {
    doc: "Redis key prefix for rate limiting",
    format: String,
    default: "reward:ratelimit",
    env: "RATE_LIMIT_REDIS_PREFIX",
  },
  rateLimitGlobalMax: {
    doc: "Global rate limit max requests per window",
    format: "int",
    default: 120,
    env: "RATE_LIMIT_GLOBAL_MAX",
  },
  rateLimitGlobalWindowMs: {
    doc: "Global rate limit window in ms",
    format: "int",
    default: 60_000,
    env: "RATE_LIMIT_GLOBAL_WINDOW_MS",
  },
  rateLimitAuthMax: {
    doc: "Auth rate limit max requests per window",
    format: "int",
    default: 10,
    env: "RATE_LIMIT_AUTH_MAX",
  },
  rateLimitAuthWindowMs: {
    doc: "Auth rate limit window in ms",
    format: "int",
    default: 300_000,
    env: "RATE_LIMIT_AUTH_WINDOW_MS",
  },
  rateLimitAdminAuthMax: {
    doc: "Admin auth rate limit max requests per window",
    format: "int",
    default: 5,
    env: "RATE_LIMIT_ADMIN_AUTH_MAX",
  },
  rateLimitAdminAuthWindowMs: {
    doc: "Admin auth rate limit window in ms",
    format: "int",
    default: 300_000,
    env: "RATE_LIMIT_ADMIN_AUTH_WINDOW_MS",
  },
  rateLimitDrawMax: {
    doc: "Draw rate limit max requests per window",
    format: "int",
    default: 30,
    env: "RATE_LIMIT_DRAW_MAX",
  },
  rateLimitDrawWindowMs: {
    doc: "Draw rate limit window in ms",
    format: "int",
    default: 60_000,
    env: "RATE_LIMIT_DRAW_WINDOW_MS",
  },
  rateLimitFinanceMax: {
    doc: "Finance rate limit max requests per window",
    format: "int",
    default: 20,
    env: "RATE_LIMIT_FINANCE_MAX",
  },
  rateLimitFinanceWindowMs: {
    doc: "Finance rate limit window in ms",
    format: "int",
    default: 60_000,
    env: "RATE_LIMIT_FINANCE_WINDOW_MS",
  },
  rateLimitAdminMax: {
    doc: "Admin mutation rate limit max requests per window",
    format: "int",
    default: 60,
    env: "RATE_LIMIT_ADMIN_MAX",
  },
  rateLimitAdminWindowMs: {
    doc: "Admin mutation rate limit window in ms",
    format: "int",
    default: 60_000,
    env: "RATE_LIMIT_ADMIN_WINDOW_MS",
  },
  authFailureDelayMs: {
    doc: "Base delay in ms for failed auth responses",
    format: "int",
    default: 400,
    env: "AUTH_FAILURE_DELAY_MS",
  },
  authFailureJitterMs: {
    doc: "Jitter in ms added to failed auth responses",
    format: "int",
    default: 250,
    env: "AUTH_FAILURE_JITTER_MS",
  },
  authFailureWindowMinutes: {
    doc: "Auth failure counting window in minutes",
    format: "int",
    default: 15,
    env: "AUTH_FAILURE_WINDOW_MINUTES",
  },
  authFailureFreezeThreshold: {
    doc: "User login failure threshold before freeze",
    format: "int",
    default: 8,
    env: "AUTH_FAILURE_FREEZE_THRESHOLD",
  },
  adminFailureFreezeThreshold: {
    doc: "Admin login failure threshold before freeze",
    format: "int",
    default: 5,
    env: "ADMIN_FAILURE_FREEZE_THRESHOLD",
  },
  passwordResetTtlMinutes: {
    doc: "Password reset token TTL in minutes",
    format: "int",
    default: 30,
    env: "PASSWORD_RESET_TTL_MINUTES",
  },
  emailVerificationTtlMinutes: {
    doc: "Email verification token TTL in minutes",
    format: "int",
    default: 24 * 60,
    env: "EMAIL_VERIFICATION_TTL_MINUTES",
  },
  phoneVerificationTtlMinutes: {
    doc: "Phone verification code TTL in minutes",
    format: "int",
    default: 10,
    env: "PHONE_VERIFICATION_TTL_MINUTES",
  },
  anomalousLoginLookbackDays: {
    doc: "Lookback window in days for anomalous login comparisons",
    format: "int",
    default: 30,
    env: "ANOMALOUS_LOGIN_LOOKBACK_DAYS",
  },
  authNotificationWebhookUrl: {
    doc: "Optional webhook URL for auth notifications and security alerts",
    format: String,
    default: "",
    env: "AUTH_NOTIFICATION_WEBHOOK_URL",
  },
  authNotificationRequestTimeoutMs: {
    doc: "Provider request timeout in ms for auth notifications",
    format: "int",
    default: 10_000,
    env: "AUTH_NOTIFICATION_REQUEST_TIMEOUT_MS",
  },
  authNotificationWorkerIntervalMs: {
    doc: "Worker poll interval in ms for auth notification deliveries",
    format: "int",
    default: 1_000,
    env: "AUTH_NOTIFICATION_WORKER_INTERVAL_MS",
  },
  authNotificationBatchSize: {
    doc: "Maximum queued auth notifications processed per worker tick",
    format: "int",
    default: 25,
    env: "AUTH_NOTIFICATION_BATCH_SIZE",
  },
  authNotificationRetryBaseMs: {
    doc: "Base retry delay in ms for auth notification redelivery",
    format: "int",
    default: 5_000,
    env: "AUTH_NOTIFICATION_RETRY_BASE_MS",
  },
  authNotificationRetryMaxMs: {
    doc: "Maximum retry delay in ms for auth notification redelivery",
    format: "int",
    default: 300_000,
    env: "AUTH_NOTIFICATION_RETRY_MAX_MS",
  },
  authNotificationMaxAttempts: {
    doc: "Maximum delivery attempts before a notification is marked failed",
    format: "int",
    default: 6,
    env: "AUTH_NOTIFICATION_MAX_ATTEMPTS",
  },
  authNotificationLockTimeoutMs: {
    doc: "Time in ms before an in-flight auth notification can be reclaimed",
    format: "int",
    default: 120_000,
    env: "AUTH_NOTIFICATION_LOCK_TIMEOUT_MS",
  },
  authNotificationEmailThrottleMax: {
    doc: "Per-email limit for password reset and verification messages",
    format: "int",
    default: 3,
    env: "AUTH_NOTIFICATION_EMAIL_THROTTLE_MAX",
  },
  authNotificationEmailThrottleWindowMs: {
    doc: "Window in ms for per-email auth notification throttling",
    format: "int",
    default: 900_000,
    env: "AUTH_NOTIFICATION_EMAIL_THROTTLE_WINDOW_MS",
  },
  authNotificationSmsThrottleMax: {
    doc: "Per-phone limit for verification codes",
    format: "int",
    default: 3,
    env: "AUTH_NOTIFICATION_SMS_THROTTLE_MAX",
  },
  authNotificationSmsThrottleWindowMs: {
    doc: "Window in ms for per-phone verification code throttling",
    format: "int",
    default: 600_000,
    env: "AUTH_NOTIFICATION_SMS_THROTTLE_WINDOW_MS",
  },
  authNotificationAlertThrottleMax: {
    doc: "Per-email limit for anomalous login alerts",
    format: "int",
    default: 2,
    env: "AUTH_NOTIFICATION_ALERT_THROTTLE_MAX",
  },
  authNotificationAlertThrottleWindowMs: {
    doc: "Window in ms for per-email anomalous login alert throttling",
    format: "int",
    default: 3_600_000,
    env: "AUTH_NOTIFICATION_ALERT_THROTTLE_WINDOW_MS",
  },
  kycReverificationWorkerEnabled: {
    doc: "Enable scheduled KYC document expiry and reverification scans",
    format: Boolean,
    default: true,
    env: "KYC_REVERIFICATION_WORKER_ENABLED",
  },
  kycReverificationWorkerIntervalMs: {
    doc: "Interval in ms between KYC document expiry and reverification scans",
    format: "int",
    default: 3_600_000,
    env: "KYC_REVERIFICATION_WORKER_INTERVAL_MS",
  },
  kycReverificationNoticeDays: {
    doc: "Lead time in days for KYC document expiry reminder emails",
    format: "int",
    default: 30,
    env: "KYC_REVERIFICATION_NOTICE_DAYS",
  },
  authSmtpHost: {
    doc: "SMTP hostname used for auth email delivery",
    format: String,
    default: "",
    env: "AUTH_SMTP_HOST",
  },
  authSmtpPort: {
    doc: "SMTP port used for auth email delivery",
    format: "port",
    default: 587,
    env: "AUTH_SMTP_PORT",
  },
  authSmtpSecure: {
    doc: "Whether SMTP uses an implicit TLS connection",
    format: Boolean,
    default: false,
    env: "AUTH_SMTP_SECURE",
  },
  authSmtpUser: {
    doc: "SMTP username used for auth email delivery",
    format: String,
    default: "",
    env: "AUTH_SMTP_USER",
  },
  authSmtpPass: {
    doc: "SMTP password used for auth email delivery",
    format: String,
    default: "",
    env: "AUTH_SMTP_PASS",
  },
  authEmailFrom: {
    doc: "From address used for auth email delivery",
    format: String,
    default: "",
    env: "AUTH_EMAIL_FROM",
  },
  authTwilioAccountSid: {
    doc: "Twilio Account SID used for auth SMS delivery",
    format: String,
    default: "",
    env: "AUTH_TWILIO_ACCOUNT_SID",
  },
  authTwilioAuthToken: {
    doc: "Twilio Auth Token used for auth SMS delivery",
    format: String,
    default: "",
    env: "AUTH_TWILIO_AUTH_TOKEN",
  },
  authTwilioFromNumber: {
    doc: "Twilio sender number used for auth SMS delivery",
    format: String,
    default: "",
    env: "AUTH_TWILIO_FROM_NUMBER",
  },
  authTwilioMessagingServiceSid: {
    doc: "Optional Twilio Messaging Service SID used for auth SMS delivery",
    format: String,
    default: "",
    env: "AUTH_TWILIO_MESSAGING_SERVICE_SID",
  },
  communityCaptchaProvider: {
    doc: "Optional captcha provider enforced for lower-tier community writers",
    format: ["disabled", "turnstile"],
    default: "disabled",
    env: "COMMUNITY_CAPTCHA_PROVIDER",
  },
  communityCaptchaBypassMinTier: {
    doc: "Users at or above this KYC tier bypass community captcha enforcement",
    format: ["tier_1", "tier_2"],
    default: "tier_2",
    env: "COMMUNITY_CAPTCHA_BYPASS_MIN_TIER",
  },
  communityCaptchaSecret: {
    doc: "Secret key used to validate community captcha tokens",
    format: String,
    default: "",
    env: "COMMUNITY_CAPTCHA_SECRET",
  },
  communityModerationProvider: {
    doc: "Optional provider used to score community submissions",
    format: ["disabled", "openai", "perspective"],
    default: "disabled",
    env: "COMMUNITY_MODERATION_PROVIDER",
  },
  communityModerationQueueThreshold: {
    doc: "Community moderation score threshold that queues content for admin review",
    format: Number,
    default: 0.65,
    env: "COMMUNITY_MODERATION_QUEUE_THRESHOLD",
  },
  communityModerationAutoHideThreshold: {
    doc: "Community moderation score threshold that auto-hides content before review",
    format: Number,
    default: 0.85,
    env: "COMMUNITY_MODERATION_AUTO_HIDE_THRESHOLD",
  },
  communityModerationKeywordList: {
    doc: "Comma or newline separated keywords that increase community spam risk",
    format: String,
    default: "",
    env: "COMMUNITY_MODERATION_KEYWORD_LIST",
  },
  communityModerationOpenAiApiKey: {
    doc: "OpenAI API key used when COMMUNITY_MODERATION_PROVIDER=openai",
    format: String,
    default: "",
    env: "COMMUNITY_MODERATION_OPENAI_API_KEY",
  },
  communityModerationOpenAiModel: {
    doc: "OpenAI moderation model used for community text checks",
    format: String,
    default: "omni-moderation-latest",
    env: "COMMUNITY_MODERATION_OPENAI_MODEL",
  },
  communityModerationPerspectiveApiKey: {
    doc: "Perspective API key used when COMMUNITY_MODERATION_PROVIDER=perspective",
    format: String,
    default: "",
    env: "COMMUNITY_MODERATION_PERSPECTIVE_API_KEY",
  },
  communityModerationTimeoutMs: {
    doc: "Timeout in ms for community moderation provider and captcha calls",
    format: "int",
    default: 3000,
    env: "COMMUNITY_MODERATION_TIMEOUT_MS",
  },
  fairnessAuditWorkerEnabled: {
    doc: "Enable scheduled fairness reveal and commit/reveal self-audit jobs",
    format: Boolean,
    default: true,
    env: "FAIRNESS_AUDIT_WORKER_ENABLED",
  },
  fairnessAuditWorkerIntervalMs: {
    doc: "Interval in ms between fairness reveal self-audit cycles",
    format: "int",
    default: 60000,
    env: "FAIRNESS_AUDIT_WORKER_INTERVAL_MS",
  },
  holdemTurnTimeoutMs: {
    doc: "Maximum think time in ms before an active holdem turn is auto-played by the system",
    format: "int",
    default: 30000,
    env: "HOLDEM_TURN_TIMEOUT_MS",
  },
  holdemTimeoutWorkerEnabled: {
    doc: "Enable the dedicated holdem timeout worker",
    format: Boolean,
    default: true,
    env: "HOLDEM_TIMEOUT_WORKER_ENABLED",
  },
  holdemTimeoutWorkerIntervalMs: {
    doc: "Interval in ms between holdem timeout worker scans",
    format: "int",
    default: 1000,
    env: "HOLDEM_TIMEOUT_WORKER_INTERVAL_MS",
  },
  holdemTimeoutWorkerBatchSize: {
    doc: "Maximum expired holdem turns processed per timeout worker cycle",
    format: "int",
    default: 50,
    env: "HOLDEM_TIMEOUT_WORKER_BATCH_SIZE",
  },
  blackjackTurnTimeoutMs: {
    doc: "Maximum think time in ms before an active blackjack turn is auto-played by the system",
    format: "int",
    default: 30000,
    env: "BLACKJACK_TURN_TIMEOUT_MS",
  },
  blackjackTimeoutWorkerEnabled: {
    doc: "Enable the dedicated blackjack timeout worker",
    format: Boolean,
    default: true,
    env: "BLACKJACK_TIMEOUT_WORKER_ENABLED",
  },
  blackjackTimeoutWorkerIntervalMs: {
    doc: "Interval in ms between blackjack timeout worker scans",
    format: "int",
    default: 1000,
    env: "BLACKJACK_TIMEOUT_WORKER_INTERVAL_MS",
  },
  blackjackTimeoutWorkerBatchSize: {
    doc: "Maximum expired blackjack turns processed per timeout worker cycle",
    format: "int",
    default: 50,
    env: "BLACKJACK_TIMEOUT_WORKER_BATCH_SIZE",
  },
  sysAuthFailureWindowMinutes: {
    doc: "System-config override for auth failure window",
    format: "int",
    default: 0,
    env: "SYS_AUTH_FAILURE_WINDOW_MINUTES",
  },
  sysAuthFailureFreezeThreshold: {
    doc: "System-config override for user auth failure threshold",
    format: "int",
    default: 0,
    env: "SYS_AUTH_FAILURE_FREEZE_THRESHOLD",
  },
  sysAdminFailureFreezeThreshold: {
    doc: "System-config override for admin auth failure threshold",
    format: "int",
    default: 0,
    env: "SYS_ADMIN_FAILURE_FREEZE_THRESHOLD",
  },
  drawPoolCacheTtlSeconds: {
    doc: "Probability pool cache TTL in seconds (0 disables caching)",
    format: "int",
    default: 30,
    env: "DRAW_POOL_CACHE_TTL_SECONDS",
  },
};

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const config = convict(schema);
  if (!config.get("databaseUrl") && process.env.POSTGRES_URL) {
    config.set("databaseUrl", process.env.POSTGRES_URL);
  }

  config.validate({ allowed: "strict" });

  const properties = config.getProperties() as AppConfig;
  if (!properties.databaseUrl) {
    throw internalInvariantError("DATABASE_URL or POSTGRES_URL is not set");
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
