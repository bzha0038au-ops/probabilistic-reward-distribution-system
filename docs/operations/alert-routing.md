# Alert Routing

These routes are the minimum operational contract for this repo. The automation
in `.github/workflows/operations-backup.yml` and
`.github/workflows/backup-verify.yml` assumes they are configured before the
schedules are enabled.

## Required Routes

- `BACKUP_ALERT_WEBHOOK_URL` secret: receives backup workflow failures.
- `DEPLOY_TG_BOT_TOKEN` secret: Telegram bot token for backup verification,
  deploy notifications, and restore-drill pages.
- `DEPLOY_TG_PAGE_CHAT_ID` secret: Telegram page chat for deploy rollback,
  backup verification failures, restore-drill failures, or stale drill evidence.
- `DEPLOY_TG_DIGEST_CHAT_ID` secret: Telegram digest chat for successful deploy
  notifications and successful backup verification digests.
- `PRIMARY_ONCALL` variable: first responder for production pages.
- `SECONDARY_ONCALL` variable: backup responder if the primary does not ack.
- `BACKUP_OWNER` variable: owner for retention, encryption, and offsite copy.
- `RESTORE_APPROVER` variable: approver for destructive restores and drill sign-off.
- `RELEASE_APPROVER` variable: approver for production upgrades.

## Routing Rules

- Backup workflow failure: page `PRIMARY_ONCALL`, then `SECONDARY_ONCALL` after 15 minutes if not acknowledged.
- Backup verification success: send the validated object summary to `DEPLOY_TG_DIGEST_CHAT_ID`.
- Backup verification failure: page `DEPLOY_TG_PAGE_CHAT_ID` immediately and include `BACKUP_OWNER`.
- Restore drill failure: page `PRIMARY_ONCALL` immediately and notify `RESTORE_APPROVER`.
- Deploy rollback: send `已自动回滚 sha=<failed_sha>` to `DEPLOY_TG_PAGE_CHAT_ID`
  after the workflow redeploys the `previous-known-good` image tags.
- Deploy success: send `deploy=ok sha=<release_sha>` to
  `DEPLOY_TG_DIGEST_CHAT_ID` after the 15-minute health and metrics monitor
  window passes.
- Readiness probe / 5xx / queue backlog alerts: route through Prometheus or your equivalent infra alert stack to the same on-call chain.
- PostgreSQL data volume alerts: route 70% to the ticket queue, 85%/95% to the page chain, and have the 95% rule fan out to the AI ops agent for an automatic expansion attempt.
- Redis memory alerts: route 70% to the ticket queue and 85%/95% to the page chain.
- Registry storage alerts: route the 80% threshold to the Telegram ticket chat so rollback images are preserved before registry GC pressure starts.
- Missing restore-drill evidence older than 45 days: treat as a sev2 operational readiness issue and page `DEPLOY_TG_PAGE_CHAT_ID`.

## Source Of Truth

- GitHub Actions schedules the repo-owned backup, backup verification, and restore-drill automation.
- GitHub Actions also runs the daily committed-evidence freshness check for
  restore drills.
- The GitHub environment variables above are the named owner registry for this repo.
- Infra-owned alerts still need Prometheus / Alertmanager (or equivalent) for `/metrics` and `/health/ready`.
