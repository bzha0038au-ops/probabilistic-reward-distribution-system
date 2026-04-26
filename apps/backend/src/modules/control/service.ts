import { desc, eq } from '@reward/database/orm';

import { configChangeRequests, paymentProviders } from '@reward/database';
import { db, type DbClient, type DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { reviewPaymentProviderConfig } from '../payment/provider-config';
import {
  getAuthFailureConfig,
  getBonusReleaseConfig,
  getDrawCost,
  getPoolBalance,
  getRandomizationConfig,
  setAuthFailureConfig,
  setBonusReleaseConfig,
  setDrawCost,
  setPoolBalance,
  setRandomizationConfig,
} from '../system/service';

type DbExecutor = DbClient | DbTransaction;

export type ControlChangeRequestStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'published'
  | 'rejected';

export type ControlChangeRequestType =
  | 'system_config_update'
  | 'payment_provider_upsert';

export type PaymentProviderFlow = 'deposit' | 'withdrawal';
export type PaymentProviderExecutionMode = 'manual' | 'automated';

export type SystemConfigDraftPayload = {
  poolBalance?: string | number;
  drawCost?: string | number;
  weightJitterEnabled?: boolean;
  weightJitterPct?: string | number;
  bonusAutoReleaseEnabled?: boolean;
  bonusUnlockWagerRatio?: string | number;
  authFailureWindowMinutes?: string | number;
  authFailureFreezeThreshold?: string | number;
  adminFailureFreezeThreshold?: string | number;
};

export type PaymentProviderGrayRuleDraftPayload = {
  grayPercent?: number | null;
  grayUserIds?: number[];
  grayCountryCodes?: string[];
  grayCurrencies?: string[];
  grayMinAmount?: string | null;
  grayMaxAmount?: string | null;
};

export type PaymentProviderDraftPayload = {
  providerId: number | null;
  name: string;
  providerType: string;
  priority: number;
  isActive: boolean;
  supportedFlows: PaymentProviderFlow[];
  executionMode: PaymentProviderExecutionMode;
  adapter: string | null;
  grayPercent?: number | null;
  grayUserIds?: number[];
  grayCountryCodes?: string[];
  grayCurrencies?: string[];
  grayMinAmount?: string | null;
  grayMaxAmount?: string | null;
  grayRules?: PaymentProviderGrayRuleDraftPayload[];
};

type ConfigChangeRequestRow = typeof configChangeRequests.$inferSelect;

export type ControlChangeRequestRecord = {
  id: number;
  changeType: ControlChangeRequestType;
  status: ControlChangeRequestStatus;
  targetType: string;
  targetId: number | null;
  reason: string | null;
  requiresSecondConfirmation: boolean;
  requiresMfa: boolean;
  createdByAdminId: number;
  submittedByAdminId: number | null;
  approvedByAdminId: number | null;
  publishedByAdminId: number | null;
  rejectedByAdminId: number | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  rejectedAt: Date | null;
  summary: string;
  changePayload: Record<string, unknown>;
  confirmationPhrases: {
    submit: string | null;
    publish: string | null;
  };
};

export type ControlSystemConfig = {
  poolBalance: string;
  drawCost: string;
  weightJitterEnabled: boolean;
  weightJitterPct: string;
  bonusAutoReleaseEnabled: boolean;
  bonusUnlockWagerRatio: string;
  authFailureWindowMinutes: string;
  authFailureFreezeThreshold: string;
  adminFailureFreezeThreshold: string;
};

export type ControlPaymentProviderRecord = {
  id: number;
  name: string;
  providerType: string;
  priority: number;
  isActive: boolean;
  isCircuitBroken: boolean;
  circuitBrokenAt: Date | null;
  circuitBreakReason: string | null;
  supportedFlows: PaymentProviderFlow[];
  executionMode: PaymentProviderExecutionMode;
  adapter: string | null;
  grayPercent: number | null;
  grayUserIds: number[];
  grayCountryCodes: string[];
  grayCurrencies: string[];
  grayMinAmount: string | null;
  grayMaxAmount: string | null;
  grayRules: PaymentProviderGrayRuleDraftPayload[];
  configViolations: ReturnType<typeof reviewPaymentProviderConfig>['violations'];
};

export type ControlCenterOverview = {
  systemConfig: ControlSystemConfig;
  providers: ControlPaymentProviderRecord[];
  changeRequests: ControlChangeRequestRecord[];
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const normalizeReason = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const normalizeSupportedFlows = (flows: readonly string[]) =>
  Array.from(
    new Set(
      flows.filter(
        (flow): flow is PaymentProviderFlow =>
          flow === 'deposit' || flow === 'withdrawal'
      )
    )
  );

const normalizeIntegerList = (values: readonly number[] | null | undefined) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => Math.trunc(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

const normalizeCodeList = (values: readonly string[] | null | undefined) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value !== '')
    )
  );

