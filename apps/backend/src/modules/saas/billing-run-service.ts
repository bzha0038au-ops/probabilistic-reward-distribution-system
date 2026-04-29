import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasBillingAccountVersions,
  saasBillingRuns,
  saasUsageEvents,
} from "@reward/database";
import { and, desc, eq, gte, isNull, lt, sql } from "@reward/database/orm";
import type {
  SaasBillingCollectionMethod,
  SaasBillingRunCreate,
  SaasBillingRunExternalSyncStage,
  SaasBillingRunSettle,
  SaasBillingRunSync,
} from "@reward/shared-types/saas";

import { db } from "../../db";
import {
  badRequestError,
  conflictError,
  notFoundError,
} from "../../shared/errors";
import { toDecimal } from "../../shared/money";
import { assertTenantCapability } from "./access";
import {
  BILLING_LIVE_ENVIRONMENT,
  BILLING_RUN_DISPATCHED_STATUSES,
  BILLING_RUN_TERMINAL_STATUSES,
  buildBillingRunInvoiceActionIdempotencyKey,
  buildBillingRunStripeFingerprint,
  isBillingRunSyncConflictError,
  resolveBillingDecisionPricing,
  resolveBillingPeriod,
  selectBillingAccountVersionForPeriod,
  summarizeUsageEventsForBilling,
} from "./billing";
import {
  buildBillingAccountSnapshot,
  createStripeInvoiceForBillingRun,
  findStripeInvoiceForBillingRun,
  loadTenantBillingContext,
  markBillingRunSyncProcessing,
  recordBillingRunSyncFailure,
  recordBillingRunSyncSuccess,
  resolveBillingRunCollectionMethod,
  syncBillingRunFromInvoice,
} from "./billing-service-support";
import {
  getSaasStripeClient,
  isSaasStripeEnabled,
  type StripeInvoice,
} from "./stripe";
import {
  normalizeMetadata,
  toSaasAdminActor,
  toSaasBillingRun,
} from "./records";
import { SAAS_STATUS_REQUEST_REFERENCE_TYPE } from "../saas-status/constants";

const loadBillingRun = async (billingRunId: number) => {
  const [run] = await db
    .select()
    .from(saasBillingRuns)
    .where(eq(saasBillingRuns.id, billingRunId))
    .limit(1);

  if (!run) {
    throw notFoundError("Billing run not found.", {
      code: API_ERROR_CODES.BILLING_RUN_NOT_FOUND,
    });
  }

  return run;
};

const findOrCreateBillingRunInvoice = async (
  run: typeof saasBillingRuns.$inferSelect,
) => {
  const stripe = getSaasStripeClient();
  const fingerprint = buildBillingRunStripeFingerprint(run);
  let invoice: StripeInvoice | null = null;

  if (run.stripeInvoiceId) {
    const existingInvoice = await stripe.invoices.retrieve(run.stripeInvoiceId);
    if (
      existingInvoice.status === "draft" &&
      existingInvoice.metadata?.saasBillingFingerprint !== fingerprint
    ) {
      await stripe.invoices.del(existingInvoice.id);
    } else {
      invoice = existingInvoice;
    }
  }

  if (!invoice) {
    invoice = await findStripeInvoiceForBillingRun(run);
  }

  return invoice ?? createStripeInvoiceForBillingRun(run);
};

const finalizeBillingRunInvoice = async (
  run: typeof saasBillingRuns.$inferSelect,
  invoice: StripeInvoice,
) =>
  getSaasStripeClient().invoices.finalizeInvoice(
    invoice.id,
    {},
    {
      idempotencyKey: buildBillingRunInvoiceActionIdempotencyKey(
        run,
        "finalize",
      ),
    },
  );

const sendBillingRunInvoice = async (
  run: typeof saasBillingRuns.$inferSelect,
  collectionMethod: SaasBillingCollectionMethod,
  invoice: StripeInvoice,
) => {
  if (collectionMethod !== "send_invoice") {
    throw badRequestError(
      "Only send-invoice billing accounts can dispatch invoices manually.",
      {
        code: API_ERROR_CODES.BILLING_RUN_MANUAL_SEND_NOT_ALLOWED,
      },
    );
  }

  const finalizedInvoice =
    invoice.status === "draft"
      ? await finalizeBillingRunInvoice(run, invoice)
      : invoice;

  return getSaasStripeClient().invoices.sendInvoice(
    finalizedInvoice.id,
    {},
    {
      idempotencyKey: buildBillingRunInvoiceActionIdempotencyKey(run, "send"),
    },
  );
};

