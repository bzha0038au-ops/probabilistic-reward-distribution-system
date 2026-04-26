import { describe, expect, it } from 'vitest';

import {
  getPaymentProviderConfigGovernance,
  reviewPaymentProviderConfig,
} from './provider-config';

describe('payment provider config governance', () => {
  it('exposes the split between admin-editable fields and secret references', () => {
    expect(getPaymentProviderConfigGovernance()).toEqual({
      adminEditableFields: [
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
      ],
      secretReferenceContainer: 'secretRefs',
      secretReferenceFields: [
        'apiKey',
        'privateKey',
        'certificate',
        'signingKey',
      ],
      secretStorageRequirement: 'secret_manager_or_kms',
      plaintextSecretStorageForbidden: true,
    });
  });

  it('rejects plaintext secrets stored directly in config', () => {
    expect(
      reviewPaymentProviderConfig({
        adapter: 'stripe',
        credentials: {
          apiKey: 'sk_live_123',
        },
      }).violations
    ).toEqual([
      {
        code: 'plaintext_secret_in_config',
        path: 'credentials.apiKey',
        message:
          'Do not store apiKey in payment_providers.config. Store the credential in a secret manager or KMS and keep only secretRefs.apiKey as the reference id.',
      },
    ]);
  });

  it('accepts secret reference ids stored under secretRefs', () => {
    expect(
      reviewPaymentProviderConfig({
        adapter: 'wechat',
        secretRefs: {
          apiKey: 'sm/payment/wechat/api-key',
          signingKey: 'kms/payment/wechat/signing-key',
        },
      }).violations
    ).toEqual([]);
  });
});