const normalizeOptionalMoneyString = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  return toMoneyString(toDecimal(trimmed));
};

const normalizeGrayRules = (
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

const buildConfirmationPhrase = (action: 'submit' | 'publish', requestId: number) =>
  `${action.toUpperCase()} ${requestId}`;

const mapSystemConfigKeys = (payload: SystemConfigDraftPayload) =>
  Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

const buildSystemConfigSummary = (payload: SystemConfigDraftPayload) => {
  const keys = mapSystemConfigKeys(payload);
  return keys.length > 0
    ? `系统配置变更：${keys.join('、')}`
    : '系统配置草稿';
};

const buildProviderSummary = (payload: PaymentProviderDraftPayload) => {
  const flowLabel =
    payload.supportedFlows.length > 0 ? payload.supportedFlows.join('/') : 'none';
  const modeLabel = payload.executionMode === 'automated' ? 'automated' : 'manual';
  const stateLabel = payload.isActive ? '启用' : '停用';
  const operation = payload.providerId ? '更新' : '新增';

  return `${operation}通道 ${payload.name} (${payload.providerType}) / ${stateLabel} / priority=${payload.priority} / flows=${flowLabel} / mode=${modeLabel}`;
};

const isSystemConfigChangePayload = (
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
  ].some((key) => Reflect.has(value, key));

const isProviderDraftPayload = (
  value: Record<string, unknown>
): value is PaymentProviderDraftPayload =>
  typeof Reflect.get(value, 'name') === 'string' &&
  typeof Reflect.get(value, 'providerType') === 'string' &&
  typeof Reflect.get(value, 'priority') === 'number' &&
  typeof Reflect.get(value, 'isActive') === 'boolean' &&
  Array.isArray(Reflect.get(value, 'supportedFlows')) &&
  (Reflect.get(value, 'executionMode') === 'manual' ||
    Reflect.get(value, 'executionMode') === 'automated');

const toSystemConfigResponse = async (
  executor: DbExecutor = db
): Promise<ControlSystemConfig> => {
  const [poolBalance, drawCost, randomization, bonusRelease, authFailure] =
    await Promise.all([
      getPoolBalance(executor),
      getDrawCost(executor),
      getRandomizationConfig(executor),
      getBonusReleaseConfig(executor),
      getAuthFailureConfig(executor),
    ]);

  return {
    poolBalance: toMoneyString(poolBalance),
    drawCost: toMoneyString(drawCost),
    weightJitterEnabled: randomization.weightJitterEnabled,
    weightJitterPct: toMoneyString(randomization.weightJitterPct),
    bonusAutoReleaseEnabled: bonusRelease.bonusAutoReleaseEnabled,
    bonusUnlockWagerRatio: toMoneyString(bonusRelease.bonusUnlockWagerRatio),
    authFailureWindowMinutes: toMoneyString(authFailure.authFailureWindowMinutes),
    authFailureFreezeThreshold: toMoneyString(
      authFailure.authFailureFreezeThreshold
    ),
    adminFailureFreezeThreshold: toMoneyString(
      authFailure.adminFailureFreezeThreshold
    ),
  };
};

const listConfigChangeRequestRows = (
  executor: DbExecutor = db,
  limit = 30
) =>
  executor
    .select()
    .from(configChangeRequests)
    .orderBy(
      desc(configChangeRequests.createdAt),
      desc(configChangeRequests.id)
    )
    .limit(limit);

const mapChangeRequestRecord = (
  row: ConfigChangeRequestRow
): ControlChangeRequestRecord => {
  const payload = toRecord(row.changePayload);
  const changeType = row.changeType as ControlChangeRequestType;
  const summary =
    changeType === 'payment_provider_upsert' && isProviderDraftPayload(payload)
      ? buildProviderSummary(payload)
      : buildSystemConfigSummary(payload as SystemConfigDraftPayload);

  return {
    id: row.id,
    changeType,
    status: row.status as ControlChangeRequestStatus,
    targetType: row.targetType,
    targetId: row.targetId ?? null,
    reason: normalizeReason(row.reason),
    requiresSecondConfirmation: row.requiresSecondConfirmation,
    requiresMfa: row.requiresMfa,
    createdByAdminId: row.createdByAdminId,
    submittedByAdminId: row.submittedByAdminId ?? null,
    approvedByAdminId: row.approvedByAdminId ?? null,
    publishedByAdminId: row.publishedByAdminId ?? null,
    rejectedByAdminId: row.rejectedByAdminId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    publishedAt: row.publishedAt ?? null,
    rejectedAt: row.rejectedAt ?? null,
    summary,
    changePayload: payload,
    confirmationPhrases: {
      submit: row.requiresSecondConfirmation
        ? buildConfirmationPhrase('submit', row.id)
        : null,
      publish: row.requiresSecondConfirmation
        ? buildConfirmationPhrase('publish', row.id)
        : null,
    },
  };
};

const parseProviderConfig = (configValue: unknown) => {
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
        ? Math.max(
            0,
            Math.min(100, Number(Reflect.get(config, 'grayPercent')))
          )
        : typeof Reflect.get(config, 'greyPercent') === 'number'
          ? Math.max(
              0,
              Math.min(100, Number(Reflect.get(config, 'greyPercent')))
            )
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
        ? (Reflect.get(config, 'grayRules') as PaymentProviderGrayRuleDraftPayload[])
        : []
    ),
  };
};

