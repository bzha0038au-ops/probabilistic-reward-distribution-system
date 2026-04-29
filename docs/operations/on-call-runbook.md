# On-Call Runbook

This runbook is for the first responder handling production issues in the reward
system.

## Golden Rules

- Treat `ledger_entries`, `house_transactions`, `draw_records`, and
  `user_wallets` as financial system-of-record data.
- Do not patch money state directly in production unless the incident commander
  and service owner approve it.
- If data correctness is in doubt, freeze writes before trying to restore
  availability.

## First 15 Minutes

1. Confirm user impact and incident scope.
2. Check backend readiness from inside the container network:

```bash
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/health/ready').then(async (response) => { process.stdout.write(await response.text()); process.exit(response.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

3. Check metrics or logs for:
   - PostgreSQL connectivity failures
   - Redis failures
   - 5xx spikes
   - draw error rate changes
   - stuck withdrawals
   - notification backlog growth
4. Decide whether the issue is:
   - app-only outage
   - database outage
   - data-integrity concern
   - notification / side-effect backlog
5. If money correctness may be affected, stop the backend and notification
   worker before deeper investigation.

## Fast Checks

Container deployment:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs reverse-proxy --tail=200
docker compose -f docker-compose.prod.yml logs backend --tail=200
docker compose -f docker-compose.prod.yml logs notification-worker --tail=200
```

Database sanity:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/finance-sanity.sql
```

## Scenario: Database Unreachable

1. Confirm whether the problem is credentials, network, or cluster health.
2. Check `/health/ready` dependency details and recent backend logs.
3. If the primary cluster is down, move to the DR runbook:
   [`disaster-recovery.md`](./disaster-recovery.md).
4. Do not restart the app repeatedly if the database is still unavailable.

## Scenario: Suspected Money-State Corruption

Triggers:

- wallet balance looks impossible
- draw outcomes do not line up with ledger history
- admin reports unexplained balance movement

Response:

1. Freeze writes.
2. Capture the affected user ids, timestamps, request ids, trace ids, release,
   and commit SHA from the error event or logs.
3. Run `deploy/sql/finance-sanity.sql`.
4. Review recent rows in:
   - `ledger_entries`
   - `house_transactions`
   - `draw_records`
   - `deposits`
   - `withdrawals`
5. If corruption is confirmed or likely, stop ad hoc edits and start recovery
   planning from a clean restore target.

## Scenario: Notification Backlog Or Provider Failure

1. Check `notification_deliveries` backlog and `failed` rows.
2. Confirm provider credentials and readiness dependency status.
3. If provider outage is external, keep the core API up unless auth flows depend
   on immediate message delivery.
4. Replay failed notifications only after verifying the provider is healthy.

## Scenario: Admin Access Emergency

1. Confirm whether this is an auth outage or an individual MFA recovery case.
2. Use the documented `ADMIN_MFA_BREAK_GLASS_SECRET` procedure only under
   audited approval.
3. Record who approved the action, when it was used, and what follow-up rotation
   is required.

## Escalate Immediately When

- database restore or failover may be required
- there is evidence of silent financial inconsistency
- backup artifacts are missing or unreadable
- restore drill evidence is older than 45 days during a real incident

## After Stabilization

- record exact start/end times
- record customer-visible impact
- capture actual RPO/RTO if recovery was involved
- file follow-up work for any manual step that should become automated
