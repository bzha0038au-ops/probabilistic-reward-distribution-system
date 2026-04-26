import { and, eq } from '@reward/database/orm';
import { paymentAutomationGapValues } from '@reward/shared-types';

import { paymentProviders } from '@reward/database';
import type { DbClient, DbTransaction } from '../../db';
import { getConfig, type AppConfig } from '../../shared/config';
import { toDecimal } from '../../shared/money';
import {
  isFinanceTerminalStatus,
  type FinanceReviewAction,
} from './finance-order';
import {
  getRegisteredPaymentAdapter,
  listAutomatedPaymentAdapterKeys,
  listRegisteredPaymentAdapterKeys,
  normalizePaymentAdapterKey,
  paymentAdapterSupportsFlow,
} from './adapter';
import {
  getPaymentProviderConfigGovernance,
  reviewPaymentProviderConfig,
  type PaymentProviderConfigGovernance,
  type PaymentProviderConfigViolation,
} from './provider-config';
import type {
  PaymentAutomationGap,
  PaymentFlow,
  PaymentManualFallbackReason,
  PaymentOperatingMode,
  PaymentProcessingMode,
} from './types';

type DbExecutor = DbClient | DbTransaction;

export type PaymentRoutingContext = {
  userId?: number | null;
  amount?: string | number | null;
  country?: string | null;
  currency?: string | null;
  channelType?: string | null;
  assetType?: string | null;
  assetCode?: string | null;
  network?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type {
  PaymentAutomationGap,
  PaymentFlow,
  PaymentManualFallbackReason,
  PaymentOperatingMode,
  PaymentProcessingMode,
} from './types';

type ProviderRow = {
  id: number;
  name: string;
  providerType: string;
  channelType: string | null;
  assetType: string | null;
  assetCode: string | null;
  network: string | null;
  priority: number | null;
  config: unknown;
};

export type PreparedPaymentProvider = ProviderRow & {
  parsedConfig: Record<string, unknown>;
  configViolations: PaymentProviderConfigViolation[];
  priority: number | null;
};

export type PaymentProviderConfigIssue = {
  providerId: number;
  providerName: string;
  issues: PaymentProviderConfigViolation[];
};

export type PaymentCapabilitySummary = {
  operatingMode: PaymentOperatingMode;
  automatedExecutionEnabled: boolean;
  automatedExecutionReady: boolean;
  registeredAdapterKeys: string[];
  implementedAutomatedAdapters: string[];
  missingCapabilities: PaymentAutomationGap[];
};

export type PaymentCapabilityOverview = PaymentCapabilitySummary & {
  activeProviderCount: number;
  configuredProviderAdapters: string[];
  activeProviderFlows: Record<PaymentFlow, boolean>;
  providerConfigGovernance: PaymentProviderConfigGovernance;
  providerConfigIssues: PaymentProviderConfigIssue[];
};

export type FinanceReviewInput = {
  action: FinanceReviewAction;
  adminId?: number | null;
  operatorNote?: string | null;
  settlementReference?: string | null;
  processingChannel?: string | null;
};

const DEPOSIT_PROVIDER_TYPES = new Set([
  'deposit',
  'deposits',
  'topup',
  'top-up',
  'top_up',
  'cash_in',
  'fiat_in',
]);

const WITHDRAW_PROVIDER_TYPES = new Set([
  'withdraw',
  'withdrawal',
  'withdrawals',
  'payout',
  'cash_out',
  'fiat_out',
]);

const BOTH_PROVIDER_TYPES = new Set([
  'all',
  'both',
  'gateway',
  'manual',
  'payment',
  'processor',
  'provider',
]);

const MANUAL_REVIEW_PROVIDER_TYPES = new Set([
  'manual',
  'bank',
  'bank_transfer',
  'offline',
]);

const PAYMENT_AUTOMATION_GAPS: PaymentAutomationGap[] = [
  ...paymentAutomationGapValues,
];

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const normalizeType = normalizePaymentAdapterKey;

const readBoolean = (value: unknown) =>
  typeof value === 'boolean' ? value : undefined;

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const readNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readIntegerArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => readNumber(item))
        .filter((item): item is number => item !== undefined)
        .map((item) => Math.trunc(item))
    : [];

const readStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    : [];

const normalizeOptionalString = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const prepareProvider = (provider: ProviderRow): PreparedPaymentProvider => {
  const reviewedConfig = reviewPaymentProviderConfig(provider.config);
  const priority =
    provider.priority ?? readNumber(Reflect.get(reviewedConfig.config, 'priority'));

  return {
    ...provider,
    parsedConfig: reviewedConfig.config,
    configViolations: reviewedConfig.violations,
    priority: priority ?? null,
  };
};

const compareProviderPriority = (
  left: PreparedPaymentProvider,
  right: PreparedPaymentProvider
) => {
  const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.id - right.id;
};

const readMoney = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  try {
    return toDecimal(value);
  } catch {
    return null;
  }
};

const normalizeCode = (value: string) => value.trim().toUpperCase();

const readCodeArray = (value: unknown) =>
  Array.from(
    new Set(
      readStringArray(value)
        .map((item) => normalizeCode(item))
        .filter((item) => item !== '')
    )
  );

const getGrayUserIds = (source: Record<string, unknown>) => [
  ...readIntegerArray(Reflect.get(source, 'grayUserIds')),
  ...readIntegerArray(Reflect.get(source, 'greyUserIds')),
  ...readIntegerArray(Reflect.get(source, 'allowUserIds')),
  ...readIntegerArray(Reflect.get(source, 'userAllowlist')),
];

const getGrayCountryCodes = (source: Record<string, unknown>) => [
  ...readCodeArray(Reflect.get(source, 'grayCountryCodes')),
  ...readCodeArray(Reflect.get(source, 'greyCountryCodes')),
  ...readCodeArray(Reflect.get(source, 'grayCountries')),
  ...readCodeArray(Reflect.get(source, 'greyCountries')),
  ...readCodeArray(Reflect.get(source, 'countryAllowlist')),
];

const getGrayCurrencies = (source: Record<string, unknown>) => [
  ...readCodeArray(Reflect.get(source, 'grayCurrencies')),
  ...readCodeArray(Reflect.get(source, 'greyCurrencies')),
  ...readCodeArray(Reflect.get(source, 'currencyAllowlist')),
];

const getGrayMinAmount = (source: Record<string, unknown>) =>
  readMoney(
    Reflect.get(source, 'grayMinAmount') ?? Reflect.get(source, 'greyMinAmount')
  );

const getGrayMaxAmount = (source: Record<string, unknown>) =>
  readMoney(
    Reflect.get(source, 'grayMaxAmount') ?? Reflect.get(source, 'greyMaxAmount')
  );

const getProviderGrayRules = (provider: PreparedPaymentProvider) =>
  Array.isArray(Reflect.get(provider.parsedConfig, 'grayRules'))
    ? (Reflect.get(provider.parsedConfig, 'grayRules') as unknown[])
        .map((item) => toRecord(item))
        .filter((item) => Object.keys(item).length > 0)
    : [];

