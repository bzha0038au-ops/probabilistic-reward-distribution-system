import { createHmac } from "node:crypto";
import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasBillingAccounts,
  saasTenants,
  saasUsageEvents,
} from "@reward/database";
import { and, eq, sql } from "@reward/database/orm";
import type {
  SaasBillingBudgetPolicyPatch,
  SaasTenantBillingInsights,
} from "@reward/shared-types/saas";

import { db, type DbClient, type DbTransaction } from "../../db";
import { getConfigView } from "../../shared/config";
import { notFoundError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { captureException } from "../../shared/telemetry";
import { sendSaasBillingBudgetAlertNotification } from "../auth/notification-service";
import { type SaasAdminActor, assertTenantCapability } from "./access";
import {
  applySaasBillingBudgetPolicyPatch,
  hasSaasBillingBudgetAlertBeenSent,
  isSaasBillingHardCapActive,
  markSaasBillingBudgetAlertSent,
  readSaasBillingBudgetPolicy,
  readSaasBillingBudgetWebhookSecret,
  resolveBillingBudgetMonthKey,
  type BillingBudgetAlertKind,
} from "./billing-budget";
import { loadTenantBillingContext } from "./billing-service-support";
import { toSaasBilling } from "./records";

const config = getConfigView();
const DAILY_REPORT_DAYS = 14;
const FORECAST_WINDOW_DAYS = 30;

type BillingAccountRow = typeof saasBillingAccounts.$inferSelect;
type TenantRow = typeof saasTenants.$inferSelect;

type DailyUsageRow = {
  usageDate: Date | string;
  usageAmount: string;
};

type BillingMonthWindow = {
  monthKey: string;
  monthStart: Date;
  monthEnd: Date;
  generatedAt: Date;
  historyStart: Date;
  dailyReportStart: Date;
  daysElapsed: number;
  daysRemaining: number;
};

type TenantBillingAlertPayload = {
  eventType:
    | "billing.threshold_exceeded"
    | "billing.forecast_7d_exceeded"
    | "billing.forecast_30d_exceeded"
    | "billing.hard_cap_reached";
  tenantId: number;
  tenantName: string;
  currency: string;
  month: string;
  currentTotalAmount: string;
  currentUsageAmount: string;
  monthlyBudget: string | null;
  budgetThresholdAmount: string | null;
  hardCap: string | null;
  projectedTotalAmount7d: string;
  projectedTotalAmount30d: string;
  dailyRunRate7d: string;
  dailyRunRate30d: string;
  hardCapReachedAt: string | null;
};

const startOfUtcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const addUtcDays = (value: Date, days: number) =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000);

const resolveCurrentBillingMonthWindow = (now = new Date()): BillingMonthWindow => {
  const generatedAt = now;
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  const reportEnd = startOfUtcDay(now);
  const historyStart = addUtcDays(reportEnd, -(FORECAST_WINDOW_DAYS - 1));
  const dailyReportStart = addUtcDays(reportEnd, -(DAILY_REPORT_DAYS - 1));
  const totalDaysInMonth = Math.max(
    Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000),
    1,
  );
  const daysElapsed = Math.min(
    totalDaysInMonth,
    Math.max(
      1,
      Math.floor((reportEnd.getTime() - monthStart.getTime()) / 86_400_000) + 1,
    ),
  );

  return {
    monthKey: resolveBillingBudgetMonthKey(now),
    monthStart,
    monthEnd,
    generatedAt,
    historyStart,
    dailyReportStart,
    daysElapsed,
    daysRemaining: Math.max(totalDaysInMonth - daysElapsed, 0),
  };
};

const toDecimal = (value: Decimal.Value) => new Decimal(value ?? 0);

const readUsageRowsForTenant = async (
  database: DbClient | DbTransaction,
  tenantId: number,
  window: BillingMonthWindow,
) => {
  const historyStart = window.historyStart.toISOString();
  const generatedAt = window.generatedAt.toISOString();
  const result = await database.execute(sql`
    SELECT
      date_trunc('day', ${saasUsageEvents.createdAt}) AS "usageDate",
      coalesce(sum(${saasUsageEvents.amount}), 0)::text AS "usageAmount"
    FROM ${saasUsageEvents}
    WHERE ${saasUsageEvents.tenantId} = ${tenantId}
      AND ${saasUsageEvents.environment} = 'live'
      AND ${saasUsageEvents.createdAt} >= ${historyStart}
      AND ${saasUsageEvents.createdAt} < ${generatedAt}
      AND coalesce(${saasUsageEvents.metadata} ->> 'billable', 'true') <> 'false'
    GROUP BY 1
    ORDER BY 1
  `);

  return readSqlRows<DailyUsageRow>(result);
};

