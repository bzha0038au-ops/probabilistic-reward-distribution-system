import { describe, expect, it } from 'vitest';

import {
  saasBillingAccountVersions,
  saasBillingRuns,
  saasBillingTopUps,
} from '@reward/database';

import {
  buildBillingRunInvoiceCreateIdempotencyKey,
  buildBillingTopUpIdempotencyKey,
  selectBillingAccountVersionForPeriod,
} from './billing';

const makeBillingAccountVersion = (
  overrides: Partial<typeof saasBillingAccountVersions.$inferSelect> = {}
) =>
  ({
    id: 1,
    tenantId: 10,
    billingAccountId: 20,
    planCode: 'starter',
    stripeCustomerId: 'cus_123',
    collectionMethod: 'send_invoice',
    autoBillingEnabled: true,
    portalConfigurationId: null,
    baseMonthlyFee: '99.00',
    drawFee: '1.5000',
    currency: 'USD',
    isBillable: true,
    metadata: null,
    effectiveAt: new Date('2026-04-01T00:00:00.000Z'),
    createdByAdminId: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  }) as typeof saasBillingAccountVersions.$inferSelect;

const makeBillingRun = (
  overrides: Partial<typeof saasBillingRuns.$inferSelect> = {}
) =>
  ({
    id: 42,
    tenantId: 10,
    billingAccountId: 20,
    billingAccountVersionId: 1,
    status: 'draft',
    periodStart: new Date('2026-04-01T00:00:00.000Z'),
    periodEnd: new Date('2026-05-01T00:00:00.000Z'),
    currency: 'USD',
    baseFeeAmount: '99.00',
    usageFeeAmount: '12.50',
    creditAppliedAmount: '0.00',
    totalAmount: '111.50',
    drawCount: 5,
    stripeCustomerId: 'cus_123',
    stripeInvoiceId: null,
    stripeInvoiceStatus: null,
    stripeHostedInvoiceUrl: null,
    stripeInvoicePdf: null,
    syncedAt: null,
    finalizedAt: null,
    sentAt: null,
    paidAt: null,
    metadata: null,
    createdByAdminId: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }) as typeof saasBillingRuns.$inferSelect;

const makeBillingTopUp = (
  overrides: Partial<typeof saasBillingTopUps.$inferSelect> = {}
) =>
  ({
    id: 8,
    tenantId: 10,
    billingAccountId: 20,
    amount: '25.00',
    currency: 'USD',
    note: null,
    status: 'pending',
    stripeCustomerId: 'cus_123',
    stripeBalanceTransactionId: null,
    syncedAt: null,
    metadata: null,
    createdByAdminId: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }) as typeof saasBillingTopUps.$inferSelect;

describe('saas billing helpers', () => {
  it('uses the version active at period start over later changes in the same period', () => {
    const periodStart = new Date('2026-04-01T00:00:00.000Z');
    const periodEnd = new Date('2026-05-01T00:00:00.000Z');

    const selected = selectBillingAccountVersionForPeriod(
      [
        makeBillingAccountVersion({
          id: 1,
          effectiveAt: new Date('2026-03-15T00:00:00.000Z'),
          baseMonthlyFee: '99.00',
        }),
        makeBillingAccountVersion({
          id: 2,
          effectiveAt: new Date('2026-04-20T00:00:00.000Z'),
          baseMonthlyFee: '149.00',
        }),
      ],
      periodStart,
      periodEnd
    );

    expect(selected?.id).toBe(1);
    expect(selected?.baseMonthlyFee).toBe('99.00');
  });

  it('falls back to the first in-period version when no version existed at period start', () => {
    const periodStart = new Date('2026-04-01T00:00:00.000Z');
    const periodEnd = new Date('2026-05-01T00:00:00.000Z');

    const selected = selectBillingAccountVersionForPeriod(
      [
        makeBillingAccountVersion({
          id: 3,
          effectiveAt: new Date('2026-04-10T00:00:00.000Z'),
        }),
        makeBillingAccountVersion({
          id: 4,
          effectiveAt: new Date('2026-04-25T00:00:00.000Z'),
        }),
      ],
      periodStart,
      periodEnd
    );

    expect(selected?.id).toBe(3);
  });

  it('keeps invoice idempotency keys stable for identical billing runs', () => {
    const run = makeBillingRun();

    expect(buildBillingRunInvoiceCreateIdempotencyKey(run)).toBe(
      buildBillingRunInvoiceCreateIdempotencyKey(makeBillingRun())
    );
  });

  it('changes idempotency keys when invoice or top-up money changes', () => {
    expect(
      buildBillingRunInvoiceCreateIdempotencyKey(makeBillingRun({ usageFeeAmount: '12.50' }))
    ).not.toBe(
      buildBillingRunInvoiceCreateIdempotencyKey(makeBillingRun({ usageFeeAmount: '13.50' }))
    );

    expect(
      buildBillingTopUpIdempotencyKey(makeBillingTopUp({ amount: '25.00' }))
    ).not.toBe(
      buildBillingTopUpIdempotencyKey(makeBillingTopUp({ amount: '30.00' }))
    );
  });
});