export async function createBillingRun(
  payload: SaasBillingRunCreate,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  await assertTenantCapability(actor, payload.tenantId, "billing:write");

  const { tenant, billingAccount } = await loadTenantBillingContext(
    payload.tenantId,
  );
  const { periodStart, periodEnd } = resolveBillingPeriod(payload);

  const run = await db.transaction(async (tx) => {
    const [existingRun] = await tx
      .select()
      .from(saasBillingRuns)
      .where(
        and(
          eq(saasBillingRuns.tenantId, tenant.id),
          eq(saasBillingRuns.periodStart, periodStart),
          eq(saasBillingRuns.periodEnd, periodEnd),
        ),
      )
      .limit(1);

    if (
      existingRun &&
      (BILLING_RUN_TERMINAL_STATUSES.has(existingRun.status) ||
        BILLING_RUN_DISPATCHED_STATUSES.has(existingRun.status) ||
        (existingRun.status === "finalized" &&
          Boolean(existingRun.stripeInvoiceId)))
    ) {
      return existingRun;
    }

    const versionRows = await tx
      .select()
      .from(saasBillingAccountVersions)
      .where(
        and(
          eq(saasBillingAccountVersions.tenantId, tenant.id),
          lt(saasBillingAccountVersions.effectiveAt, periodEnd),
        ),
      )
      .orderBy(
        desc(saasBillingAccountVersions.effectiveAt),
        desc(saasBillingAccountVersions.id),
      );
    const billingAccountVersion = selectBillingAccountVersionForPeriod(
      versionRows,
      periodStart,
      periodEnd,
    );
    if (!billingAccountVersion) {
      throw conflictError(
        "No billing account version is available for this billing period.",
        {
          code: API_ERROR_CODES.NO_BILLING_ACCOUNT_VERSION_FOR_PERIOD,
        },
      );
    }

    const [billingRun] = existingRun
      ? [existingRun]
      : await tx
          .insert(saasBillingRuns)
          .values({
            tenantId: tenant.id,
            billingAccountId: billingAccount.id,
            billingAccountVersionId: billingAccountVersion.id,
            status: "draft",
            periodStart,
            periodEnd,
            currency: billingAccountVersion.currency,
            stripeCustomerId: billingAccountVersion.stripeCustomerId,
            createdByAdminId: adminId ?? null,
          })
          .returning();

    await tx
      .update(saasUsageEvents)
      .set({
        billingRunId: billingRun.id,
      })
      .where(
        and(
          eq(saasUsageEvents.tenantId, tenant.id),
          eq(saasUsageEvents.environment, BILLING_LIVE_ENVIRONMENT),
          isNull(saasUsageEvents.billingRunId),
          sql`${saasUsageEvents.referenceType} is distinct from ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}`,
          gte(saasUsageEvents.createdAt, periodStart),
          lt(saasUsageEvents.createdAt, periodEnd),
        ),
      );

    const usageEvents = await tx
      .select({
        eventType: saasUsageEvents.eventType,
        decisionType: saasUsageEvents.decisionType,
        units: saasUsageEvents.units,
        amount: saasUsageEvents.amount,
        metadata: saasUsageEvents.metadata,
      })
      .from(saasUsageEvents)
      .where(
        and(
          eq(saasUsageEvents.billingRunId, billingRun.id),
          eq(saasUsageEvents.environment, BILLING_LIVE_ENVIRONMENT),
          sql`${saasUsageEvents.referenceType} is distinct from ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}`,
        ),
      );

    const decisionPricing = resolveBillingDecisionPricing(
      billingAccountVersion.metadata,
      billingAccountVersion.drawFee,
    );
    const normalizedUsageEvents = usageEvents.map((event) => ({
      eventType: event.eventType,
      decisionType: event.decisionType,
      units: Number(event.units ?? 0),
      amount: toDecimal(event.amount).toFixed(4),
      metadata: normalizeMetadata(event.metadata),
    }));
    const usageSummary = summarizeUsageEventsForBilling(
      normalizedUsageEvents.filter((event) => event.metadata?.billable !== false),
      decisionPricing,
    );
    const usageFeeAmount = toDecimal(usageSummary.usageFeeAmount);
    const baseFeeAmount = toDecimal(billingAccountVersion.baseMonthlyFee);
    const totalAmount = baseFeeAmount.plus(usageFeeAmount);
    const existingMetadata = normalizeMetadata(billingRun.metadata);
    const nextRunMetadata =
      existingMetadata && Reflect.has(existingMetadata, "externalSync")
        ? Object.fromEntries(
            Object.entries(existingMetadata).filter(
              ([key]) => key !== "externalSync",
            ),
          )
        : existingMetadata;

    const [updatedRun] = await tx
      .update(saasBillingRuns)
      .set({
        billingAccountId: billingAccount.id,
        billingAccountVersionId: billingAccountVersion.id,
        status: "draft",
        currency: billingAccountVersion.currency,
        baseFeeAmount: baseFeeAmount.toFixed(2),
        usageFeeAmount: usageFeeAmount.toFixed(2),
        creditAppliedAmount: "0",
        totalAmount: totalAmount.toFixed(2),
        drawCount: usageSummary.drawCount,
        stripeCustomerId: billingAccountVersion.stripeCustomerId,
        metadata: normalizeMetadata({
          ...(nextRunMetadata ?? {}),
          generatedBy: adminId ? "manual" : "automation",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          billingSnapshot: buildBillingAccountSnapshot(billingAccountVersion),
          decisionBreakdown: usageSummary.decisionBreakdown,
        }),
        updatedAt: new Date(),
      })
      .where(eq(saasBillingRuns.id, billingRun.id))
      .returning();

    return updatedRun;
  });

  if (!run) {
    throw conflictError("Failed to create billing run.", {
      code: API_ERROR_CODES.FAILED_TO_CREATE_BILLING_RUN,
    });
  }

  const wantsStripeSync =
    payload.finalize === true || payload.sendInvoice === true;
  if (wantsStripeSync) {
    return syncBillingRun(
      run.id,
      {
        finalize: payload.finalize,
        sendInvoice: payload.sendInvoice,
      },
      adminId,
      permissions,
    );
  }

  return toSaasBillingRun(run);
}

