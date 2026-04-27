import { createHash } from "node:crypto";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasBillingAccountVersions,
  saasBillingRuns,
  saasBillingTopUps,
} from "@reward/database";
import type {
  PrizeEngineApiKeyScope,
  SaasBillingRun,
  SaasBillingRunCreate,
} from "@reward/shared-types/saas";

import { badRequestError } from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
import type { StripeEvent, StripeInvoice } from "./stripe";

export const BILLING_DRAW_EVENT_TYPE: PrizeEngineApiKeyScope = "draw:write";

export const BILLING_RUN_TERMINAL_STATUSES = new Set<SaasBillingRun["status"]>([
  "paid",
  "void",
  "uncollectible",
]);

export const BILLING_RUN_DISPATCHED_STATUSES = new Set<
  SaasBillingRun["status"]
>(["sent", "paid", "void", "uncollectible"]);

export const getDefaultBillingPeriod = (now = new Date()) => {
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const previousMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0),
  );

  return {
    periodStart: previousMonthStart,
    periodEnd: currentMonthStart,
  };
};

export const parseDateInput = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequestError("Invalid billing period.", {
      code: API_ERROR_CODES.INVALID_BILLING_PERIOD,
    });
  }

  return parsed;
};

export const resolveBillingPeriod = (
  payload: Pick<SaasBillingRunCreate, "periodStart" | "periodEnd">,
) => {
  const defaults = getDefaultBillingPeriod();
  const periodStart =
    parseDateInput(payload.periodStart) ?? defaults.periodStart;
  const periodEnd = parseDateInput(payload.periodEnd) ?? defaults.periodEnd;

  if (periodStart >= periodEnd) {
    throw badRequestError("Billing period end must be after period start.", {
      code: API_ERROR_CODES.BILLING_PERIOD_END_MUST_BE_AFTER_START,
    });
  }

  return { periodStart, periodEnd };
};

export const resolveStripeCreditAppliedAmount = (invoice: StripeInvoice) => {
  const startingBalance = Number(invoice.starting_balance ?? 0);
  if (!Number.isFinite(startingBalance) || startingBalance >= 0) {
    return "0.00";
  }

  return toMoneyString(Math.abs(startingBalance) / 100);
};

export const resolveBillingRunStatusFromInvoice = (
  invoice: StripeInvoice,
  previousStatus: SaasBillingRun["status"] = "draft",
  eventType?: string,
): SaasBillingRun["status"] => {
  if (invoice.status === "paid") {
    return "paid";
  }

  if (invoice.status === "void") {
    return "void";
  }

  if (invoice.status === "uncollectible") {
    return "uncollectible";
  }

  if (eventType === "invoice.payment_failed") {
    return "failed";
  }

  if (eventType === "invoice.sent") {
    return "sent";
  }

  if (invoice.status === "open") {
    return previousStatus === "sent" ? "sent" : "finalized";
  }

  if (invoice.status === "draft") {
    return "synced";
  }

  return previousStatus;
};

export const buildBillingInvoiceMetadata = (payload: {
  tenantId: number;
  billingRunId: number;
  periodStart: Date;
  periodEnd: Date;
  fingerprint?: string;
}) => ({
  saasTenantId: String(payload.tenantId),
  saasBillingRunId: String(payload.billingRunId),
  saasPeriodStart: payload.periodStart.toISOString(),
  saasPeriodEnd: payload.periodEnd.toISOString(),
  ...(payload.fingerprint
    ? { saasBillingFingerprint: payload.fingerprint }
    : {}),
});

export const computeWebhookRetryDelayMs = (attempts: number) => {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(5_000 * 2 ** exponent, 15 * 60 * 1000);
};

export const selectBillingAccountVersionForPeriod = (
  rows: Array<typeof saasBillingAccountVersions.$inferSelect>,
  periodStart: Date,
  periodEnd: Date,
) => {
  let latestAtOrBeforeStart:
    | typeof saasBillingAccountVersions.$inferSelect
    | null = null;
  let earliestWithinPeriod:
    | typeof saasBillingAccountVersions.$inferSelect
    | null = null;

  for (const row of rows) {
    if (row.effectiveAt <= periodStart) {
      if (
        !latestAtOrBeforeStart ||
        row.effectiveAt > latestAtOrBeforeStart.effectiveAt ||
        (row.effectiveAt.getTime() ===
          latestAtOrBeforeStart.effectiveAt.getTime() &&
          row.id > latestAtOrBeforeStart.id)
      ) {
        latestAtOrBeforeStart = row;
      }
      continue;
    }

    if (row.effectiveAt >= periodEnd) {
      continue;
    }

    if (
      !earliestWithinPeriod ||
      row.effectiveAt < earliestWithinPeriod.effectiveAt ||
      (row.effectiveAt.getTime() ===
        earliestWithinPeriod.effectiveAt.getTime() &&
        row.id < earliestWithinPeriod.id)
    ) {
      earliestWithinPeriod = row;
    }
  }

  return latestAtOrBeforeStart ?? earliestWithinPeriod;
};