const matchesGrayScope = (
  source: Record<string, unknown>,
  routing: PaymentRoutingContext
) => {
  const userId = routing.userId ?? null;
  const allowlistedUserIds = getGrayUserIds(source);
  const percentValue =
    readNumber(Reflect.get(source, 'grayPercent')) ??
    readNumber(Reflect.get(source, 'greyPercent')) ??
    readNumber(Reflect.get(source, 'rolloutPercent')) ??
    readNumber(Reflect.get(source, 'trafficPercent'));
  const percent = percentValue ?? 100;
  const allowlisted = userId !== null && allowlistedUserIds.includes(userId);

  if (allowlistedUserIds.length > 0 && !allowlisted) {
    if (
      percentValue === undefined ||
      percent <= 0 ||
      userId === null ||
      Math.abs(userId) % 100 >= percent
    ) {
      return false;
    }
  } else if (percent < 100) {
    if (percent <= 0 || userId === null || Math.abs(userId) % 100 >= percent) {
      return false;
    }
  }

  const routingCountry =
    typeof routing.country === 'string'
      ? normalizeCode(routing.country)
      : typeof Reflect.get(routing.metadata ?? {}, 'country') === 'string'
        ? normalizeCode(String(Reflect.get(routing.metadata ?? {}, 'country')))
        : typeof Reflect.get(routing.metadata ?? {}, 'countryCode') === 'string'
          ? normalizeCode(String(Reflect.get(routing.metadata ?? {}, 'countryCode')))
          : null;
  const allowedCountries = getGrayCountryCodes(source);
  if (
    allowedCountries.length > 0 &&
    (!routingCountry || !allowedCountries.includes(routingCountry))
  ) {
    return false;
  }

  const routingCurrency =
    typeof routing.currency === 'string'
      ? normalizeCode(routing.currency)
      : typeof Reflect.get(routing.metadata ?? {}, 'currency') === 'string'
        ? normalizeCode(String(Reflect.get(routing.metadata ?? {}, 'currency')))
        : typeof Reflect.get(routing.metadata ?? {}, 'currencyCode') === 'string'
          ? normalizeCode(String(Reflect.get(routing.metadata ?? {}, 'currencyCode')))
          : null;
  const allowedCurrencies = getGrayCurrencies(source);
  if (
    allowedCurrencies.length > 0 &&
    (!routingCurrency || !allowedCurrencies.includes(routingCurrency))
  ) {
    return false;
  }

  const amount =
    routing.amount === null || routing.amount === undefined
      ? null
      : readMoney(routing.amount);
  const minAmount = getGrayMinAmount(source);
  if (minAmount !== null && (amount === null || amount.lt(minAmount))) {
    return false;
  }
  const maxAmount = getGrayMaxAmount(source);
  if (maxAmount !== null && (amount === null || amount.gt(maxAmount))) {
    return false;
  }

  return true;
};

const matchesGrayRule = (
  provider: PreparedPaymentProvider,
  routing: PaymentRoutingContext
) => {
  const rules = getProviderGrayRules(provider);
  if (rules.length > 0) {
    return rules.some((rule) => matchesGrayScope(rule, routing));
  }

  return matchesGrayScope(provider.parsedConfig, routing);
};

const matchesProviderRoute = (
  provider: PreparedPaymentProvider,
  routing: PaymentRoutingContext
) => {
  const routeChannel = normalizeOptionalString(routing.channelType);
  if (provider.channelType && routeChannel && provider.channelType !== routeChannel) {
    return false;
  }

  const routeAssetType = normalizeOptionalString(routing.assetType);
  if (provider.assetType && routeAssetType && provider.assetType !== routeAssetType) {
    return false;
  }

  const routeAssetCode = routing.assetCode
    ? normalizeCode(routing.assetCode)
    : typeof routing.metadata?.assetCode === 'string'
      ? normalizeCode(routing.metadata.assetCode)
      : null;
  if (
    provider.assetCode &&
    routeAssetCode &&
    normalizeCode(provider.assetCode) !== routeAssetCode
  ) {
    return false;
  }

  const routeNetwork = routing.network
    ? normalizeCode(routing.network)
    : typeof routing.metadata?.network === 'string'
      ? normalizeCode(routing.metadata.network)
      : null;
  if (
    provider.network &&
    routeNetwork &&
    normalizeCode(provider.network) !== routeNetwork
  ) {
    return false;
  }

  return true;
};

export const listActiveProviders = async (
  db: DbExecutor
): Promise<PreparedPaymentProvider[]> => {
  const providers = await db
    .select({
      id: paymentProviders.id,
      name: paymentProviders.name,
      providerType: paymentProviders.providerType,
      channelType: paymentProviders.channelType,
      assetType: paymentProviders.assetType,
      assetCode: paymentProviders.assetCode,
      network: paymentProviders.network,
      priority: paymentProviders.priority,
      config: paymentProviders.config,
    })
    .from(paymentProviders)
    .where(
      and(
        eq(paymentProviders.isActive, true),
        eq(paymentProviders.isCircuitBroken, false)
      )
    );

  return providers.map(prepareProvider).sort(compareProviderPriority);
};

