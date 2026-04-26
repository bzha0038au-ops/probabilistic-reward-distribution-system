'use client';

import * as Sentry from '@sentry/browser';

import { frontendRuntimeMetadata } from './shared';

type CaptureContext = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
};

let initialized = false;

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const withScope = (captureContext: CaptureContext, callback: () => void) => {
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(captureContext.tags ?? {})) {
      if (value !== undefined && value !== null) {
        scope.setTag(key, String(value));
      }
    }

    for (const [key, value] of Object.entries(captureContext.extra ?? {})) {
      scope.setExtra(key, value);
    }

    callback();
  });
};

export const initFrontendObservability = () => {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;

  Sentry.init({
    dsn: frontendRuntimeMetadata.sentryDsn || undefined,
    enabled: frontendRuntimeMetadata.sentryDsn !== '',
    environment: frontendRuntimeMetadata.environment,
    release: frontendRuntimeMetadata.release,
    initialScope: {
      tags: {
        service: frontendRuntimeMetadata.serviceName,
        environment: frontendRuntimeMetadata.environment,
        release: frontendRuntimeMetadata.release,
        commit_sha: frontendRuntimeMetadata.commitSha,
      },
    },
  });
};

export const captureFrontendException = (
  error: unknown,
  captureContext: CaptureContext = {}
) => {
  initFrontendObservability();
  withScope(captureContext, () => {
    Sentry.captureException(normalizeError(error));
  });
};

export const captureFrontendApiFailure = (payload: {
  path: string;
  status?: number;
  requestId?: string;
  traceId?: string;
  message?: string;
}) => {
  if (payload.status !== undefined && payload.status < 500) {
    return;
  }

  captureFrontendException(
    new Error(payload.message ?? `Backend request failed for ${payload.path}`),
    {
      tags: {
        kind: 'backend_api_failure',
        status_code: payload.status ?? 'unknown',
      },
      extra: {
        backendPath: payload.path,
        status: payload.status,
        requestId: payload.requestId,
        traceId: payload.traceId,
      },
    }
  );
};
