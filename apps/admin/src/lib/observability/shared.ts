import { dev } from '$app/environment';

export type AdminRuntimeMetadata = {
  serviceName: string;
  environment: string;
  release: string;
  commitSha: string;
  publicSentryDsn: string;
};

const normalizeValue = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
};

export const adminRuntimeMetadata: AdminRuntimeMetadata = {
  serviceName: 'reward-admin',
  environment: normalizeValue(
    import.meta.env.PUBLIC_OBSERVABILITY_ENVIRONMENT,
    dev ? 'development' : 'production'
  ),
  release: normalizeValue(import.meta.env.PUBLIC_OBSERVABILITY_RELEASE, 'dev'),
  commitSha: normalizeValue(
    import.meta.env.PUBLIC_OBSERVABILITY_COMMIT_SHA,
    'unknown'
  ),
  publicSentryDsn: import.meta.env.PUBLIC_SENTRY_DSN?.trim() ?? '',
};
