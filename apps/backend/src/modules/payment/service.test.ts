import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db';
import { resetConfig } from '../../shared/config';

import {
  getPaymentProviderSecretReferenceEnvName,
  resetPaymentProviderSecretReferenceCache,
} from './secret-resolver';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/reward_test';
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;

const originalPaymentOperatingMode = process.env.PAYMENT_OPERATING_MODE;
const originalPaymentAutomatedModeOptIn =
  process.env.PAYMENT_AUTOMATED_MODE_OPT_IN;
const originalPaymentStripeSecretKey = process.env.PAYMENT_STRIPE_SECRET_KEY;
const originalPaymentProviderSecretRefDir =
  process.env.PAYMENT_PROVIDER_SECRET_REF_DIR;

let assertActivePaymentProviderSecretsResolvable: typeof import('./service').assertActivePaymentProviderSecretsResolvable;
let assertAutomatedPaymentModeSupported: typeof import('./service').assertAutomatedPaymentModeSupported;
let getPaymentCapabilityOverview: typeof import('./service').getPaymentCapabilityOverview;
let getPaymentCapabilitySummary: typeof import('./service').getPaymentCapabilitySummary;
let resolvePaymentProcessingContext: typeof import('./service').resolvePaymentProcessingContext;

type ProviderFixture = {
  id: number;
  name?: string;
  providerType: string;
  priority?: number | null;
  isActive?: boolean;
  isCircuitBroken?: boolean;
  config: unknown;
};

const createDb = (providers: ProviderFixture[]) =>
  ({
    select: () => ({
      from: () => ({
        where: async () =>
          providers
            .filter((provider) => provider.isActive !== false)
            .filter((provider) => provider.isCircuitBroken !== true)
            .map((provider) => ({
              name: provider.name ?? `provider-${provider.id}`,
              priority: provider.priority ?? 100,
              ...provider,
            })),
      }),
    }),
  }) as unknown as DbClient;

beforeAll(async () => {
  ({
    assertActivePaymentProviderSecretsResolvable,
    assertAutomatedPaymentModeSupported,
    getPaymentCapabilityOverview,
    getPaymentCapabilitySummary,
    resolvePaymentProcessingContext,
  } = await import('./service'));
}, 30000);

beforeEach(() => {
  resetConfig();
  resetPaymentProviderSecretReferenceCache();
  if (originalPaymentOperatingMode === undefined) {
    delete process.env.PAYMENT_OPERATING_MODE;
  } else {
    process.env.PAYMENT_OPERATING_MODE = originalPaymentOperatingMode;
  }
  if (originalPaymentAutomatedModeOptIn === undefined) {
    delete process.env.PAYMENT_AUTOMATED_MODE_OPT_IN;
  } else {
    process.env.PAYMENT_AUTOMATED_MODE_OPT_IN = originalPaymentAutomatedModeOptIn;
  }
  if (originalPaymentStripeSecretKey === undefined) {
    delete process.env.PAYMENT_STRIPE_SECRET_KEY;
  } else {
    process.env.PAYMENT_STRIPE_SECRET_KEY = originalPaymentStripeSecretKey;
  }
  if (originalPaymentProviderSecretRefDir === undefined) {
    delete process.env.PAYMENT_PROVIDER_SECRET_REF_DIR;
  } else {
    process.env.PAYMENT_PROVIDER_SECRET_REF_DIR = originalPaymentProviderSecretRefDir;
  }
  delete process.env[
    getPaymentProviderSecretReferenceEnvName('sm/payment/stripe/api-key')
  ];
});

afterEach(() => {
  resetConfig();
  resetPaymentProviderSecretReferenceCache();
  if (originalPaymentOperatingMode === undefined) {
    delete process.env.PAYMENT_OPERATING_MODE;
  } else {
    process.env.PAYMENT_OPERATING_MODE = originalPaymentOperatingMode;
  }
  if (originalPaymentAutomatedModeOptIn === undefined) {
    delete process.env.PAYMENT_AUTOMATED_MODE_OPT_IN;
  } else {
    process.env.PAYMENT_AUTOMATED_MODE_OPT_IN = originalPaymentAutomatedModeOptIn;
  }
  if (originalPaymentStripeSecretKey === undefined) {
    delete process.env.PAYMENT_STRIPE_SECRET_KEY;
  } else {
    process.env.PAYMENT_STRIPE_SECRET_KEY = originalPaymentStripeSecretKey;
  }
  if (originalPaymentProviderSecretRefDir === undefined) {
    delete process.env.PAYMENT_PROVIDER_SECRET_REF_DIR;
  } else {
    process.env.PAYMENT_PROVIDER_SECRET_REF_DIR = originalPaymentProviderSecretRefDir;
  }
  delete process.env[
    getPaymentProviderSecretReferenceEnvName('sm/payment/stripe/api-key')
  ];
});

