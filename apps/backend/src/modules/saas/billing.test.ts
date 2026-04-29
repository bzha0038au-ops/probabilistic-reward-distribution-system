import { describe, expect, it } from 'vitest';

import {
  saasBillingAccountVersions,
  saasBillingRuns,
  saasBillingTopUps,
} from '@reward/database';

import {
  billingRunSyncConflictError,
  buildBillingRunInvoiceCreateIdempotencyKey,
  buildBillingTopUpIdempotencyKey,
  isBillingRunSyncConflictError,
  resolveBillingRunExternalSyncTransition,
  resolveBillingDecisionPricing,
  selectBillingAccountVersionForPeriod,
  summarizeUsageEventsForBilling,
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
    externalSyncStatus: 'idle',
    externalSyncAction: null,
    externalSyncStage: null,
    externalSyncError: null,
    externalSyncRecoveryPath: null,
    externalSyncObservedInvoiceStatus: null,
    externalSyncEventType: null,
    externalSyncRevision: 0,
    externalSyncAttemptedAt: null,
    externalSyncCompletedAt: null,
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

  it('resolves decision pricing from metadata and falls back to draw fee', () => {
    expect(resolveBillingDecisionPricing(null, '1.5000')).toEqual({
      reject: '1.5000',
      mute: '1.5000',
      payout: '1.5000',
    });

    expect(
      resolveBillingDecisionPricing(
        {
          decisionPricing: {
            reject: '0.1000',
            mute: '0.4000',
            payout: '1.9000',
          },
        },
        '1.5000'
      )
    ).toEqual({
      reject: '0.1000',
      mute: '0.4000',
      payout: '1.9000',
    });
  });

  it('summarizes usage by decision type and infers legacy draw outcomes from metadata', () => {
    const summary = summarizeUsageEventsForBilling(
      [
        {
          eventType: 'draw:write',
          decisionType: null,
          units: 2,
          amount: '1.5000',
          metadata: { status: 'miss' },
        },
        {
          eventType: 'reward:write',
          decisionType: 'payout',
          units: 1,
          amount: '1.5000',
          metadata: null,
        },
      ],
      {
        reject: '0.1000',
        mute: '0.2500',
        payout: '1.5000',
      }
    );

    expect(summary.usageFeeAmount).toBe('2.00');
    expect(summary.drawCount).toBe(3);
    expect(summary.decisionBreakdown).toEqual([
      {
        decisionType: 'mute',
        units: 2,
        unitAmount: '0.2500',
        totalAmount: '0.50',
      },
      {
        decisionType: 'payout',
        units: 1,
        unitAmount: '1.5000',
        totalAmount: '1.50',
      },
    ]);
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

  it('changes invoice idempotency keys when decision breakdown changes at the same total', () => {
    expect(
      buildBillingRunInvoiceCreateIdempotencyKey(
        makeBillingRun({
          metadata: {
            decisionBreakdown: [
              {
                decisionType: 'mute',
                units: 2,
                unitAmount: '0.2500',
                totalAmount: '0.50',
              },
              {
                decisionType: 'payout',
                units: 8,
                unitAmount: '1.5000',
                totalAmount: '12.00',
              },
            ],
          },
        })
      )
    ).not.toBe(
      buildBillingRunInvoiceCreateIdempotencyKey(
        makeBillingRun({
          metadata: {
            decisionBreakdown: [
              {
                decisionType: 'reject',
                units: 5,
                unitAmount: '0.1000',
                totalAmount: '0.50',
              },
              {
                decisionType: 'payout',
                units: 8,
                unitAmount: '1.5000',
                totalAmount: '12.00',
              },
            ],
          },
        })
      )
    );
  });

  it('allows only valid external sync state transitions', () => {
    expect(resolveBillingRunExternalSyncTransition('idle', 'processing')).toBe(
      'processing'
    );
    expect(
      resolveBillingRunExternalSyncTransition('processing', 'processing')
    ).toBe('processing');
    expect(
      resolveBillingRunExternalSyncTransition('processing', 'succeeded')
    ).toBe('succeeded');
    expect(resolveBillingRunExternalSyncTransition('failed', 'processing')).toBe(
      'processing'
    );
    expect(() =>
      resolveBillingRunExternalSyncTransition('idle', 'failed')
    ).toThrow('Billing run external sync transition is invalid.');
  });

  it('identifies billing run sync CAS conflicts', () => {
    const error = billingRunSyncConflictError();

    expect(isBillingRunSyncConflictError(error)).toBe(true);
    expect(isBillingRunSyncConflictError(new Error('other'))).toBe(false);
  });
});