const buildUsageMap = (rows: DailyUsageRow[]) => {
  const map = new Map<string, Decimal>();

  for (const row of rows) {
    const parsed =
      row.usageDate instanceof Date ? row.usageDate : new Date(row.usageDate);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    map.set(parsed.toISOString().slice(0, 10), toDecimal(row.usageAmount));
  }

  return map;
};

const sumUsage = (
  usageByDay: Map<string, Decimal>,
  start: Date,
  dayCount: number,
) => {
  let total = new Decimal(0);
  for (let offset = 0; offset < dayCount; offset += 1) {
    const key = addUtcDays(start, offset).toISOString().slice(0, 10);
    total = total.plus(usageByDay.get(key) ?? 0);
  }
  return total;
};

const buildForecastScenario = (payload: {
  trailingDays: number;
  trailingUsageAmount: Decimal;
  currentUsageAmount: Decimal;
  daysRemaining: number;
  baseMonthlyFee: Decimal;
  monthlyBudget: Decimal | null;
}) => {
  const dailyRunRate = payload.trailingUsageAmount.div(payload.trailingDays);
  const projectedUsageAmount = payload.currentUsageAmount.plus(
    dailyRunRate.mul(payload.daysRemaining),
  );
  const projectedTotalAmount = payload.baseMonthlyFee.plus(projectedUsageAmount);

  return {
    trailingDays: payload.trailingDays,
    dailyRunRate: toMoneyString(dailyRunRate),
    projectedUsageAmount: toMoneyString(projectedUsageAmount),
    projectedTotalAmount: toMoneyString(projectedTotalAmount),
    exceedsBudget:
      payload.monthlyBudget !== null &&
      projectedTotalAmount.gte(payload.monthlyBudget),
  };
};