describe('resolvePaymentProcessingContext', () => {
  it('falls back to manual when no active provider exists', async () => {
    await expect(
      resolvePaymentProcessingContext(createDb([]), 'deposit')
    ).resolves.toEqual({
      mode: 'manual',
      providerId: null,
      adapterKey: null,
      adapterRegistered: false,
      manualFallbackRequired: true,
      manualFallbackReason: 'no_active_payment_provider',
    });
  });

  it('does not advertise automated processing when a provider row exists without an automated adapter', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 7,
            name: 'legacy-bank-proxy',
            providerType: 'deposit',
            config: { supportsDeposit: true, adapter: 'bank_proxy' },
          },
        ]),
        'deposit'
      )
    ).resolves.toEqual({
      mode: 'manual',
      providerId: 7,
      adapterKey: 'bank_proxy',
      adapterRegistered: false,
      manualFallbackRequired: true,
      manualFallbackReason: 'provider_execution_not_implemented',
    });
  });

  it('routes automated deposits into the provider path when a registered adapter supports the flow', async () => {
    process.env.PAYMENT_OPERATING_MODE = 'automated';
    process.env.PAYMENT_AUTOMATED_MODE_OPT_IN = 'true';
    resetConfig();

    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 17,
            name: 'stripe-cn',
            providerType: 'deposit',
            config: { supportsDeposit: true, adapter: 'stripe' },
          },
        ]),
        'deposit'
      )
    ).resolves.toEqual({
      mode: 'provider',
      providerId: 17,
      adapterKey: 'stripe',
      adapterRegistered: true,
      manualFallbackRequired: false,
      manualFallbackReason: null,
    });
  });

  it('keeps deposits on manual review when automated mode lacks explicit opt-in', async () => {
    process.env.PAYMENT_OPERATING_MODE = 'automated';
    delete process.env.PAYMENT_AUTOMATED_MODE_OPT_IN;
    resetConfig();

    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 18,
            name: 'stripe-cn',
            providerType: 'deposit',
            config: { supportsDeposit: true, adapter: 'stripe' },
          },
        ]),
        'deposit'
      )
    ).resolves.toEqual({
      mode: 'manual',
      providerId: 18,
      adapterKey: 'stripe',
      adapterRegistered: true,
      manualFallbackRequired: true,
      manualFallbackReason: 'manual_review_mode',
    });
  });

  it('routes adapter keys through the backend registry instead of treating config as execution logic', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 9,
            name: 'manual-router',
            providerType: 'deposit',
            config: { supportsDeposit: true, adapter: 'manual_review' },
          },
        ]),
        'deposit'
      )
    ).resolves.toEqual({
      mode: 'manual',
      providerId: 9,
      adapterKey: 'manual_review',
      adapterRegistered: true,
      manualFallbackRequired: true,
      manualFallbackReason: 'manual_provider_review_required',
    });
  });

  it('keeps explicitly manual providers on the manual review path', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 11,
            name: 'manual-bank',
            providerType: 'manual',
            config: { supportsWithdraw: true, executionMode: 'manual' },
          },
        ]),
        'withdrawal'
      )
    ).resolves.toEqual({
      mode: 'manual',
      providerId: 11,
      adapterKey: null,
      adapterRegistered: false,
      manualFallbackRequired: true,
      manualFallbackReason: 'manual_provider_review_required',
    });
  });

  it('does not route new orders into a disabled channel', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 21,
            name: 'disabled-primary',
            providerType: 'deposit',
            priority: 1,
            config: {
              supportsDeposit: true,
              grayPercent: 100,
            },
            isActive: false,
          },
          {
            id: 22,
            name: 'fallback',
            providerType: 'deposit',
            priority: 20,
            config: {
              supportsDeposit: true,
            },
          },
        ]),
        'deposit',
        { userId: 105 }
      )
    ).resolves.toMatchObject({
      providerId: 22,
    });
  });

  it('honors gray routing rules before considering lower-priority fallback channels', async () => {
    const db = createDb([
      {
        id: 31,
        name: 'gray-primary',
        providerType: 'deposit',
        priority: 1,
        config: {
          supportsDeposit: true,
          grayPercent: 10,
          grayUserIds: [201],
        },
      },
      {
        id: 32,
        name: 'fallback',
        providerType: 'deposit',
        priority: 5,
        config: {
          supportsDeposit: true,
        },
      },
    ]);

    await expect(
      resolvePaymentProcessingContext(db, 'deposit', { userId: 201 })
    ).resolves.toMatchObject({
      providerId: 31,
    });

    await expect(
      resolvePaymentProcessingContext(db, 'deposit', { userId: 55 })
    ).resolves.toMatchObject({
      providerId: 32,
    });

    await expect(
      resolvePaymentProcessingContext(db, 'deposit', { userId: 7 })
    ).resolves.toMatchObject({
      providerId: 31,
    });
  });

  it('supports layered gray rollout by allowlist, country, currency, and amount', async () => {
    const db = createDb([
      {
        id: 61,
        name: 'layered-primary',
        providerType: 'deposit',
        priority: 1,
        config: {
          supportsDeposit: true,
          grayRules: [
            {
              grayUserIds: [701],
              grayMaxAmount: '100.00',
            },
            {
              grayCountryCodes: ['JP'],
              grayCurrencies: ['JPY'],
              grayMinAmount: '1000.00',
              grayMaxAmount: '5000.00',
            },
          ],
        },
      },
      {
        id: 62,
        name: 'fallback',
        providerType: 'deposit',
        priority: 5,
        config: {
          supportsDeposit: true,
        },
      },
    ]);

    await expect(
      resolvePaymentProcessingContext(db, 'deposit', {
        userId: 701,
        amount: '88.00',
      })
    ).resolves.toMatchObject({
      providerId: 61,
    });

    await expect(
      resolvePaymentProcessingContext(db, 'deposit', {
        userId: 702,
        amount: '88.00',
      })
    ).resolves.toMatchObject({
      providerId: 62,
    });

    await expect(
      resolvePaymentProcessingContext(db, 'deposit', {
        userId: 702,
        amount: '3200.00',
        country: 'jp',
        currency: 'jpy',
      })
    ).resolves.toMatchObject({
      providerId: 61,
    });
  });

  it('prefers the highest-priority eligible channel', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 41,
            name: 'secondary',
            providerType: 'withdrawal',
            priority: 20,
            config: { supportsWithdraw: true },
          },
          {
            id: 42,
            name: 'primary',
            providerType: 'withdrawal',
            priority: 1,
            config: { supportsWithdraw: true },
          },
        ]),
        'withdrawal',
        { userId: 18 }
      )
    ).resolves.toMatchObject({
      providerId: 42,
    });
  });

  it('skips circuit-broken channels and routes to the next candidate', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 51,
            name: 'broken-primary',
            providerType: 'withdrawal',
            priority: 1,
            isCircuitBroken: true,
            config: { supportsWithdraw: true },
          },
          {
            id: 52,
            name: 'healthy-secondary',
            providerType: 'withdrawal',
            priority: 5,
            config: { supportsWithdraw: true },
          },
        ]),
        'withdrawal',
        { userId: 18 }
      )
    ).resolves.toMatchObject({
      providerId: 52,
    });
  });

  it('keeps the order on manual fallback when the only channel does not match gray scope', async () => {
    await expect(
      resolvePaymentProcessingContext(
        createDb([
          {
            id: 71,
            name: 'restricted-primary',
            providerType: 'deposit',
            priority: 1,
            config: {
              supportsDeposit: true,
              grayPercent: 0,
              grayUserIds: [999],
            },
          },
        ]),
        'deposit',
        { userId: 10, amount: '50.00' }
      )
    ).resolves.toEqual({
      mode: 'manual',
      providerId: 71,
      adapterKey: null,
      adapterRegistered: false,
      manualFallbackRequired: true,
      manualFallbackReason: 'outside_automation_gray_scope',
    });
  });
});