export async function listPaymentProvidersForAdmin(
  executor: DbExecutor = db
): Promise<ControlPaymentProviderRecord[]> {
  const rows = await executor
    .select({
      id: paymentProviders.id,
      name: paymentProviders.name,
      providerType: paymentProviders.providerType,
      priority: paymentProviders.priority,
      isActive: paymentProviders.isActive,
      isCircuitBroken: paymentProviders.isCircuitBroken,
      circuitBrokenAt: paymentProviders.circuitBrokenAt,
      circuitBreakReason: paymentProviders.circuitBreakReason,
      config: paymentProviders.config,
    })
    .from(paymentProviders)
    .orderBy(paymentProviders.priority, paymentProviders.id);

  return rows.map((row) => {
    const parsed = parseProviderConfig(row.config);

    return {
      id: row.id,
      name: row.name,
      providerType: row.providerType,
      priority: row.priority ?? 100,
      isActive: row.isActive,
      isCircuitBroken: row.isCircuitBroken,
      circuitBrokenAt: row.circuitBrokenAt ?? null,
      circuitBreakReason: normalizeReason(row.circuitBreakReason),
      supportedFlows: parsed.supportedFlows,
      executionMode: parsed.executionMode,
      adapter: parsed.adapter,
      grayPercent: parsed.grayPercent,
      grayUserIds: parsed.grayUserIds,
      grayCountryCodes: parsed.grayCountryCodes,
      grayCurrencies: parsed.grayCurrencies,
      grayMinAmount: parsed.grayMinAmount,
      grayMaxAmount: parsed.grayMaxAmount,
      grayRules: parsed.grayRules,
      configViolations: parsed.review.violations,
    } as ControlPaymentProviderRecord;
  });
}

export async function listControlChangeRequests(
  executor: DbExecutor = db,
  limit = 30
) {
  const rows = await listConfigChangeRequestRows(executor, limit);
  return rows.map(mapChangeRequestRecord);
}

export async function getControlCenterOverview(
  executor: DbExecutor = db
): Promise<ControlCenterOverview> {
  const [systemConfig, providers, changeRequests] = await Promise.all([
    toSystemConfigResponse(executor),
    listPaymentProvidersForAdmin(executor),
    listControlChangeRequests(executor),
  ]);

  return {
    systemConfig,
    providers,
    changeRequests,
  };
}

const readChangeRequest = async (
  executor: DbExecutor,
  requestId: number
): Promise<ConfigChangeRequestRow | null> => {
  const [row] = await executor
    .select()
    .from(configChangeRequests)
    .where(eq(configChangeRequests.id, requestId))
    .limit(1);

  return row ?? null;
};

const assertChangeRequestExists = (
  request: ConfigChangeRequestRow | null,
  requestId: number
): ConfigChangeRequestRow => {
  if (!request) {
    throw new Error(`Config change request ${requestId} not found.`);
  }

  return request;
};

