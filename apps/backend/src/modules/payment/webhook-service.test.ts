import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/reward_test';
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;

let derivePaymentWebhookTransition: typeof import('./webhook-service').derivePaymentWebhookTransition;
let readPaymentWebhookEventId: typeof import('./webhook-service').readPaymentWebhookEventId;
let readPaymentWebhookEventIdFromHeaders: typeof import('./webhook-service').readPaymentWebhookEventIdFromHeaders;
let readPaymentWebhookSignatureFromHeaders: typeof import('./webhook-service').readPaymentWebhookSignatureFromHeaders;

beforeAll(async () => {
  const mod = await import('./webhook-service');
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
