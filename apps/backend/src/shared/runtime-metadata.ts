import { getConfig, type AppConfig } from './config';

export type RuntimeMetadata = {
  serviceName: string;
  environment: string;
  release: string;
  commitSha: string;
};

const normalizeValue = (value: string | undefined | null, fallback: string) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
};

export const getRuntimeMetadata = (
  config: Pick<
    AppConfig,
    | 'nodeEnv'
    | 'observabilityServiceName'
    | 'observabilityEnvironment'
    | 'observabilityRelease'
    | 'observabilityCommitSha'
  > = getConfig()
): RuntimeMetadata => ({
  serviceName: normalizeValue(
    config.observabilityServiceName,
    'reward-backend'
  ),
  environment: normalizeValue(config.observabilityEnvironment, config.nodeEnv),
  release: normalizeValue(config.observabilityRelease, 'dev'),
  commitSha: normalizeValue(config.observabilityCommitSha, 'unknown'),
});