const assertConfirmationPhrase = (payload: {
  request: ConfigChangeRequestRow;
  action: 'submit' | 'publish';
  confirmationText?: string | null;
}) => {
  if (!payload.request.requiresSecondConfirmation) {
    return;
  }

  const expected = buildConfirmationPhrase(payload.action, payload.request.id);
  const actual = payload.confirmationText?.trim().toUpperCase() ?? '';

  if (actual !== expected) {
    throw new Error(`Second confirmation required. Enter "${expected}".`);
  }
};

const applySystemConfigDraft = async (
  executor: DbExecutor,
  payload: SystemConfigDraftPayload
) => {
  if (payload.poolBalance !== undefined) {
    const poolBalance = toDecimal(payload.poolBalance);
    if (poolBalance.lt(0)) {
      throw new Error('Pool balance must be >= 0.');
    }
    await setPoolBalance(executor, poolBalance);
  }

  if (payload.drawCost !== undefined) {
    const drawCost = toDecimal(payload.drawCost);
    if (drawCost.lt(0)) {
      throw new Error('Draw cost must be >= 0.');
    }
    await setDrawCost(executor, drawCost);
  }

  await setRandomizationConfig(executor, {
    weightJitterEnabled: payload.weightJitterEnabled,
    weightJitterPct:
      payload.weightJitterPct !== undefined
        ? toDecimal(payload.weightJitterPct)
        : undefined,
  });

  await setBonusReleaseConfig(executor, {
    bonusAutoReleaseEnabled: payload.bonusAutoReleaseEnabled,
    bonusUnlockWagerRatio:
      payload.bonusUnlockWagerRatio !== undefined
        ? toDecimal(payload.bonusUnlockWagerRatio)
        : undefined,
  });

  await setAuthFailureConfig(executor, {
    authFailureWindowMinutes:
      payload.authFailureWindowMinutes !== undefined
        ? toDecimal(payload.authFailureWindowMinutes)
        : undefined,
    authFailureFreezeThreshold:
      payload.authFailureFreezeThreshold !== undefined
        ? toDecimal(payload.authFailureFreezeThreshold)
        : undefined,
    adminFailureFreezeThreshold:
      payload.adminFailureFreezeThreshold !== undefined
        ? toDecimal(payload.adminFailureFreezeThreshold)
        : undefined,
  });
};

const buildProviderConfigPayload = (
  baseConfig: Record<string, unknown>,
  payload: PaymentProviderDraftPayload
) => {
  const nextConfig = { ...baseConfig };

  delete nextConfig.priority;
  nextConfig.supportedFlows = payload.supportedFlows;
  nextConfig.supportsDeposit = payload.supportedFlows.includes('deposit');
  nextConfig.supportsWithdraw = payload.supportedFlows.includes('withdrawal');
  nextConfig.executionMode = payload.executionMode;

  if (payload.adapter) {
    nextConfig.adapter = payload.adapter;
  } else {
    delete nextConfig.adapter;
  }

  if (payload.grayPercent !== undefined && payload.grayPercent !== null) {
    nextConfig.grayPercent = payload.grayPercent;
  } else {
    delete nextConfig.grayPercent;
  }

  const grayUserIds = normalizeIntegerList(payload.grayUserIds);
  if (grayUserIds.length > 0) {
    nextConfig.grayUserIds = grayUserIds;
  } else {
    delete nextConfig.grayUserIds;
  }

  const grayCountryCodes = normalizeCodeList(payload.grayCountryCodes);
  if (grayCountryCodes.length > 0) {
    nextConfig.grayCountryCodes = grayCountryCodes;
  } else {
    delete nextConfig.grayCountryCodes;
  }

  const grayCurrencies = normalizeCodeList(payload.grayCurrencies);
  if (grayCurrencies.length > 0) {
    nextConfig.grayCurrencies = grayCurrencies;
  } else {
    delete nextConfig.grayCurrencies;
  }

  const grayMinAmount = normalizeOptionalMoneyString(payload.grayMinAmount);
  if (grayMinAmount !== null) {
    nextConfig.grayMinAmount = grayMinAmount;
  } else {
    delete nextConfig.grayMinAmount;
  }

  const grayMaxAmount = normalizeOptionalMoneyString(payload.grayMaxAmount);
  if (grayMaxAmount !== null) {
    nextConfig.grayMaxAmount = grayMaxAmount;
  } else {
    delete nextConfig.grayMaxAmount;
  }

  const grayRules = normalizeGrayRules(payload.grayRules);
  if (grayRules.length > 0) {
    nextConfig.grayRules = grayRules;
  } else {
    delete nextConfig.grayRules;
  }

  return nextConfig;
};

