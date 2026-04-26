# Environment Variables

## Must Match Across Apps

These values must be identical for auth/session verification to work:

- `ADMIN_JWT_SECRET` (backend + admin console)

Production containers also support `<NAME>_FILE` counterparts. The runtime
entrypoint resolves those secret-file paths into the expected environment
variables before the app starts.

## Backend (`apps/backend/.env`)

- `DATABASE_URL` / `POSTGRES_URL` (required)
- `ADMIN_JWT_SECRET` (required)
- `USER_JWT_SECRET` (required)
- The same backend env file is used by both the API process and the
  auth-notification worker process.
- `ADMIN_MFA_ENCRYPTION_SECRET` (required in production; must differ from JWT/web secrets)
- `ADMIN_MFA_BREAK_GLASS_SECRET` (required in production; must differ from all other secrets)
- `DRAW_COST` (optional seed value for `system_config.draw_cost`)
- `DRAW_POOL_CACHE_TTL_SECONDS` (optional, probability pool cache TTL; `0` disables)
- `REDIS_URL` (optional, enables shared rate limiting + probability pool cache)
- `PAYMENT_OPERATING_MODE` (keep `manual_review`; `automated` is reserved and
  intentionally rejected at startup until the backend owns outbound gateway
  execution, signed payment callbacks, idempotent retries, and
  recovery/compensation end to end)
- `PAYMENT_RECONCILIATION_ENABLED`
- `PAYMENT_RECONCILIATION_INTERVAL_MS`
- `PAYMENT_RECONCILIATION_LOOKBACK_MINUTES`
- `PAYMENT_RECONCILIATION_PENDING_TIMEOUT_MINUTES`
- `PAYMENT_RECONCILIATION_MAX_ORDERS_PER_PROVIDER`
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
- `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_MINUTES`,
  `PHONE_VERIFICATION_TTL_MINUTES` (optional token/code TTL overrides)
- `ANOMALOUS_LOGIN_LOOKBACK_DAYS` (optional; login anomaly comparison window)
- `WEB_BASE_URL`, `ADMIN_BASE_URL`, `PORT`
- `ADMIN_SESSION_TTL`, `USER_SESSION_TTL` (optional)

## Web (`apps/frontend/.env`)

- `AUTH_SECRET` (required, frontend-only)
- `API_BASE_URL` (server-side API base URL)

## Admin (`apps/admin/.env`)

- `ADMIN_JWT_SECRET` (required, must match backend)
- `API_BASE_URL` (backend base URL)

## Container Deploy Env Files (`deploy/env/*.env`)

- `deploy/env/backend.env.example` is the contract for the backend container,
  the auth-notification worker, and the DB migration job.
- `deploy/env/postgres.env.example` is the contract for the single-host
  PostgreSQL container that ships in `docker-compose.prod.yml`.
- `deploy/env/frontend.env.example` is the contract for the Next.js container.
- `deploy/env/admin.env.example` is the contract for the SvelteKit admin container.
- `deploy/env/ops.env.example` is the local-cron contract for
  `deploy/scripts/backup-runner.sh` when you are not using the GitHub Actions
  scheduler.
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
- variable: `LOCAL_BACKUP_RETENTION_DAYS`
- variable: `OFFSITE_BACKUP_RETENTION_DAYS`
- variable: `PRIMARY_ONCALL`
- variable: `SECONDARY_ONCALL`
- variable: `BACKUP_OWNER`
- variable: `RESTORE_APPROVER`
- variable: `RELEASE_APPROVER`

## Consistency Rules

- `ADMIN_JWT_SECRET` must match between backend and admin.
- `USER_JWT_SECRET` must not be shared with the admin or web secrets.
- `ADMIN_MFA_ENCRYPTION_SECRET` must not match any JWT or web secret.
- `ADMIN_MFA_BREAK_GLASS_SECRET` must not match any JWT, web, or MFA encryption secret.
- `AUTH_SECRET` is only for NextAuth in the web app.
- In production, `ADMIN_JWT_SECRET`, `USER_JWT_SECRET`, `ADMIN_MFA_ENCRYPTION_SECRET`, and `ADMIN_MFA_BREAK_GLASS_SECRET` must be at least 32 characters.
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
- Production should run the auth-notification worker as a separate process from
  the Fastify API.