export const providerSupportsFlow = (
  provider: PreparedPaymentProvider,
  flow: PaymentFlow
) => {
  const config = provider.parsedConfig;
  const supportedFlows = readStringArray(Reflect.get(config, 'supportedFlows')).map(
    normalizeType
  );

  if (supportedFlows.length > 0) {
    return supportedFlows.includes(flow);
  }

  const supportsDeposit = readBoolean(Reflect.get(config, 'supportsDeposit'));
  const supportsWithdraw = readBoolean(Reflect.get(config, 'supportsWithdraw'));

  if (flow === 'deposit' && supportsDeposit !== undefined) {
    return supportsDeposit;
  }
  if (flow === 'withdrawal' && supportsWithdraw !== undefined) {
    return supportsWithdraw;
  }
  if (flow === 'deposit' && supportsWithdraw === true && supportsDeposit === undefined) {
    return false;
  }
  if (
    flow === 'withdrawal' &&
    supportsDeposit === true &&
    supportsWithdraw === undefined
  ) {
    return false;
  }

  const providerType = normalizeType(provider.providerType);
  if (BOTH_PROVIDER_TYPES.has(providerType)) {
    return true;
  }
  if (flow === 'deposit') {
    if (DEPOSIT_PROVIDER_TYPES.has(providerType)) return true;
    if (WITHDRAW_PROVIDER_TYPES.has(providerType)) return false;
  }
  if (flow === 'withdrawal') {
    if (WITHDRAW_PROVIDER_TYPES.has(providerType)) return true;
    if (DEPOSIT_PROVIDER_TYPES.has(providerType)) return false;
  }

  // Treat unknown provider types as generic gateways so existing configs keep
  // working until explicit capability flags are added.
  return true;
};

const toReviewTrail = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
  );
};

const mapFallbackStatus = (action: FinanceReviewAction) => {
  switch (action) {
    case 'deposit_requested':
      return 'requested';
    case 'deposit_mark_provider_pending':
      return 'provider_pending';
    case 'deposit_mark_provider_succeeded':
      return 'provider_succeeded';
    case 'deposit_credit':
      return 'credited';
    case 'deposit_mark_provider_failed':
      return 'provider_failed';
    case 'deposit_reverse':
      return 'reversed';
    case 'withdrawal_requested':
      return 'requested';
    case 'withdrawal_approve':
      return 'approved';
    case 'withdrawal_mark_provider_submitted':
      return 'provider_submitted';
    case 'withdrawal_mark_provider_processing':
      return 'provider_processing';
    case 'withdrawal_pay':
      return 'paid';
    case 'withdrawal_mark_provider_failed':
      return 'provider_failed';
    case 'withdrawal_reject':
      return 'rejected';
    case 'withdrawal_reverse':
      return 'reversed';
    case 'system_timeout_cleanup':
    case 'system_compensation':
      return null;
  }
};

const isFallbackTerminalAction = (action: FinanceReviewAction) => {
  const status = mapFallbackStatus(action);
  const flow = action.startsWith('deposit_') ? 'deposit' : 'withdrawal';
  return status ? isFinanceTerminalStatus(status, flow) : false;
};

const isManualReviewProvider = (provider: PreparedPaymentProvider) => {
  const config = provider.parsedConfig;
  const executionMode = normalizeType(readString(Reflect.get(config, 'executionMode')) ?? '');

  if (executionMode === 'manual') {
    return true;
  }

  return MANUAL_REVIEW_PROVIDER_TYPES.has(normalizeType(provider.providerType));
};

export const getConfiguredAdapter = (provider: PreparedPaymentProvider) => {
  const config = provider.parsedConfig;
  const adapterName = readString(Reflect.get(config, 'adapter'));
  if (!adapterName) {
    return null;
  }

  const adapter = normalizeType(adapterName);

  return adapter === '' ? null : adapter;
};

export const resolveRegisteredAdapter = (
  provider: PreparedPaymentProvider
) => {
  const adapter = getConfiguredAdapter(provider);
  if (!adapter) {
    return null;
  }

  return getRegisteredPaymentAdapter(adapter);
};