const applyPaymentProviderDraft = async (
  executor: DbExecutor,
  payload: PaymentProviderDraftPayload
) => {
  if (payload.providerId) {
    const [provider] = await executor
      .select({
        id: paymentProviders.id,
        config: paymentProviders.config,
      })
      .from(paymentProviders)
      .where(eq(paymentProviders.id, payload.providerId))
      .limit(1);

    if (!provider) {
      throw new Error(`Payment provider ${payload.providerId} not found.`);
    }

    const nextConfig = buildProviderConfigPayload(toRecord(provider.config), payload);

    await executor
      .update(paymentProviders)
      .set({
        name: payload.name,
        providerType: payload.providerType,
        priority: payload.priority,
        isActive: payload.isActive,
        config: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(paymentProviders.id, payload.providerId));

    return payload.providerId;
  }

  const nextConfig = buildProviderConfigPayload({}, payload);
  const [created] = await executor
    .insert(paymentProviders)
    .values({
      name: payload.name,
      providerType: payload.providerType,
      priority: payload.priority,
      isActive: payload.isActive,
      isCircuitBroken: false,
      config: nextConfig,
    })
    .returning({ id: paymentProviders.id });

  if (!created) {
    throw new Error('Failed to create payment provider.');
  }

  return created.id;
};

const applyChangeRequest = async (
  executor: DbExecutor,
  request: ConfigChangeRequestRow
) => {
  const payload = toRecord(request.changePayload);

  if (
    request.changeType === 'system_config_update' &&
    isSystemConfigChangePayload(payload)
  ) {
    await applySystemConfigDraft(executor, payload);
    return request.targetId ?? null;
  }

  if (
    request.changeType === 'payment_provider_upsert' &&
    isProviderDraftPayload(payload)
  ) {
    return applyPaymentProviderDraft(executor, payload);
  }

  throw new Error(`Unsupported config change payload for request ${request.id}.`);
};

export async function createSystemConfigDraft(payload: {
  adminId: number;
  values: SystemConfigDraftPayload;
  reason?: string | null;
}) {
  const normalizedReason = normalizeReason(payload.reason);
  const [created] = await db
    .insert(configChangeRequests)
    .values({
      changeType: 'system_config_update',
      status: 'draft',
      targetType: 'system_config',
      targetId: null,
      changePayload: payload.values as Record<string, unknown>,
      reason: normalizedReason,
      requiresSecondConfirmation: true,
      requiresMfa: false,
      createdByAdminId: payload.adminId,
    })
    .returning();

  return mapChangeRequestRecord(created);
}

export async function createPaymentProviderDraft(payload: {
  adminId: number;
  provider: PaymentProviderDraftPayload;
  reason?: string | null;
}) {
  const normalizedReason = normalizeReason(payload.reason);
  if (payload.provider.priority < 0) {
    throw new Error('Provider priority must be >= 0.');
  }

  const requiresMfa =
    payload.provider.isActive &&
    payload.provider.executionMode === 'automated' &&
    payload.provider.supportedFlows.includes('withdrawal');

  const [created] = await db
    .insert(configChangeRequests)
    .values({
      changeType: 'payment_provider_upsert',
      status: 'draft',
      targetType: 'payment_provider',
      targetId: payload.provider.providerId,
      changePayload: payload.provider as unknown as Record<string, unknown>,
      reason: normalizedReason,
      requiresSecondConfirmation: true,
      requiresMfa,
      createdByAdminId: payload.adminId,
    })
    .returning();

  return mapChangeRequestRecord(created);
}

export async function submitControlChangeRequest(payload: {
  requestId: number;
  adminId: number;
  confirmationText?: string | null;
}) {
  return db.transaction(async (tx) => {
    const request = assertChangeRequestExists(
      await readChangeRequest(tx, payload.requestId),
      payload.requestId
    );

    if (request.status !== 'draft') {
      throw new Error('Only draft requests can be submitted.');
    }

    assertConfirmationPhrase({
      request,
      action: 'submit',
      confirmationText: payload.confirmationText,
    });

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: 'pending_approval',
        submittedByAdminId: payload.adminId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(configChangeRequests.id, payload.requestId))
      .returning();

    return mapChangeRequestRecord(updated);
  });
}

