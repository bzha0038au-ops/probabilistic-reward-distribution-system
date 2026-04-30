# Deployment Checklist

This is the minimum staging/production checklist for the hardened single-host
topology in `docker-compose.prod.yml`.

The checklist is now backed by an executable gate:

```bash
pnpm ops:release-gate --environment staging
pnpm ops:release-gate --environment production
```

The `Deploy` GitHub Actions workflow runs the same gate before build/test so
missing external controls block the rollout instead of staying as doc debt.

## 1. Environment separation

- Development, staging, and production use separate domains, secret values,
  deploy credentials, and host paths.
- Each deployed environment has its own runtime tree under
  `$DEPLOY_PATH/shared/<environment>/`.
- The deploy SSH key is scoped to one environment. Do not reuse the same key
  across staging and production.
- The deploy host contains:
  - `$DEPLOY_PATH/shared/<environment>/env`
  - `$DEPLOY_PATH/shared/<environment>/secrets`
  - `$DEPLOY_PATH/shared/<environment>/proxy/{data,config,logs}`

## 2. Secrets and config

- `compose.env` defines `APP_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN`,
  `TLS_ACME_EMAIL`, and `HSTS_MAX_AGE`.
- `backend.env`, `frontend.env`, `admin.env`, and `postgres.env` are present in
  `$DEPLOY_PATH/shared/<environment>/env`.
- Runtime container env files prefer `*_FILE` variables over plaintext secret
  values.
- The secret manager has populated these files in
  `$DEPLOY_PATH/shared/<environment>/secrets`:
  - `postgres_password`
  - `redis_password`
  - `backend_database_url`
  - `backend_redis_url`
  - `admin_jwt_secret`
  - `user_jwt_secret`
  - `admin_mfa_encryption_secret`
  - `admin_mfa_break_glass_secret`
  - `frontend_auth_secret`
- Optional provider secret files exist when email or SMS delivery is enabled:
  - `auth_smtp_pass`
  - `auth_twilio_auth_token`
- `WEB_BASE_URL`, `ADMIN_BASE_URL`, `API_BASE_URL`, and public domains match.
- `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_MINUTES`, and
  `PHONE_VERIFICATION_TTL_MINUTES` match policy.
- The auth-notification worker is deployed separately from the API.

## 3. Public boundary

- Only `reverse-proxy` publishes host ports.
- `backend`, `frontend`, `admin`, `postgres`, and `redis` do not publish
  Docker `ports`.
- `postgres` and `redis` only sit on the internal `data` network.
- `/metrics` and `/health*` are not publicly routable through the reverse proxy.
- A CDN/WAF sits in front of the proxy before go-live.
- If admin access is internet-exposed, an extra control such as VPN, access
  proxy, or IP policy is in place.

## 4. Database and cache

- For local smoke tests, start containers: `pnpm db:up`
- Run migrations: `pnpm db:migrate`
- Enforce migration journal + rollback headers before cutting a release:
  `pnpm guard:migration-discipline`
- Verify `system_config` seeded keys exist.
- Ensure `house_account` has a single row.
- Confirm `reward_postgres_data` and `reward_redis_data` exist on persistent
  storage with enough free disk.
- Confirm `backend_database_url` and `backend_redis_url` reference the internal
  compose service names and environment-specific credentials.

## 5. Backup, restore, and rotation

- PostgreSQL logical backups run on a schedule through
  [`.github/workflows/operations-backup.yml`](../.github/workflows/operations-backup.yml)
  and are copied off the machine.
- Weekly/monthly PostgreSQL volume backups run through the same workflow.
- Backup artifacts are encrypted and copied to a separate storage boundary via
  `OFFSITE_STORAGE_URI`.
- `BACKUP_ALERT_WEBHOOK_URL` pages the current on-call owner on backup or
  restore-drill failure.
