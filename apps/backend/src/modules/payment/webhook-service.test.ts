import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/reward_test';
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;

let derivePaymentWebhookTransition: typeof import('./webhook').derivePaymentWebhookTransition;
let readPaymentWebhookEventId: typeof import('./webhook').readPaymentWebhookEventId;
let readPaymentWebhookEventIdFromHeaders: typeof import('./webhook').readPaymentWebhookEventIdFromHeaders;
let readPaymentWebhookSignatureFromHeaders: typeof import('./webhook').readPaymentWebhookSignatureFromHeaders;

beforeAll(async () => {
  const mod = await import('./webhook');
  derivePaymentWebhookTransition = mod.derivePaymentWebhookTransition;
  readPaymentWebhookEventId = mod.readPaymentWebhookEventId;
  readPaymentWebhookEventIdFromHeaders = mod.readPaymentWebhookEventIdFromHeaders;
  readPaymentWebhookSignatureFromHeaders = mod.readPaymentWebhookSignatureFromHeaders;
});

describe('payment webhook helpers', () => {
  it('extracts event ids from nested payloads and headers', () => {
    expect(
      readPaymentWebhookEventId({
        data: {
          object: {
            id: 'evt_nested_1',
          },
        },
      })
    ).toBe('evt_nested_1');

    expect(
      readPaymentWebhookEventIdFromHeaders({
        'x-event-id': 'evt_header_1',
      })
    ).toBe('evt_header_1');
  });

  it('extracts signatures from common webhook headers', () => {
    expect(
      readPaymentWebhookSignatureFromHeaders({
        'x-payment-signature': 'sha256=abc123',
      })
    ).toBe('sha256=abc123');
  });

  it('maps deposit success payloads into provider success actions', () => {
    expect(
      derivePaymentWebhookTransition(
        {
          id: 'evt_dep_1',
          type: 'deposit.succeeded',
          data: {
            referenceType: 'deposit',
            referenceId: 18,
            status: 'succeeded',
            settlementReference: 'gw-dep-1',
          },
        },
        'stripe'
      )
    ).toEqual({
      decision: 'process',
      orderType: 'deposit',
      orderId: 18,
      action: 'deposit_mark_provider_succeeded',
      providerStatus: 'succeeded',
      settlementReference: 'gw-dep-1',
      processingChannel: 'stripe',
      eventType: 'deposit.succeeded',
    });
  });

  it('maps real stripe checkout session payloads by reading order references from metadata', () => {
    expect(
      derivePaymentWebhookTransition(
        {
          id: 'evt_checkout_complete_1',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_123',
              status: 'complete',
              payment_status: 'paid',
              client_reference_id: '44',
              metadata: {
                referenceType: 'deposit',
                orderId: '44',
                referenceId: '44',
              },
            },
          },
        },
        'stripe'
      )
    ).toEqual({
      decision: 'process',
      orderType: 'deposit',
      orderId: 44,
      action: 'deposit_mark_provider_succeeded',
      providerStatus: 'paid',
      settlementReference: null,
      processingChannel: 'stripe',
      eventType: 'checkout.session.completed',
    });
  });

  it('maps deposit pending payloads into provider pending actions', () => {
    expect(
      derivePaymentWebhookTransition(
        {
          id: 'evt_dep_2',
          type: 'deposit.pending',
          data: {
            referenceType: 'deposit',
            referenceId: 19,
            status: 'pending',
          },
        },
        'stripe'
      )
    ).toEqual({
      decision: 'process',
      action: 'deposit_mark_provider_pending',
      eventType: 'deposit.pending',
      providerStatus: 'pending',
      settlementReference: null,
      processingChannel: 'stripe',
      orderType: 'deposit',
      orderId: 19,
    });
  });

  it('ignores unknown webhook event types with non-actionable provider statuses', () => {
    expect(
      derivePaymentWebhookTransition(
        {
          id: 'evt_unknown_1',
          type: 'provider.unknown',
          data: {
            referenceType: 'deposit',
            referenceId: 21,
            status: 'mystery',
          },
        },
        'stripe'
      )
    ).toEqual({
      decision: 'ignore',
      reason: 'status_not_actionable',
      eventType: 'provider.unknown',
      providerStatus: 'mystery',
      orderType: 'deposit',
      orderId: 21,
    });
  });

  it('ignores payloads that do not carry an order reference', () => {
    expect(
      derivePaymentWebhookTransition(
        {
          id: 'evt_missing_reference_1',
          type: 'deposit.succeeded',
          data: {
            status: 'succeeded',
          },
        },
        'stripe'
      )
    ).toEqual({
      decision: 'ignore',
      reason: 'missing_order_reference',
      eventType: 'deposit.succeeded',
      providerStatus: 'succeeded',
      orderType: 'deposit',
      orderId: null,
    });
  });

  it('maps withdrawal completion payloads into payout actions', () => {
    expect(
      derivePaymentWebhookTransition(
        {
          id: 'evt_wd_1',
          type: 'withdrawal.completed',
          data: {
            referenceType: 'withdrawal',
            referenceId: 27,
            status: 'completed',
            settlementReference: 'gw-wd-1',
          },
        },
        'stripe'
      )
    ).toEqual({
      decision: 'process',
      orderType: 'withdrawal',
      orderId: 27,
      action: 'withdrawal_pay',
      providerStatus: 'completed',
      settlementReference: 'gw-wd-1',
      processingChannel: 'stripe',
      eventType: 'withdrawal.completed',
    });
  });
});
