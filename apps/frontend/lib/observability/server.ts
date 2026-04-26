import * as Sentry from '@sentry/node';

import { frontendRuntimeMetadata } from './shared';

type CaptureContext = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
};

let initialized = false;

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const getServerSentryDsn = () =>
  process.env.SENTRY_DSN?.trim() || frontendRuntimeMetadata.sentryDsn;

export const initFrontendServerObservability = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  const sentryDsn = getServerSentryDsn();
  Sentry.init({
    dsn: sentryDsn || undefined,
    enabled: sentryDsn !== '',
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

export const captureFrontendServerException = (
  error: unknown,
  captureContext: CaptureContext = {}
) => {
  initFrontendServerObservability();

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
