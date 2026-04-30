-- deploy-plan: contract
-- rollback-plan: reversible_sql
-- blast-radius: medium

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_account_versions'::regclass
      AND conname = 'saas_billing_account_versions_billing_account_id_saas_billing_a'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_account_versions'::regclass
      AND conname = 'saas_billing_account_versions_billing_account_fk'
  ) THEN
    ALTER TABLE "saas_billing_account_versions"
      RENAME CONSTRAINT "saas_billing_account_versions_billing_account_id_saas_billing_a"
      TO "saas_billing_account_versions_billing_account_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_runs'::regclass
      AND conname = 'saas_billing_runs_billing_account_id_saas_billing_accounts_id_f'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_runs'::regclass
      AND conname = 'saas_billing_runs_billing_account_fk'
  ) THEN
    ALTER TABLE "saas_billing_runs"
      RENAME CONSTRAINT "saas_billing_runs_billing_account_id_saas_billing_accounts_id_f"
      TO "saas_billing_runs_billing_account_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_runs'::regclass
      AND conname = 'saas_billing_runs_billing_account_version_id_saas_billing_accou'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_runs'::regclass
      AND conname = 'saas_billing_runs_billing_account_version_fk'
  ) THEN
    ALTER TABLE "saas_billing_runs"
      RENAME CONSTRAINT "saas_billing_runs_billing_account_version_id_saas_billing_accou"
      TO "saas_billing_runs_billing_account_version_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_top_ups'::regclass
      AND conname = 'saas_billing_top_ups_billing_account_id_saas_billing_accounts_i'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_billing_top_ups'::regclass
      AND conname = 'saas_billing_top_ups_billing_account_fk'
  ) THEN
    ALTER TABLE "saas_billing_top_ups"
      RENAME CONSTRAINT "saas_billing_top_ups_billing_account_id_saas_billing_accounts_i"
      TO "saas_billing_top_ups_billing_account_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_stripe_webhook_events'::regclass
      AND conname = 'saas_stripe_webhook_events_billing_run_id_saas_billing_runs_id_'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_stripe_webhook_events'::regclass
      AND conname = 'saas_stripe_webhook_events_billing_run_fk'
  ) THEN
    ALTER TABLE "saas_stripe_webhook_events"
      RENAME CONSTRAINT "saas_stripe_webhook_events_billing_run_id_saas_billing_runs_id_"
      TO "saas_stripe_webhook_events_billing_run_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_agent_group_correlations'::regclass
      AND conname = 'saas_agent_group_correlations_draw_record_id_saas_draw_records_'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_agent_group_correlations'::regclass
      AND conname = 'saas_agent_group_correlations_draw_record_fk'
  ) THEN
    ALTER TABLE "saas_agent_group_correlations"
      RENAME CONSTRAINT "saas_agent_group_correlations_draw_record_id_saas_draw_records_"
      TO "saas_agent_group_correlations_draw_record_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_outbound_webhook_deliveries'::regclass
      AND conname = 'saas_outbound_webhook_deliveries_draw_record_id_saas_draw_recor'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_outbound_webhook_deliveries'::regclass
      AND conname = 'saas_outbound_webhook_deliveries_draw_record_fk'
  ) THEN
    ALTER TABLE "saas_outbound_webhook_deliveries"
      RENAME CONSTRAINT "saas_outbound_webhook_deliveries_draw_record_id_saas_draw_recor"
      TO "saas_outbound_webhook_deliveries_draw_record_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_outbound_webhook_deliveries'::regclass
      AND conname = 'saas_outbound_webhook_deliveries_webhook_id_saas_outbound_webho'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saas_outbound_webhook_deliveries'::regclass
      AND conname = 'saas_outbound_webhook_deliveries_webhook_fk'
  ) THEN
    ALTER TABLE "saas_outbound_webhook_deliveries"
      RENAME CONSTRAINT "saas_outbound_webhook_deliveries_webhook_id_saas_outbound_webho"
      TO "saas_outbound_webhook_deliveries_webhook_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.legal_document_publications'::regclass
      AND conname = 'legal_document_publications_change_request_id_config_change_req'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.legal_document_publications'::regclass
      AND conname = 'legal_document_publications_change_request_fk'
  ) THEN
    ALTER TABLE "legal_document_publications"
      RENAME CONSTRAINT "legal_document_publications_change_request_id_config_change_req"
      TO "legal_document_publications_change_request_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.legal_document_acceptances'::regclass
      AND conname = 'legal_document_acceptances_publication_id_legal_document_public'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.legal_document_acceptances'::regclass
      AND conname = 'legal_document_acceptances_publication_fk'
  ) THEN
    ALTER TABLE "legal_document_acceptances"
      RENAME CONSTRAINT "legal_document_acceptances_publication_id_legal_document_public"
      TO "legal_document_acceptances_publication_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prediction_market_appeals'::regclass
      AND conname = 'prediction_market_appeals_oracle_binding_id_prediction_market_o'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prediction_market_appeals'::regclass
      AND conname = 'prediction_market_appeals_oracle_binding_fk'
  ) THEN
    ALTER TABLE "prediction_market_appeals"
      RENAME CONSTRAINT "prediction_market_appeals_oracle_binding_id_prediction_market_o"
      TO "prediction_market_appeals_oracle_binding_fk";
  END IF;
END
$$;