export const buildSaasTenantBillingInsights = (params: {
  tenantId: number;
  currency: string;
  baseMonthlyFee: string;
  metadata: unknown;
  usageRows: DailyUsageRow[];
  now?: Date;
}): SaasTenantBillingInsights => {
  const window = resolveCurrentBillingMonthWindow(params.now);
  const policy = readSaasBillingBudgetPolicy(params.metadata);
  const usageByDay = buildUsageMap(params.usageRows);
  const baseMonthlyFee = toDecimal(params.baseMonthlyFee);

  const currentUsageAmount = sumUsage(
    usageByDay,
    window.monthStart,
    window.daysElapsed,
  );
  const trailing7dUsageAmount = sumUsage(usageByDay, addUtcDays(startOfUtcDay(window.generatedAt), -6), 7);
  const trailing30dUsageAmount = sumUsage(
    usageByDay,
    window.historyStart,
    FORECAST_WINDOW_DAYS,
  );
  const currentTotalAmount = baseMonthlyFee.plus(currentUsageAmount);
  const monthlyBudget = policy.monthlyBudget ? toDecimal(policy.monthlyBudget) : null;
  const hardCap = policy.hardCap ? toDecimal(policy.hardCap) : null;
  const budgetThresholdAmount =
    monthlyBudget !== null && policy.alertThresholdPct !== null
      ? monthlyBudget.mul(policy.alertThresholdPct).div(100)
      : null;

  const trailing7d = buildForecastScenario({
    trailingDays: 7,
    trailingUsageAmount: trailing7dUsageAmount,
    currentUsageAmount,
    daysRemaining: window.daysRemaining,
    baseMonthlyFee,
    monthlyBudget,
  });
  const trailing30d = buildForecastScenario({
    trailingDays: FORECAST_WINDOW_DAYS,
    trailingUsageAmount: trailing30dUsageAmount,
    currentUsageAmount,
    daysRemaining: window.daysRemaining,
    baseMonthlyFee,
    monthlyBudget,
  });

  const thresholdBreached =
    budgetThresholdAmount !== null &&
    currentTotalAmount.gte(budgetThresholdAmount);
  const hardCapReached =
    isSaasBillingHardCapActive(params.metadata, window.generatedAt) ||
    (hardCap !== null && currentTotalAmount.gte(hardCap));

  const dailyReport = Array.from({ length: DAILY_REPORT_DAYS }, (_, index) => {
    const date = addUtcDays(window.dailyReportStart, index);
    const key = date.toISOString().slice(0, 10);
    const usageAmount = usageByDay.get(key) ?? new Decimal(0);
    const totalAmount =
      key === window.monthStart.toISOString().slice(0, 10)
        ? usageAmount.plus(baseMonthlyFee)
        : usageAmount;

    return {
      date,
      usageAmount: toMoneyString(usageAmount),
      totalAmount: toMoneyString(totalAmount),
    };
  });

  return {
    tenantId: params.tenantId,
    currency: params.currency,
    window: {
      monthStart: window.monthStart,
      monthEnd: window.monthEnd,
      generatedAt: window.generatedAt,
      daysElapsed: window.daysElapsed,
      daysRemaining: window.daysRemaining,
    },
    budgetPolicy: policy,
    summary: {
      baseMonthlyFee: toMoneyString(baseMonthlyFee),
      currentUsageAmount: toMoneyString(currentUsageAmount),
      currentTotalAmount: toMoneyString(currentTotalAmount),
      trailing7dUsageAmount: toMoneyString(trailing7dUsageAmount),
      trailing30dUsageAmount: toMoneyString(trailing30dUsageAmount),
      monthlyBudget: monthlyBudget ? toMoneyString(monthlyBudget) : null,
      budgetThresholdAmount: budgetThresholdAmount
        ? toMoneyString(budgetThresholdAmount)
        : null,
      hardCap: hardCap ? toMoneyString(hardCap) : null,
      remainingBudgetAmount:
        monthlyBudget !== null
          ? toMoneyString(Decimal.max(monthlyBudget.minus(currentTotalAmount), 0))
          : null,
      remainingHardCapAmount:
        hardCap !== null
          ? toMoneyString(Decimal.max(hardCap.minus(currentTotalAmount), 0))
          : null,
      thresholdBreached,
      hardCapReached,
    },
    forecasts: {
      trailing7d,
      trailing30d,
    },
    alerts: {
      thresholdExceeded: thresholdBreached,
      forecast7dExceeded: trailing7d.exceedsBudget,
      forecast30dExceeded: trailing30d.exceedsBudget,
      hardCapReached,
    },
    dailyReport,
  };
};

export async function getSaasTenantBillingInsights(
  tenantId: number,
  actor?: SaasAdminActor,
) {
  await assertTenantCapability(actor ?? null, tenantId, "tenant:read");

  const { billingAccount } = await loadTenantBillingContext(tenantId);
  const usageRows = await readUsageRowsForTenant(
    db,
    tenantId,
    resolveCurrentBillingMonthWindow(),
  );

  return buildSaasTenantBillingInsights({
    tenantId,
    currency: billingAccount.currency,
    baseMonthlyFee: toMoneyString(billingAccount.baseMonthlyFee),
    metadata: billingAccount.metadata,
    usageRows,
  });
}

export async function updateSaasBillingBudgetPolicy(
  payload: SaasBillingBudgetPolicyPatch,
  actor?: SaasAdminActor,
) {
  await assertTenantCapability(actor ?? null, payload.tenantId, "billing:write");

  const { billingAccount } = await loadTenantBillingContext(payload.tenantId);
  const metadata = applySaasBillingBudgetPolicyPatch(billingAccount.metadata, {
    monthlyBudget: payload.monthlyBudget,
    alertThresholdPct: payload.alertThresholdPct,
    hardCap: payload.hardCap,
    alertEmailEnabled: payload.alertEmailEnabled,
    alertWebhookUrl: payload.alertWebhookUrl,
    alertWebhookSecret: payload.alertWebhookSecret,
    clearAlertWebhook: payload.clearAlertWebhook,
  });

  const [updated] = await db
    .update(saasBillingAccounts)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(saasBillingAccounts.id, billingAccount.id))
    .returning();

  if (!updated) {
    throw notFoundError("Billing account not configured.", {
      code: API_ERROR_CODES.BILLING_ACCOUNT_NOT_CONFIGURED,
    });
  }

  return toSaasBilling(updated);
}

