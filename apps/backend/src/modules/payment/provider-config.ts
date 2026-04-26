import { z } from 'zod';

const PAYMENT_PROVIDER_SECRET_REFS_KEY = 'secretRefs' as const;

export const PAYMENT_PROVIDER_ADMIN_EDITABLE_FIELDS = [
  'isActive',
  'priority',
  'supportedFlows',
  'grayPercent',
  'grayUserIds',
  'grayCountryCodes',
  'grayCurrencies',
  'grayMinAmount',
  'grayMaxAmount',
  'grayRules',
  'circuitState',
  'singleTransactionLimit',
  'dailyLimit',
  'currency',
  'callbackWhitelist',
  'routeTags',
  'riskThresholds',
] as const;

export const PAYMENT_PROVIDER_SECRET_REFERENCE_FIELDS = [
  'apiKey',
  'privateKey',
  'certificate',
  'signingKey',
] as const;

export type PaymentProviderAdminEditableField =
  (typeof PAYMENT_PROVIDER_ADMIN_EDITABLE_FIELDS)[number];

export type PaymentProviderSecretReferenceField =
  (typeof PAYMENT_PROVIDER_SECRET_REFERENCE_FIELDS)[number];

export type PaymentProviderSecretRefs = Partial<
  Record<PaymentProviderSecretReferenceField, string>
>;

export type PaymentProviderConfigGovernance = {
  adminEditableFields: PaymentProviderAdminEditableField[];
  secretReferenceContainer: typeof PAYMENT_PROVIDER_SECRET_REFS_KEY;
  secretReferenceFields: PaymentProviderSecretReferenceField[];
  secretStorageRequirement: 'secret_manager_or_kms';
  plaintextSecretStorageForbidden: true;
};

export type PaymentProviderConfigViolation = {
  code: 'plaintext_secret_in_config' | 'invalid_secret_reference';
  path: string;
  message: string;
};

export type PaymentProviderConfigReview = {
  config: Record<string, unknown>;
  violations: PaymentProviderConfigViolation[];
};

const SecretRefSchema = z.string().trim().min(1);

const PaymentProviderSecretRefsSchema = z
  .object({
    apiKey: SecretRefSchema.optional(),
    privateKey: SecretRefSchema.optional(),
    certificate: SecretRefSchema.optional(),
    signingKey: SecretRefSchema.optional(),
  })
  .strict();

const PLAINTEXT_SECRET_KEY_ALIASES: Record<string, PaymentProviderSecretReferenceField> = {
  api_key: 'apiKey',
  apikey: 'apiKey',
  private_key: 'privateKey',
  privatekey: 'privateKey',
  certificate: 'certificate',
  cert: 'certificate',
  cert_pem: 'certificate',
  certpem: 'certificate',
  signing_key: 'signingKey',
  signingkey: 'signingKey',
  signature_key: 'signingKey',
  signaturekey: 'signingKey',
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const collectPlaintextSecretViolations = (
  value: unknown,
  path: string[] = [],
  insideSecretRefs = false
): PaymentProviderConfigViolation[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectPlaintextSecretViolations(item, [...path, String(index)], insideSecretRefs)
    );
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const nextPath = [...path, key];
    const normalized = normalizeKey(key);
    const nextInsideSecretRefs =
      insideSecretRefs || normalized === normalizeKey(PAYMENT_PROVIDER_SECRET_REFS_KEY);
    const sensitiveField = PLAINTEXT_SECRET_KEY_ALIASES[normalized];
    const violations: PaymentProviderConfigViolation[] = [];

    if (!nextInsideSecretRefs && sensitiveField) {
      violations.push({
        code: 'plaintext_secret_in_config',
        path: nextPath.join('.'),
        message: `Do not store ${sensitiveField} in payment_providers.config. Store the credential in a secret manager or KMS and keep only ${PAYMENT_PROVIDER_SECRET_REFS_KEY}.${sensitiveField} as the reference id.`,
      });
    }

    return [
      ...violations,
      ...collectPlaintextSecretViolations(nested, nextPath, nextInsideSecretRefs),
    ];
  });
};

export const reviewPaymentProviderConfig = (value: unknown): PaymentProviderConfigReview => {
  const config = toRecord(value);
  const violations = collectPlaintextSecretViolations(config);
  const secretRefs = Reflect.get(config, PAYMENT_PROVIDER_SECRET_REFS_KEY);

  if (secretRefs !== undefined) {
    const parsed = PaymentProviderSecretRefsSchema.safeParse(secretRefs);
    if (!parsed.success) {
      violations.push({
        code: 'invalid_secret_reference',
        path: PAYMENT_PROVIDER_SECRET_REFS_KEY,
        message: `${PAYMENT_PROVIDER_SECRET_REFS_KEY} must be an object whose values are non-empty secret reference ids.`,
      });
    }
  }

  return {
    config,
    violations,
  };
};

export const getPaymentProviderConfigGovernance =
  (): PaymentProviderConfigGovernance => ({
    adminEditableFields: [...PAYMENT_PROVIDER_ADMIN_EDITABLE_FIELDS],
    secretReferenceContainer: PAYMENT_PROVIDER_SECRET_REFS_KEY,
    secretReferenceFields: [...PAYMENT_PROVIDER_SECRET_REFERENCE_FIELDS],
    secretStorageRequirement: 'secret_manager_or_kms',
    plaintextSecretStorageForbidden: true,
  });
