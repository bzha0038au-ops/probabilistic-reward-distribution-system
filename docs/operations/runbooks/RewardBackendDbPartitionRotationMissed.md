# RewardBackendDbPartitionRotationMissed

## Trigger

- Prometheus alert: `RewardBackendDbPartitionRotationMissed`
- Signal: `reward_backend_db_partition_horizon_months_missing > 0`

This means at least one managed append-only parent table is missing the current
month or one of the pre-created future monthly partitions that should still be
attached in `public`.

## Immediate Checks

1. Inspect backend metrics:

   ```bash
   node -e "fetch('http://127.0.0.1:4000/metrics').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))" | rg 'reward_backend_db_partition_horizon_months_(expected|available|missing)'
   ```

2. Check the worker container is present and healthy enough to stay running:

   ```bash
   docker compose -f docker-compose.prod.yml ps db-partition-maintenance-worker
   docker compose -f docker-compose.prod.yml logs --tail=200 db-partition-maintenance-worker
   ```

3. Confirm config drift did not disable or shrink the horizon unexpectedly:

   - `DB_PARTITION_MAINTENANCE_ENABLED`
   - `DB_PARTITION_MAINTENANCE_FUTURE_MONTHS`
   - `DB_PARTITION_MAINTENANCE_INTERVAL_MS`
   - `DB_PARTITION_MAINTENANCE_ARCHIVE_AFTER_MONTHS`

## Database Verification

Run this against production Postgres:

```sql
select
  parent_cls.relname as parent_table,
  child_cls.relname as partition_name
from pg_inherits inh
join pg_class parent_cls on parent_cls.oid = inh.inhparent
join pg_namespace parent_ns on parent_ns.oid = parent_cls.relnamespace
join pg_class child_cls on child_cls.oid = inh.inhrelid
join pg_namespace child_ns on child_ns.oid = child_cls.relnamespace
where parent_ns.nspname = 'public'
  and child_ns.nspname = 'public'
  and parent_cls.relname in ('ledger_entries', 'saas_usage_events', 'round_events', 'admin_actions')
order by parent_cls.relname, child_cls.relname;
```

You should see the current month plus the configured future horizon as
`<parent>_pYYYYMM` tables for every managed parent.

## Recovery

1. Fix the worker process or env drift if the container is missing or crash-looping.
2. If the worker is healthy but the horizon is still missing, run one maintenance cycle manually from the backend image:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm db-partition-maintenance-worker
   ```

3. Re-check `/metrics` and verify `reward_backend_db_partition_horizon_months_missing` returns to `0` for every `parent_table`.

## Why This Matters

This alert is intentionally pre-failure. Missing future partitions may not break
traffic immediately, but at the next month boundary they can turn into write
errors or force large append-only tables onto slower paths that degrade query
latency and maintenance cost.
