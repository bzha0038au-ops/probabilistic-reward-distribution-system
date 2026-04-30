# Environment Variables

## Must Match Across Apps

These values must be identical for auth/session verification to work:

- `ADMIN_JWT_SECRET` (backend + admin console)
- `ADMIN_JWT_SECRET_PREVIOUS` (backend + admin console when set for rotation)
- `USER_JWT_SECRET` (backend + web app)
- `USER_JWT_SECRET_PREVIOUS` (backend + web app when set for rotation)

Production containers also support `<NAME>_FILE` counterparts. The runtime
entrypoint resolves those secret-file paths into the expected environment
variables before the app starts.

## Backend (`apps/backend/.env`)

- `DATABASE_URL` / `POSTGRES_URL` (required)
- `DB_POOL_MAX` (optional, backend postgres-js pool size; default `30`)
- `DB_POOL_IDLE_TIMEOUT_SECONDS` (optional, idle pool connection timeout; default `20`)
- `DB_POOL_CONNECT_TIMEOUT_SECONDS` (optional, new connection timeout; default `30`)
- `DB_POOL_MAX_LIFETIME_SECONDS` (optional, pool connection recycle lifetime; default `1800`)
- `ADMIN_JWT_SECRET` (required)
- `ADMIN_JWT_SECRET_PREVIOUS` (optional, enables smooth rotation verification)
- `USER_JWT_SECRET` (required)
- `USER_JWT_SECRET_PREVIOUS` (optional, enables smooth rotation verification)
- The same backend env file is used by both the API process and the
  auth-notification worker process.
- `ADMIN_MFA_ENCRYPTION_SECRET` (required in production; must differ from JWT/web secrets)
- `USER_MFA_ENCRYPTION_SECRET` (required in production; must differ from JWT/web/admin MFA secrets)
- `ADMIN_MFA_BREAK_GLASS_SECRET` (required in production; must differ from all other secrets)
- `DRAW_COST` (optional seed value for `system_config.draw_cost`)
- `DRAW_POOL_CACHE_TTL_SECONDS` (optional, probability pool cache TTL; `0` disables)
- `REDIS_URL` (optional, enables shared rate limiting + probability pool cache)
- `AML_PROVIDER_KEY` (defaults to `mock`; opaque provider key string, for example `openssl rand -hex 16`, and it must match a backend-registered AML provider)
- `SECURITY_EVENT_SINKS` (comma-separated `log`, `webhook`, `elasticsearch`;
  default `log`, which is the intended path for Datadog Logs / stdout collectors)
- `SECURITY_EVENT_WEBHOOK_URL`
- `SECURITY_EVENT_REQUEST_TIMEOUT_MS`
- `SECURITY_EVENT_ELASTICSEARCH_URL`
- `SECURITY_EVENT_ELASTICSEARCH_API_KEY`
- `SECURITY_EVENT_ELASTICSEARCH_INDEX`
- `PAYMENT_OPERATING_MODE` (defaults to `manual_review`; only set
  `automated` after an explicit operational approval)
- `PAYMENT_AUTOMATED_MODE_OPT_IN` (defaults to `false`; automated execution is
  only allowed when both this flag is `true` and
  `PAYMENT_OPERATING_MODE=automated`)
- `PAYMENT_RECONCILIATION_ENABLED`
- `PAYMENT_RECONCILIATION_INTERVAL_MS`
- `PAYMENT_RECONCILIATION_LOOKBACK_MINUTES`
- `PAYMENT_RECONCILIATION_PENDING_TIMEOUT_MINUTES`
- `PAYMENT_RECONCILIATION_MAX_ORDERS_PER_PROVIDER`
- `APPLE_IAP_BUNDLE_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`
  (required in production to enable real App Store Server API verification)
- `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_ROOT_CERTIFICATES_PEM`
  (required in production; use the corresponding `_FILE` variants for multiline
  secrets and Apple root cert bundles)
- `APPLE_IAP_APPLE_ID` (required for production App Store notification verification;
  keep `0` in local/test unless you are verifying production-signed payloads)
