import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getPaymentProviderSecretReferenceEnvName,
  resetPaymentProviderSecretReferenceCache,
  resolvePaymentProviderSecretReference,
} from './secret-resolver';

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
};

afterEach(() => {
  resetPaymentProviderSecretReferenceCache();
  restoreEnv();
});

describe('payment provider secret resolver', () => {
  it('resolves explicit env references', () => {
    process.env.PAYMENT_STRIPE_SECRET_KEY = 'sk_test_env_ref';

    expect(
      resolvePaymentProviderSecretReference('env:PAYMENT_STRIPE_SECRET_KEY')
    ).toBe('sk_test_env_ref');
  });

  it('resolves logical refs from normalized env overrides', () => {
    process.env[
      getPaymentProviderSecretReferenceEnvName('sm/payment/stripe/api-key')
    ] = 'sk_test_logical_ref';

    expect(
      resolvePaymentProviderSecretReference('sm/payment/stripe/api-key')
    ).toBe('sk_test_logical_ref');
  });

  it('resolves logical refs from the mounted secret root directory', () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'payment-secret-ref-'));
    const secretPath = path.join(tempRoot, 'sm/payment/stripe');
    mkdirSync(secretPath, { recursive: true });
    writeFileSync(path.join(secretPath, 'api-key'), 'sk_test_file_ref\n');
    process.env.PAYMENT_PROVIDER_SECRET_REF_DIR = tempRoot;

    try {
      expect(
        resolvePaymentProviderSecretReference('sm/payment/stripe/api-key')
      ).toBe('sk_test_file_ref');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns null when a logical ref cannot be resolved', () => {
    expect(
      resolvePaymentProviderSecretReference('sm/payment/stripe/missing-secret')
    ).toBeNull();
  });
});
