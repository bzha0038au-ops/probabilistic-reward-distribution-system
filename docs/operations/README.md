# Operations Runbooks

These assets cover the minimum operational controls this repo expects before a
real production launch.

## Scope

- PostgreSQL backup and restore procedure for application-owned data
- Disaster recovery decision flow and cutover steps
- On-call response guidance for database, finance, and notification incidents
- Restore drill process and evidence capture
- Host hardening and public-boundary expectations
- Secret rotation and file-based secret injection workflow

## Runbooks

- [`backup-and-restore.md`](./backup-and-restore.md): backup cadence, restore
  steps, and validation flow
- [`disaster-recovery.md`](./disaster-recovery.md): failover and point-in-time
  recovery guidance
- [`host-hardening.md`](./host-hardening.md): public entry-point, least-privilege,
  patching, and disk/filesystem alert baseline
- [`on-call-runbook.md`](./on-call-runbook.md): first-response playbook for
  production incidents
- [`on-call-schedule.md`](./on-call-schedule.md): weekly rotation and named owners
- [`restore-drill.md`](./restore-drill.md): quarterly rehearsal checklist and
  evidence template
- [`restore-drill-template.md`](./restore-drill-template.md): copy/paste report
  skeleton for manual evidence capture
- [`alert-routing.md`](./alert-routing.md): backup and restore-drill paging route
- [`runbooks/`](./runbooks/): alert-specific runbooks linked from Prometheus
  alerts and notification payloads
- [`evidence/`](./evidence/): committed restore-drill reports and machine-readable
  summaries produced by manual drills or the monthly automation PR
- [`secret-rotation.md`](./secret-rotation.md): secret file inventory and
  rotation procedure

## Executable Assets

- Root `pnpm ops:*` shortcuts:
  - `pnpm ops:health`
  - `pnpm ops:tail-errors`
  - `pnpm ops:check-finance`
  - `pnpm ops:freeze-deploys`
  - `pnpm ops:rotate-jwt`
  - `pnpm ops:ai-diagnose`
  - `pnpm ops:postmortem`
- [`deploy/scripts/postgres-backup.sh`](../../deploy/scripts/postgres-backup.sh)
- [`deploy/scripts/backup-runner.sh`](../../deploy/scripts/backup-runner.sh)
- [`deploy/scripts/verify-backup.sh`](../../deploy/scripts/verify-backup.sh)
- [`deploy/scripts/postgres-restore.sh`](../../deploy/scripts/postgres-restore.sh)
- [`deploy/scripts/restore-drill.sh`](../../deploy/scripts/restore-drill.sh)
- [`deploy/scripts/check-restore-drill-freshness.sh`](../../deploy/scripts/check-restore-drill-freshness.sh)
- [`deploy/scripts/ops-notify.sh`](../../deploy/scripts/ops-notify.sh)
- [`deploy/scripts/telegram-notify.sh`](../../deploy/scripts/telegram-notify.sh)
- [`deploy/sql/post-restore-checks.sql`](../../deploy/sql/post-restore-checks.sql)
- [`deploy/sql/finance-sanity.sql`](../../deploy/sql/finance-sanity.sql)
- [`.github/workflows/operations-backup.yml`](../../.github/workflows/operations-backup.yml)
- [`.github/workflows/backup-verify.yml`](../../.github/workflows/backup-verify.yml)

## Ops Shortcuts

The repo root now carries the on-call shortcuts that should replace "which
package / directory was that command in?" during incidents.

- `pnpm ops:health`: probe all configured `/health/ready` URLs and fail on
  `not_ready`
- `pnpm ops:tail-errors`: fetch the latest 100 Sentry 5xx events
- `pnpm ops:check-finance`: run [`deploy/sql/finance-sanity.sql`](../../deploy/sql/finance-sanity.sql)
  from the repo root
- `pnpm ops:freeze-deploys`: create or clear `.deploy-frozen`, which now
  causes [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) to
  reject deploys for that ref
- `pnpm ops:rotate-jwt`: guided dual-secret rotation over
  `*_JWT_SECRET_PREVIOUS`
- `pnpm ops:ai-diagnose`: collect health, metrics, logs, and recent Sentry 5xx
  context for AI-assisted diagnosis
- `pnpm ops:postmortem`: pull a bounded log window and have AI draft a Markdown
  postmortem

## Production Standard

This repo now ships the repo-owned backup scheduler, backup readability
verification, restore-drill automation, and evidence format. Production is only
ready when the following are configured outside the repo and referenced by the
workflow:

- managed PostgreSQL snapshots plus point-in-time recovery or WAL archiving
- `BACKUP_ALERT_WEBHOOK_URL`
- `DEPLOY_TG_BOT_TOKEN` and `DEPLOY_TG_PAGE_CHAT_ID`
- `DEPLOY_TG_DIGEST_CHAT_ID` for non-paging backup verification results
- `PRIMARY_ONCALL`, `SECONDARY_ONCALL`, `BACKUP_OWNER`,
  `RESTORE_APPROVER`, and `RELEASE_APPROVER`
- `OFFSITE_STORAGE_URI` and `BACKUP_ENCRYPTION_PASSPHRASE`
- `BACKUP_ARCHIVE_S3_URI` plus optional `BACKUP_ARCHIVE_CROSS_REGION_S3_URI`
- alert routing for readiness failures, 5xx spikes, draw error rate, withdraw
  stuck, and queue backlog growth
- a committed restore drill report under `docs/operations/evidence/` from the
  last 90 days
- CDN/WAF coverage in front of the reverse proxy
- patch management plus disk/filesystem alerting on the deployment host
