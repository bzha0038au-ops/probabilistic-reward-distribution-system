import { saasBillingAccountVersions, saasTenants } from "@reward/database";
import { sql } from "@reward/database/orm";
import type { SaasBillingCollectionMethod } from "@reward/shared-types/saas";

import { db } from "../../db";
import { logger } from "../../shared/logger";
import { readSqlRows } from "../../shared/sql-result";
import { captureException } from "../../shared/telemetry";
import { getDefaultBillingPeriod } from "./billing";
import { config } from "./billing-service-support";
import { createBillingRun } from "./billing-run-service";

const loadAutoBillingCandidates = async (params: {
  periodStart: Date;
  periodEnd: Date;
  limit: number;
}) => {
  const result = await db.execute(sql`
    WITH before_period AS (
      SELECT DISTINCT ON (${saasBillingAccountVersions.tenantId})
        ${saasBillingAccountVersions.tenantId} AS tenant_id,
        ${saasBillingAccountVersions.collectionMethod} AS collection_method,
        ${saasBillingAccountVersions.autoBillingEnabled} AS auto_billing_enabled,
        ${saasBillingAccountVersions.isBillable} AS is_billable
      FROM ${saasBillingAccountVersions}
      WHERE ${saasBillingAccountVersions.effectiveAt} <= ${params.periodStart}
      ORDER BY
        ${saasBillingAccountVersions.tenantId},
        ${saasBillingAccountVersions.effectiveAt} DESC,
        ${saasBillingAccountVersions.id} DESC
    ),
    within_period AS (
      SELECT DISTINCT ON (${saasBillingAccountVersions.tenantId})
        ${saasBillingAccountVersions.tenantId} AS tenant_id,
        ${saasBillingAccountVersions.collectionMethod} AS collection_method,
        ${saasBillingAccountVersions.autoBillingEnabled} AS auto_billing_enabled,
        ${saasBillingAccountVersions.isBillable} AS is_billable
      FROM ${saasBillingAccountVersions}
      WHERE
        ${saasBillingAccountVersions.effectiveAt} > ${params.periodStart}
        AND ${saasBillingAccountVersions.effectiveAt} < ${params.periodEnd}
      ORDER BY
        ${saasBillingAccountVersions.tenantId},
        ${saasBillingAccountVersions.effectiveAt} ASC,
        ${saasBillingAccountVersions.id} ASC
    ),
    resolved AS (
      SELECT
        COALESCE(before_period.tenant_id, within_period.tenant_id) AS tenant_id,
        COALESCE(before_period.collection_method, within_period.collection_method) AS collection_method,
        COALESCE(before_period.auto_billing_enabled, within_period.auto_billing_enabled) AS auto_billing_enabled,
        COALESCE(before_period.is_billable, within_period.is_billable) AS is_billable
      FROM before_period
      FULL OUTER JOIN within_period
        ON before_period.tenant_id = within_period.tenant_id
    )
    SELECT
      resolved.tenant_id AS "tenantId",
      resolved.collection_method AS "collectionMethod"
    FROM resolved
    INNER JOIN ${saasTenants}
      ON ${saasTenants.id} = resolved.tenant_id
    LEFT JOIN "saas_billing_runs" AS period_runs
      ON period_runs."tenant_id" = resolved.tenant_id
      AND period_runs."period_start" = ${params.periodStart}
      AND period_runs."period_end" = ${params.periodEnd}
    LEFT JOIN "saas_billing_runs" AS completed_runs
      ON completed_runs."tenant_id" = resolved.tenant_id
      AND completed_runs."period_start" = ${params.periodStart}
      AND completed_runs."period_end" = ${params.periodEnd}
      AND (
        completed_runs."status" IN ('sent', 'paid', 'void', 'uncollectible')
        OR (
          completed_runs."status" = 'finalized'
          AND completed_runs."stripe_invoice_id" IS NOT NULL
        )
      )
    WHERE
      ${saasTenants.status} = 'active'
      AND resolved.auto_billing_enabled = true
      AND resolved.is_billable = true
      AND completed_runs."id" IS NULL
    ORDER BY
      CASE WHEN period_runs."id" IS NULL THEN 0 ELSE 1 END ASC,
      resolved.tenant_id ASC
    LIMIT ${params.limit}
  `);

  return readSqlRows<{
    tenantId: number;
    collectionMethod: SaasBillingCollectionMethod;
  }>(result);
};

export async function runSaasBillingAutomationCycle() {
  if (!config.saasBillingAutomationEnabled) {
    return {
      enabled: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      periodStart: null,
      periodEnd: null,
    };
  }

  const { periodStart, periodEnd } = getDefaultBillingPeriod();
  const accounts = await loadAutoBillingCandidates({
    periodStart,
    periodEnd,
    limit: config.saasBillingAutomationBatchSize,
  });

  let succeeded = 0;
  let failed = 0;
  for (const account of accounts) {
    try {
      await createBillingRun(
        {
          tenantId: account.tenantId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          finalize: true,
          sendInvoice: account.collectionMethod === "send_invoice",
        },
        null,
        [],
      );
      succeeded += 1;
    } catch (error) {
      failed += 1;
      captureException(error, {
        tags: {
          alert_priority: "high",
          service_role: "saas_billing_worker",
          payment_subsystem: "automation",
        },
        extra: {
          saasTenantId: account.tenantId,
        },
      });
      logger.error("saas auto billing cycle failed for tenant", {
        saasTenantId: account.tenantId,
        err: error,
      });
    }
  }

  return {
    enabled: true,
    processed: accounts.length,
    succeeded,
    failed,
    periodStart,
    periodEnd,
  };
}
