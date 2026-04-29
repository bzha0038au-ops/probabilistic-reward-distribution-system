# DR Drills

This ledger tracks the monthly staging full-database restore drills. The source of truth stays in `docs/operations/evidence/`, and this file is rebuilt from the committed `*.summary.json` outputs.

- Successful full restore drills on record: 1
- Latest successful drill (UTC): 2026-04-26T17:00:11Z
- Freshness gate: page if the newest committed drill evidence is older than 45 days
- Metric definition: estimated RPO is backup age at restore start; actual RTO is restore plus validation wall-clock time.

| Drill date (UTC) | Environment | Backup created (UTC) | Estimated RPO | Actual RTO | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-04-26 | staging | 2026-04-26T16:57:31Z | 2m 40s | 1s | passed | [report](evidence/restore-drill-2026-04-27.md) / [summary](evidence/restore-drill-2026-04-27.summary.json) |

