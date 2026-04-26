CREATE INDEX IF NOT EXISTS draw_records_status_created_idx
  ON draw_records (status, created_at);

CREATE INDEX IF NOT EXISTS ledger_entries_type_user_idx
  ON ledger_entries (type, user_id);