const buildSaasStripeIdempotencyKey = (
  prefix: string,
  parts: Array<string | number | boolean | null | undefined>,
) => {
  const payload = JSON.stringify(parts.map((part) => part ?? null));
  return `${prefix}:${createHash("sha256").update(payload).digest("hex")}`;
};

export const buildBillingRunStripeFingerprint = (
  run: Pick<
    typeof saasBillingRuns.$inferSelect,
    | "id"
    | "tenantId"
    | "periodStart"
    | "periodEnd"
    | "currency"
    | "baseFeeAmount"
    | "usageFeeAmount"
    | "stripeCustomerId"
  >,
) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        run.id,
        run.tenantId,
        run.periodStart.toISOString(),
        run.periodEnd.toISOString(),
        run.currency,
        toMoneyString(run.baseFeeAmount),
        toMoneyString(run.usageFeeAmount),
        run.stripeCustomerId ?? null,
      ]),
    )
    .digest("hex");

export const buildBillingRunInvoiceCreateIdempotencyKey = (
  run: Pick<
    typeof saasBillingRuns.$inferSelect,
    | "id"
    | "tenantId"
    | "periodStart"
    | "periodEnd"
    | "currency"
    | "baseFeeAmount"
    | "usageFeeAmount"
    | "stripeCustomerId"
  >,
) =>
  buildSaasStripeIdempotencyKey("saas-billing-run-invoice-create", [
    buildBillingRunStripeFingerprint(run),
  ]);

export const buildBillingRunInvoiceLineItemIdempotencyKey = (
  run: Pick<
    typeof saasBillingRuns.$inferSelect,
    | "id"
    | "tenantId"
    | "periodStart"
    | "periodEnd"
    | "currency"
    | "baseFeeAmount"
    | "usageFeeAmount"
    | "stripeCustomerId"
  >,
  lineType: "base_fee" | "usage_fee",
) =>
  buildSaasStripeIdempotencyKey("saas-billing-run-invoice-line-item", [
    buildBillingRunStripeFingerprint(run),
    lineType,
  ]);

export const buildBillingRunInvoiceActionIdempotencyKey = (
  run: Pick<
    typeof saasBillingRuns.$inferSelect,
    | "id"
    | "tenantId"
    | "periodStart"
    | "periodEnd"
    | "currency"
    | "baseFeeAmount"
    | "usageFeeAmount"
    | "stripeCustomerId"
  >,
  action: "finalize" | "send" | "pay",
  extra?: string | number | boolean | null,
) =>
  buildSaasStripeIdempotencyKey("saas-billing-run-invoice-action", [
    buildBillingRunStripeFingerprint(run),
    action,
    extra ?? null,
  ]);

export const buildBillingTopUpIdempotencyKey = (
  topUp: Pick<
    typeof saasBillingTopUps.$inferSelect,
    "id" | "tenantId" | "amount" | "currency" | "stripeCustomerId"
  >,
) =>
  buildSaasStripeIdempotencyKey("saas-billing-top-up", [
    topUp.id,
    topUp.tenantId,
    toMoneyString(topUp.amount),
    topUp.currency,
    topUp.stripeCustomerId ?? null,
  ]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readStringField = (
  source: Record<string, unknown>,
  key: string,
) => {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
};

export const readNumberField = (
  source: Record<string, unknown>,
  key: string,
) => {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const parseStripeInvoiceObject = (
  value: unknown,
): StripeInvoice | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = readStringField(value, "id");
  if (!id) {
    return null;
  }

  const customerValue = value.customer;
  const customer =
    typeof customerValue === "string"
      ? customerValue
      : isRecord(customerValue) && typeof customerValue.id === "string"
        ? { id: customerValue.id }
        : null;
  const statusTransitionsValue = value.status_transitions;
  const statusTransitions = isRecord(statusTransitionsValue)
    ? {
        finalized_at: readNumberField(statusTransitionsValue, "finalized_at"),
        paid_at: readNumberField(statusTransitionsValue, "paid_at"),
      }
    : null;
  const metadataValue = value.metadata;
  const metadata = isRecord(metadataValue)
    ? Object.fromEntries(
        Object.entries(metadataValue).map(([key, fieldValue]) => [
          key,
          typeof fieldValue === "string" ? fieldValue : undefined,
        ]),
      )
    : null;

  return {
    id,
    customer,
    metadata,
    status: readStringField(value, "status"),
    hosted_invoice_url: readStringField(value, "hosted_invoice_url"),
    invoice_pdf: readStringField(value, "invoice_pdf"),
    starting_balance: readNumberField(value, "starting_balance"),
    amount_due: readNumberField(value, "amount_due"),
    total: readNumberField(value, "total"),
    status_transitions: statusTransitions,
  };
};

export const parseStripeEventObject = (value: unknown): StripeEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = readStringField(value, "id");
  const type = readStringField(value, "type");
  const dataValue = value.data;
  if (!id || !type || !isRecord(dataValue)) {
    return null;
  }

  return {
    id,
    type,
    created: readNumberField(value, "created") ?? undefined,
    data: {
      object: dataValue.object,
    },
  };
};

export const resolveStripeInvoiceCustomerId = (invoice: StripeInvoice) =>
  typeof invoice.customer === "string"
    ? invoice.customer
    : (invoice.customer?.id ?? null);
