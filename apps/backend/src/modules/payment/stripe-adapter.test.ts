import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/reward_test';
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;

const stripeMocks = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsRetrieve: vi.fn(),
  sessionsList: vi.fn(),
  constructEvent: vi.fn(),
  getStripeClient: vi.fn(),
  resolveStripeSecretKey: vi.fn(),
}));

vi.mock('./adapters/stripe/client', async () => {
  return {
    extractStripeReferenceId: vi.fn(),
    getStripeClient: stripeMocks.getStripeClient,
    mapStripeCheckoutSessionStatus: (session: {
      status: string | null;
      payment_status: string | null;
    }) => ({
      status:
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required'
          ? ('success' as const)
          : session.status === 'expired'
            ? ('failed' as const)
            : ('pending' as const),
      rawStatus: `${session.status ?? 'open'}:${session.payment_status ?? 'unpaid'}`,
    }),
    readStripeCheckoutCancelUrl: vi.fn(() => 'https://example.test/cancel'),
    readStripeCheckoutProductName: vi.fn(
      (_config: Record<string, unknown>, internalOrderId: number) =>
        `Wallet deposit #${internalOrderId}`
    ),
    readStripeCheckoutSuccessUrl: vi.fn(
      () => 'https://example.test/success?session_id={CHECKOUT_SESSION_ID}'
    ),
    readStripeCurrency: vi.fn(() => 'usd'),
    resolvePaymentProviderWebhookSecret: vi.fn(),
    resolveStripeSecretKey: stripeMocks.resolveStripeSecretKey,
    toStripeAmount: (value: string | number) =>
      Math.round(Number(value) * 100),
    verifyStripeWebhookSignature: vi.fn(),
  };
});

import { stripePaymentAdapter } from './adapters/stripe/adapter';

beforeEach(() => {
  stripeMocks.sessionsCreate.mockReset();
  stripeMocks.sessionsRetrieve.mockReset();
  stripeMocks.sessionsList.mockReset();
  stripeMocks.constructEvent.mockReset();
  stripeMocks.getStripeClient.mockReset();
  stripeMocks.resolveStripeSecretKey.mockReset();

  stripeMocks.getStripeClient.mockReturnValue({
    checkout: {
      sessions: {
        create: stripeMocks.sessionsCreate,
        retrieve: stripeMocks.sessionsRetrieve,
        list: stripeMocks.sessionsList,
      },
    },
    webhooks: {
      constructEvent: stripeMocks.constructEvent,
    },
  });
  stripeMocks.resolveStripeSecretKey.mockReturnValue('sk_test_reward');
});

describe('stripePaymentAdapter', () => {
  it('builds stable idempotency keys for repeated checkout creation attempts', () => {
    expect(
      stripePaymentAdapter.buildIdempotencyKey({
        flow: 'deposit',
        providerId: 17,
        internalOrderId: 44,
        operation: 'checkout session create',
      })
    ).toBe('stripe:deposit:17:44:checkout_session_create');
  });

  it('passes the generated idempotency key into Stripe checkout session creation', async () => {
    stripeMocks.sessionsCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/session/cs_test_123',
      status: 'open',
      payment_status: 'unpaid',
      client_reference_id: '44',
      metadata: {
        orderId: '44',
        referenceId: '44',
      },
    });

    const idempotencyKey = stripePaymentAdapter.buildIdempotencyKey({
      flow: 'deposit',
      providerId: 17,
      internalOrderId: 44,
      operation: 'checkout session create',
    });

    const result = await stripePaymentAdapter.createDepositOrder({
      providerId: 17,
      providerName: 'stripe',
      flow: 'deposit',
      config: {
        currency: 'usd',
      },
      internalOrderId: 44,
      userId: 91,
      amount: '18.50',
      idempotencyKey,
      referenceId: 'merchant-ref-44',
    });

    expect(stripeMocks.getStripeClient).toHaveBeenCalledWith('sk_test_reward');
    expect(stripeMocks.sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: '44',
        metadata: expect.objectContaining({
          flow: 'deposit',
          orderId: '44',
          referenceId: '44',
          providerId: '17',
          userId: '91',
          externalReferenceId: 'merchant-ref-44',
        }),
      }),
      {
        idempotencyKey,
      }
    );
    expect(result).toMatchObject({
      providerOrderId: 'cs_test_123',
      status: 'pending',
      rawStatus: 'open:unpaid',
    });
  });
});