- `POSTGRES_PITR_ENABLED=true`, `POSTGRES_PITR_STRATEGY`,
  `POSTGRES_PITR_RPO_MINUTES`, `POSTGRES_WAL_ARCHIVE_ENABLED=true`, and
  `POSTGRES_WAL_ARCHIVE_URI` are configured on the target GitHub environment.
- `DEPLOY_TG_BOT_TOKEN`, `DEPLOY_TG_PAGE_CHAT_ID`, and
  `DEPLOY_TG_DIGEST_CHAT_ID` are configured on the GitHub environment used by
  the manual deploy workflow.
- `docs/operations/alert-routing.md` and
  `docs/operations/on-call-schedule.md` are current.
- A monthly staging restore drill has been completed within the last 45 days.
- [`docs/operations/dr-drills.md`](./operations/dr-drills.md) shows the latest successful restore row.
- A secret-rotation drill has been completed within the last 90 days.
- Secret rotation procedure is documented, executable, and tested:
  [`docs/operations/secret-rotation.md`](./operations/secret-rotation.md).
- On-call has reviewed:
  - [`docs/operations/backup-and-restore.md`](./operations/backup-and-restore.md)
  - [`docs/operations/disaster-recovery.md`](./operations/disaster-recovery.md)
  - [`docs/operations/on-call-runbook.md`](./operations/on-call-runbook.md)
  - [`docs/operations/on-call-schedule.md`](./operations/on-call-schedule.md)

## 6. Runtime safety

- Confirm CORS origin list matches public domains.
- Confirm CSRF protections are enabled.
- Confirm rate limiting is enabled.
- Keep `PAYMENT_OPERATING_MODE=manual_review` by default. Only set
  `PAYMENT_OPERATING_MODE=automated` together with
  `PAYMENT_AUTOMATED_MODE_OPT_IN=true` after an explicit rollout decision and
  a deployment review of outbound execution, signed callbacks, idempotent
  retries, and recovery/compensation coverage.
- Confirm the reconciliation worker is deployed and `PAYMENT_RECONCILIATION_*`
  settings match expected provider volume and timeout windows.
- If automated funds movement is ever enabled later, keep withdrawals manual
  first and expand by provider gray rules instead of a single global cutover.
  Gate rollout by allowlisted users, small orders, country, currency, and
  amount bands, with a documented manual fallback path at every stage.
- Do not route real-money deposits or withdrawals through this stack yet.
- Confirm the API process and the auth-notification worker both restart on deploy.
- Confirm worker capacity and `AUTH_NOTIFICATION_BATCH_SIZE` fit peak queue depth.

## 7. Observability and host baseline

- Logs include trace IDs plus `service`, `environment`, `release`, and
  `commitSha`, and are shipped to your log system.
- Backend `SENTRY_DSN`, frontend `NEXT_PUBLIC_SENTRY_DSN`, and admin
  `PUBLIC_SENTRY_DSN` are configured for centralized exception triage.
- Backend `OTEL_EXPORTER_OTLP_ENDPOINT` is configured and traces arrive in
  Tempo, Jaeger, Datadog, or your equivalent trace backend.
- Reverse-proxy access logs are retained from
  `$DEPLOY_PATH/shared/<environment>/proxy/logs/access.log`.
- `/health/ready` is wired into internal readiness probes.
- `/metrics` is scraped from an internal path or monitoring network.
- `deploy/monitoring/prometheus-alerts.yml` is loaded into Prometheus or your
  equivalent alerting stack.
- `deploy/monitoring/alertmanager-routing.example.yml` has been translated into
  the environment's real Alertmanager routing config.
- `NODE_EXPORTER_JOB`, `POSTGRES_EXPORTER_JOB`, and `REDIS_EXPORTER_JOB` are
  configured on the deployment environment and match the real scrape jobs.
- The deploy host preserves `previous-known-good` tags for backend, frontend,
  and admin images, plus
  `$DEPLOY_PATH/shared/<environment>/ops/release-state.env`.
