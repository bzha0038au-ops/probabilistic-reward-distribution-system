import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasBillingDisputes,
  saasBillingLedgerEntries,
  saasBillingRuns,
} from "@reward/database";
import { and, desc, eq, inArray } from "@reward/database/orm";
import type {
  SaasBillingDisputeCreate,
  SaasBillingDisputeReason,
  SaasBillingDisputeReview,
} from "@reward/shared-types/saas";

import { db, type DbTransaction } from "../../db";
import {
  badRequestError,
  conflictError,
  notFoundError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { assertTenantCapability } from "./access";
import {
  buildBillingDisputeCreditNoteIdempotencyKey,
  buildBillingRunInvoiceActionIdempotencyKey,
} from "./billing";
import { getSaasStripeClient, isSaasStripeEnabled, toStripeAmount } from "./stripe";
import { normalizeMetadata, toSaasAdminActor, toSaasBillingDispute } from "./records";

const OPEN_DISPUTE_STATUSES = ["submitted", "under_review"] as const;
const FINAL_DISPUTE_STATUSES = new Set(["resolved", "rejected"]);
const BILLING_LEDGER_CHARGE_ENTRY_TYPE = "billing_run_charge";
const BILLING_LEDGER_DISPUTE_REFUND_ENTRY_TYPE = "billing_dispute_refund";

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

const loadBillingDispute = async (billingDisputeId: number) => {
  const [dispute] = await db
    .select()
    .from(saasBillingDisputes)
    .where(eq(saasBillingDisputes.id, billingDisputeId))
    .limit(1);

  if (!dispute) {
    throw notFoundError("Billing dispute not found.", {
      code: API_ERROR_CODES.BILLING_DISPUTE_NOT_FOUND,
    });
  }

  return dispute;
};

const appendBillingLedgerEntry = async (
  tx: DbTransaction,
  params: {
    tenantId: number;
    billingRunId: number | null;
    disputeId: number | null;
    entryType: string;
    amount: Decimal.Value;
    currency: string;
    referenceType?: string | null;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
    createdByAdminId?: number | null;
  },
) => {
  const [latestEntry] = await tx
    .select({
      balanceAfter: saasBillingLedgerEntries.balanceAfter,
    })
    .from(saasBillingLedgerEntries)
    .where(eq(saasBillingLedgerEntries.tenantId, params.tenantId))
    .orderBy(desc(saasBillingLedgerEntries.id))
    .limit(1);

  const amount = toDecimal(params.amount).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
  const balanceBefore = toDecimal(latestEntry?.balanceAfter ?? 0).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
  const balanceAfter = balanceBefore.plus(amount);

  const [created] = await tx
    .insert(saasBillingLedgerEntries)
    .values({
      tenantId: params.tenantId,
      billingRunId: params.billingRunId,
      disputeId: params.disputeId,
      entryType: params.entryType,
      amount: amount.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
      currency: params.currency,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      metadata: params.metadata ?? null,
      createdByAdminId: params.createdByAdminId ?? null,
      createdAt: new Date(),
    })
    .returning();

  if (!created) {
    throw conflictError("Failed to write billing ledger entry.", {
      code: API_ERROR_CODES.FAILED_TO_RESOLVE_BILLING_DISPUTE,
    });
  }

  return created;
};

const ensureBillingRunChargeLedgerEntry = async (
  tx: DbTransaction,
  run: typeof saasBillingRuns.$inferSelect,
  adminId?: number | null,
) => {
  const [existing] = await tx
    .select()
    .from(saasBillingLedgerEntries)
    .where(
      and(
        eq(saasBillingLedgerEntries.billingRunId, run.id),
        eq(saasBillingLedgerEntries.entryType, BILLING_LEDGER_CHARGE_ENTRY_TYPE),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  return appendBillingLedgerEntry(tx, {
    tenantId: run.tenantId,
    billingRunId: run.id,
    disputeId: null,
    entryType: BILLING_LEDGER_CHARGE_ENTRY_TYPE,
    amount: run.totalAmount,
    currency: run.currency,
    referenceType: "saas_billing_run",
    referenceId: run.id,
    metadata: {
      reconstructedFromBillingRun: true,
      periodStart: run.periodStart.toISOString(),
      periodEnd: run.periodEnd.toISOString(),
    },
    createdByAdminId: adminId ?? null,
  });
};

const readRemainingRefundableAmount = async (
  tx: DbTransaction,
  run: typeof saasBillingRuns.$inferSelect,
) => {
  const entries = await tx
    .select({
      amount: saasBillingLedgerEntries.amount,
    })
    .from(saasBillingLedgerEntries)
    .where(eq(saasBillingLedgerEntries.billingRunId, run.id));

  return entries.reduce(
    (sum, entry) => sum.plus(entry.amount ?? 0),
    new Decimal(0),
  );
};

const requirePositiveMoney = (
  value: Decimal.Value,
  message: string,
  code = API_ERROR_CODES.INVALID_REQUEST,
) => {
  const normalized = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (normalized.lte(0)) {
    throw badRequestError(message, { code });
  }
  return normalized;
};

const resolveStripeCreditNoteReason = (reason: SaasBillingDisputeReason) => {
  switch (reason) {
    case "duplicate_charge":
      return "duplicate";
    case "invoice_amount":
      return "order_change";
    case "service_quality":
      return "product_unsatisfactory";
    case "other":
    default:
      return "product_unsatisfactory";
  }
};

const resolveApprovedRefundAmount = (params: {
  resolutionType: SaasBillingDisputeReview["resolutionType"];
  approvedRefundAmount?: Decimal.Value;
  remainingRefundableAmount: Decimal;
}) => {
  if (params.remainingRefundableAmount.lte(0)) {
    throw conflictError("No refundable balance remains for this billing run.", {
      code: API_ERROR_CODES.BILLING_DISPUTE_REFUND_EXCEEDS_AVAILABLE,
    });
  }

  if (params.resolutionType === "full_refund") {
    return params.remainingRefundableAmount;
  }

  const approvedRefundAmount = requirePositiveMoney(
    params.approvedRefundAmount ?? 0,
    "Approved refund amount must be greater than zero.",
  );
  if (approvedRefundAmount.gt(params.remainingRefundableAmount)) {
    throw conflictError(
      "Approved refund amount exceeds the remaining refundable balance for this billing run.",
      {
        code: API_ERROR_CODES.BILLING_DISPUTE_REFUND_EXCEEDS_AVAILABLE,
      },
    );
  }

  return approvedRefundAmount;
};

export async function createBillingDispute(
  payload: SaasBillingDisputeCreate,
  adminId?: number | null,
  permissions?: string[],
  accessScope: "global" | "membership" = "global",
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions, accessScope);
  await assertTenantCapability(actor, payload.tenantId, "billing:write");

  const run = await loadBillingRun(payload.billingRunId);
  if (run.tenantId !== payload.tenantId) {
    throw badRequestError("Billing run does not belong to this tenant.", {
      code: API_ERROR_CODES.INVALID_BILLING_RUN_ID,
    });
  }

  const requestedRefundAmount = requirePositiveMoney(
    payload.requestedRefundAmount,
    "Requested refund amount must be greater than zero.",
  );
  if (requestedRefundAmount.gt(toDecimal(run.totalAmount))) {
    throw badRequestError(
      "Requested refund amount cannot exceed the billing run total.",
      {
        code: API_ERROR_CODES.BILLING_DISPUTE_REFUND_EXCEEDS_AVAILABLE,
      },
    );
  }

  const [pendingDispute] = await db
    .select({
      id: saasBillingDisputes.id,
    })
    .from(saasBillingDisputes)
    .where(
      and(
        eq(saasBillingDisputes.billingRunId, run.id),
        inArray(saasBillingDisputes.status, OPEN_DISPUTE_STATUSES),
      ),
    )
    .limit(1);

  if (pendingDispute) {
    throw conflictError(
      "Another billing dispute is already pending for this billing run.",
      {
        code: API_ERROR_CODES.ANOTHER_REVIEW_PENDING,
      },
    );
  }

  const [created] = await db
    .insert(saasBillingDisputes)
    .values({
      tenantId: payload.tenantId,
      billingRunId: run.id,
      billingAccountId: run.billingAccountId,
      status: "submitted",
      reason: payload.reason,
      summary: payload.summary.trim(),
      description: payload.description.trim(),
      requestedRefundAmount: requestedRefundAmount.toFixed(2),
      currency: run.currency,
      metadata: normalizeMetadata(payload.metadata),
      createdByAdminId: adminId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!created) {
    throw conflictError("Failed to create billing dispute.", {
      code: API_ERROR_CODES.FAILED_TO_CREATE_BILLING_DISPUTE,
    });
  }

  return toSaasBillingDispute(created);
}

export async function reviewBillingDispute(
  billingDisputeId: number,
  payload: SaasBillingDisputeReview,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  const dispute = await loadBillingDispute(billingDisputeId);

  await assertTenantCapability(actor, dispute.tenantId, "billing:settle");
  if (FINAL_DISPUTE_STATUSES.has(dispute.status)) {
    throw conflictError("Billing dispute has already been finalized.", {
      code: API_ERROR_CODES.BILLING_DISPUTE_ALREADY_FINALIZED,
    });
  }

  if (payload.resolutionType === "reject") {
    const [updated] = await db
      .update(saasBillingDisputes)
      .set({
        status: "rejected",
        resolutionType: "reject",
        resolutionNotes: payload.resolutionNotes?.trim() || null,
        approvedRefundAmount: null,
        resolvedByAdminId: adminId ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(saasBillingDisputes.id, dispute.id))
      .returning();

    if (!updated) {
      throw conflictError("Failed to finalize billing dispute.", {
        code: API_ERROR_CODES.FAILED_TO_RESOLVE_BILLING_DISPUTE,
      });
    }

    return toSaasBillingDispute(updated);
  }

  const run = await loadBillingRun(dispute.billingRunId);
  const { remainingRefundableAmount, resolutionNotes } = await db.transaction(
    async (tx) => {
      await ensureBillingRunChargeLedgerEntry(tx, run, adminId);

      const remaining = await readRemainingRefundableAmount(tx, run);
      await tx
        .update(saasBillingDisputes)
        .set({
          status: "under_review",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(saasBillingDisputes.id, dispute.id),
            inArray(saasBillingDisputes.status, OPEN_DISPUTE_STATUSES),
          ),
        );

      return {
        remainingRefundableAmount: remaining,
        resolutionNotes: payload.resolutionNotes?.trim() || null,
      };
    },
  );

  const approvedRefundAmount = resolveApprovedRefundAmount({
    resolutionType: payload.resolutionType,
    approvedRefundAmount: payload.approvedRefundAmount,
    remainingRefundableAmount,
  });

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
  let invoice = await stripe.invoices.retrieve(run.stripeInvoiceId);
  if (invoice.status === "draft") {
    invoice = await stripe.invoices.finalizeInvoice(
      invoice.id,
      {},
      {
        idempotencyKey: buildBillingRunInvoiceActionIdempotencyKey(
          run,
          "finalize",
          dispute.id,
        ),
      },
    );
  }

  if (invoice.status === "uncollectible" || invoice.status === "void") {
    throw conflictError(
      "Stripe invoice is not eligible for credit-note refunds in its current state.",
      {
        code: API_ERROR_CODES.BILLING_DISPUTE_ALREADY_FINALIZED,
      },
    );
  }

  if (invoice.status !== "open" && invoice.status !== "paid") {
    throw conflictError(
      "Stripe invoice must be finalized before a dispute refund can be applied.",
      {
        code: API_ERROR_CODES.STRIPE_INVOICE_NOT_CREATED_FOR_BILLING_RUN,
      },
    );
  }

  const approvedRefundAmountCents = toStripeAmount(approvedRefundAmount);
  const amountRemainingCents = Math.max(0, Number(invoice.amount_remaining ?? 0));
  const refundAmountCents =
    invoice.status === "paid"
      ? approvedRefundAmountCents
      : amountRemainingCents <= 0
        ? approvedRefundAmountCents
        : Math.max(approvedRefundAmountCents - amountRemainingCents, 0);

  const creditNote = await stripe.creditNotes.create(
    {
      invoice: run.stripeInvoiceId,
      amount: approvedRefundAmountCents,
      ...(refundAmountCents > 0 ? { refund_amount: refundAmountCents } : {}),
      email_type: "none",
      memo: resolutionNotes ?? dispute.summary,
      reason: resolveStripeCreditNoteReason(dispute.reason),
      metadata: {
        saasTenantId: String(dispute.tenantId),
        saasBillingRunId: String(run.id),
        saasBillingDisputeId: String(dispute.id),
        saasBillingDisputeResolution: payload.resolutionType,
      },
    },
    {
      idempotencyKey: buildBillingDisputeCreditNoteIdempotencyKey({
        disputeId: dispute.id,
        billingRunId: run.id,
        tenantId: dispute.tenantId,
        approvedRefundAmount: approvedRefundAmount.toFixed(2),
        resolutionType: payload.resolutionType,
      }),
    },
  );

  const finalized = await db.transaction(async (tx) => {
    const [freshDispute] = await tx
      .select()
      .from(saasBillingDisputes)
      .where(eq(saasBillingDisputes.id, dispute.id))
      .limit(1);

    if (!freshDispute) {
      throw notFoundError("Billing dispute not found.", {
        code: API_ERROR_CODES.BILLING_DISPUTE_NOT_FOUND,
      });
    }
    if (FINAL_DISPUTE_STATUSES.has(freshDispute.status)) {
      throw conflictError("Billing dispute has already been finalized.", {
        code: API_ERROR_CODES.BILLING_DISPUTE_ALREADY_FINALIZED,
      });
    }

    await ensureBillingRunChargeLedgerEntry(tx, run, adminId);

    const nextRemainingRefundableAmount = await readRemainingRefundableAmount(
      tx,
      run,
    );
    if (approvedRefundAmount.gt(nextRemainingRefundableAmount)) {
      throw conflictError(
        "Approved refund amount exceeds the remaining refundable balance for this billing run.",
        {
          code: API_ERROR_CODES.BILLING_DISPUTE_REFUND_EXCEEDS_AVAILABLE,
        },
      );
    }

    await appendBillingLedgerEntry(tx, {
      tenantId: dispute.tenantId,
      billingRunId: run.id,
      disputeId: dispute.id,
      entryType: BILLING_LEDGER_DISPUTE_REFUND_ENTRY_TYPE,
      amount: approvedRefundAmount.mul(-1),
      currency: run.currency,
      referenceType: "saas_billing_dispute",
      referenceId: dispute.id,
      metadata: {
        stripeCreditNoteId: creditNote.id,
        stripeCreditNoteStatus: creditNote.status,
        stripeCreditNotePdf: creditNote.pdf,
        prePaymentAmount: toMoneyString(
          Number(creditNote.pre_payment_amount ?? 0) / 100,
        ),
        postPaymentAmount: toMoneyString(
          Number(creditNote.post_payment_amount ?? 0) / 100,
        ),
      },
      createdByAdminId: adminId ?? null,
    });

    const [updated] = await tx
      .update(saasBillingDisputes)
      .set({
        status: "resolved",
        resolutionType: payload.resolutionType,
        resolutionNotes,
        approvedRefundAmount: approvedRefundAmount.toFixed(2),
        stripeCreditNoteId: creditNote.id,
        stripeCreditNoteStatus: creditNote.status,
        stripeCreditNotePdf: creditNote.pdf,
        resolvedByAdminId: adminId ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(saasBillingDisputes.id, dispute.id))
      .returning();

    if (!updated) {
      throw conflictError("Failed to finalize billing dispute.", {
        code: API_ERROR_CODES.FAILED_TO_RESOLVE_BILLING_DISPUTE,
      });
    }

    return updated;
  });

  return toSaasBillingDispute(finalized);
}
