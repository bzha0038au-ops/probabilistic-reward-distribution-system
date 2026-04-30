ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_status" varchar(32) DEFAULT 'idle' NOT NULL;

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_action" varchar(64);

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_stage" varchar(64);

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_error" text;

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_recovery_path" varchar(128);

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_observed_invoice_status" varchar(64);

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_event_type" varchar(128);

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_revision" integer DEFAULT 0 NOT NULL;

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_attempted_at" timestamp with time zone;

ALTER TABLE "saas_billing_runs"
  ADD COLUMN IF NOT EXISTS "external_sync_completed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "saas_billing_runs_external_sync_status_updated_idx"
  ON "saas_billing_runs" ("external_sync_status", "updated_at");

UPDATE "saas_billing_runs"
SET
  "external_sync_status" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      AND ("metadata"->'externalSync'->>'lastResult') = 'succeeded'
      THEN 'succeeded'
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      AND ("metadata"->'externalSync'->>'lastResult') = 'failed'
      THEN 'failed'
    WHEN "status" = 'failed'
      THEN 'failed'
    WHEN "stripe_invoice_id" IS NOT NULL
      OR "synced_at" IS NOT NULL
      OR "status" IN ('synced', 'finalized', 'sent', 'paid', 'void', 'uncollectible')
      THEN 'succeeded'
    ELSE 'idle'
  END,
  "external_sync_action" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      AND ("metadata"->'externalSync'->>'lastAction') IN (
        'sync',
        'sync_and_finalize',
        'sync_and_send',
        'refresh',
        'settle',
        'reconciliation',
        'stripe_webhook'
      )
      THEN "metadata"->'externalSync'->>'lastAction'
    ELSE NULL
  END,
  "external_sync_stage" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      AND ("metadata"->'externalSync'->>'lastStage') IN (
        'precondition',
        'invoice_lookup',
        'invoice_finalize',
        'invoice_send',
        'invoice_retrieve',
        'invoice_pay',
        'invoice_refresh',
        'invoice_reconcile',
        'invoice_webhook',
        'persist_invoice_state'
      )
      THEN "metadata"->'externalSync'->>'lastStage'
    WHEN "status" = 'failed'
      THEN 'precondition'
    WHEN "stripe_invoice_id" IS NOT NULL
      OR "synced_at" IS NOT NULL
      OR "status" IN ('synced', 'finalized', 'sent', 'paid', 'void', 'uncollectible')
      THEN 'persist_invoice_state'
    ELSE NULL
  END,
  "external_sync_error" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      THEN NULLIF("metadata"->'externalSync'->>'lastError', '')
    WHEN "status" = 'failed'
      THEN 'Historical billing sync failure.'
    ELSE NULL
  END,
  "external_sync_recovery_path" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      THEN NULLIF("metadata"->'externalSync'->>'recoveryPath', '')
    WHEN "status" = 'failed'
      THEN 'retry_sync_or_wait_for_reconciliation'
    ELSE NULL
  END,
  "external_sync_observed_invoice_status" = COALESCE(
    CASE
      WHEN jsonb_typeof("metadata") = 'object'
        AND jsonb_typeof("metadata"->'externalSync') = 'object'
        THEN NULLIF("metadata"->'externalSync'->>'observedInvoiceStatus', '')
      ELSE NULL
    END,
    "stripe_invoice_status"
  ),
  "external_sync_event_type" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      AND jsonb_typeof("metadata"->'externalSync') = 'object'
      THEN NULLIF("metadata"->'externalSync'->>'eventType', '')
    ELSE NULL
  END,
  "external_sync_attempted_at" = COALESCE(
    CASE
      WHEN jsonb_typeof("metadata") = 'object'
        AND jsonb_typeof("metadata"->'externalSync') = 'object'
        AND COALESCE("metadata"->'externalSync'->>'lastAttemptAt', '') <> ''
        THEN ("metadata"->'externalSync'->>'lastAttemptAt')::timestamp with time zone
      ELSE NULL
    END,
    CASE
      WHEN "status" = 'failed'
        OR "stripe_invoice_id" IS NOT NULL
        OR "synced_at" IS NOT NULL
        OR "status" IN ('synced', 'finalized', 'sent', 'paid', 'void', 'uncollectible')
        THEN COALESCE("synced_at", "paid_at", "sent_at", "finalized_at", "updated_at")
      ELSE NULL
    END
  ),
  "external_sync_completed_at" = COALESCE(
    CASE
      WHEN jsonb_typeof("metadata") = 'object'
        AND jsonb_typeof("metadata"->'externalSync') = 'object'
        AND COALESCE("metadata"->'externalSync'->>'lastAttemptAt', '') <> ''
        AND COALESCE("metadata"->'externalSync'->>'lastResult', '') IN ('succeeded', 'failed')
        THEN ("metadata"->'externalSync'->>'lastAttemptAt')::timestamp with time zone
      ELSE NULL
    END,
    CASE
      WHEN "status" = 'failed'
        OR "stripe_invoice_id" IS NOT NULL
        OR "synced_at" IS NOT NULL
        OR "status" IN ('synced', 'finalized', 'sent', 'paid', 'void', 'uncollectible')
        THEN COALESCE("synced_at", "paid_at", "sent_at", "finalized_at", "updated_at")
      ELSE NULL
    END
  ),
  "metadata" = CASE
    WHEN jsonb_typeof("metadata") = 'object'
      THEN "metadata" - 'externalSync'
    ELSE "metadata"
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'saas_billing_runs_external_sync_state_check'
  ) THEN
    ALTER TABLE "saas_billing_runs"
      ADD CONSTRAINT "saas_billing_runs_external_sync_state_check" CHECK (
        (
          "external_sync_status" = 'idle'
          AND "external_sync_action" IS NULL
          AND "external_sync_stage" IS NULL
          AND "external_sync_error" IS NULL
          AND "external_sync_recovery_path" IS NULL
          AND "external_sync_attempted_at" IS NULL
          AND "external_sync_completed_at" IS NULL
        )
        OR (
          "external_sync_status" = 'processing'
          AND "external_sync_action" IS NOT NULL
          AND "external_sync_stage" IS NOT NULL
          AND "external_sync_error" IS NULL
          AND "external_sync_recovery_path" IS NULL
          AND "external_sync_attempted_at" IS NOT NULL
          AND "external_sync_completed_at" IS NULL
        )
        OR (
          "external_sync_status" = 'succeeded'
          AND "external_sync_action" IS NOT NULL
          AND "external_sync_stage" IS NOT NULL
          AND "external_sync_error" IS NULL
          AND "external_sync_recovery_path" IS NULL
          AND "external_sync_attempted_at" IS NOT NULL
          AND "external_sync_completed_at" IS NOT NULL
        )
        OR (
          "external_sync_status" = 'failed'
          AND "external_sync_action" IS NOT NULL
          AND "external_sync_stage" IS NOT NULL
          AND "external_sync_error" IS NOT NULL
          AND "external_sync_recovery_path" IS NOT NULL
          AND "external_sync_attempted_at" IS NOT NULL
          AND "external_sync_completed_at" IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_saas_billing_run_external_sync_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."external_sync_status" = NEW."external_sync_status" THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'idle'
    AND NEW."external_sync_status" = 'processing' THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'processing'
    AND NEW."external_sync_status" IN ('processing', 'succeeded', 'failed') THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'succeeded'
    AND NEW."external_sync_status" IN ('processing', 'succeeded') THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'failed'
    AND NEW."external_sync_status" IN ('processing', 'failed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Invalid saas_billing_runs.external_sync_status transition: % -> %',
    OLD."external_sync_status",
    NEW."external_sync_status";
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.saas_billing_runs'::regclass
      AND tgname = 'saas_billing_run_external_sync_transition_guard'
      AND NOT tgisinternal
  ) THEN
    DROP TRIGGER saas_billing_run_external_sync_transition_guard
      ON "saas_billing_runs";
  END IF;
END
$$;

CREATE TRIGGER saas_billing_run_external_sync_transition_guard
BEFORE UPDATE ON "saas_billing_runs"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_saas_billing_run_external_sync_transition();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'saas_billing_runs_external_sync_completed_order_check'
  ) THEN
    ALTER TABLE "saas_billing_runs"
      ADD CONSTRAINT "saas_billing_runs_external_sync_completed_order_check" CHECK (
        "external_sync_completed_at" IS NULL
        OR (
          "external_sync_attempted_at" IS NOT NULL
          AND "external_sync_completed_at" >= "external_sync_attempted_at"
        )
      );
  END IF;
END
$$;
