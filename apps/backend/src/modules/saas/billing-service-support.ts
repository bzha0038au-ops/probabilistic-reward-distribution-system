import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasBillingAccounts,
  saasBillingAccountVersions,
  saasBillingRuns,
  saasBillingTopUps,
  saasTenants,
} from "@reward/database";
import { eq } from "@reward/database/orm";
import type { SaasBillingCollectionMethod } from "@reward/shared-types/saas";

import { db } from "../../db";
import { getConfigView } from "../../shared/config";
import { badRequestError, notFoundError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import {
  buildBillingInvoiceMetadata,
  buildBillingRunInvoiceCreateIdempotencyKey,
  buildBillingRunInvoiceLineItemIdempotencyKey,
  buildBillingRunStripeFingerprint,
  parseStripeInvoiceObject,
  resolveBillingRunStatusFromInvoice,
  resolveStripeCreditAppliedAmount,
} from "./billing";
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
  currency: row.currency,
  isBillable: Boolean(row.isBillable),
  metadata: normalizeMetadata(row.metadata),
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

export const syncBillingRunFromInvoice = async (
  run: typeof saasBillingRuns.$inferSelect,
  invoice: StripeInvoice,
  eventType?: string,
) => {
  const creditAppliedAmount = resolveStripeCreditAppliedAmount(invoice);
  const [updated] = await db
    .update(saasBillingRuns)
    .set({
      status: resolveBillingRunStatusFromInvoice(
        invoice,
        run.status,
        eventType,
      ),
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
      syncedAt: new Date(),
      finalizedAt: invoice.status_transitions?.finalized_at
        ? new Date(invoice.status_transitions.finalized_at * 1000)
        : run.finalizedAt,
      sentAt: eventType === "invoice.sent" ? new Date() : run.sentAt,
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : run.paidAt,
      updatedAt: new Date(),
    })
    .where(eq(saasBillingRuns.id, run.id))
    .returning();

  return toSaasBillingRun(updated ?? run);
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
  if (usageFeeAmount.gt(0)) {
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
