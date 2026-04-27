import {
  recordStripeApiFailure,
  recordStripeApiRequest,
} from './observability';
import { captureException } from './telemetry';

export type StripeApiSurface = 'payment' | 'saas';
export type StripeApiFailureReason =
  | 'rate_limit'
  | 'server_error'
  | 'client_error'
  | 'transport_error'
  | 'unknown';

type StripeApiFailureClassification = {
  reason: StripeApiFailureReason;
  statusFamily: '2xx' | '4xx' | '5xx' | '429' | 'transport' | 'unknown';
  statusCode: number | null;
};

const readStripeErrorStatusCode = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof Reflect.get(error, 'statusCode') === 'number'
  ) {
    const statusCode = Number(Reflect.get(error, 'statusCode'));
    return Number.isFinite(statusCode) ? Math.trunc(statusCode) : null;
  }

  return null;
};

const readStripeErrorToken = (error: unknown, key: string) => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const value = Reflect.get(error, key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
};

const normalizeOperationSegment = (segment: string) =>
  segment
    .replace(/^del$/u, 'delete')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export const normalizeStripeOperationLabel = (segments: string[]) =>
  segments.map(normalizeOperationSegment).join('.');

export const classifyStripeApiFailure = (
  error: unknown
): StripeApiFailureClassification => {
  const statusCode = readStripeErrorStatusCode(error);
  const typeToken = (
    readStripeErrorToken(error, 'type') ??
    readStripeErrorToken(error, 'rawType') ??
    ''
  ).toLowerCase();
  const codeToken = (readStripeErrorToken(error, 'code') ?? '').toLowerCase();
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    statusCode === 429 ||
    typeToken.includes('ratelimit') ||
    codeToken.includes('rate_limit') ||
    message.includes('rate limit')
  ) {
    return {
      reason: 'rate_limit',
      statusFamily: '429',
      statusCode: statusCode ?? 429,
    };
  }

  if (statusCode !== null && statusCode >= 500) {
    return {
      reason: 'server_error',
      statusFamily: '5xx',
      statusCode,
    };
  }

  if (statusCode !== null && statusCode >= 400) {
    return {
      reason: 'client_error',
      statusFamily: '4xx',
      statusCode,
    };
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('econnrefused') ||
    message.includes('network')
  ) {
    return {
      reason: 'transport_error',
      statusFamily: 'transport',
      statusCode: null,
    };
  }

  return {
    reason: 'unknown',
    statusFamily: 'unknown',
    statusCode,
  };
};

const shouldCaptureStripeFailure = (reason: StripeApiFailureReason) =>
  reason === 'rate_limit' || reason === 'server_error';

const shouldInstrumentStripeOperation = (segments: string[]) =>
  segments.length > 0 && segments[0] !== 'webhooks';

export const observeStripeApiCall = async <T>(params: {
  surface: StripeApiSurface;
  operation: string;
  execute: () => Promise<T>;
}) => {
  try {
    const result = await params.execute();
    recordStripeApiRequest({
      surface: params.surface,
      operation: params.operation,
      outcome: 'success',
      statusFamily: '2xx',
    });
    return result;
  } catch (error) {
    const failure = classifyStripeApiFailure(error);
    recordStripeApiRequest({
      surface: params.surface,
      operation: params.operation,
      outcome: 'failure',
      statusFamily: failure.statusFamily,
    });
    recordStripeApiFailure({
      surface: params.surface,
      operation: params.operation,
      reason: failure.reason,
    });

    if (shouldCaptureStripeFailure(failure.reason)) {
      captureException(error, {
        tags: {
          alert_priority: 'high',
          payment_surface: params.surface,
          stripe_operation: params.operation,
          stripe_failure_reason: failure.reason,
          stripe_status_family: failure.statusFamily,
        },
        extra: {
          stripeStatusCode: failure.statusCode,
        },
      });
    }

    throw error;
  }
};

export const instrumentStripeClient = <T extends object>(
  surface: StripeApiSurface,
  target: T,
  path: string[] = []
): T =>
  new Proxy(target, {
    get(currentTarget, prop, receiver) {
      const value = Reflect.get(currentTarget, prop, receiver);
      if (typeof prop === 'symbol') {
        return value;
      }

      const nextPath = [...path, String(prop)];

      if (typeof value === 'function') {
        const operation = normalizeStripeOperationLabel(nextPath);
        if (!shouldInstrumentStripeOperation(nextPath)) {
          return value.bind(currentTarget);
        }

        return (...args: unknown[]) =>
          observeStripeApiCall({
            surface,
            operation,
            execute: () => Promise.resolve(value.apply(currentTarget, args)),
          });
      }

      if (typeof value === 'object' && value !== null) {
        return instrumentStripeClient(
          surface,
          value as Record<string, unknown>,
          nextPath
        );
      }

      return value;
    },
  });
