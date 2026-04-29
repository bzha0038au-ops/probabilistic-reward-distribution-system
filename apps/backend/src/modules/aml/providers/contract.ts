import type {
  AmlCheckResult,
  AmlCheckpoint,
  AmlProviderKey,
  AmlRiskLevel,
} from '@reward/shared-types/aml';

export type CheckMetadata = Record<string, unknown> | null;

export type ScreeningSubject = {
  userId: number;
  email: string;
  phone: string | null;
};

export type ProviderDecision = {
  providerKey: AmlProviderKey;
  result: Exclude<AmlCheckResult, 'provider_error'>;
  riskLevel: AmlRiskLevel;
  providerReference?: string | null;
  metadata?: Record<string, unknown> | null;
  providerPayload?: unknown;
  summary?: string | null;
};

export type AmlProviderScreeningInput = {
  checkpoint: AmlCheckpoint;
  subject: ScreeningSubject;
  metadata?: CheckMetadata;
};

export type AmlProvider = {
  key: AmlProviderKey;
  screen(input: AmlProviderScreeningInput): Promise<ProviderDecision>;
};
