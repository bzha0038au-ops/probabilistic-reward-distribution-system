import { internalInvariantError } from '../../../../shared/errors';
import type {
  PaymentAdapter,
  PaymentAdapterCreateDepositOrderInput,
  PaymentAdapterMapStatusInput,
  PaymentAdapterReconciliationOrder,
} from '../contract';
import {
  extractStripeReferenceId,
  getStripeClient,
  mapStripeCheckoutSessionStatus,
  readStripeCheckoutCancelUrl,
  readStripeCheckoutProductName,
  readStripeCheckoutSuccessUrl,
  readStripeCurrency,
  resolvePaymentProviderWebhookSecret,
  resolveStripeSecretKey,
  toStripeAmount,
  verifyStripeWebhookSignature,
} from './client';

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readDate = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }

  return null;
};

const normalizeProviderStatus = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const unsupportedStripeOperation = (operation: string): never => {
  throw internalInvariantError(
    `Payment adapter "stripe" does not support ${operation} for the requested flow.`
  );
};

const getStripeClientForConfig = (
  providerName: string | null | undefined,
  configValue: Record<string, unknown>
) => {
  const secretKey = resolveStripeSecretKey(providerName, configValue);
  if (!secretKey) {
    throw internalInvariantError(
      'Stripe payment adapter requires a secret key via config.secretRefs.apiKey or the legacy PAYMENT_STRIPE_SECRET_KEY / provider env fallback.'
    );
  }

  return getStripeClient(secretKey);
};

const buildStripeCheckoutMetadata = (input: PaymentAdapterCreateDepositOrderInput) => ({
  flow: 'deposit',
  orderId: String(input.internalOrderId),
  referenceType: 'deposit',
  referenceId: String(input.internalOrderId),
  providerId: input.providerId === null ? '' : String(input.providerId),
  userId: String(input.userId),
  ...(input.referenceId ? { externalReferenceId: input.referenceId } : {}),
});

const mapStripeProviderStatus = ({
  flow,
  providerStatus,
}: PaymentAdapterMapStatusInput) => {
  const normalized = normalizeProviderStatus(providerStatus);

  if (flow === 'deposit') {
    if (
      normalized === 'paid' ||
      normalized === 'success' ||
      normalized === 'succeeded' ||
      normalized === 'complete' ||
      normalized === 'completed'
    ) {
      return 'success' as const;
    }
    if (normalized === 'expired' || normalized === 'failed' || normalized === 'canceled') {
      return 'failed' as const;
    }

    return 'pending' as const;
  }

  if (normalized === 'paid' || normalized === 'success' || normalized === 'succeeded') {
    return 'paid' as const;
  }
  if (normalized === 'approved' || normalized === 'submitted') {
    return 'approved' as const;
  }
  if (normalized === 'failed' || normalized === 'rejected' || normalized === 'canceled') {
    return 'rejected' as const;
  }

  return 'processing' as const;
};

const toReconciliationOrder = (
  session: {
    id: string;
    status: string | null;
    payment_status: string | null;
    url: string | null;
    client_reference_id: string | null;
    metadata: Record<string, string> | null;
    created?: number | null;
  }
): PaymentAdapterReconciliationOrder => {
  const mapped = mapStripeCheckoutSessionStatus(session);

  return {
    flow: 'deposit',
    providerOrderId: session.id,
    referenceId: extractStripeReferenceId(session),
    status: mapped.status,
    rawStatus: mapped.rawStatus,
    metadata: {
      redirectUrl: session.url ?? null,
      clientReferenceId: session.client_reference_id ?? null,
      paymentStatus: session.payment_status ?? null,
      checkoutStatus: session.status ?? null,
      source: 'stripe_checkout_session',
    },
    updatedAt: readDate(session.created)?.toISOString() ?? null,
  };
};

