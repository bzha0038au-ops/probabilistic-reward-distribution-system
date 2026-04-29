# Operations Evidence

Committed evidence under this directory is consumed by automation:

- `restore-drill-YYYY-MM.md`
- `restore-drill-YYYY-MM.summary.json`
- `secret-rotation-YYYY-MM-DD.summary.json`

Freshness gates currently enforce:

- restore-drill evidence newer than 45 days
- secret-rotation evidence newer than 90 days

Secret-rotation summaries should include at least one of these fields:

- `completed_at_utc`
- `finished_at_utc`
- `performed_at_utc`
- `date`