- `APPLE_IAP_ENABLE_ONLINE_CHECKS` (optional; defaults to `true`)
- `APPLE_IAP_DEFAULT_ENVIRONMENT` (optional; defaults to `production`; use
  `sandbox` for local StoreKit sandbox-only setups)
- `IAP_LOCAL_STUB_VERIFICATION_ENABLED`
  (optional; defaults to `true`; set to `false` in real sandbox/staging QA so
  `/iap/purchases/verify` and `/gift-packs/purchase/complete` fail fast unless
  Apple/Google verification credentials are actually configured. When it stays
  `true`, local stub purchases only create pending manual-approval orders and
  do not auto-fulfill assets.)
- `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`
  (required in production to enable Android Publisher purchase verification)
- `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`
  (required in production; prefer `_FILE` in deployed environments)
- `GOOGLE_PLAY_OAUTH_TOKEN_URL`
  (optional; defaults to `https://oauth2.googleapis.com/token`)
- `GOOGLE_PLAY_API_BASE_URL`
  (optional; defaults to `https://androidpublisher.googleapis.com`)
- `GOOGLE_PLAY_RTDN_BEARER_TOKEN`
  (optional but recommended when Google RTDN is delivered through an authenticated push proxy)
- `WALLET_RECONCILIATION_ENABLED`, `WALLET_RECONCILIATION_INTERVAL_MS`
- `WALLET_RECONCILIATION_SLA_HOURS`
- `WALLET_RECONCILIATION_SLACK_WEBHOOK_URL` (optional Slack incoming webhook for wallet drift alerts)
- `WALLET_RECONCILIATION_PAGERDUTY_ROUTING_KEY` (optional PagerDuty Events v2 routing key for wallet drift alerts)
- `WALLET_RECONCILIATION_NOTIFY_REQUEST_TIMEOUT_MS`
- `PAYMENT_PROVIDER_SECRET_REF_DIR` (optional mounted root for
  `payment_providers.config.secretRefs.*`; a ref like
  `sm/payment/stripe/api-key` resolves to
  `$PAYMENT_PROVIDER_SECRET_REF_DIR/sm/payment/stripe/api-key`)
- `PAYMENT_PROVIDER_SECRET_REF__<NORMALIZED_REF>` (optional env override for an
  individual logical payment secret ref; e.g.
  `PAYMENT_PROVIDER_SECRET_REF__SM_PAYMENT_STRIPE_API_KEY`)
- `AUTH_SMTP_HOST`, `AUTH_SMTP_PORT`, `AUTH_SMTP_SECURE`, `AUTH_SMTP_USER`,
  `AUTH_SMTP_PASS`, `AUTH_EMAIL_FROM` (required in production for password reset,
  email verification, and anomalous-login email delivery)
- `AUTH_TWILIO_ACCOUNT_SID`, `AUTH_TWILIO_AUTH_TOKEN`, and either
  `AUTH_TWILIO_FROM_NUMBER` or `AUTH_TWILIO_MESSAGING_SERVICE_SID`
  (required in production for phone verification delivery)
- `AUTH_NOTIFICATION_WEBHOOK_URL` (optional fallback for non-production delivery)
- `AUTH_NOTIFICATION_REQUEST_TIMEOUT_MS`, `AUTH_NOTIFICATION_WORKER_INTERVAL_MS`,
  `AUTH_NOTIFICATION_BATCH_SIZE`, `AUTH_NOTIFICATION_RETRY_BASE_MS`,
  `AUTH_NOTIFICATION_RETRY_MAX_MS`, `AUTH_NOTIFICATION_MAX_ATTEMPTS`,
  `AUTH_NOTIFICATION_LOCK_TIMEOUT_MS`
- `AUTH_NOTIFICATION_EMAIL_THROTTLE_MAX`,
  `AUTH_NOTIFICATION_EMAIL_THROTTLE_WINDOW_MS`,
  `AUTH_NOTIFICATION_SMS_THROTTLE_MAX`,
  `AUTH_NOTIFICATION_SMS_THROTTLE_WINDOW_MS`,
  `AUTH_NOTIFICATION_ALERT_THROTTLE_MAX`,
  `AUTH_NOTIFICATION_ALERT_THROTTLE_WINDOW_MS`