- Dashboards cover readiness, 5xx, draw error rate, withdraw stuck,
  notification backlog, payment webhook signature failures, reconciliation
  manual-review queue depth, outbound idempotency conflicts, Stripe provider
  degradation, SaaS billing failures, and `reward_backend_build_info`.
- Draw errors, payout limits, withdraw stuck, notification backlog, delivery
  failures, webhook signature spikes, reconciliation queue growth, Stripe
  rate-limit / 5xx failures, outbound idempotency conflicts, and SaaS billing
  collection failures are monitored.
- Disk-capacity, inode, and filesystem-read-only alerts exist for the host,
  Docker storage, and persistent volumes.
- Host patching, least privilege, and access controls match
  [`docs/operations/host-hardening.md`](./operations/host-hardening.md).
- `HOST_HARDENING_LAST_REVIEW_UTC` and `HOST_PATCH_WINDOW` are set on the
  target GitHub environment.
- Production go-live has `WAF_CDN_PROVIDER`, `WAF_CDN_DASHBOARD_URL`, and
  `ADMIN_EDGE_ACCESS_POLICY` configured before internet exposure.

## 8. Capacity and failure validation

- Run the generic authenticated wallet load smoke: `pnpm test:load`.
- Run a dedicated draw load test against the real authenticated `POST /draw`
  path with realistic prize-pool data, request mix, and client nonce behavior.
- Run a notification-queue load test that drives the worker into expected peak
  backlog and verifies drain rate, retry behavior, and dead-letter growth.
- Run an admin finance peak test against the real approval actions
  (`/admin/deposits/:id/approve`, `/admin/withdrawals/:id/approve`,
  `/admin/withdrawals/:id/pay`) at expected operator concurrency.
- For every capacity test, record the offered QPS, concurrent sessions, worker
  replica count, queue backlog, oldest pending age, p95/p99 latency, non-2xx
  rate, timeout rate, and the first point where the system starts to degrade.
- Record the observed degradation shape for each path: higher tail latency,
  queue age growth, retry storms, 429/5xx spikes, readiness moving to
  `degraded` or `not_ready`, slower admin actions, or manual replay becoming
  necessary.
- Deployment is blocked until the team can state, from recent evidence, the draw
  QPS, notification backlog/oldest-age threshold, and admin finance concurrency
  at which the system begins to degrade.
- Complete and record failure drills for Redis unavailable, auth email provider
  unavailable, auth SMS provider unavailable, notification-worker crash/restart,
  and database failover/connection switch.

## 9. Smoke tests

- Run unit tests: `pnpm test`
- Run integration tests: `pnpm test:integration`
- Run the payment anomaly drill suite: `pnpm test:integration:payments-drill`
- Run browser regression after installing the Playwright browser once: `pnpm test:e2e`
- Run the SaaS portal browser regression: `pnpm test:e2e:portal`
- Run the mobile Maestro regression on a booted device/emulator:
  `pnpm test:e2e:mobile`
- Enforce UI surface file budgets before merge:
  `pnpm guard:surface-file-budgets`
- Perform a manual draw and verify ledger entries and draw records.

## 10. Deployment path

- Docker Engine and the Docker Compose plugin are installed on the target host.
- The target host user can run `docker load` and `docker compose` without
  manual sudo steps.
- Use the manual GitHub Actions workflow `Deploy` to build the backend, worker,
  frontend, and admin images, upload them plus the proxy config over SSH, boot
  local `postgres` and `redis`, run `docker compose run --rm migrate`, and
  refresh the running stack behind the reverse proxy.
- After the new containers come up, the deploy workflow watches
  `/health/ready`, backend 5xx ratio, and draw error ratio for 15 minutes; on
  failure it redeploys `previous-known-good`, pages the deploy Telegram chat,
  and leaves the old release directory as `current`.
