# Restore Drill

Run this drill at least once every 90 days. The goal is to prove that backups
are usable and that responders can recover the system without inventing steps
during an incident. The repo scheduler in
[`.github/workflows/operations-backup.yml`](../../.github/workflows/operations-backup.yml)
already performs the monthly variant; use this doc for manual or ad hoc drills.

## Drill Objective

- restore a recent production-like backup into an isolated target
- run invariant and sanity checks successfully
- measure actual RTO and estimated RPO
- capture gaps, missing approvals, or unclear steps

## Preparation

- pick the backup artifact to test
- provision an isolated PostgreSQL target
- confirm the operator has `pg_dump`, `pg_restore`, and `psql`
- confirm the PostgreSQL client major version matches the target server major version
- confirm the current runbooks are the versions under `docs/operations`
- confirm `RESTORE_APPROVER` is named before starting

## Drill Steps

1. Record drill start time.
2. Restore the backup into the isolated target:

```bash
TARGET_DATABASE_URL=postgres://... \
BACKUP_ENCRYPTION_PASSPHRASE=change-me \
RUN_BACKEND_SMOKE=true \
./deploy/scripts/restore-drill.sh /secure/backups/reward-system-logical-20260427T010000Z.tar.gz.enc
```

3. Validate:
   - backend `/health/ready`
   - admin finance page load
   - authenticated wallet history read or equivalent read probe
   - write probe succeeds against the isolated target
   - pending withdrawal/deposit counts are sensible
4. Record drill end time.

## Evidence To Capture

- backup artifact name and timestamp
- restore target identifier
- start and end time
- actual restore duration
- actual post-restore validation duration
- blockers, manual fixes, or missing permissions

## Pass Criteria

- restore completed without SQL invariant failures
- responders followed the documented path without guesswork
- financial tables and queue state were readable after restore
- actual RTO stayed within the agreed target, or the delta is explained

## Follow-Up

Every drill should produce:

- a short drill report
- a list of runbook corrections
- a ticket for every manual step worth automating
- a saved copy under `docs/operations/evidence/` or the workflow artifact store
