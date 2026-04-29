import { createRequire } from 'node:module';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import Decimal from 'decimal.js';

import { badRequestError } from '../../shared/errors';
import { toDecimal, type MoneyValue } from '../../shared/money';
import { instrumentStripeClient } from '../../shared/stripe-observability';

export type StripeInvoice = {
  id: string;
  customer: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  amount_paid: number | null;
  amount_remaining: number | null;
  starting_balance: number | null;
  amount_due: number | null;
  total: number | null;
  status_transitions:
    | {
        finalized_at: number | null;
        paid_at: number | null;
      }
    | null
    | undefined;
};

export type StripeBalanceTransaction = {
  id: string;
  metadata?: Record<string, string | undefined> | null;
};

export type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data: {
    object: unknown;
  };
};

export type StripeCreditNote = {
  id: string;
  status: string;
  pdf: string | null;
  pre_payment_amount: number | null;
  post_payment_amount: number | null;
};

type StripeRequestOptions = {
  idempotencyKey?: string;
};

type StripeListResult<T> = {
  data: T[];
  has_more?: boolean;
};

type StripeClient = {
  billingPortal: {
    sessions: {
      create(input: Record<string, unknown>): Promise<{ id: string; url: string }>;
    };
  };
  checkout: {
    sessions: {
      create(input: Record<string, unknown>): Promise<{ id: string; url: string | null }>;
    };
  };
  customers: {
    create(input: Record<string, unknown>): Promise<{ id: string }>;
    createBalanceTransaction(
      customerId: string,
      input: Record<string, unknown>,
      options?: StripeRequestOptions
    ): Promise<StripeBalanceTransaction>;
    listBalanceTransactions(
      customerId: string,
      input?: Record<string, unknown>
    ): Promise<StripeListResult<StripeBalanceTransaction>>;
    retrieveBalanceTransaction(
      customerId: string,
      transactionId: string,
      input?: Record<string, unknown>
    ): Promise<StripeBalanceTransaction>;
  };
  creditNotes: {
    create(
      input: Record<string, unknown>,
      options?: StripeRequestOptions
    ): Promise<StripeCreditNote>;
  };
  invoices: {
    create(
      input: Record<string, unknown>,
      options?: StripeRequestOptions
    ): Promise<StripeInvoice>;
    search(input: Record<string, unknown>): Promise<StripeListResult<StripeInvoice>>;
    retrieve(invoiceId: string): Promise<StripeInvoice>;
    del(invoiceId: string): Promise<unknown>;
    finalizeInvoice(
      invoiceId: string,
      input?: Record<string, unknown>,
      options?: StripeRequestOptions
    ): Promise<StripeInvoice>;
    sendInvoice(
      invoiceId: string,
      input?: Record<string, unknown>,
      options?: StripeRequestOptions
    ): Promise<StripeInvoice>;
    pay(
      invoiceId: string,
      input: { paid_out_of_band?: boolean },
      options?: StripeRequestOptions
    ): Promise<StripeInvoice>;
  };
  invoiceItems: {
    create(input: Record<string, unknown>, options?: StripeRequestOptions): Promise<unknown>;
  };
  webhooks: {
    constructEvent(payloadRaw: string, signature: string, secret: string): StripeEvent;
  };
};

type StripeConstructor = new (
  secretKey: string,
  options: { apiVersion: string }
) => StripeClient;

export const SAAS_STRIPE_API_VERSION = '2026-02-25.clover';

let cachedStripeClient: StripeClient | null = null;
let cachedStripeSecretKey: string | null = null;
let cachedStripeConstructor: StripeConstructor | null = null;

const require = createRequire(import.meta.url);

const readString = (value: string | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const getSaasStripeSecretKey = () =>
  readString(process.env.SAAS_STRIPE_SECRET_KEY);

export const getSaasStripeWebhookSecret = () =>
  readString(process.env.SAAS_STRIPE_WEBHOOK_SECRET);

export const getSaasStripeInvoiceDueDays = () => {
  const value = Number(process.env.SAAS_STRIPE_INVOICE_DUE_DAYS ?? '');
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }

  return Math.min(Math.max(Math.floor(value), 1), 90);
};

export const isSaasStripeEnabled = () => Boolean(getSaasStripeSecretKey());

export const normalizeStripeCurrency = (value: string) =>
  value.trim().toLowerCase();

export const toStripeAmount = (value: MoneyValue) =>
  toDecimal(value)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

export const getSaasStripeClient = () => {
  const secretKey = getSaasStripeSecretKey();
  if (!secretKey) {
    throw badRequestError('SAAS Stripe is not configured.', {
      code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
    });
  }

  if (!cachedStripeConstructor) {
    try {
      const stripeModule = require('stripe') as {
        default?: StripeConstructor;
      };
      cachedStripeConstructor = stripeModule.default ?? (stripeModule as unknown as StripeConstructor);
    } catch {
      throw badRequestError('SaaS billing requires the optional Stripe dependency.', {
        code: API_ERROR_CODES.SAAS_STRIPE_DEPENDENCY_NOT_CONFIGURED,
      });
    }
  }

  if (!cachedStripeClient || cachedStripeSecretKey !== secretKey) {
    cachedStripeClient = instrumentStripeClient(
      'saas',
      new cachedStripeConstructor(secretKey, {
        apiVersion: SAAS_STRIPE_API_VERSION,
      })
    );
    cachedStripeSecretKey = secretKey;
  }

  return cachedStripeClient;
};