describe('payment capability metadata', () => {
  it('reports automation as implemented even while manual review mode remains the active setting', () => {
    expect(
      getPaymentCapabilitySummary({
        paymentOperatingMode: 'manual_review',
        paymentAutomatedModeOptIn: false,
      })
    ).toEqual({
      operatingMode: 'manual_review',
      automatedExecutionRequested: false,
      automatedModeOptIn: false,
      automatedExecutionEnabled: false,
      automatedExecutionReady: true,
      registeredAdapterKeys: ['manual_review', 'stripe'],
      implementedAutomatedAdapters: ['stripe'],
      missingCapabilities: [],
    });
  });

  it('rejects automated mode without the explicit opt-in flag', () => {
    expect(() =>
      assertAutomatedPaymentModeSupported({
        paymentOperatingMode: 'automated',
        paymentAutomatedModeOptIn: false,
      })
    ).toThrow(
      'PAYMENT_OPERATING_MODE=automated requires PAYMENT_AUTOMATED_MODE_OPT_IN=true.'
    );
  });

  it('allows automated mode only when opt-in is present and outbound execution is ready', () => {
    expect(
      assertAutomatedPaymentModeSupported({
        paymentOperatingMode: 'automated',
        paymentAutomatedModeOptIn: true,
      })
    ).toEqual({
      operatingMode: 'automated',
      automatedExecutionRequested: true,
      automatedModeOptIn: true,
      automatedExecutionEnabled: true,
      automatedExecutionReady: true,
      registeredAdapterKeys: ['manual_review', 'stripe'],
      implementedAutomatedAdapters: ['stripe'],
      missingCapabilities: [],
    });
  });

  it('summarizes configured providers separately from implemented adapters', async () => {
    await expect(
      getPaymentCapabilityOverview(
        createDb([
          {
            id: 7,
            name: 'stripe-cn',
            providerType: 'deposit',
            priority: 1,
            config: { supportsDeposit: true, adapter: 'stripe' },
          },
          {
            id: 8,
            name: 'bank-proxy',
            providerType: 'withdrawal',
            priority: 2,
            config: { supportsWithdraw: true, adapter: 'bank_proxy' },
          },
        ]),
        {
          paymentOperatingMode: 'manual_review',
          paymentAutomatedModeOptIn: false,
        }
      )
    ).resolves.toEqual({
      operatingMode: 'manual_review',
      automatedExecutionRequested: false,
      automatedModeOptIn: false,
      automatedExecutionEnabled: false,
      automatedExecutionReady: true,
      registeredAdapterKeys: ['manual_review', 'stripe'],
      implementedAutomatedAdapters: ['stripe'],
      missingCapabilities: [],
      activeProviderCount: 2,
      configuredProviderAdapters: ['bank_proxy', 'stripe'],
      activeProviderFlows: {
        deposit: true,
        withdrawal: true,
      },
      providerConfigGovernance: {
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
      },
      providerConfigIssues: [],
    });
  });

  it('surfaces provider config issues when plaintext credentials are stored in config', async () => {
    await expect(
      getPaymentCapabilityOverview(
        createDb([
          {
            id: 21,
            name: 'legacy-gateway',
            providerType: 'deposit',
            config: {
              supportsDeposit: true,
              credentials: {
                apiKey: 'live-secret',
              },
            },
          },
        ]),
        {
          paymentOperatingMode: 'manual_review',
          paymentAutomatedModeOptIn: false,
        }
      )
    ).resolves.toMatchObject({
      activeProviderCount: 1,
      providerConfigIssues: [
        {
          providerId: 21,
          providerName: 'legacy-gateway',
          issues: [
            {
              code: 'plaintext_secret_in_config',
              path: 'credentials.apiKey',
            },
          ],
        },
      ],
    });
  });
});

