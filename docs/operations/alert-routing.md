# Alert Routing

These routes are the minimum operational contract for this repo. The automation
in `.github/workflows/operations-backup.yml` assumes they are configured before
the schedule is enabled.

## Required Routes

- `BACKUP_ALERT_WEBHOOK_URL` secret: receives backup and restore-drill failures.
- `PRIMARY_ONCALL` variable: first responder for production pages.
- `SECONDARY_ONCALL` variable: backup responder if the primary does not ack.
- `BACKUP_OWNER` variable: owner for retention, encryption, and offsite copy.
- `RESTORE_APPROVER` variable: approver for destructive restores and drill sign-off.
- `RELEASE_APPROVER` variable: approver for production upgrades.

## Routing Rules

- Backup workflow failure: page `PRIMARY_ONCALL`, then `SECONDARY_ONCALL` after 15 minutes if not acknowledged.
- Restore drill failure: page `PRIMARY_ONCALL` immediately and notify `RESTORE_APPROVER`.
- Readiness probe / 5xx / queue backlog alerts: route through Prometheus or your equivalent infra alert stack to the same on-call chain.
- Missing restore-drill evidence older than 90 days: treat as a sev2 operational readiness issue.

## Source Of Truth

- GitHub Actions schedules the repo-owned backup and restore-drill automation.
- The GitHub environment variables above are the named owner registry for this repo.
- Infra-owned alerts still need Prometheus / Alertmanager (or equivalent) for `/metrics` and `/health/ready`.
