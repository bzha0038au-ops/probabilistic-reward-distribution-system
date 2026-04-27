import { createRequire } from 'node:module';
import Decimal from 'decimal.js';

import { instrumentStripeClient } from '../../../../shared/stripe-observability';

import { readPaymentProviderSecretRefs } from '../../provider-config';
import { resolvePaymentProviderSecretReference } from '../../secret-resolver';

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status: string | null;
  payment_status: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  created?: number | null;
};

type StripeClient = {
  checkout: {
    sessions: {
      create(
        input: Record<string, unknown>,
        options?: { idempotencyKey?: string }
      ): Promise<StripeCheckoutSession>;
      retrieve(sessionId: string): Promise<StripeCheckoutSession>;
      list(input: Record<string, unknown>): Promise<{ data: StripeCheckoutSession[] }>;
    };
  };
  webhooks: {
    constructEvent(
      payloadRaw: string,
      signature: string,
      secret: string
    ): StripeWebhookEvent;
  };
};

type StripeConstructor = new (
  secretKey: string,
  options: { apiVersion: string }
) => StripeClient;

const PAYMENT_STRIPE_API_VERSION = '2026-02-25.clover';

let cachedStripeConstructor: StripeConstructor | null = null;
const cachedStripeClients = new Map<string, StripeClient>();

const require = createRequire(import.meta.url);

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const normalizeEnvToken = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const resolveProviderEnvValue = (
  prefix: string,
  providerName: string | null | undefined
) => {
  const normalized = providerName ? normalizeEnvToken(providerName) : '';
  if (normalized === '') {
    return null;
  }

  return readString(process.env[`${prefix}${normalized}`]);
};

export const resolvePaymentProviderWebhookSecret = (
  providerName: string | null | undefined,
  configValue: Record<string, unknown>
) => {
  const secretRefs = readPaymentProviderSecretRefs(configValue);
  if (secretRefs.signingKey) {
    return resolvePaymentProviderSecretReference(secretRefs.signingKey);
  }

  const explicitEnvName = readString(Reflect.get(configValue, 'webhookSecretEnv'));
  if (explicitEnvName) {
    return readString(process.env[explicitEnvName]) ?? null;
  }

  return (
    resolveProviderEnvValue('PAYMENT_WEBHOOK_SECRET__', providerName) ??
    readString(Reflect.get(configValue, 'webhookSecret'))
  );
};

export const resolveStripeSecretKey = (
  providerName: string | null | undefined,
  configValue: Record<string, unknown>
) => {
  const secretRefs = readPaymentProviderSecretRefs(configValue);
  if (secretRefs.apiKey) {
    return resolvePaymentProviderSecretReference(secretRefs.apiKey);
  }

  const explicitEnvName =
    readString(Reflect.get(configValue, 'apiKeyEnv')) ??
    readString(Reflect.get(configValue, 'secretKeyEnv')) ??
    readString(Reflect.get(configValue, 'stripeSecretKeyEnv'));
  if (explicitEnvName) {
    return readString(process.env[explicitEnvName]) ?? null;
  }

  return (
    resolveProviderEnvValue('PAYMENT_PROVIDER_API_KEY__', providerName) ??
    readString(process.env.PAYMENT_STRIPE_SECRET_KEY) ??
    readString(Reflect.get(configValue, 'stripeSecretKey'))
  );
};

export const getStripeClient = (secretKey: string) => {
  if (!cachedStripeConstructor) {
    const stripeModule = require('stripe') as {
      default?: StripeConstructor;
    };
    cachedStripeConstructor =
      stripeModule.default ?? (stripeModule as unknown as StripeConstructor);
  }

  const cached = cachedStripeClients.get(secretKey);
  if (cached) {
    return cached;
  }

  const client = instrumentStripeClient(
    'payment',
    new cachedStripeConstructor(secretKey, {
      apiVersion: PAYMENT_STRIPE_API_VERSION,
    })
  );
  cachedStripeClients.set(secretKey, client);
  return client;
};

export const verifyStripeWebhookSignature = (params: {
  payloadRaw: string;
  signature: string;
  secret: string;
}) => {
  getStripeClient(params.secret).webhooks.constructEvent(
    params.payloadRaw,
    params.signature,
    params.secret
  );
};

export const toStripeAmount = (value: string | number) =>
  new Decimal(value)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

export const readStripeCurrency = (configValue: Record<string, unknown>) =>
  (
    readString(Reflect.get(configValue, 'currency')) ??
    readString(Reflect.get(configValue, 'checkoutCurrency')) ??
    'usd'
  ).toLowerCase();

export const readStripeCheckoutSuccessUrl = (configValue: Record<string, unknown>) =>
  readString(Reflect.get(configValue, 'checkoutSuccessUrl')) ??
  readString(Reflect.get(configValue, 'depositSuccessUrl')) ??
  `${readString(process.env.WEB_BASE_URL) ?? 'http://localhost:3000'}?payment=success&session_id={CHECKOUT_SESSION_ID}`;

export const readStripeCheckoutCancelUrl = (configValue: Record<string, unknown>) =>
  readString(Reflect.get(configValue, 'checkoutCancelUrl')) ??
  readString(Reflect.get(configValue, 'depositCancelUrl')) ??
  `${readString(process.env.WEB_BASE_URL) ?? 'http://localhost:3000'}?payment=cancelled`;

export const readStripeCheckoutProductName = (
  configValue: Record<string, unknown>,
  internalOrderId: number
) =>
  readString(Reflect.get(configValue, 'checkoutProductName')) ??
  readString(Reflect.get(configValue, 'depositProductName')) ??
  `Wallet deposit #${internalOrderId}`;

export const mapStripeCheckoutSessionStatus = (session: StripeCheckoutSession) => {
  const checkoutStatus = readString(session.status) ?? 'open';
  const paymentStatus = readString(session.payment_status) ?? 'unpaid';

  if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
    return {
      status: 'success' as const,
      rawStatus: `${checkoutStatus}:${paymentStatus}`,
    };
  }

  if (checkoutStatus === 'expired') {
    return {
      status: 'failed' as const,
      rawStatus: `${checkoutStatus}:${paymentStatus}`,
    };
  }

  return {
    status: 'pending' as const,
    rawStatus: `${checkoutStatus}:${paymentStatus}`,
  };
};

export const extractStripeReferenceId = (session: StripeCheckoutSession) => {
  const metadata = toRecord(session.metadata);

  return (
    readString(Reflect.get(metadata, 'referenceId')) ??
    readString(Reflect.get(metadata, 'orderId')) ??
    readString(session.client_reference_id)
  );
};

export const extractStripeOrderId = (value: unknown) => {
  const session = toRecord(value);
  const metadata = toRecord(Reflect.get(session, 'metadata'));
  const direct =
    readString(Reflect.get(metadata, 'orderId')) ??
    readString(Reflect.get(metadata, 'referenceId')) ??
    readString(Reflect.get(session, 'client_reference_id'));

  if (!direct || !/^\d+$/.test(direct)) {
    return null;
  }

  const parsed = Number.parseInt(direct, 10);
  return parsed > 0 ? parsed : null;
};
