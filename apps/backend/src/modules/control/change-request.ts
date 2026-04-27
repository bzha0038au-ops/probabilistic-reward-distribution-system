import { toDecimal, toMoneyString } from '../../shared/money';
import { reviewPaymentProviderConfig } from '../payment/provider-config';
import type {
  PaymentProviderDraftPayload,
  PaymentProviderExecutionMode,
  PaymentProviderFlow,
  PaymentProviderGrayRuleDraftPayload,
  SystemConfigDraftPayload,
} from './service';

export const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

export const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export const normalizeReason = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const normalizeSupportedFlows = (flows: readonly string[]) =>
  Array.from(
    new Set(
      flows.filter(
        (flow): flow is PaymentProviderFlow =>
          flow === 'deposit' || flow === 'withdrawal'
      )
    )
  );

export const normalizeIntegerList = (
  values: readonly number[] | null | undefined
) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => Math.trunc(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

export const normalizeCodeList = (
  values: readonly string[] | null | undefined
) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value !== '')
    )
  );

export const normalizeOptionalMoneyString = (
  value: string | null | undefined
) => {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  return toMoneyString(toDecimal(trimmed));
};

export const normalizeGrayRules = (
  rules: readonly PaymentProviderGrayRuleDraftPayload[] | null | undefined
) =>
  (rules ?? [])
    .map((rule) => ({
      ...(rule.grayPercent !== undefined && rule.grayPercent !== null
        ? { grayPercent: rule.grayPercent }
        : {}),
      ...(normalizeIntegerList(rule.grayUserIds).length > 0
        ? { grayUserIds: normalizeIntegerList(rule.grayUserIds) }
        : {}),
      ...(normalizeCodeList(rule.grayCountryCodes).length > 0
        ? { grayCountryCodes: normalizeCodeList(rule.grayCountryCodes) }
        : {}),
      ...(normalizeCodeList(rule.grayCurrencies).length > 0
        ? { grayCurrencies: normalizeCodeList(rule.grayCurrencies) }
        : {}),
      ...(normalizeOptionalMoneyString(rule.grayMinAmount) !== null
        ? { grayMinAmount: normalizeOptionalMoneyString(rule.grayMinAmount) }
        : {}),
      ...(normalizeOptionalMoneyString(rule.grayMaxAmount) !== null
        ? { grayMaxAmount: normalizeOptionalMoneyString(rule.grayMaxAmount) }
        : {}),
    }))
    .filter((rule) => Object.keys(rule).length > 0);

export const buildConfirmationPhrase = (
  action: 'submit' | 'publish',
  requestId: number
) => `${action.toUpperCase()} ${requestId}`;

const mapSystemConfigKeys = (payload: SystemConfigDraftPayload) =>
  Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

export const buildSystemConfigSummary = (
  payload: SystemConfigDraftPayload
) => {
  const keys = mapSystemConfigKeys(payload);
  return keys.length > 0
    ? `系统配置变更：${keys.join('、')}`
    : '系统配置草稿';
};

export const buildProviderSummary = (payload: PaymentProviderDraftPayload) => {
  const flowLabel =
    payload.supportedFlows.length > 0 ? payload.supportedFlows.join('/') : 'none';
  const modeLabel = payload.executionMode === 'automated' ? 'automated' : 'manual';
  const stateLabel = payload.isActive ? '启用' : '停用';
  const operation = payload.providerId ? '更新' : '新增';

  return `${operation}通道 ${payload.name} (${payload.providerType}) / ${stateLabel} / priority=${payload.priority} / flows=${flowLabel} / mode=${modeLabel}`;
};

