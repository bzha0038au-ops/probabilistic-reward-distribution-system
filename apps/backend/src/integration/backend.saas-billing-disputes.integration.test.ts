import { beforeEach, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  invoicesRetrieve: vi.fn(),
  invoicesFinalize: vi.fn(),
  creditNotesCreate: vi.fn(),
}));

vi.mock("../modules/saas/stripe", async () => {
  const actual = await vi.importActual("../modules/saas/stripe");
  return {
    ...actual,
    isSaasStripeEnabled: () => true,
    getSaasStripeClient: () => ({
      invoices: {
        retrieve: stripeMocks.invoicesRetrieve,
        finalizeInvoice: stripeMocks.invoicesFinalize,
      },
      creditNotes: {
        create: stripeMocks.creditNotesCreate,
      },
    }),
  };
});

import { expect } from "vitest";
import {
  saasBillingDisputes,
  saasBillingLedgerEntries,
  saasBillingRuns,
} from "@reward/database";
import { and, asc, eq } from "@reward/database/orm";

import {
  describeIntegrationSuite,
  getDb,
  itIntegration as it,
} from "./integration-test-support";
import {
  createBillingDispute,
  createBillingRun,
  createSaasTenant,
  reviewBillingDispute,
  upsertSaasBillingAccount,
} from "../modules/saas/service";

describeIntegrationSuite("backend saas billing dispute integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a reversing billing ledger entry and stores the Stripe credit note", async () => {
    const tenant = await createSaasTenant({
      slug: "saas-billing-dispute-ledger",
      name: "SaaS Billing Dispute Ledger",
      status: "active",
    });

    await upsertSaasBillingAccount({
      tenantId: tenant.id,
      planCode: "growth",
      stripeCustomerId: "cus_dispute_test",
      baseMonthlyFee: "10.00",
      drawFee: "0.00",
      currency: "USD",
      isBillable: true,
    });

    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 60_000);
    const billingRun = await createBillingRun({
      tenantId: tenant.id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    await getDb()
      .update(saasBillingRuns)
      .set({
        stripeInvoiceId: "in_dispute_test",
        stripeInvoiceStatus: "paid",
        status: "paid",
      })
      .where(eq(saasBillingRuns.id, billingRun.id));

    const dispute = await createBillingDispute({
      tenantId: tenant.id,
      billingRunId: billingRun.id,
      reason: "invoice_amount",
      summary: "Invoice includes one extra line",
      description: "Operator confirmed that one metered line should be reversed.",
      requestedRefundAmount: "2.50",
    });

    stripeMocks.invoicesRetrieve.mockResolvedValue({
      id: "in_dispute_test",
      customer: "cus_dispute_test",
      metadata: { saasBillingRunId: String(billingRun.id) },
      status: "paid",
      hosted_invoice_url: "https://example.test/invoice",
      invoice_pdf: "https://example.test/invoice.pdf",
      amount_paid: 1000,
      amount_remaining: 0,
      starting_balance: 0,
      amount_due: 0,
      total: 1000,
      status_transitions: {
        finalized_at: Math.floor(Date.now() / 1000),
        paid_at: Math.floor(Date.now() / 1000),
      },
    });
    stripeMocks.creditNotesCreate.mockResolvedValue({
      id: "cn_dispute_test",
      status: "issued",
      pdf: "https://example.test/credit-note.pdf",
      pre_payment_amount: 0,
      post_payment_amount: 250,
    });

    const reviewed = await reviewBillingDispute(dispute.id, {
      resolutionType: "partial_refund",
      approvedRefundAmount: "2.50",
      resolutionNotes: "Refund one mis-billed metered event.",
    });

    expect(stripeMocks.creditNotesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: "in_dispute_test",
        amount: 250,
        refund_amount: 250,
      }),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
      }),
    );
    expect(reviewed).toMatchObject({
      status: "resolved",
      approvedRefundAmount: "2.50",
      stripeCreditNoteId: "cn_dispute_test",
    });

    const [disputeRow] = await getDb()
      .select()
      .from(saasBillingDisputes)
      .where(eq(saasBillingDisputes.id, dispute.id))
      .limit(1);
    expect(disputeRow?.stripeCreditNoteId).toBe("cn_dispute_test");

    const ledgerEntries = await getDb()
      .select()
      .from(saasBillingLedgerEntries)
      .where(
        and(
          eq(saasBillingLedgerEntries.tenantId, tenant.id),
          eq(saasBillingLedgerEntries.billingRunId, billingRun.id),
        ),
      )
      .orderBy(asc(saasBillingLedgerEntries.id));

    expect(ledgerEntries).toHaveLength(2);
    expect(ledgerEntries[0]).toMatchObject({
      entryType: "billing_run_charge",
      amount: "10.00",
      balanceBefore: "0.00",
      balanceAfter: "10.00",
    });
    expect(ledgerEntries[1]).toMatchObject({
      entryType: "billing_dispute_refund",
      amount: "-2.50",
      balanceBefore: "10.00",
      balanceAfter: "7.50",
    });
  });
});