export async function approveControlChangeRequest(payload: {
  requestId: number;
  adminId: number;
}) {
  return db.transaction(async (tx) => {
    const request = assertChangeRequestExists(
      await readChangeRequest(tx, payload.requestId),
      payload.requestId
    );

    if (request.status !== 'pending_approval') {
      throw new Error('Only pending requests can be approved.');
    }

    if (request.createdByAdminId === payload.adminId) {
      throw new Error('The requester cannot approve their own config change.');
    }

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: 'approved',
        approvedByAdminId: payload.adminId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(configChangeRequests.id, payload.requestId))
      .returning();

    return mapChangeRequestRecord(updated);
  });
}

export async function rejectControlChangeRequest(payload: {
  requestId: number;
  adminId: number;
  reason?: string | null;
}) {
  return db.transaction(async (tx) => {
    const request = assertChangeRequestExists(
      await readChangeRequest(tx, payload.requestId),
      payload.requestId
    );

    if (request.status === 'published' || request.status === 'rejected') {
      throw new Error('The request is already finalized.');
    }

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: 'rejected',
        rejectedByAdminId: payload.adminId,
        rejectedAt: new Date(),
        reason: normalizeReason(payload.reason) ?? request.reason,
        updatedAt: new Date(),
      })
      .where(eq(configChangeRequests.id, payload.requestId))
      .returning();

    return mapChangeRequestRecord(updated);
  });
}

export async function publishControlChangeRequest(payload: {
  requestId: number;
  adminId: number;
  confirmationText?: string | null;
}) {
  return db.transaction(async (tx) => {
    const request = assertChangeRequestExists(
      await readChangeRequest(tx, payload.requestId),
      payload.requestId
    );

    if (request.status !== 'approved') {
      throw new Error('Only approved requests can be published.');
    }

    assertConfirmationPhrase({
      request,
      action: 'publish',
      confirmationText: payload.confirmationText,
    });

    const appliedTargetId = await applyChangeRequest(tx, request);

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: 'published',
        targetId: appliedTargetId ?? request.targetId,
        publishedByAdminId: payload.adminId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(configChangeRequests.id, payload.requestId))
      .returning();

    return mapChangeRequestRecord(updated);
  });
}

const updateProviderCircuitState = async (payload: {
  providerId: number;
  tripped: boolean;
  reason?: string | null;
}): Promise<ControlPaymentProviderRecord> => {
  const [updated] = await db
    .update(paymentProviders)
    .set({
      isCircuitBroken: payload.tripped,
      circuitBrokenAt: payload.tripped ? new Date() : null,
      circuitBreakReason: payload.tripped ? normalizeReason(payload.reason) : null,
      updatedAt: new Date(),
    })
    .where(eq(paymentProviders.id, payload.providerId))
    .returning({
      id: paymentProviders.id,
      name: paymentProviders.name,
      providerType: paymentProviders.providerType,
      priority: paymentProviders.priority,
      isActive: paymentProviders.isActive,
      isCircuitBroken: paymentProviders.isCircuitBroken,
      circuitBrokenAt: paymentProviders.circuitBrokenAt,
      circuitBreakReason: paymentProviders.circuitBreakReason,
      config: paymentProviders.config,
    });

  if (!updated) {
    throw new Error(`Payment provider ${payload.providerId} not found.`);
  }

  const parsed = parseProviderConfig(updated.config);

  return {
    id: updated.id,
    name: updated.name,
    providerType: updated.providerType,
    priority: updated.priority ?? 100,
    isActive: updated.isActive,
    isCircuitBroken: updated.isCircuitBroken,
    circuitBrokenAt: updated.circuitBrokenAt ?? null,
    circuitBreakReason: normalizeReason(updated.circuitBreakReason),
    supportedFlows: parsed.supportedFlows,
    executionMode: parsed.executionMode,
    adapter: parsed.adapter,
    grayPercent: parsed.grayPercent,
    grayUserIds: parsed.grayUserIds,
    grayCountryCodes: parsed.grayCountryCodes,
    grayCurrencies: parsed.grayCurrencies,
    grayMinAmount: parsed.grayMinAmount,
    grayMaxAmount: parsed.grayMaxAmount,
    grayRules: parsed.grayRules,
    configViolations: parsed.review.violations,
  } as ControlPaymentProviderRecord;
};

export async function tripPaymentProviderCircuitBreaker(payload: {
  providerId: number;
  reason?: string | null;
}) {
  return updateProviderCircuitState({
    providerId: payload.providerId,
    tripped: true,
    reason: payload.reason,
  });
}

export async function resetPaymentProviderCircuitBreaker(payload: {
  providerId: number;
}) {
  return updateProviderCircuitState({
    providerId: payload.providerId,
    tripped: false,
  });
}
