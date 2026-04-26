# On-Call Schedule

## Rotation Cadence

- Rotation changes every Monday at 09:00 Australia/Sydney.
- Every handoff must confirm the latest successful backup artifact and the latest restore-drill report date.

## Named Roles

- Primary on-call: `PRIMARY_ONCALL` GitHub environment variable
- Secondary on-call: `SECONDARY_ONCALL` GitHub environment variable
- Backup owner: `BACKUP_OWNER` GitHub environment variable
- Restore approver: `RESTORE_APPROVER` GitHub environment variable
- Release approver: `RELEASE_APPROVER` GitHub environment variable

## Weekly Handoff Checklist

1. Confirm the last daily backup succeeded in `Operations Backups`.
2. Confirm the last monthly restore drill report is newer than 90 days.
3. Confirm `BACKUP_ALERT_WEBHOOK_URL` is still valid.
4. Confirm the current primary and secondary responders match the GitHub environment variables.

## Roster Template

| Window (Australia/Sydney) | Primary | Secondary | Backup Owner | Release Approver | Restore Approver |
| --- | --- | --- | --- | --- | --- |
| 2026-04-27 to 2026-05-04 | `PRIMARY_ONCALL` | `SECONDARY_ONCALL` | `BACKUP_OWNER` | `RELEASE_APPROVER` | `RESTORE_APPROVER` |
| 2026-05-04 to 2026-05-11 | update on rotation | update on rotation | `BACKUP_OWNER` | `RELEASE_APPROVER` | `RESTORE_APPROVER` |
| 2026-05-11 to 2026-05-18 | update on rotation | update on rotation | `BACKUP_OWNER` | `RELEASE_APPROVER` | `RESTORE_APPROVER` |
| 2026-05-18 to 2026-05-25 | update on rotation | update on rotation | `BACKUP_OWNER` | `RELEASE_APPROVER` | `RESTORE_APPROVER` |
