ALTER TABLE "saas_usage_events"
ADD COLUMN IF NOT EXISTS "decision_type" varchar(32);

UPDATE "saas_usage_events"
SET "decision_type" = CASE
  WHEN "event_type" IN ('reward:write', 'draw:write')
    AND COALESCE("metadata"->>'status', '') = 'won'
    THEN 'payout'
  WHEN "event_type" IN ('reward:write', 'draw:write')
    THEN 'mute'
  ELSE "decision_type"
END
WHERE "decision_type" IS NULL;

CREATE INDEX IF NOT EXISTS "saas_usage_events_billing_run_decision_idx"
ON "saas_usage_events" ("billing_run_id", "decision_type");
