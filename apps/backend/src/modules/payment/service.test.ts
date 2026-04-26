import { describe, expect, it } from 'vitest';
import type { DbClient } from '../../db';

import {
  assertAutomatedPaymentModeSupported,
  getPaymentCapabilityOverview,
  getPaymentCapabilitySummary,
  resolvePaymentProcessingContext,
} from './service';

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
            name: 'stripe-cn',
            providerType: 'deposit',
            config: { supportsDeposit: true, adapter: 'stripe' },
          },
        ]),
        'deposit'
      )
    ).resolves.toEqual({
      mode: 'manual',
      providerId: 7,
      adapterKey: 'stripe',
      adapterRegistered: false,
      manualFallbackRequired: true,
      manualFallbackReason: 'provider_execution_not_implemented',
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
  it('reports the backend as manual-review only until automation exists', () => {
    expect(
      getPaymentCapabilitySummary({ paymentOperatingMode: 'manual_review' })
    ).toEqual({
      operatingMode: 'manual_review',
      automatedExecutionEnabled: false,
      automatedExecutionReady: false,
      registeredAdapterKeys: ['manual_review'],
      implementedAutomatedAdapters: [],
      missingCapabilities: [
        'outbound_gateway_execution',
        'payment_webhook_entrypoint',
        'payment_webhook_signature_verification',
        'idempotent_retry_handling',
        'automated_reconciliation',
        'compensation_and_recovery',
      ],
    });
  });

  it('rejects automated mode until the money-movement loop is implemented', () => {
    expect(() =>
      assertAutomatedPaymentModeSupported({ paymentOperatingMode: 'automated' })
    ).toThrow('PAYMENT_OPERATING_MODE=automated is not supported yet.');
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
        { paymentOperatingMode: 'manual_review' }
      )
    ).resolves.toEqual({
      operatingMode: 'manual_review',
      automatedExecutionEnabled: false,
      automatedExecutionReady: false,
      registeredAdapterKeys: ['manual_review'],
      implementedAutomatedAdapters: [],
      missingCapabilities: [
        'outbound_gateway_execution',
        'payment_webhook_entrypoint',
        'payment_webhook_signature_verification',
        'idempotent_retry_handling',
        'automated_reconciliation',
        'compensation_and_recovery',
      ],
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
        { paymentOperatingMode: 'manual_review' }
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