export const isSystemConfigChangePayload = (
  value: Record<string, unknown>
): value is SystemConfigDraftPayload =>
  [
    'poolBalance',
    'drawCost',
    'weightJitterEnabled',
    'weightJitterPct',
    'bonusAutoReleaseEnabled',
    'bonusUnlockWagerRatio',
    'authFailureWindowMinutes',
    'authFailureFreezeThreshold',
    'adminFailureFreezeThreshold',
    'profileSecurityRewardAmount',
    'firstDrawRewardAmount',
    'drawStreakDailyRewardAmount',
    'topUpStarterRewardAmount',
    'blackjackMinStake',
    'blackjackMaxStake',
    'blackjackWinPayoutMultiplier',
    'blackjackPushPayoutMultiplier',
    'blackjackNaturalPayoutMultiplier',
    'blackjackDealerHitsSoft17',
    'blackjackDoubleDownAllowed',
    'blackjackSplitAcesAllowed',
    'blackjackHitSplitAcesAllowed',
    'blackjackResplitAllowed',
    'blackjackMaxSplitHands',
    'blackjackSplitTenValueCardsAllowed',
  ].some((key) => Reflect.has(value, key));

export const isProviderDraftPayload = (
  value: Record<string, unknown>
): value is PaymentProviderDraftPayload =>
  typeof Reflect.get(value, 'name') === 'string' &&
  typeof Reflect.get(value, 'providerType') === 'string' &&
  typeof Reflect.get(value, 'priority') === 'number' &&
  typeof Reflect.get(value, 'isActive') === 'boolean' &&
  Array.isArray(Reflect.get(value, 'supportedFlows')) &&
  (Reflect.get(value, 'executionMode') === 'manual' ||
    Reflect.get(value, 'executionMode') === 'automated');

export const parseProviderConfig = (configValue: unknown) => {
  const review = reviewPaymentProviderConfig(configValue);
  const config = review.config;
  const supportedFlows = normalizeSupportedFlows(
    Array.isArray(Reflect.get(config, 'supportedFlows'))
      ? (Reflect.get(config, 'supportedFlows') as string[])
      : [
          ...(Reflect.get(config, 'supportsDeposit') === true ? ['deposit'] : []),
          ...(Reflect.get(config, 'supportsWithdraw') === true
            ? ['withdrawal']
            : []),
        ]
  );
  const executionMode =
    Reflect.get(config, 'executionMode') === 'automated' ? 'automated' : 'manual';

  return {
    config,
    review,
    supportedFlows,
    executionMode: executionMode as PaymentProviderExecutionMode,
    adapter: readString(Reflect.get(config, 'adapter')),
    grayPercent:
      typeof Reflect.get(config, 'grayPercent') === 'number'
        ? Math.max(0, Math.min(100, Number(Reflect.get(config, 'grayPercent'))))
        : typeof Reflect.get(config, 'greyPercent') === 'number'
          ? Math.max(0, Math.min(100, Number(Reflect.get(config, 'greyPercent'))))
          : null,
    grayUserIds: normalizeIntegerList(
      Array.isArray(Reflect.get(config, 'grayUserIds'))
        ? (Reflect.get(config, 'grayUserIds') as number[])
        : Array.isArray(Reflect.get(config, 'greyUserIds'))
          ? (Reflect.get(config, 'greyUserIds') as number[])
          : []
    ),
    grayCountryCodes: normalizeCodeList(
      Array.isArray(Reflect.get(config, 'grayCountryCodes'))
        ? (Reflect.get(config, 'grayCountryCodes') as string[])
        : Array.isArray(Reflect.get(config, 'greyCountryCodes'))
          ? (Reflect.get(config, 'greyCountryCodes') as string[])
          : []
    ),
    grayCurrencies: normalizeCodeList(
      Array.isArray(Reflect.get(config, 'grayCurrencies'))
        ? (Reflect.get(config, 'grayCurrencies') as string[])
        : Array.isArray(Reflect.get(config, 'greyCurrencies'))
          ? (Reflect.get(config, 'greyCurrencies') as string[])
          : []
    ),
    grayMinAmount: normalizeOptionalMoneyString(
      readString(Reflect.get(config, 'grayMinAmount')) ??
        readString(Reflect.get(config, 'greyMinAmount'))
    ),
    grayMaxAmount: normalizeOptionalMoneyString(
      readString(Reflect.get(config, 'grayMaxAmount')) ??
        readString(Reflect.get(config, 'greyMaxAmount'))
    ),
    grayRules: normalizeGrayRules(
      Array.isArray(Reflect.get(config, 'grayRules'))
        ? (Reflect.get(
            config,
            'grayRules'
          ) as PaymentProviderGrayRuleDraftPayload[])
        : []
    ),
  };
};
