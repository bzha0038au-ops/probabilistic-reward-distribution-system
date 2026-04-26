import { describe, expect, it } from 'vitest';

import { applyPaymentAutomationUpdate } from './auto-execution';

describe('applyPaymentAutomationUpdate', () => {
  it('does not credit a deposit twice for the same provider callback', () => {
    const snapshot = {
      flow: 'deposit' as const,
      orderStatus: 'provider_succeeded' as const,
      amount: '25.50',
      credited: false,
      wallet: {
        withdrawableBalance: '0.00',
        lockedBalance: '0.00',
      },
      reconciliationRequired: false,
      providerStatus: 'provider_succeeded',
      processedUpdateKeys: [],
    };

    const first = applyPaymentAutomationUpdate(snapshot, {
      source: 'provider_callback',
      dedupeKey: 'provider:deposit-1:success',
      status: 'success',
      providerStatus: 'success',
    });

    expect(first.snapshot).toMatchObject({
      orderStatus: 'credited',
      credited: true,
      wallet: {
        withdrawableBalance: '25.50',
        lockedBalance: '0.00',
      },
    });
    expect(first.effects).toEqual([{ type: 'credit_wallet', amount: '25.50' }]);

    const duplicate = applyPaymentAutomationUpdate(first.snapshot, {
      source: 'provider_callback',
      dedupeKey: 'provider:deposit-1:success',
      status: 'success',
      providerStatus: 'success',
    });

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.stateChanged).toBe(false);
    expect(duplicate.effects).toEqual([]);
    expect(duplicate.snapshot).toEqual(first.snapshot);
  });

  it('keeps local deposit credit idempotent even if success is observed more than once', () => {
    const first = applyPaymentAutomationUpdate(
      {
        flow: 'deposit' as const,
        orderStatus: 'provider_succeeded' as const,
        amount: '18.00',
        credited: false,
        wallet: {
          withdrawableBalance: '0.00',
          lockedBalance: '0.00',
        },
        reconciliationRequired: false,
        providerStatus: 'provider_succeeded',
        processedUpdateKeys: [],
      },
      {
        source: 'provider_callback',
        dedupeKey: 'provider:deposit-2:success:1',
        status: 'success',
      }
    );

    const second = applyPaymentAutomationUpdate(first.snapshot, {
      source: 'reconciliation',
      dedupeKey: 'recon:deposit-2:success:2',
      status: 'success',
    });

    expect(first.effects).toEqual([{ type: 'credit_wallet', amount: '18.00' }]);
    expect(second.effects).toEqual([]);
    expect(second.duplicate).toBe(false);
    expect(second.snapshot).toMatchObject({
      orderStatus: 'credited',
      credited: true,
      wallet: {
        withdrawableBalance: '18.00',
        lockedBalance: '0.00',
      },
    });
    expect(second.snapshot.processedUpdateKeys).toEqual([
      'provider:deposit-2:success:1',
      'recon:deposit-2:success:2',
    ]);
  });

  it('marks timeout for reconciliation and lets a later reconciliation success fill the gap', () => {
    const timedOut = applyPaymentAutomationUpdate(
      {
        flow: 'deposit' as const,
        orderStatus: 'provider_pending' as const,
        amount: '30.00',
        credited: false,
        wallet: {
          withdrawableBalance: '0.00',
          lockedBalance: '0.00',
        },
        reconciliationRequired: false,
        providerStatus: 'provider_pending',
        processedUpdateKeys: [],
      },
      {
        source: 'provider_callback',
        dedupeKey: 'provider:deposit-3:timeout',
        status: 'timeout',
      }
    );

    expect(timedOut.snapshot).toMatchObject({
      orderStatus: 'provider_pending',
      credited: false,
      reconciliationRequired: true,
      providerStatus: 'timeout',
      wallet: {
        withdrawableBalance: '0.00',
      },
    });
    expect(timedOut.effects).toEqual([{ type: 'mark_reconciliation_required' }]);

    const reconciled = applyPaymentAutomationUpdate(timedOut.snapshot, {
      source: 'reconciliation',
      dedupeKey: 'recon:deposit-3:success',
      status: 'success',
      providerStatus: 'success',
    });

    expect(reconciled.snapshot).toMatchObject({
      orderStatus: 'credited',
      credited: true,
      reconciliationRequired: false,
      providerStatus: 'success',
      wallet: {
        withdrawableBalance: '30.00',
      },
    });
    expect(reconciled.effects).toEqual([
      { type: 'credit_wallet', amount: '30.00' },
    ]);
  });

  it('marks provider failure without unlocking withdrawal funds', () => {
    const failed = applyPaymentAutomationUpdate(
      {
        flow: 'withdrawal' as const,
        orderStatus: 'provider_processing' as const,
        amount: '40.00',
        lockedAmount: '40.00',
        wallet: {
          withdrawableBalance: '60.00',
          lockedBalance: '40.00',
        },
        reconciliationRequired: false,
        providerStatus: 'processing',
        processedUpdateKeys: [],
      },
      {
        source: 'provider_callback',
        dedupeKey: 'provider:withdraw-1:failed',
        status: 'failed',
        providerStatus: 'failed',
      }
    );

    expect(failed.snapshot).toMatchObject({
      orderStatus: 'provider_failed',
      reconciliationRequired: false,
      wallet: {
        withdrawableBalance: '60.00',
        lockedBalance: '40.00',
      },
    });
    expect(failed.effects).toEqual([]);

    const duplicate = applyPaymentAutomationUpdate(failed.snapshot, {
      source: 'provider_callback',
      dedupeKey: 'provider:withdraw-1:failed',
      status: 'failed',
      providerStatus: 'failed',
    });

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.effects).toEqual([]);
    expect(duplicate.snapshot).toEqual(failed.snapshot);
  });
});
