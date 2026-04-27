import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAYMENT_PROVIDER_SECRET_REF_ENV_PREFIX = 'PAYMENT_PROVIDER_SECRET_REF__';
const PAYMENT_PROVIDER_SECRET_REF_DIR_ENV = 'PAYMENT_PROVIDER_SECRET_REF_DIR';

const secretReferenceCache = new Map<string, string | null>();

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const normalizeSecretReferenceToken = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const readSecretFile = (filePath: string) => {
  try {
    return readString(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const resolveExplicitSecretReference = (reference: string) => {
  const trimmed = reference.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('env:')) {
    const envName = trimmed.slice('env:'.length).trim();
    return envName === '' ? null : readString(process.env[envName]);
  }

  if (lower.startsWith('file:')) {
    const filePath = trimmed.slice('file:'.length).trim();
    return filePath === '' ? null : readSecretFile(path.resolve(filePath));
  }

  return undefined;
};

const resolveMappedSecretReference = (reference: string) => {
  const normalized = normalizeSecretReferenceToken(reference);
  if (normalized !== '') {
    const envValue = readString(
      process.env[`${PAYMENT_PROVIDER_SECRET_REF_ENV_PREFIX}${normalized}`]
    );
    if (envValue) {
      return envValue;
    }
  }

  const rootDirectory = readString(process.env[PAYMENT_PROVIDER_SECRET_REF_DIR_ENV]);
  if (!rootDirectory) {
    return null;
  }

  const resolvedRoot = path.resolve(rootDirectory);
  const candidatePath = path.resolve(resolvedRoot, reference);
  const relative = path.relative(resolvedRoot, candidatePath);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative === ''
  ) {
    return null;
  }

  return readSecretFile(candidatePath);
};

export const getPaymentProviderSecretReferenceEnvName = (reference: string) =>
  `${PAYMENT_PROVIDER_SECRET_REF_ENV_PREFIX}${normalizeSecretReferenceToken(reference)}`;

export const resolvePaymentProviderSecretReference = (reference: string) => {
  const trimmed = reference.trim();
  if (trimmed === '') {
    return null;
  }

  if (secretReferenceCache.has(trimmed)) {
    return secretReferenceCache.get(trimmed) ?? null;
  }

  const explicit = resolveExplicitSecretReference(trimmed);
  const resolved =
    explicit !== undefined ? explicit : resolveMappedSecretReference(trimmed);
  secretReferenceCache.set(trimmed, resolved ?? null);
  return resolved ?? null;
};

export const resetPaymentProviderSecretReferenceCache = () => {
  secretReferenceCache.clear();
};
