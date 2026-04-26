# Restore Drill Evidence: 2026-04-27

- Local drill date: 2026-04-27 Australia/Sydney
- UTC start: 2026-04-26T17:00:11Z
- UTC finish: 2026-04-26T17:00:12Z
- Drill ID: `local-restore-drill-2026-04-27`
- Operator: `codex-local`
- Restore approver placeholder: `restore-approver-to-wire-in-github-vars`
- Change / ticket: `local-proof-2026-04-27`

## Backup Artifact

- Logical encrypted bundle: `reward-system-logical-20260426T165731Z.tar.gz.enc`
- Volume encrypted bundle: `reward-system-volume-20260426T165731Z.tar.gz.enc`
- Source volume: `reward_ops_src_pgdata`
- Offsite copy target used for the proof run: `.tmp/ops-drill/offsite/`

## Result

- Restore status: passed
- `deploy/sql/post-restore-checks.sql`: passed
- `deploy/sql/finance-sanity.sql`: passed
- Write probe: passed
- End-to-end restore + validation time: 1 second

## Notes

- The drill restored the encrypted logical bundle into an isolated PostgreSQL target on a different container/port than the source.
- The write probe used a temporary table and rolled back, which proved the restored target was writable without mutating persistent business data.
- Backend smoke was intentionally skipped in the final proof record because the current backend baseline has unrelated build/import issues; the scheduled drill workflow therefore uses SQL validation plus the write probe as the automated restore acceptance gate.
