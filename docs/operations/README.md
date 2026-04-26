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
- [`evidence/restore-drill-2026-04-27.md`](./evidence/restore-drill-2026-04-27.md):
  latest committed restore-drill evidence
- [`secret-rotation.md`](./secret-rotation.md): secret file inventory and
  rotation procedure

## Executable Assets

- [`deploy/scripts/postgres-backup.sh`](../../deploy/scripts/postgres-backup.sh)
- [`deploy/scripts/backup-runner.sh`](../../deploy/scripts/backup-runner.sh)
- [`deploy/scripts/postgres-restore.sh`](../../deploy/scripts/postgres-restore.sh)
- [`deploy/scripts/restore-drill.sh`](../../deploy/scripts/restore-drill.sh)
- [`deploy/scripts/ops-notify.sh`](../../deploy/scripts/ops-notify.sh)
- [`deploy/sql/post-restore-checks.sql`](../../deploy/sql/post-restore-checks.sql)
- [`deploy/sql/finance-sanity.sql`](../../deploy/sql/finance-sanity.sql)
- [`.github/workflows/operations-backup.yml`](../../.github/workflows/operations-backup.yml)

## Production Standard

This repo now ships the repo-owned backup scheduler, restore-drill automation,
and evidence format. Production is only ready when the following are configured
outside the repo and referenced by the workflow:

- managed PostgreSQL snapshots plus point-in-time recovery or WAL archiving
- `BACKUP_ALERT_WEBHOOK_URL`
- `PRIMARY_ONCALL`, `SECONDARY_ONCALL`, `BACKUP_OWNER`,
  `RESTORE_APPROVER`, and `RELEASE_APPROVER`
- `OFFSITE_STORAGE_URI` and `BACKUP_ENCRYPTION_PASSPHRASE`
- alert routing for readiness failures, 5xx spikes, draw error rate, withdraw
  stuck, and queue backlog growth
- a completed restore drill from the last 90 days
- CDN/WAF coverage in front of the reverse proxy
- patch management plus disk/filesystem alerting on the deployment host
