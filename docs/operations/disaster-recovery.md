# Disaster Recovery

This runbook covers application-level recovery for incidents that threaten
availability or correctness of the reward system.

## Incident Classes

- `db_outage`: the primary PostgreSQL cluster is unavailable
- `db_corruption`: data was corrupted by bad write path, operator action, or
  unsafe migration
- `region_loss`: the primary runtime region is unavailable
- `app_host_loss`: application nodes are unavailable but the database is intact

## Decision Rules

- If the database is healthy and only application nodes failed, redeploy the
  backend, worker, frontend, and admin services. Do not perform a DB restore.
- If the database is reachable but data is incorrect, prefer point-in-time
  restore to a clean target and then cut over after validation.
- If the primary database region is down, promote a replica or provider-managed
  standby first. Restore from logical dump only when replica promotion or PITR
  is not available.

## Preconditions Before Production

Production is not DR-ready until these exist outside the repo:

- PostgreSQL point-in-time recovery or continuous WAL archival
- a warm standby / read replica or documented provider failover path
- backup storage in a separate failure domain
- DNS or service-discovery mechanism for swapping `DATABASE_URL`
- an approved incident communication path and escalation tree

## Failover Procedure

1. Declare the incident and assign roles:
   - incident commander
   - database operator
   - application operator
   - communications owner
2. Freeze writes by stopping the backend API and notification worker.
3. Capture the failure window:
   - incident start time
   - last known good request timestamp
   - backup identifier or target PITR timestamp
4. Recover the database:
   - promote the standby if this is a primary outage
   - restore to a new cluster if this is corruption or destructive change
5. Update runtime configuration so the backend and worker use the recovered
   database target.
6. Start the backend and notification worker against the recovered target.
7. Run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/post-restore-checks.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/finance-sanity.sql
```

8. Validate application readiness:
   - `GET /health/ready`
   - admin finance and security pages
   - a controlled authenticated wallet read
9. Reopen traffic gradually.
10. Capture actual RPO/RTO and open a postmortem.

## Data-Corruption Recovery

If correctness is in doubt, do not reopen traffic after a partial fix.

Use this order:

1. stop writes
2. preserve evidence and logs
3. pick restore timestamp or dump artifact
4. restore into a clean target
5. validate financial tables and recent activity windows
6. cut traffic to the validated target

Manual SQL edits to `ledger_entries`, `house_transactions`, `draw_records`, or
`user_wallets` require explicit approval and post-incident reconciliation notes.

## Recovery Validation

Minimum acceptance criteria:

- no invariant failure from `post-restore-checks.sql`
- no negative wallet or house balances
- `house_account` singleton intact
- pending deposits / withdrawals are understood and reviewed
- notification backlog state is visible and acceptable

## Drill Scenarios

Run the staging full-database restore drill every month. In addition, exercise
at least one broader DR scenario every quarter:

- restore the latest logical dump into a staging clone
- recover to a specific timestamp after simulated accidental deletion
- swap the app stack to a standby database target and back