export const stripePaymentAdapter: PaymentAdapter = {
  key: 'stripe',
  displayName: 'Stripe Checkout',
  supportedFlows: ['deposit'],
  supportsAutomation: true,
  supportsReconciliation: true,
  validateConfiguration(input) {
    const configValue = toRecord(input.config);
    const secretKey = resolveStripeSecretKey(input.providerName, configValue);
    if (!secretKey) {
      throw internalInvariantError(
        `Active Stripe payment provider "${input.providerName ?? input.providerId ?? 'unknown'}" is missing a usable API secret. Configure config.secretRefs.apiKey or keep the legacy Stripe env fallback until the provider row is migrated.`
      );
    }
  },
  async createDepositOrder(input) {
    const configValue = toRecord(input.config);
    const stripe = getStripeClientForConfig(input.providerName, configValue);
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        success_url: readStripeCheckoutSuccessUrl(configValue),
        cancel_url: readStripeCheckoutCancelUrl(configValue),
        client_reference_id: String(input.internalOrderId),
        metadata: buildStripeCheckoutMetadata(input),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: readStripeCurrency(configValue),
              unit_amount: toStripeAmount(input.amount),
              product_data: {
                name: readStripeCheckoutProductName(
                  configValue,
                  input.internalOrderId
                ),
              },
            },
          },
        ],
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );
    const mapped = mapStripeCheckoutSessionStatus(session);

    return {
      providerOrderId: session.id,
      redirectUrl: session.url ?? null,
      status: mapped.status,
      rawStatus: mapped.rawStatus,
      metadata: {
        checkoutStatus: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        redirectUrl: session.url ?? null,
        clientReferenceId: session.client_reference_id ?? null,
      },
    };
  },
  async createWithdrawal() {
    return unsupportedStripeOperation('createWithdrawal');
  },
  async queryOrder(input) {
    if (!input.providerOrderId) {
      throw internalInvariantError(
        'Stripe order queries require a providerOrderId checkout session id.'
      );
    }

    const configValue = toRecord(input.config);
    const stripe = getStripeClientForConfig(input.providerName, configValue);
    const session = await stripe.checkout.sessions.retrieve(input.providerOrderId);
    const mapped = mapStripeCheckoutSessionStatus(session);

    return {
      internalOrderId: input.internalOrderId,
      providerOrderId: session.id,
      status: mapped.status,
      rawStatus: mapped.rawStatus,
      metadata: {
        checkoutStatus: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        redirectUrl: session.url ?? null,
        clientReferenceId: session.client_reference_id ?? null,
      },
    };
  },
  async handleWebhook(input) {
    const payload = toRecord(input.payload);
    const data = toRecord(Reflect.get(payload, 'data'));
    const session = toRecord(Reflect.get(data, 'object'));
    const metadata = toRecord(Reflect.get(session, 'metadata'));
    const orderIdValue =
      readString(Reflect.get(metadata, 'orderId')) ??
      readString(Reflect.get(metadata, 'referenceId')) ??
      readString(Reflect.get(session, 'client_reference_id'));
    const orderId =
      orderIdValue && /^\d+$/.test(orderIdValue)
        ? Number.parseInt(orderIdValue, 10)
        : null;
    const status = mapStripeProviderStatus({
      flow: 'deposit',
      providerStatus:
        readString(Reflect.get(session, 'payment_status')) ??
        readString(Reflect.get(session, 'status')) ??
        'pending',
    });

    return {
      accepted: true,
      internalOrderId: orderId,
      providerOrderId: readString(Reflect.get(session, 'id')),
      status,
      metadata: {
        eventType: readString(Reflect.get(payload, 'type')),
      },
    };
  },
  async verifySignature(input) {
    const configValue = toRecord(input.config);
    const secret = resolvePaymentProviderWebhookSecret(
      input.providerName,
      configValue
    );
    const signature =
      readString(input.headers['stripe-signature']) ??
      readString(input.headers['Stripe-Signature']);
    if (!secret || !signature) {
      return false;
    }

    try {
      verifyStripeWebhookSignature({
        payloadRaw: input.rawBody,
        signature,
        secret,
      });
      return true;
    } catch {
      return false;
    }
  },
  buildIdempotencyKey(input) {
    return [
      'stripe',
      input.flow,
      input.providerId ?? 'no_provider',
      input.internalOrderId,
      normalizeProviderStatus(input.operation),
    ].join(':');
  },
  async listOrdersForReconciliation(input) {
    if (!input.flows.includes('deposit')) {
      return [];
    }

    const configValue = toRecord(input.config);
    const stripe = getStripeClientForConfig(input.providerName, configValue);
    const response = await stripe.checkout.sessions.list({
      limit: 100,
      created: {
        gte: Math.floor(input.since.getTime() / 1000),
        lte: Math.ceil(input.until.getTime() / 1000),
      },
    });

    return response.data.map((session) => toReconciliationOrder(session));
  },
  mapProviderStatusToInternalStatus(input) {
    return mapStripeProviderStatus(input);
  },
};
