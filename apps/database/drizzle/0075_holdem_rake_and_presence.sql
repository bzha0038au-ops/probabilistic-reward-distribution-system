ALTER TABLE "holdem_table_seats"
  ADD COLUMN IF NOT EXISTS "presence_heartbeat_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "disconnect_grace_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "seat_lease_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "auto_cash_out_pending" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_seats_disconnect_grace_idx"
  ON "holdem_table_seats" ("disconnect_grace_expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_seats_seat_lease_idx"
  ON "holdem_table_seats" ("seat_lease_expires_at", "auto_cash_out_pending");
--> statement-breakpoint
INSERT INTO "system_config" ("config_key", "config_number", "config_value", "description")
VALUES
  ('holdem.rake_bps', 500.00, NULL, 'Holdem rake in basis points'),
  ('holdem.rake_cap_amount', 8.00, NULL, 'Holdem rake cap per hand'),
  ('holdem.rake_no_flop_no_drop', 1.00, NULL, 'Disable rake when the flop was not dealt'),
  ('holdem.disconnect_grace_seconds', 30.00, NULL, 'Grace window before a disconnected holdem seat is marked sitting out'),
  ('holdem.seat_lease_seconds', 300.00, NULL, 'Seat retention window before a disconnected holdem seat is auto-cashed out')
ON CONFLICT ("config_key") DO NOTHING;
