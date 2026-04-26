# Deployment Checklist

This is a pragmatic checklist for staging/production deployments.

## 1. Secrets and environment
- `DATABASE_URL` / `POSTGRES_URL` are set and point to the correct cluster.
- `ADMIN_JWT_SECRET` and `USER_JWT_SECRET` are long, random, and distinct.
- `AUTH_SECRET` (web) is long and random.
- `WEB_BASE_URL` / `ADMIN_BASE_URL` / `API_BASE_URL` are correct.
- `AUTH_NOTIFICATION_WEBHOOK_URL` points at the email/SMS delivery worker.
- `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_MINUTES`, and
  `PHONE_VERIFICATION_TTL_MINUTES` match your security policy.
- `DRAW_POOL_CACHE_TTL_SECONDS` is set if you want probability pool caching.
- `REDIS_URL` is set if you want shared rate limits and shared pool cache.
- GitHub Actions deployment secrets are configured per environment:
  - `DEPLOY_HOST`
  - `DEPLOY_USER`
  - `DEPLOY_PATH`
  - `DEPLOY_SSH_KEY`
  - `DEPLOY_RESTART_COMMAND`

## 2. Database
- For local smoke tests, start containers: `pnpm db:up`
- Run migrations: `pnpm db:migrate`
- Verify `system_config` seeded keys exist.
- Ensure `house_account` has a single row.

## 3. Runtime safety
- Confirm CORS origin list matches public domains.
- Confirm CSRF protections are enabled.
- Confirm rate limiting is enabled.

## 4. Observability
- Logs include trace IDs and are shipped to your log system.
- Draw errors and payout limits are monitored.
- Delivery failures from the auth notification webhook are monitored.
- `*_login_anomaly` auth events are visible in the admin security monitor.

## 5. Smoke tests
- Run unit tests: `pnpm test`
- Run integration tests (with Postgres): `pnpm test:integration`
- Perform a manual draw and verify ledger entries and draw records.

## 6. Remote host prerequisites
- Node.js 20 and PNPM 10 are installed on the target host.
- The target host already has runtime env files or secret injection in place.
- The restart command in `DEPLOY_RESTART_COMMAND` rebuilds process state safely after `pnpm build`.
- Use the manual GitHub Actions workflow `Deploy` to ship a selected ref to `staging` or `production`.
