import * as Sentry from '@sentry/node';

import { adminRuntimeMetadata } from './shared';

type CaptureContext = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
};

let initialized = false;

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const getServerSentryDsn = () =>
  process.env.SENTRY_DSN?.trim() || adminRuntimeMetadata.publicSentryDsn;

export const initAdminServerObservability = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  const sentryDsn = getServerSentryDsn();
  Sentry.init({
    dsn: sentryDsn || undefined,
    enabled: sentryDsn !== '',
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

export const captureAdminServerException = (
  error: unknown,
  captureContext: CaptureContext = {}
) => {
  initAdminServerObservability();

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
