# Backup And Restore

This system keeps wallet state, ledger history, draw records, and house balance
data in PostgreSQL. Production must treat backup and restore as a first-class
control, not as an ad hoc DBA task.

## Minimum Standard

- Enable provider-level snapshots and point-in-time recovery for the production
  PostgreSQL cluster.
- Schedule at least one logical backup per day using
  `.github/workflows/operations-backup.yml`, which calls
  `deploy/scripts/backup-runner.sh`.
- Schedule at least one daily readability check using
  `.github/workflows/backup-verify.yml`, which downloads the newest S3 backup
  copy and runs `pg_restore --list`.
- Schedule at least one volume-level PostgreSQL backup every week using the same
  workflow with `INCLUDE_VOLUME_BACKUP=true`.
- Store backup artifacts encrypted and offsite from the primary runtime
  account/region through `OFFSITE_STORAGE_URI`.
- Keep a readable logical dump copy in `BACKUP_ARCHIVE_S3_URI` for automated
  validation, and mirror it to `BACKUP_ARCHIVE_CROSS_REGION_S3_URI` when your
  cloud provider does not already replicate that bucket or prefix.
- Run a full-database restore drill every month in staging using
  `deploy/scripts/restore-drill.sh` against an isolated target database.
- Record and review actual RPO/RTO after every drill and every real incident.

## Recovery Targets

Define these explicitly before go-live:

- `target_rpo`: maximum tolerated data loss in minutes
- `target_rto`: maximum tolerated service restoration time in minutes
- `backup_owner`: `BACKUP_OWNER`
- `restore_approver`: `RESTORE_APPROVER`
- `release_approver`: `RELEASE_APPROVER`
- `primary_oncall` / `secondary_oncall`: `PRIMARY_ONCALL` / `SECONDARY_ONCALL`

## Automation Contract

The repo-owned scheduler is
[`.github/workflows/operations-backup.yml`](../../.github/workflows/operations-backup.yml).

- Daily schedule: logical backup only
- Weekly schedule: logical backup plus PostgreSQL volume backup
- Monthly schedule: production backup plus a staging full-database restore drill
- Daily verification schedule:
  [`.github/workflows/backup-verify.yml`](../../.github/workflows/backup-verify.yml)
- Daily restore-drill freshness check: page on-call if the newest committed
  evidence in `docs/operations/evidence/` is older than 45 days

Successful monthly drills copy their report into `docs/operations/evidence/`
as `restore-drill-YYYY-MM.*`, rebuild
[`dr-drills.md`](./dr-drills.md), and open an automated pull request for
review.

For local cron or another scheduler, use `deploy/env/ops.env.example` as the
configuration contract for `deploy/scripts/backup-runner.sh`.

Use a `pg_dump` / `pg_restore` / `psql` client major version that matches the
server major version for your production PostgreSQL cluster.

## Backup Procedure

1. Load the production backend env file or export `DATABASE_URL`.
   On a deployed host, set `DEPLOY_PATH` to the app root first.
2. Run the backup orchestrator:

```bash
ENV_FILE="$DEPLOY_PATH/current/.env.d/backend.env" \
COMPOSE_ENV_FILE="$DEPLOY_PATH/current/.env.d/compose.env" \
BACKUP_ENCRYPTION_PASSPHRASE=change-me \
./deploy/scripts/backup-runner.sh
```

3. Verify the generated artifacts:
   - encrypted logical bundle
   - encrypted volume bundle on weekly/monthly runs
   - checksum files for encrypted bundles
   - `backup-manifest.json` with run metadata
4. Confirm the encrypted bundles arrived at `OFFSITE_STORAGE_URI`.
5. Confirm the readable logical dump copy arrived at `BACKUP_ARCHIVE_S3_URI`.
6. If bucket replication is not enabled in infra, confirm the manual
   cross-region copy arrived at `BACKUP_ARCHIVE_CROSS_REGION_S3_URI`.
7. Alert on backup job failure or missing daily artifact through `BACKUP_ALERT_WEBHOOK_URL`.

## Restore Procedure

Use restores in two cases:

- isolated drill or analytics clone restore
- production recovery after corruption, accidental deletion, or bad migration
- Migrations `0028` through `0035` do not ship repo-owned down SQL; rollback for `quick_eight`, `blackjack`, and `saas` / `prize_engine_saas` changes means restoring to a pre-deploy snapshot or PITR target and then redeploying the previous application release.

Before restoring a production target:

1. Declare the incident and assign an incident commander.
2. Freeze writes by stopping the backend API and notification worker.
3. Confirm the restore target and chosen backup or PITR timestamp.
4. Take a fresh safety snapshot of the target if it still contains useful data.

Example for the repo's Docker Compose deployment:

```bash
docker compose -f docker-compose.prod.yml stop backend notification-worker frontend admin
```

Run the restore:

```bash
CONFIRM_RESTORE=YES \
ENV_FILE="$DEPLOY_PATH/current/.env.d/backend.env" \
./deploy/scripts/postgres-restore.sh /secure/backups/reward-system-20260427T010000Z.dump
```

Notes:

- `postgres-restore.sh` takes a pre-restore safety snapshot by default.
- Set `TARGET_DATABASE_URL` when restoring into a fresh clone instead of the
  current production target.
- Set `DROP_PUBLIC_SCHEMA_BEFORE_RESTORE=true` only when the destination is a
  dedicated empty target and you want a hard reset before loading the dump.
- In the validation commands below, `RESTORED_DATABASE_URL` means the database
  you just restored. For an in-place production restore, that can simply be the
  same value as `DATABASE_URL`.

## After Restore

1. Run database migrations if the restored backup is older than the currently
   deployed application schema:

```bash
pnpm db:migrate
```

2. Run the built-in invariant checks:

```bash
psql "$RESTORED_DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/post-restore-checks.sql
```

3. Run finance sanity queries:

```bash
psql "$RESTORED_DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/finance-sanity.sql
```

4. Bring the API and worker back online.
5. Verify:
   - `GET /health/ready` returns `ready` or approved `degraded`
   - admin finance pages load
   - wallet history endpoints return ledger data
   - pending withdrawal/deposit workload matches expectations
6. Reopen traffic only after sign-off from the incident commander and service
   owner / `RESTORE_APPROVER`.

For the monthly staging drill, also confirm the generated report and summary
show:

- `estimated_rpo_seconds`
- `actual_rto_seconds`
- `drill_environment=staging`
- a new row in [`dr-drills.md`](./dr-drills.md)

## What The Post-Restore Checks Validate

`deploy/sql/post-restore-checks.sql` verifies:

- `house_account` still exists as a single-row singleton
- required runtime config such as `system_config.draw_cost` exists
- no negative wallet or house balances are present
- prize stock and draw record values are not invalid negative numbers
- critical table counts and latest timestamps are visible for human review

## Limits Of This Repo-Level Procedure

- Logical dumps are not a replacement for point-in-time recovery.
- Redis is treated as rebuildable cache / rate-limit state and is not part of
  the financial system of record.
- External payment reconciliation now has scheduled jobs and a manual diff
  queue, but backup validation still proves internal state recovery rather than
  full settlement correctness against a real payment processor.
- There is no built-in maintenance mode flag yet, so write freezing is done by
  stopping the write-capable services.
