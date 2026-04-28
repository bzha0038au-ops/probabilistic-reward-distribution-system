ALTER TABLE "saas_tenants"
  ADD COLUMN IF NOT EXISTS "risk_envelope_daily_budget_cap" numeric(14, 2);

ALTER TABLE "saas_tenants"
  ADD COLUMN IF NOT EXISTS "risk_envelope_max_single_payout" numeric(14, 2);

ALTER TABLE "saas_tenants"
  ADD COLUMN IF NOT EXISTS "risk_envelope_variance_cap" numeric(14, 2);

ALTER TABLE "saas_tenants"
  ADD COLUMN IF NOT EXISTS "risk_envelope_emergency_stop" boolean NOT NULL DEFAULT false;
