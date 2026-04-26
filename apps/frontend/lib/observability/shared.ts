export type FrontendRuntimeMetadata = {
  serviceName: string;
  environment: string;
  release: string;
  commitSha: string;
  sentryDsn: string;
};

const normalizeValue = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
};

export const frontendRuntimeMetadata: FrontendRuntimeMetadata = {
  serviceName: 'reward-frontend',
  environment: normalizeValue(
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT,
    process.env.NODE_ENV ?? 'development'
  ),
  release: normalizeValue(process.env.NEXT_PUBLIC_OBSERVABILITY_RELEASE, 'dev'),
  commitSha: normalizeValue(
    process.env.NEXT_PUBLIC_OBSERVABILITY_COMMIT_SHA,
    'unknown'
  ),
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? '',
};
