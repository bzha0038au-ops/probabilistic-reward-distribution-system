import Decimal from "decimal.js";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core/query-builders/update";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasBillingAccounts,
  saasBillingAccountVersions,
  saasBillingRuns,
  saasBillingTopUps,
  saasTenants,
} from "@reward/database";
import { and, eq, sql } from "@reward/database/orm";
import type {
  SaasBillingCollectionMethod,
  SaasBillingRunExternalSyncAction,
  SaasBillingRunExternalSyncStage,
} from "@reward/shared-types/saas";

import { db } from "../../db";
import { getConfigView } from "../../shared/config";
import { badRequestError, notFoundError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import {
  BILLING_RUN_DISPATCHED_STATUSES,
  BILLING_RUN_TERMINAL_STATUSES,
  billingRunSyncConflictError,
  buildBillingInvoiceMetadata,
  buildBillingRunInvoiceCreateIdempotencyKey,
  buildBillingRunInvoiceLineItemIdempotencyKey,
  buildBillingRunStripeFingerprint,
  readBillingRunDecisionBreakdown,
  resolveBillingRunExternalSyncTransition,
  resolveBillingDecisionPricing,
  parseStripeInvoiceObject,
  resolveBillingRunStatusFromInvoice,
  resolveStripeCreditAppliedAmount,
} from "./billing";
import {
  readSaasBillingBudgetPolicy,
  redactBillingMetadata,
} from "./billing-budget";
import {
  getSaasStripeClient,
  getSaasStripeInvoiceDueDays,
  normalizeStripeCurrency,
  type StripeBalanceTransaction,
  type StripeEvent,
  type StripeInvoice,
  toStripeAmount,
} from "./stripe";
import {
  normalizeMetadata,
  toSaasBillingRun,
  toSaasBillingTopUp,
} from "./records";

export const config = getConfigView();

export const loadTenantBillingContext = async (tenantId: number) => {
  const [tenant] = await db
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw notFoundError("Tenant not found.", {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  const [billingAccount] = await db
    .select()
    .from(saasBillingAccounts)
    .where(eq(saasBillingAccounts.tenantId, tenantId))
    .limit(1);

  if (!billingAccount) {
    throw notFoundError("Billing account not configured.", {
      code: API_ERROR_CODES.BILLING_ACCOUNT_NOT_CONFIGURED,
    });
  }

  return { tenant, billingAccount };
};

export const buildBillingAccountSnapshot = (
  row: typeof saasBillingAccountVersions.$inferSelect,
) => ({
  billingAccountVersionId: row.id,
  billingAccountId: row.billingAccountId,
  tenantId: row.tenantId,
  planCode: row.planCode,
  stripeCustomerId: row.stripeCustomerId,
  collectionMethod: row.collectionMethod,
  autoBillingEnabled: Boolean(row.autoBillingEnabled),
  portalConfigurationId: row.portalConfigurationId,
  baseMonthlyFee: toMoneyString(row.baseMonthlyFee),
  drawFee: new Decimal(row.drawFee).toFixed(4),
  decisionPricing: resolveBillingDecisionPricing(row.metadata, row.drawFee),
  budgetPolicy: readSaasBillingBudgetPolicy(row.metadata),
  currency: row.currency,
  isBillable: Boolean(row.isBillable),
  metadata: redactBillingMetadata(row.metadata),
  effectiveAt: row.effectiveAt.toISOString(),
  createdByAdminId: row.createdByAdminId,
  createdAt: row.createdAt.toISOString(),
});

export const readBillingRunSnapshot = (
  run: typeof saasBillingRuns.$inferSelect,
) => normalizeMetadata(Reflect.get(run.metadata ?? {}, "billingSnapshot"));

export const findStripeInvoiceForBillingRun = async (
  run: Pick<typeof saasBillingRuns.$inferSelect, "id" | "stripeCustomerId">,
) => {
  if (!run.stripeCustomerId) {
    return null;
  }

  const results = await getSaasStripeClient().invoices.search({
    query: `metadata['saasBillingRunId']:'${run.id}' AND customer:'${run.stripeCustomerId}'`,
    limit: 1,
  });

  return results.data[0] ?? null;
};

const truncateSyncError = (error: unknown) =>
  error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 2_000)
    : "Unknown billing sync error.";

const hasExpiredBillingRunSyncClaim = (
  run: typeof saasBillingRuns.$inferSelect,
  now: Date,
) => {
  if (run.externalSyncStatus !== "processing") {
    return false;
  }

  if (!run.externalSyncAttemptedAt) {
    return true;
  }

  return (
    run.externalSyncAttemptedAt.getTime() <=
    now.getTime() - config.saasBillingRunSyncLockTimeoutMs
  );
};

const assertBillingRunSyncClaimable = (
  run: typeof saasBillingRuns.$inferSelect,
  now: Date,
) => {
  if (
    run.externalSyncStatus === "processing" &&
    !hasExpiredBillingRunSyncClaim(run, now)
  ) {
    throw billingRunSyncConflictError();
  }
};

const updateBillingRunWithCompareAndSwap = async (
  run: typeof saasBillingRuns.$inferSelect,
  values: PgUpdateSetSource<typeof saasBillingRuns>,
) => {
  const [updated] = await db
    .update(saasBillingRuns)
    .set(values)
    .where(
      and(
        eq(saasBillingRuns.id, run.id),
        eq(saasBillingRuns.externalSyncRevision, run.externalSyncRevision),
      ),
    )
    .returning();

  if (!updated) {
    throw billingRunSyncConflictError();
  }

  return updated;
};

const buildBillingRunExternalSyncColumns = (
  run: typeof saasBillingRuns.$inferSelect,
  params: {
    nextStatus: typeof saasBillingRuns.$inferSelect["externalSyncStatus"];
    action: SaasBillingRunExternalSyncAction;
    stage: SaasBillingRunExternalSyncStage;
    error?: string | null;
    recoveryPath?: string | null;
    observedInvoiceStatus?: string | null;
    eventType?: string | null;
    attemptedAt?: Date | null;
    completedAt?: Date | null;
  },
) => ({
  externalSyncStatus: resolveBillingRunExternalSyncTransition(
    run.externalSyncStatus,
    params.nextStatus,
  ),
  externalSyncAction: params.action,
  externalSyncStage: params.stage,
  externalSyncError: params.error ?? null,
  externalSyncRecoveryPath: params.recoveryPath ?? null,
  externalSyncObservedInvoiceStatus: params.observedInvoiceStatus ?? null,
  externalSyncEventType: params.eventType ?? null,
  externalSyncRevision: sql<number>`${saasBillingRuns.externalSyncRevision} + 1`,
  externalSyncAttemptedAt: params.attemptedAt ?? run.externalSyncAttemptedAt,
  externalSyncCompletedAt: params.completedAt ?? null,
});

export const markBillingRunSyncProcessing = async (
  run: typeof saasBillingRuns.$inferSelect,
  params: {
    action: SaasBillingRunExternalSyncAction;
    stage: SaasBillingRunExternalSyncStage;
    observedInvoiceStatus?: string | null;
    eventType?: string | null;
  },
) => {
  const now = new Date();
  assertBillingRunSyncClaimable(run, now);

  return updateBillingRunWithCompareAndSwap(run, {
    ...buildBillingRunExternalSyncColumns(run, {
      nextStatus: "processing",
      action: params.action,
      stage: params.stage,
      observedInvoiceStatus:
        params.observedInvoiceStatus ?? run.stripeInvoiceStatus ?? null,
      eventType: params.eventType ?? null,
      attemptedAt: now,
      completedAt: null,
    }),
    updatedAt: now,
  });
};

export const recordBillingRunSyncSuccess = async (
  run: typeof saasBillingRuns.$inferSelect,
  params: {
    action: SaasBillingRunExternalSyncAction;
    stage: SaasBillingRunExternalSyncStage;
    observedInvoiceStatus?: string | null;
    eventType?: string | null;
  },
) => {
  const now = new Date();
  return updateBillingRunWithCompareAndSwap(run, {
    ...buildBillingRunExternalSyncColumns(run, {
      nextStatus: "succeeded",
      action: params.action,
      stage: params.stage,
      observedInvoiceStatus: params.observedInvoiceStatus ?? null,
      eventType: params.eventType ?? null,
      attemptedAt: run.externalSyncAttemptedAt ?? now,
      completedAt: now,
    }),
    updatedAt: now,
  });
};

export const recordBillingRunSyncFailure = async (
  run: typeof saasBillingRuns.$inferSelect,
  params: {
    action: SaasBillingRunExternalSyncAction;
    stage: SaasBillingRunExternalSyncStage;
    error: unknown;
    recoveryPath: string;
    observedInvoiceStatus?: string | null;
    eventType?: string | null;
  },
) => {
  const nextStatus =
    BILLING_RUN_TERMINAL_STATUSES.has(run.status) ||
    BILLING_RUN_DISPATCHED_STATUSES.has(run.status)
      ? run.status
      : "failed";
  const now = new Date();

  return updateBillingRunWithCompareAndSwap(run, {
    status: nextStatus,
    ...buildBillingRunExternalSyncColumns(run, {
      nextStatus: "failed",
      action: params.action,
      stage: params.stage,
      error: truncateSyncError(params.error),
      recoveryPath: params.recoveryPath,
      observedInvoiceStatus: params.observedInvoiceStatus ?? null,
      eventType: params.eventType ?? null,
      attemptedAt: run.externalSyncAttemptedAt ?? now,
      completedAt: now,
    }),
    updatedAt: now,
  });
};

export const syncBillingRunFromInvoice = async (
  run: typeof saasBillingRuns.$inferSelect,
  invoice: StripeInvoice,
  eventType?: string,
  syncContext?: {
    action?: SaasBillingRunExternalSyncAction;
    stage?: SaasBillingRunExternalSyncStage;
  },
) => {
  const creditAppliedAmount = resolveStripeCreditAppliedAmount(invoice);
  const now = new Date();
  const updated = await updateBillingRunWithCompareAndSwap(run, {
    status: resolveBillingRunStatusFromInvoice(invoice, run.status, eventType),
    stripeCustomerId:
      typeof invoice.customer === "string"
        ? invoice.customer
        : run.stripeCustomerId,
    stripeInvoiceId: invoice.id,
    stripeInvoiceStatus: invoice.status,
    stripeHostedInvoiceUrl: invoice.hosted_invoice_url,
    stripeInvoicePdf: invoice.invoice_pdf,
    creditAppliedAmount,
    totalAmount: toMoneyString(
      Number(invoice.amount_due ?? invoice.total ?? 0) / 100,
    ),
    syncedAt: now,
    finalizedAt: invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000)
      : run.finalizedAt,
    sentAt: eventType === "invoice.sent" ? now : run.sentAt,
    paidAt: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : run.paidAt,
    ...buildBillingRunExternalSyncColumns(run, {
      nextStatus: "succeeded",
      action: syncContext?.action ?? (eventType ? "stripe_webhook" : "sync"),
      stage: syncContext?.stage ?? "persist_invoice_state",
      observedInvoiceStatus: invoice.status,
      eventType: eventType ?? null,
      attemptedAt: run.externalSyncAttemptedAt ?? now,
      completedAt: now,
    }),
    updatedAt: now,
  });

  return toSaasBillingRun(updated);
};

export const resolveBillingRunCollectionMethod = async (
  run: Pick<
    typeof saasBillingRuns.$inferSelect,
    "billingAccountId" | "metadata"
  >,
): Promise<SaasBillingCollectionMethod> => {
  const [billingAccount] = await db
    .select()
    .from(saasBillingAccounts)
    .where(eq(saasBillingAccounts.id, run.billingAccountId ?? 0))
    .limit(1);
  const snapshot = readBillingRunSnapshot(
    run as typeof saasBillingRuns.$inferSelect,
  );

  const collectionMethod =
    typeof snapshot?.collectionMethod === "string"
      ? snapshot.collectionMethod
      : billingAccount?.collectionMethod;

  return collectionMethod === "charge_automatically"
    ? "charge_automatically"
    : "send_invoice";
};

export const createStripeInvoiceForBillingRun = async (
  run: typeof saasBillingRuns.$inferSelect,
) => {
  if (!run.stripeCustomerId) {
    throw badRequestError("Stripe customer is not configured for this tenant.", {
      code: API_ERROR_CODES.STRIPE_CUSTOMER_NOT_CONFIGURED,
    });
  }

  const collectionMethod = await resolveBillingRunCollectionMethod(run);
  const stripe = getSaasStripeClient();
  const fingerprint = buildBillingRunStripeFingerprint(run);
  const invoice = await stripe.invoices.create(
    {
      customer: run.stripeCustomerId,
      auto_advance: false,
      collection_method: collectionMethod,
      ...(collectionMethod === "send_invoice"
        ? { days_until_due: getSaasStripeInvoiceDueDays() }
        : {}),
      currency: normalizeStripeCurrency(run.currency),
      metadata: buildBillingInvoiceMetadata({
        tenantId: run.tenantId,
        billingRunId: run.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        fingerprint,
      }),
      description: `Prize engine usage ${run.periodStart.toISOString()} - ${run.periodEnd.toISOString()}`,
    },
    {
      idempotencyKey: buildBillingRunInvoiceCreateIdempotencyKey(run),
    },
  );

  const baseFeeAmount = toDecimal(run.baseFeeAmount);
  if (baseFeeAmount.gt(0)) {
    await stripe.invoiceItems.create(
      {
        customer: run.stripeCustomerId,
        invoice: invoice.id,
        currency: normalizeStripeCurrency(run.currency),
        amount: toStripeAmount(baseFeeAmount),
        description: `Base monthly fee (${run.periodStart.toISOString()} - ${run.periodEnd.toISOString()})`,
        metadata: {
          saasBillingRunId: String(run.id),
          saasLineType: "base_fee",
        },
      },
      {
        idempotencyKey: buildBillingRunInvoiceLineItemIdempotencyKey(
          run,
          "base_fee",
        ),
      },
    );
  }

  const usageFeeAmount = toDecimal(run.usageFeeAmount);
  const decisionBreakdown = readBillingRunDecisionBreakdown(run.metadata);
  const chargeableDecisionBreakdown = decisionBreakdown.filter((item) =>
    toDecimal(item.totalAmount).gt(0),
  );
  if (chargeableDecisionBreakdown.length > 0) {
    for (const item of chargeableDecisionBreakdown) {
      await stripe.invoiceItems.create(
        {
          customer: run.stripeCustomerId,
          invoice: invoice.id,
          currency: normalizeStripeCurrency(run.currency),
          amount: toStripeAmount(item.totalAmount),
          description: `Usage fee - ${item.decisionType} (${item.units} decisions @ ${item.unitAmount})`,
          metadata: {
            saasBillingRunId: String(run.id),
            saasLineType: `usage_fee_${item.decisionType}`,
            saasDecisionType: item.decisionType,
          },
        },
        {
          idempotencyKey: buildBillingRunInvoiceLineItemIdempotencyKey(
            run,
            `usage_fee_${item.decisionType}`,
          ),
        },
      );
    }
  } else if (usageFeeAmount.gt(0)) {
    await stripe.invoiceItems.create(
      {
        customer: run.stripeCustomerId,
        invoice: invoice.id,
        currency: normalizeStripeCurrency(run.currency),
        amount: toStripeAmount(usageFeeAmount),
        description: `Usage fee (${run.drawCount} draw events)`,
        metadata: {
          saasBillingRunId: String(run.id),
          saasLineType: "usage_fee",
        },
      },
      {
        idempotencyKey: buildBillingRunInvoiceLineItemIdempotencyKey(
          run,
          "usage_fee",
        ),
      },
    );
  }

  return stripe.invoices.retrieve(invoice.id);
};

export const findStripeBalanceTransactionForTopUp = async (
  topUp: Pick<typeof saasBillingTopUps.$inferSelect, "id" | "stripeCustomerId">,
) => {
  if (!topUp.stripeCustomerId) {
    return null;
  }

  const stripe = getSaasStripeClient();
  let startingAfter: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const results = await stripe.customers.listBalanceTransactions(
      topUp.stripeCustomerId,
      {
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
    );
    const matched = results.data.find(
      (transaction) => transaction.metadata?.saasTopUpId === String(topUp.id),
    );
    if (matched) {
      return matched;
    }

    if (!results.has_more || results.data.length === 0) {
      break;
    }

    startingAfter = results.data[results.data.length - 1]?.id;
    if (!startingAfter) {
      break;
    }
  }

  return null;
};

export const syncBillingTopUpFromBalanceTransaction = async (
  topUp: typeof saasBillingTopUps.$inferSelect,
  balanceTransaction: StripeBalanceTransaction,
) => {
  const [updated] = await db
    .update(saasBillingTopUps)
    .set({
      status: "synced",
      stripeBalanceTransactionId: balanceTransaction.id,
      syncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(saasBillingTopUps.id, topUp.id))
    .returning();

  return toSaasBillingTopUp(updated ?? topUp);
};

export const resolveBillingRunForStripeInvoice = async (params: {
  invoice: StripeInvoice;
  billingRunId?: number | null;
}) => {
  const candidates = [
    Number(params.billingRunId ?? 0),
    Number(params.invoice.metadata?.saasBillingRunId ?? 0),
  ].filter(
    (value, index, values) =>
      Number.isFinite(value) && value > 0 && values.indexOf(value) === index,
  );

  for (const id of candidates) {
    const [run] = await db
      .select()
      .from(saasBillingRuns)
      .where(eq(saasBillingRuns.id, id))
      .limit(1);
    if (run) {
      return run;
    }
  }

  if (!params.invoice.id) {
    return null;
  }

  const [run] = await db
    .select()
    .from(saasBillingRuns)
    .where(eq(saasBillingRuns.stripeInvoiceId, params.invoice.id))
    .limit(1);

  return run ?? null;
};

export const resolveStripeWebhookContext = async (event: StripeEvent) => {
  const invoice = event.type.startsWith("invoice.")
    ? parseStripeInvoiceObject(event.data.object)
    : null;
  let billingRunId = invoice?.metadata?.saasBillingRunId
    ? Number(invoice.metadata.saasBillingRunId)
    : null;
  let tenantId = invoice?.metadata?.saasTenantId
    ? Number(invoice.metadata.saasTenantId)
    : null;

  if (invoice && (!billingRunId || !tenantId)) {
    const run = await resolveBillingRunForStripeInvoice({
      invoice,
      billingRunId,
    });
    if (run) {
      billingRunId = run.id;
      tenantId = run.tenantId;
    }
  }

  return {
    invoice,
    billingRunId:
      Number.isFinite(Number(billingRunId)) && Number(billingRunId) > 0
        ? Number(billingRunId)
        : null,
    tenantId:
      Number.isFinite(Number(tenantId)) && Number(tenantId) > 0
        ? Number(tenantId)
        : null,
  };
};