export async function syncBillingRun(
  billingRunId: number,
  payload: SaasBillingRunSync,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  const loadedRun = await loadBillingRun(billingRunId);
  const syncAction =
    payload.sendInvoice === true
      ? "sync_and_send"
      : payload.finalize === true
        ? "sync_and_finalize"
        : "sync";

  await assertTenantCapability(actor, loadedRun.tenantId, "billing:write");
  let syncStage: SaasBillingRunExternalSyncStage = "precondition";
  let observedInvoiceStatus: string | null = null;
  const run = await markBillingRunSyncProcessing(loadedRun, {
    action: syncAction,
    stage: syncStage,
  });

  try {
    if (!isSaasStripeEnabled()) {
      throw badRequestError("SAAS Stripe is not configured.", {
        code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
      });
    }

    if (!run.stripeCustomerId) {
      throw badRequestError("Stripe customer is not configured for this tenant.", {
        code: API_ERROR_CODES.STRIPE_CUSTOMER_NOT_CONFIGURED,
      });
    }

    const collectionMethod = await resolveBillingRunCollectionMethod(run);
    syncStage = "invoice_lookup";
    let invoice = await findOrCreateBillingRunInvoice(run);
    observedInvoiceStatus = invoice.status;

    if (payload.finalize) {
      syncStage = "invoice_finalize";
      invoice = await finalizeBillingRunInvoice(run, invoice);
      observedInvoiceStatus = invoice.status;
    }

    if (payload.sendInvoice) {
      syncStage = "invoice_send";
      invoice = await sendBillingRunInvoice(run, collectionMethod, invoice);
      observedInvoiceStatus = invoice.status;
    }

    return syncBillingRunFromInvoice(
      run,
      invoice,
      payload.sendInvoice ? "invoice.sent" : undefined,
      {
        action: syncAction,
        stage: syncStage,
      },
    );
  } catch (error) {
    if (isBillingRunSyncConflictError(error)) {
      throw error;
    }

    try {
      await recordBillingRunSyncFailure(run, {
        action: syncAction,
        stage: syncStage,
        error,
        recoveryPath: "retry_sync_or_wait_for_reconciliation",
        observedInvoiceStatus,
        eventType: payload.sendInvoice ? "invoice.sent" : null,
      });
    } catch {
      // Preserve the original sync error when failure bookkeeping cannot be written.
    }
    throw error;
  }
}