describe('active provider secret validation', () => {
  it('fails fast when an active provider has a malformed secretRefs payload', async () => {
    await expect(
      assertActivePaymentProviderSecretsResolvable(
        createDb([
          {
            id: 16,
            name: 'stripe-cn',
            providerType: 'deposit',
            config: {
              supportsDeposit: true,
              adapter: 'stripe',
              secretRefs: 'not-an-object',
            },
          },
        ])
      )
    ).rejects.toThrow('has an invalid secretRefs payload');
  });

  it('fails fast when an active provider secret ref cannot be resolved', async () => {
    await expect(
      assertActivePaymentProviderSecretsResolvable(
        createDb([
          {
            id: 17,
            name: 'stripe-cn',
            providerType: 'deposit',
            config: {
              supportsDeposit: true,
              adapter: 'stripe',
              secretRefs: {
                apiKey: 'sm/payment/stripe/api-key',
              },
            },
          },
        ])
      )
    ).rejects.toThrow(
      'Active payment provider "stripe-cn" (17) could not resolve config.secretRefs.apiKey'
    );
  });

  it('accepts active providers when secret refs resolve from the mapped env store', async () => {
    process.env[
      getPaymentProviderSecretReferenceEnvName('sm/payment/stripe/api-key')
    ] = 'sk_test_resolved';

    await expect(
      assertActivePaymentProviderSecretsResolvable(
        createDb([
          {
            id: 18,
            name: 'stripe-cn',
            providerType: 'deposit',
            config: {
              supportsDeposit: true,
              adapter: 'stripe',
              secretRefs: {
                apiKey: 'sm/payment/stripe/api-key',
              },
            },
          },
        ])
      )
    ).resolves.toBeUndefined();
  });

  it('fails fast when an active Stripe provider has no usable API secret', async () => {
    await expect(
      assertActivePaymentProviderSecretsResolvable(
        createDb([
          {
            id: 19,
            name: 'stripe-cn',
            providerType: 'deposit',
            config: {
              supportsDeposit: true,
              adapter: 'stripe',
            },
          },
        ])
      )
    ).rejects.toThrow('is missing a usable API secret');
  });
});
