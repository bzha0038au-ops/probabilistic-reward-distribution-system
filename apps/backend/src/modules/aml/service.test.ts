import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getConfig, resetConfig } from '../../shared/config';
import { mockAmlProvider } from './providers';
import { getConfiguredAmlProvider } from './service';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/reward_test';
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;

const originalAmlProviderKey = process.env.AML_PROVIDER_KEY;

beforeEach(() => {
  resetConfig();
  if (originalAmlProviderKey === undefined) {
    delete process.env.AML_PROVIDER_KEY;
  } else {
    process.env.AML_PROVIDER_KEY = originalAmlProviderKey;
  }
});

afterEach(() => {
  resetConfig();
  if (originalAmlProviderKey === undefined) {
    delete process.env.AML_PROVIDER_KEY;
  } else {
    process.env.AML_PROVIDER_KEY = originalAmlProviderKey;
  }
});

describe('getConfiguredAmlProvider', () => {
  it('defaults to the registered mock AML provider', () => {
    delete process.env.AML_PROVIDER_KEY;
    resetConfig();

    expect(getConfiguredAmlProvider()).toBe(mockAmlProvider);
  });

  it('resolves the configured AML provider through the registry', () => {
    process.env.AML_PROVIDER_KEY = 'mock';
    resetConfig();

    expect(getConfiguredAmlProvider()).toBe(mockAmlProvider);
  });

  it('accepts opaque AML provider keys from config without a shared enum change', () => {
    process.env.AML_PROVIDER_KEY = 'a9f4c2d87b6e01aa4d5f3e12c9b8d7ef';
    resetConfig();

    expect(getConfig().amlProviderKey).toBe(
      'a9f4c2d87b6e01aa4d5f3e12c9b8d7ef'
    );
  });
});