export function getPaymentCapabilitySummary(
  config: Pick<AppConfig, 'paymentOperatingMode'> = getConfig()
): PaymentCapabilitySummary {
  const registeredAdapterKeys = listRegisteredPaymentAdapterKeys();
  const implementedAutomatedAdapters = listAutomatedPaymentAdapterKeys();
  const missingCapabilities = [...PAYMENT_AUTOMATION_GAPS];
  const automatedExecutionReady =
    implementedAutomatedAdapters.length > 0 && missingCapabilities.length === 0;

  return {
    operatingMode: config.paymentOperatingMode,
    automatedExecutionEnabled: config.paymentOperatingMode === 'automated',
    automatedExecutionReady,
    registeredAdapterKeys,
    implementedAutomatedAdapters,
    missingCapabilities,
  };
}

export function assertAutomatedPaymentModeSupported(
  config: Pick<AppConfig, 'paymentOperatingMode'> = getConfig()
) {
  const summary = getPaymentCapabilitySummary(config);
  if (!summary.automatedExecutionEnabled || summary.automatedExecutionReady) {
    return summary;
  }

  throw new Error(
    `PAYMENT_OPERATING_MODE=automated is not supported yet. Keep PAYMENT_OPERATING_MODE=manual_review until the backend owns the full payment execution loop. Missing ${summary.missingCapabilities.join(', ')}.`
  );
}

export async function getPaymentCapabilityOverview(
  db: DbExecutor,
  config: Pick<AppConfig, 'paymentOperatingMode'> = getConfig()
): Promise<PaymentCapabilityOverview> {
  const providers = await listActiveProviders(db);
  const configuredProviderAdapters = Array.from(
    new Set(
      providers
        .map((provider) => getConfiguredAdapter(provider))
        .filter((value): value is string => value !== null)
    )
  ).sort();
  const summary = getPaymentCapabilitySummary(config);
  const providerConfigIssues = providers
    .filter((provider) => provider.configViolations.length > 0)
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      issues: provider.configViolations,
    }));

  return {
    ...summary,
    activeProviderCount: providers.length,
    configuredProviderAdapters,
    activeProviderFlows: {
      deposit: providers.some((provider) => providerSupportsFlow(provider, 'deposit')),
      withdrawal: providers.some((provider) =>
        providerSupportsFlow(provider, 'withdrawal')
      ),
    },
    providerConfigGovernance: getPaymentProviderConfigGovernance(),
    providerConfigIssues,
  };
};

export function selectPaymentProvider(
  providers: PreparedPaymentProvider[],
  flow: PaymentFlow,
  routing: PaymentRoutingContext = {}
) {
  return (
    providers
      .filter((provider) => providerSupportsFlow(provider, flow))
      .filter((provider) => matchesProviderRoute(provider, routing))
      .filter((provider) => matchesGrayRule(provider, routing))
      .sort(compareProviderPriority)[0] ?? null
  );
}

export async function resolvePaymentProcessingContext(
  db: DbExecutor,
  flow: PaymentFlow,
  routing: PaymentRoutingContext = {}
) {
  const providers = await listActiveProviders(db);
  const flowProviders = providers
    .filter((provider) => providerSupportsFlow(provider, flow))
    .sort(compareProviderPriority);

  const provider = selectPaymentProvider(flowProviders, flow, routing);
  const fallbackProvider = flowProviders[0] ?? null;

  if (!fallbackProvider) {
    return {
      mode: 'manual' as const,
      providerId: null,
      adapterKey: null,
      adapterRegistered: false,
      manualFallbackRequired: true,
      manualFallbackReason: 'no_active_payment_provider' as PaymentManualFallbackReason,
    };
  }

  if (!provider) {
    return {
      mode: 'manual' as const,
      providerId: fallbackProvider.id,
      adapterKey: getConfiguredAdapter(fallbackProvider),
      adapterRegistered: resolveRegisteredAdapter(fallbackProvider) !== null,
      manualFallbackRequired: true,
      manualFallbackReason: 'outside_automation_gray_scope' as PaymentManualFallbackReason,
    };
  }

  const adapterKey = getConfiguredAdapter(provider);
  const adapter = resolveRegisteredAdapter(provider);
  const adapterSupportsFlow =
    adapter !== null && paymentAdapterSupportsFlow(adapter, flow);

  if (adapter && adapterSupportsFlow && adapter.supportsAutomation) {
    if (getConfig().paymentOperatingMode !== 'automated') {
      return {
        mode: 'manual' as const,
        providerId: provider.id,
        adapterKey: adapter.key,
        adapterRegistered: true,
        manualFallbackRequired: true,
        manualFallbackReason: 'manual_review_mode' as PaymentManualFallbackReason,
      };
    }

    return {
      mode: 'provider' as const,
      providerId: provider.id,
      adapterKey: adapter.key,
      adapterRegistered: true,
      manualFallbackRequired: false,
      manualFallbackReason: null,
    };
  }

  return {
    mode: 'manual' as const,
    providerId: provider.id,
    adapterKey: adapterKey ?? null,
    adapterRegistered: adapterSupportsFlow,
    manualFallbackRequired: true,
    manualFallbackReason:
      adapter && adapterSupportsFlow
        ? ('manual_provider_review_required' as PaymentManualFallbackReason)
        : isManualReviewProvider(provider)
          ? ('manual_provider_review_required' as PaymentManualFallbackReason)
          : ('provider_execution_not_implemented' as PaymentManualFallbackReason),
  };
}