- `KYC_REVERIFICATION_WORKER_ENABLED`,
  `KYC_REVERIFICATION_WORKER_INTERVAL_MS`,
  `KYC_REVERIFICATION_NOTICE_DAYS`
- `DB_PARTITION_MAINTENANCE_ENABLED`,
  `DB_PARTITION_MAINTENANCE_INTERVAL_MS`,
  `DB_PARTITION_MAINTENANCE_FUTURE_MONTHS`,
  `DB_PARTITION_MAINTENANCE_ARCHIVE_AFTER_MONTHS`,
  `DB_PARTITION_MAINTENANCE_ARCHIVE_SCHEMA`
- `HOLDEM_TURN_TIMEOUT_MS`, `HOLDEM_TIMEOUT_WORKER_ENABLED`,
  `HOLDEM_TIMEOUT_WORKER_INTERVAL_MS`,
  `HOLDEM_TIMEOUT_WORKER_BATCH_SIZE`
- `BLACKJACK_TURN_TIMEOUT_MS`, `BLACKJACK_TIMEOUT_WORKER_ENABLED`,
  `BLACKJACK_TIMEOUT_WORKER_INTERVAL_MS`,
  `BLACKJACK_TIMEOUT_WORKER_BATCH_SIZE`
- `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_MINUTES`,
  `PHONE_VERIFICATION_TTL_MINUTES` (optional token/code TTL overrides)
- `ANOMALOUS_LOGIN_LOOKBACK_DAYS` (optional; login anomaly comparison window)
- `WEB_BASE_URL`, `ADMIN_BASE_URL`, `PORT`
- `ADMIN_SESSION_TTL`, `USER_SESSION_TTL` (optional)

## Web (`apps/frontend/.env`)

- `AUTH_SECRET` (required, frontend-only)
- `USER_JWT_SECRET` (required, must match backend)
- `USER_JWT_SECRET_PREVIOUS` (optional, must match backend when set for rotation)
- `API_BASE_URL` (server-side API base URL)

## Admin (`apps/admin/.env`)

- `ADMIN_JWT_SECRET` (required, must match backend)
- `ADMIN_JWT_SECRET_PREVIOUS` (optional, must match backend when set for rotation)
- `API_BASE_URL` (backend base URL)

## Container Deploy Env Files (`deploy/env/*.env`)

- `deploy/env/backend.env.example` is the contract for the backend container,
  the auth-notification worker, and the DB migration job.
- `deploy/env/postgres.env.example` is the contract for the single-host
  PostgreSQL container that ships in `docker-compose.prod.yml`.
- `deploy/env/frontend.env.example` is the contract for the Next.js container.
- `deploy/env/admin.env.example` is the contract for the SvelteKit admin container.
- `deploy/env/ops.env.example` is the local-cron and repo-ops contract for
  `deploy/scripts/backup-runner.sh` plus the root-level `pnpm ops:*` commands
  when you are not using the GitHub Actions scheduler.
- `deploy/env/compose.env.example` controls the public ports, domains, TLS
  email, HSTS age, image names, and `COMPOSE_PROJECT_NAME`.
- On a deployed host, keep runtime files under:
  - `$DEPLOY_PATH/shared/<environment>/env`
  - `$DEPLOY_PATH/shared/<environment>/secrets`
  - `$DEPLOY_PATH/shared/<environment>/proxy`

## GitHub Operations Secrets And Variables

The scheduled backup workflow expects these to be defined on the target GitHub
environment:

- secret: `DEPLOY_HOST`
- secret: `DEPLOY_USER`
- secret: `DEPLOY_PATH`
- secret: `DEPLOY_SSH_KEY`
- secret: `BACKUP_ENCRYPTION_PASSPHRASE`
- secret: `OFFSITE_STORAGE_URI`
- secret: `BACKUP_ALERT_WEBHOOK_URL`
- secret: `BACKUP_ARCHIVE_S3_URI` (optional, readable S3 copy for daily verification)
- secret: `BACKUP_ARCHIVE_CROSS_REGION_S3_URI` (optional, manual cross-region replica prefix)
- secret: `BACKUP_ARCHIVE_S3_KMS_KEY_ID` (optional, for KMS-backed S3 copies)
- secret: `DEPLOY_TG_BOT_TOKEN`
- secret: `DEPLOY_TG_PAGE_CHAT_ID`
- secret: `DEPLOY_TG_DIGEST_CHAT_ID`
- variable: `LOCAL_BACKUP_RETENTION_DAYS`
- variable: `OFFSITE_BACKUP_RETENTION_DAYS`
- variable: `BACKUP_ARCHIVE_S3_SSE` (optional, defaults to `AES256`)
- variable: `BACKUP_ARCHIVE_S3_STORAGE_CLASS` (optional)
- variable: `PRIMARY_ONCALL`
- variable: `SECONDARY_ONCALL`
- variable: `BACKUP_OWNER`
- variable: `RESTORE_APPROVER`
- variable: `RELEASE_APPROVER`

The daily backup verification workflow expects these additional GitHub
environment values:

- secret: `AWS_ACCESS_KEY_ID`
- secret: `AWS_SECRET_ACCESS_KEY`
- secret: `AWS_SESSION_TOKEN` (optional)
- secret: `BACKUP_VERIFY_S3_URI`
- variable: `BACKUP_VERIFY_AWS_REGION`
- variable: `BACKUP_VERIFY_OBJECT_PATTERN` (optional; defaults to `*.dump`)

## Consistency Rules

- `ADMIN_JWT_SECRET` must match between backend and admin.
- `ADMIN_JWT_SECRET_PREVIOUS` must match between backend and admin when set.
- `USER_JWT_SECRET` must not be shared with the admin or web secrets.
- `USER_JWT_SECRET_PREVIOUS` must match between backend and web when set.
- `USER_JWT_SECRET_PREVIOUS` and `ADMIN_JWT_SECRET_PREVIOUS` must not reuse any
  current JWT secret, `AUTH_SECRET`, or the MFA secrets.
- `ADMIN_MFA_ENCRYPTION_SECRET` must not match any JWT or web secret.
- `USER_MFA_ENCRYPTION_SECRET` must not match any JWT, web, or admin MFA secret.
- `ADMIN_MFA_BREAK_GLASS_SECRET` must not match any JWT, web, or MFA encryption secret.
- `AUTH_SECRET` is only for NextAuth in the web app.
- In production, current and previous JWT secrets, when set, plus
  `ADMIN_MFA_ENCRYPTION_SECRET`, `USER_MFA_ENCRYPTION_SECRET`, and
  `ADMIN_MFA_BREAK_GLASS_SECRET` must be at least 32 characters.
- In production, prefer `*_FILE` variables in container env files so secret
  managers inject file content instead of long-lived plaintext env values.
- In production, password-reset and verification endpoints return `503` unless the
  required SMTP/Twilio providers are configured.
- The single-host production template assumes the reverse proxy is the only
  public ingress, app containers stay on the internal `app` network, and
  `postgres` / `redis` stay on the internal `data` network.
- The single-host production template assumes `backend_database_url` and
  `backend_redis_url` secret files point to `postgres:5432` and `redis:6379`
  on the internal Docker network with environment-specific credentials.
- Non-production environments can use the webhook fallback or the built-in mock
  provider for local testing.
- Real-money deposits and withdrawals must stay on manual review until the
  payment execution loop exists end to end; this repo does not yet provide
  automated gateway execution for funds movement.
- The backend exposes `/health`, `/health/live`, `/health/ready`, and `/metrics`;
  production deployments should wire probes and scraping for these endpoints
  from an internal network, not from the public internet.
- The manual deploy workflow keeps a `previous-known-good` image tag per app
  image on the deployment host and stores release state under
  `$DEPLOY_PATH/shared/<environment>/ops/release-state.env`.
- Production should run the auth-notification worker, holdem-timeout worker,
  and blackjack-timeout worker as separate processes from the Fastify API.
