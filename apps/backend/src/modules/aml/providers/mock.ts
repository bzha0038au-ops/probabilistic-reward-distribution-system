import type { AmlCheckResult } from '@reward/shared-types/aml';

import type {
  AmlProvider,
  AmlProviderScreeningInput,
  CheckMetadata,
  ProviderDecision,
  ScreeningSubject,
} from './contract';

const mockMatchKeywords = [
  'aml',
  'sanction',
  'ofac',
  'pep',
  'watchlist',
  'blocked',
] as const;

const toMetadataRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readMockResultOverride = (
  metadata: Record<string, unknown> | null
): Exclude<AmlCheckResult, 'provider_error'> | null => {
  const value = readString(metadata?.amlMockResult);
  if (value === 'clear') {
    return 'clear';
  }
  if (value === 'hit' || value === 'review_required') {
    return 'hit';
  }
  return null;
};

const readMockSources = (
  subject: ScreeningSubject,
  metadata: CheckMetadata
) => {
  return [
    subject.email,
    subject.phone ?? '',
    readString(toMetadataRecord(metadata)?.amlMockTerm) ?? '',
  ]
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term.length > 0);
};

const createMockDecision = (input: AmlProviderScreeningInput): ProviderDecision => {
  const normalizedMetadata = toMetadataRecord(input.metadata);
  const override = readMockResultOverride(normalizedMetadata);
  const matchedTerms = mockMatchKeywords.filter((keyword, index, source) =>
    source.indexOf(keyword) === index &&
    readMockSources(input.subject, normalizedMetadata).some((source) =>
      source.includes(keyword)
    )
  );
  const result = override ?? (matchedTerms.length > 0 ? 'hit' : 'clear');

  return {
    providerKey: 'mock',
    result,
    riskLevel: result === 'hit' ? 'high' : 'low',
    providerReference: `mock:${input.checkpoint}:${input.subject.userId}:${Date.now()}`,
    summary:
      result === 'hit'
        ? 'Mock AML provider matched review keywords.'
        : 'Mock AML provider cleared the subject.',
    metadata: {
      matchedTerms,
      overrideApplied: override,
    },
    providerPayload: {
      provider: 'mock',
      checkpoint: input.checkpoint,
      matchedTerms,
      overrideApplied: override,
      evaluatedAt: new Date().toISOString(),
    },
  };
};

export const mockAmlProvider: AmlProvider = {
  key: 'mock',
  async screen(input) {
    return createMockDecision(input);
  },
};