export async function refreshBillingRun(
  billingRunId: number,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  const loadedRun = await loadBillingRun(billingRunId);

  await assertTenantCapability(actor, loadedRun.tenantId, "tenant:read");

  if (!isSaasStripeEnabled()) {
    throw badRequestError("SAAS Stripe is not configured.", {
      code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
    });
  }

  const run = await markBillingRunSyncProcessing(loadedRun, {
    action: "refresh",
    stage: "invoice_refresh",
  });
  const invoice = run.stripeInvoiceId
    ? await getSaasStripeClient().invoices.retrieve(run.stripeInvoiceId)
    : await findStripeInvoiceForBillingRun(run);
  if (!invoice) {
    return toSaasBillingRun(
      await recordBillingRunSyncSuccess(run, {
        action: "refresh",
        stage: "invoice_refresh",
      }),
    );
  }

  return syncBillingRunFromInvoice(run, invoice, undefined, {
    action: "refresh",
    stage: "invoice_refresh",
  });
}

export async function settleBillingRun(
  billingRunId: number,
  payload: SaasBillingRunSettle,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  const loadedRun = await loadBillingRun(billingRunId);

  await assertTenantCapability(actor, loadedRun.tenantId, "billing:settle");
  let syncStage: SaasBillingRunExternalSyncStage = "precondition";
  let observedInvoiceStatus: string | null = null;
  const run = await markBillingRunSyncProcessing(loadedRun, {
    action: "settle",
    stage: syncStage,
  });

  try {
    if (!run.stripeInvoiceId) {
      throw badRequestError(
        "Stripe invoice has not been created for this billing run.",
        {
          code: API_ERROR_CODES.STRIPE_INVOICE_NOT_CREATED_FOR_BILLING_RUN,
        },
      );
    }

    if (!isSaasStripeEnabled()) {
      throw badRequestError("SAAS Stripe is not configured.", {
        code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
      });
    }

    const stripe = getSaasStripeClient();
    syncStage = "invoice_retrieve";
    let invoice = await stripe.invoices.retrieve(run.stripeInvoiceId);
    observedInvoiceStatus = invoice.status;
    if (invoice.status === "draft") {
      syncStage = "invoice_finalize";
      invoice = await finalizeBillingRunInvoice(run, invoice);
      observedInvoiceStatus = invoice.status;
    }

    syncStage = "invoice_pay";
    invoice = await stripe.invoices.pay(
      invoice.id,
      {
        paid_out_of_band: payload.paidOutOfBand ?? false,
      },
      {
        idempotencyKey: buildBillingRunInvoiceActionIdempotencyKey(
          run,
          "pay",
          payload.paidOutOfBand ?? false,
        ),
      },
    );
    observedInvoiceStatus = invoice.status;

    return syncBillingRunFromInvoice(run, invoice, "invoice.paid", {
      action: "settle",
      stage: syncStage,
    });
  } catch (error) {
    if (isBillingRunSyncConflictError(error)) {
      throw error;
    }

    try {
      await recordBillingRunSyncFailure(run, {
        action: "settle",
        stage: syncStage,
        error,
        recoveryPath: "retry_settle_or_wait_for_reconciliation",
        observedInvoiceStatus,
        eventType: "invoice.paid",
      });
    } catch {
      // Preserve the original settle error when failure bookkeeping cannot be written.
    }
    throw error;
  }
}
