import * as Sentry from '@sentry/browser';

import { adminRuntimeMetadata } from './shared';

type CaptureContext = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
};

let initialized = false;

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export const initAdminClientObservability = () => {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;

  Sentry.init({
    dsn: adminRuntimeMetadata.publicSentryDsn || undefined,
    enabled: adminRuntimeMetadata.publicSentryDsn !== '',
    environment: adminRuntimeMetadata.environment,
    release: adminRuntimeMetadata.release,
    initialScope: {
      tags: {
        service: adminRuntimeMetadata.serviceName,
        environment: adminRuntimeMetadata.environment,
        release: adminRuntimeMetadata.release,
        commit_sha: adminRuntimeMetadata.commitSha,
      },
    },
  });
};

export const captureAdminClientException = (
  error: unknown,
  captureContext: CaptureContext = {}
) => {
  initAdminClientObservability();

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(captureContext.tags ?? {})) {
      if (value !== undefined && value !== null) {
        scope.setTag(key, String(value));
      }
    }

    for (const [key, value] of Object.entries(captureContext.extra ?? {})) {
      scope.setExtra(key, value);
    }

    Sentry.captureException(normalizeError(error));
  });
};
