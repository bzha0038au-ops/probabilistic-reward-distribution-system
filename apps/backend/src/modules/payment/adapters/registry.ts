import type { PaymentFlow } from '../types';

import type { PaymentAdapter } from './contract';
import { normalizePaymentAdapterKey } from './contract';
import { manualReviewPaymentAdapter } from './manual-review';
import { stripePaymentAdapter } from './stripe';

const PAYMENT_ADAPTER_REGISTRY = new Map<string, PaymentAdapter>(
  [manualReviewPaymentAdapter, stripePaymentAdapter].map((adapter) => [
    adapter.key,
    adapter,
  ])
);

export const listRegisteredPaymentAdapterKeys = () =>
  Array.from(PAYMENT_ADAPTER_REGISTRY.keys()).sort();

export const listAutomatedPaymentAdapterKeys = () =>
  Array.from(PAYMENT_ADAPTER_REGISTRY.values())
    .filter((adapter) => adapter.supportsAutomation)
    .map((adapter) => adapter.key)
    .sort();

export const getRegisteredPaymentAdapter = (key: string | null | undefined) => {
  const normalized = key ? normalizePaymentAdapterKey(key) : '';
  if (normalized === '') {
    return null;
  }

  return PAYMENT_ADAPTER_REGISTRY.get(normalized) ?? null;
};

export const paymentAdapterSupportsFlow = (
  adapter: PaymentAdapter,
  flow: PaymentFlow
) => adapter.supportedFlows.includes(flow);