const buildAlertPayload = (
  tenant: TenantRow,
  billingAccount: BillingAccountRow,
  insights: SaasTenantBillingInsights,
  kind: BillingBudgetAlertKind,
): TenantBillingAlertPayload => ({
  eventType:
    kind === "threshold"
      ? "billing.threshold_exceeded"
      : kind === "forecast7d"
        ? "billing.forecast_7d_exceeded"
        : kind === "forecast30d"
          ? "billing.forecast_30d_exceeded"
          : "billing.hard_cap_reached",
  tenantId: tenant.id,
  tenantName: tenant.name,
  currency: billingAccount.currency,
  month: resolveBillingBudgetMonthKey(insights.window.generatedAt as Date),
  currentTotalAmount: insights.summary.currentTotalAmount,
  currentUsageAmount: insights.summary.currentUsageAmount,
  monthlyBudget: insights.summary.monthlyBudget,
  budgetThresholdAmount: insights.summary.budgetThresholdAmount,
  hardCap: insights.summary.hardCap,
  projectedTotalAmount7d: insights.forecasts.trailing7d.projectedTotalAmount,
  projectedTotalAmount30d: insights.forecasts.trailing30d.projectedTotalAmount,
  dailyRunRate7d: insights.forecasts.trailing7d.dailyRunRate,
  dailyRunRate30d: insights.forecasts.trailing30d.dailyRunRate,
  hardCapReachedAt:
    typeof insights.budgetPolicy.state.hardCapReachedAt === "string"
      ? insights.budgetPolicy.state.hardCapReachedAt
      : insights.budgetPolicy.state.hardCapReachedAt instanceof Date
        ? insights.budgetPolicy.state.hardCapReachedAt.toISOString()
        : null,
});

const dispatchTenantBudgetWebhookAlert = async (
  metadata: unknown,
  payload: TenantBillingAlertPayload,
) => {
  const policy = readSaasBillingBudgetPolicy(metadata);
  const secret = readSaasBillingBudgetWebhookSecret(metadata);
  if (!policy.alertWebhookUrl || !secret) {
    return false;
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.saasOutboundWebhookRequestTimeoutMs,
  );

  try {
    const response = await fetch(policy.alertWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "reward-saas-billing-alert/1.0",
        "x-reward-billing-event": payload.eventType,
        "x-reward-billing-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Billing alert webhook returned ${response.status} ${response.statusText}`,
      );
    }

    return true;
  } finally {
    clearTimeout(timeout);
  }
};

const queueBudgetAlertEmail = async (
  tenant: TenantRow,
  billingAccount: BillingAccountRow,
  insights: SaasTenantBillingInsights,
  payload: TenantBillingAlertPayload,
) => {
  const policy = readSaasBillingBudgetPolicy(billingAccount.metadata);
  if (!policy.alertEmailEnabled || !tenant.billingEmail) {
    return false;
  }

  await sendSaasBillingBudgetAlertNotification({
    email: tenant.billingEmail,
    tenantName: tenant.name,
    eventType: payload.eventType,
    currency: billingAccount.currency,
    month: payload.month,
    currentTotalAmount: insights.summary.currentTotalAmount,
    currentUsageAmount: insights.summary.currentUsageAmount,
    monthlyBudget: insights.summary.monthlyBudget,
    budgetThresholdAmount: insights.summary.budgetThresholdAmount,
    hardCap: insights.summary.hardCap,
    projectedTotalAmount7d: insights.forecasts.trailing7d.projectedTotalAmount,
    projectedTotalAmount30d: insights.forecasts.trailing30d.projectedTotalAmount,
    dailyRunRate7d: insights.forecasts.trailing7d.dailyRunRate,
    dailyRunRate30d: insights.forecasts.trailing30d.dailyRunRate,
    hardCapReachedAt: payload.hardCapReachedAt,
  });

  return true;
};

