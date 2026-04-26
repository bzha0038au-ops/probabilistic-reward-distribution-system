import { describe, expect, it } from 'vitest';

import {
  buildOrderFindings,
  buildProviderAdapterMissingFinding,
  buildRemoteOnlyFinding,
} from './reconciliation';

describe('payment reconciliation logic', () => {
  it('flags missing provider references for local orders', () => {
    const findings = buildOrderFindings({
      providerId: 7,
      order: {
        flow: 'deposit',
        orderId: 11,
        providerId: 7,
        amount: '100.00',
        status: 'requested',
        providerReference: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      remote: null,
      ledger: {
        status: 'ok',
        healthy: true,
      },
      now: new Date('2026-01-01T01:00:00.000Z'),
      timeoutMs: 15 * 60_000,
    });

    expect(findings.map((finding) => finding.issueType)).toContain(
      'missing_provider_reference'
    );
    expect(findings.map((finding) => finding.issueType)).toContain(
      'timed_out_non_terminal'
    );
  });

  it('flags status and ledger mismatches when provider/local/ledger diverge', () => {
    const findings = buildOrderFindings({
      providerId: 7,
      order: {
        flow: 'withdrawal',
        orderId: 19,
        providerId: 7,
        amount: '88.00',
        status: 'approved',
        providerReference: 'wd-19',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:30:00.000Z'),
      },
      remote: {
        flow: 'withdrawal',
        providerOrderId: 'remote-19',
        referenceId: 'wd-19',
        status: 'paid',
        amount: '88.00',
      },
      ledger: {
        status: 'missing_paid_entry',
        healthy: false,
      },
      now: new Date('2026-01-01T00:31:00.000Z'),
      timeoutMs: 15 * 60_000,
    });

    expect(findings.map((finding) => finding.issueType)).toEqual(
      expect.arrayContaining(['order_status_mismatch', 'ledger_mismatch'])
    );
  });

  it('creates a provider-level issue when no reconciliation adapter exists', () => {
    expect(
      buildProviderAdapterMissingFinding({
        providerId: 3,
        flow: 'deposit',
        adapterKey: 'stripe',
      })
    ).toMatchObject({
      flow: 'provider',
      issueType: 'provider_adapter_missing',
      severity: 'critical',
    });
  });

  it('creates an orphan remote-order issue for provider orders without a local record', () => {
    expect(
      buildRemoteOnlyFinding({
        providerId: 4,
        remote: {
          flow: 'deposit',
          providerOrderId: 'remote-88',
          referenceId: 'dep-88',
          status: 'success',
          amount: '120.00',
        },
      })
    ).toMatchObject({
      orderType: 'deposit',
      issueType: 'local_order_missing',
      remoteReference: 'dep-88',
      severity: 'critical',
    });
  });

  it('does not keep provider-order-missing open after a terminal failure or reversal', () => {
    const findings = buildOrderFindings({
      providerId: 9,
      order: {
        flow: 'withdrawal',
        orderId: 27,
        providerId: 9,
        amount: '42.00',
        status: 'reversed',
        providerReference: 'wd-27',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:45:00.000Z'),
      },
      remote: null,
      ledger: {
        status: 'ok',
        healthy: true,
      },
      now: new Date('2026-01-01T01:00:00.000Z'),
      timeoutMs: 15 * 60_000,
    });

    expect(findings.map((finding) => finding.issueType)).not.toContain(
      'provider_order_missing'
    );
  });
});