export function withPaymentProcessingMetadata(
  existing: unknown,
  params: {
    flow: PaymentFlow;
    processingMode: PaymentProcessingMode;
    manualFallbackRequired: boolean;
    manualFallbackReason?: PaymentManualFallbackReason | null;
    paymentProviderId?: number | null;
    paymentOperatingMode?: PaymentOperatingMode;
    paymentAutomationRequested?: boolean;
    paymentAutomationReady?: boolean;
    paymentAdapterKey?: string | null;
    paymentAdapterRegistered?: boolean;
  }
) {
  const metadata = toRecord(existing);

  return {
    ...metadata,
    paymentFlow: params.flow,
    processingMode: params.processingMode,
    paymentOperatingMode: params.paymentOperatingMode ?? 'manual_review',
    paymentProviderId: params.paymentProviderId ?? null,
    paymentAutomationRequested: params.paymentAutomationRequested ?? false,
    paymentAutomationReady: params.paymentAutomationReady ?? false,
    paymentAdapterKey: params.paymentAdapterKey ?? null,
    paymentAdapterRegistered: params.paymentAdapterRegistered ?? false,
    manualFallbackRequired: params.manualFallbackRequired,
    ...(params.manualFallbackRequired
      ? {
          manualFallbackReason:
            params.manualFallbackReason ?? 'no_active_payment_provider',
          manualFallbackStatus: 'requested',
          manualFallbackResolvedAt: null,
          financeCurrentStatus: 'requested',
        }
      : {
          manualFallbackReason: null,
          manualFallbackStatus: null,
          manualFallbackResolvedAt: null,
          financeCurrentStatus: 'requested',
        }),
  };
}

export function appendFinanceReviewMetadata(
  existing: unknown,
  input: FinanceReviewInput
) {
  const metadata = toRecord(existing);
  const reviewTrail = toReviewTrail(Reflect.get(metadata, 'financeReviewTrail'));
  const recordedAt = new Date().toISOString();

  const reviewEntry: Record<string, unknown> = {
    action: input.action,
    adminId: input.adminId ?? null,
    recordedAt,
  };

  const operatorNote = normalizeOptionalString(input.operatorNote);
  const settlementReference = normalizeOptionalString(input.settlementReference);
  const processingChannel = normalizeOptionalString(input.processingChannel);

  if (operatorNote) {
    reviewEntry.operatorNote = operatorNote;
  }
  if (settlementReference) {
    reviewEntry.settlementReference = settlementReference;
  }
  if (processingChannel) {
    reviewEntry.processingChannel = processingChannel;
  }

  const manualFallbackUpdate =
    metadata.manualFallbackRequired === true
      ? (() => {
          const status = mapFallbackStatus(input.action);
          if (!status) {
            return {};
          }

          if (!isFallbackTerminalAction(input.action)) {
            return {
              manualFallbackStatus: status,
              financeCurrentStatus: status,
            };
          }

          return {
            manualFallbackStatus: status,
            manualFallbackResolvedAt: recordedAt,
            financeCurrentStatus: status,
          };
        })()
      : {};

  return {
    ...metadata,
    financeReviewLatest: reviewEntry,
    financeReviewTrail: [...reviewTrail, reviewEntry],
    ...manualFallbackUpdate,
  };
}