export async function runSaasBillingBudgetAlertCycle(now = new Date()) {
  const rows = await db
    .select({
      tenant: saasTenants,
      billingAccount: saasBillingAccounts,
    })
    .from(saasBillingAccounts)
    .innerJoin(saasTenants, eq(saasBillingAccounts.tenantId, saasTenants.id))
    .where(and(eq(saasBillingAccounts.isBillable, true), eq(saasTenants.status, "active")));

  let alerted = 0;
  let emailQueued = 0;
  let webhookDelivered = 0;
  let failed = 0;

  for (const row of rows) {
    const policy = readSaasBillingBudgetPolicy(row.billingAccount.metadata);
    const hasBudgetSignals = Boolean(policy.monthlyBudget || policy.hardCap);
    if (!hasBudgetSignals) {
      continue;
    }

    try {
      const usageRows = await readUsageRowsForTenant(
        db,
        row.tenant.id,
        resolveCurrentBillingMonthWindow(now),
      );
      const insights = buildSaasTenantBillingInsights({
        tenantId: row.tenant.id,
        currency: row.billingAccount.currency,
        baseMonthlyFee: toMoneyString(row.billingAccount.baseMonthlyFee),
        metadata: row.billingAccount.metadata,
        usageRows,
        now,
      });

      const kinds: BillingBudgetAlertKind[] = [];
      if (
        insights.alerts.thresholdExceeded &&
        !hasSaasBillingBudgetAlertBeenSent(
          row.billingAccount.metadata,
          "threshold",
          now,
        )
      ) {
        kinds.push("threshold");
      }
      if (
        insights.alerts.forecast7dExceeded &&
        !hasSaasBillingBudgetAlertBeenSent(
          row.billingAccount.metadata,
          "forecast7d",
          now,
        )
      ) {
        kinds.push("forecast7d");
      }
      if (
        insights.alerts.forecast30dExceeded &&
        !hasSaasBillingBudgetAlertBeenSent(
          row.billingAccount.metadata,
          "forecast30d",
          now,
        )
      ) {
        kinds.push("forecast30d");
      }
      if (
        insights.alerts.hardCapReached &&
        !hasSaasBillingBudgetAlertBeenSent(
          row.billingAccount.metadata,
          "hardCap",
          now,
        )
      ) {
        kinds.push("hardCap");
      }

      let nextMetadata = row.billingAccount.metadata;
      for (const kind of kinds) {
        const payload = buildAlertPayload(
          row.tenant,
          row.billingAccount,
          insights,
          kind,
        );

        try {
          if (
            await queueBudgetAlertEmail(
              row.tenant,
              row.billingAccount,
              insights,
              payload,
            )
          ) {
            emailQueued += 1;
          }
        } catch (error) {
          failed += 1;
          logger.error("saas billing budget email alert failed", {
            err: error,
            tenantId: row.tenant.id,
            kind,
          });
          captureException(error, {
            tags: {
              alert_priority: "medium",
              service_role: "saas_billing_worker",
              payment_subsystem: "billing_budget_email",
            },
          });
        }

        try {
          if (await dispatchTenantBudgetWebhookAlert(nextMetadata, payload)) {
            webhookDelivered += 1;
          }
        } catch (error) {
          failed += 1;
          logger.error("saas billing budget webhook alert failed", {
            err: error,
            tenantId: row.tenant.id,
            kind,
          });
          captureException(error, {
            tags: {
              alert_priority: "medium",
              service_role: "saas_billing_worker",
              payment_subsystem: "billing_budget_webhook",
            },
          });
        }

        nextMetadata = markSaasBillingBudgetAlertSent(nextMetadata, kind, now);
        alerted += 1;
      }

      if (kinds.length > 0) {
        await db
          .update(saasBillingAccounts)
          .set({
            metadata: nextMetadata,
            updatedAt: new Date(),
          })
          .where(eq(saasBillingAccounts.id, row.billingAccount.id));
      }
    } catch (error) {
      failed += 1;
      logger.error("saas billing budget alert cycle tenant failed", {
        err: error,
        tenantId: row.tenant.id,
      });
      captureException(error, {
        tags: {
          alert_priority: "medium",
          service_role: "saas_billing_worker",
          payment_subsystem: "billing_budget_cycle",
        },
      });
    }
  }

  return {
    scanned: rows.length,
    alerted,
    emailQueued,
    webhookDelivered,
    failed,
  };
}
