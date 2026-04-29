import { API_ERROR_CODES } from "@reward/shared-types/api";
import { eq } from "@reward/database/orm";

import {
  configChangeRequests,
  paymentProviders,
  saasTenants,
} from "@reward/database";
import { db } from "../../db";
import {
  conflictError,
  internalInvariantError,
  notFoundError,
  persistenceError,
  unprocessableEntityError,
} from "../../shared/errors";
import { toDecimal } from "../../shared/money";
import {
  buildLegalDocumentPublishPayload,
  publishLegalDocumentVersion,
  readActiveLegalPublicationAuditState,
} from "../legal/service";
import {
  setAntiAbuseConfig,
  getBlackjackConfig,
  setAuthFailureConfig,
  setBlackjackConfig,
  setBonusReleaseConfig,
  setDrawCost,
  setDrawSystemControls,
  setGamificationRewardConfig,
  setPaymentConfig,
  setPoolBalance,
  setRandomizationConfig,
  setSaasUsageAlertConfig,
  setSystemFlagsConfig,
  setWithdrawalRiskConfig,
} from "../system/service";
import {
  mapChangeRequestRecord,
  toControlPaymentProviderRecord,
  toSystemConfigResponse,
} from "./control-overview-service";
import {
  buildConfirmationPhrase,
  isLegalDocumentPublishPayload,
  isSaasTenantRiskEnvelopeDraftPayload,
  isProviderDraftPayload,
  isSystemConfigChangePayload,
  normalizeCodeList,
  normalizeGrayRules,
  normalizeIntegerList,
  normalizeOptionalMoneyString,
  normalizeReason,
  toRecord,
} from "./change-request";
import type {
  PublishControlChangeRequestResult,
  ControlChangeRequestType,
  ControlChangeAuditField,
  DbExecutor,
  PaymentProviderDraftPayload,
  SaasTenantRiskEnvelopeDraftPayload,
  SystemConfigDraftPayload,
} from "./service";

type ConfigChangeRequestRow = typeof configChangeRequests.$inferSelect;

const HIGH_RISK_SYSTEM_CONFIG_KEYS = new Set<keyof SystemConfigDraftPayload>([
  "maintenanceMode",
  "registrationEnabled",
  "loginEnabled",
  "drawEnabled",
  "paymentDepositEnabled",
  "paymentWithdrawEnabled",
  "antiAbuseAutoFreezeEnabled",
  "withdrawRiskNewCardFirstWithdrawalReviewEnabled",
]);

const readChangeRequest = async (
  executor: DbExecutor,
  requestId: number,
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
  requestId: number,
): ConfigChangeRequestRow => {
  if (!request) {
    throw notFoundError(`Config change request ${requestId} not found.`, {
      code: API_ERROR_CODES.CONFIG_CHANGE_REQUEST_NOT_FOUND,
    });
  }

  return request;
};

const assertConfirmationPhrase = (payload: {
  request: ConfigChangeRequestRow;
  action: "submit" | "publish";
  confirmationText?: string | null;
}) => {
  if (!payload.request.requiresSecondConfirmation) {
    return;
  }

  const expected = buildConfirmationPhrase(payload.action, payload.request.id);
  const actual = payload.confirmationText?.trim().toUpperCase() ?? "";

  if (actual !== expected) {
    throw conflictError(`Second confirmation required. Enter "${expected}".`, {
      code: API_ERROR_CODES.SECOND_CONFIRMATION_REQUIRED,
    });
  }
};

const hasHighRiskSystemConfigChange = (payload: SystemConfigDraftPayload) =>
  Object.entries(payload).some(
    ([key, value]) =>
      value !== undefined &&
      HIGH_RISK_SYSTEM_CONFIG_KEYS.has(key as keyof SystemConfigDraftPayload),
  );

const assertHighRiskReviewNotes = (payload: {
  values: SystemConfigDraftPayload;
  reason?: string | null;
}) => {
  if (!hasHighRiskSystemConfigChange(payload.values)) {
    return;
  }

  if (normalizeReason(payload.reason) === null) {
    throw unprocessableEntityError(
      "Review notes are required for high-risk runtime control changes.",
      {
        code: API_ERROR_CODES.FIELD_INVALID,
      },
    );
  }
};

const normalizeSaasTenantRiskEnvelopeMoney = (
  value: string | number | null | undefined,
  fieldLabel: string,
) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const parsed = toDecimal(value);
  if (parsed.lt(0)) {
    throw unprocessableEntityError(`${fieldLabel} must be >= 0.`, {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }

  return parsed.toFixed(2);
};

const normalizeSaasTenantRiskEnvelopeDraft = (
  payload: SaasTenantRiskEnvelopeDraftPayload,
) => ({
  tenantId: payload.tenantId,
  dailyBudgetCap: normalizeSaasTenantRiskEnvelopeMoney(
    payload.dailyBudgetCap,
    "Daily budget cap",
  ),
  maxSinglePayout: normalizeSaasTenantRiskEnvelopeMoney(
    payload.maxSinglePayout,
    "Max single payout",
  ),
  varianceCap: normalizeSaasTenantRiskEnvelopeMoney(
    payload.varianceCap,
    "Variance cap",
  ),
  emergencyStop:
    payload.emergencyStop !== undefined
      ? Boolean(payload.emergencyStop)
      : undefined,
});

const applySystemConfigDraft = async (
  executor: DbExecutor,
  payload: SystemConfigDraftPayload,
) => {
  if (payload.poolBalance !== undefined) {
    const poolBalance = toDecimal(payload.poolBalance);
    if (poolBalance.lt(0)) {
      throw unprocessableEntityError("Pool balance must be >= 0.", {
        code: API_ERROR_CODES.POOL_BALANCE_NEGATIVE,
      });
    }
    await setPoolBalance(executor, poolBalance);
  }

  if (payload.drawCost !== undefined) {
    const drawCost = toDecimal(payload.drawCost);
    if (drawCost.lt(0)) {
      throw unprocessableEntityError("Draw cost must be >= 0.", {
        code: API_ERROR_CODES.DRAW_COST_NEGATIVE,
      });
    }
    await setDrawCost(executor, drawCost);
  }

  await setSystemFlagsConfig(executor, {
    maintenanceMode: payload.maintenanceMode,
    registrationEnabled: payload.registrationEnabled,
    loginEnabled: payload.loginEnabled,
  });

  await setDrawSystemControls(executor, {
    drawEnabled: payload.drawEnabled,
  });

  await setPaymentConfig(executor, {
    depositEnabled: payload.paymentDepositEnabled,
    withdrawEnabled: payload.paymentWithdrawEnabled,
  });

  await setAntiAbuseConfig(executor, {
    autoFreezeEnabled: payload.antiAbuseAutoFreezeEnabled,
  });

  await setWithdrawalRiskConfig(executor, {
    newCardFirstWithdrawalReviewEnabled:
      payload.withdrawRiskNewCardFirstWithdrawalReviewEnabled,
  });

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

  await setGamificationRewardConfig(executor, {
    profileSecurityRewardAmount:
      payload.profileSecurityRewardAmount !== undefined
        ? toDecimal(payload.profileSecurityRewardAmount)
        : undefined,
    firstDrawRewardAmount:
      payload.firstDrawRewardAmount !== undefined
        ? toDecimal(payload.firstDrawRewardAmount)
        : undefined,
    drawStreakDailyRewardAmount:
      payload.drawStreakDailyRewardAmount !== undefined
        ? toDecimal(payload.drawStreakDailyRewardAmount)
        : undefined,
    topUpStarterRewardAmount:
      payload.topUpStarterRewardAmount !== undefined
        ? toDecimal(payload.topUpStarterRewardAmount)
        : undefined,
  });

  if (
    payload.saasUsageAlertMaxMinuteQps !== undefined &&
    toDecimal(payload.saasUsageAlertMaxMinuteQps).lt(0)
  ) {
    throw unprocessableEntityError(
      "SaaS usage alert maximum minute QPS must be >= 0.",
      {
        code: API_ERROR_CODES.FIELD_INVALID,
      },
    );
  }

  if (
    payload.saasUsageAlertMaxSinglePayoutAmount !== undefined &&
    toDecimal(payload.saasUsageAlertMaxSinglePayoutAmount).lt(0)
  ) {
    throw unprocessableEntityError(
      "SaaS usage alert maximum single payout amount must be >= 0.",
      {
        code: API_ERROR_CODES.FIELD_INVALID,
      },
    );
  }

  if (
    payload.saasUsageAlertMaxAntiExploitRatePct !== undefined &&
    (toDecimal(payload.saasUsageAlertMaxAntiExploitRatePct).lt(0) ||
      toDecimal(payload.saasUsageAlertMaxAntiExploitRatePct).gt(100))
  ) {
    throw unprocessableEntityError(
      "SaaS usage alert anti-exploit rate must be between 0 and 100.",
      {
        code: API_ERROR_CODES.FIELD_INVALID,
      },
    );
  }

  await setSaasUsageAlertConfig(executor, {
    maxMinuteQps:
      payload.saasUsageAlertMaxMinuteQps !== undefined
        ? toDecimal(payload.saasUsageAlertMaxMinuteQps)
        : undefined,
    maxSinglePayoutAmount:
      payload.saasUsageAlertMaxSinglePayoutAmount !== undefined
        ? toDecimal(payload.saasUsageAlertMaxSinglePayoutAmount)
        : undefined,
    maxAntiExploitRatePct:
      payload.saasUsageAlertMaxAntiExploitRatePct !== undefined
        ? toDecimal(payload.saasUsageAlertMaxAntiExploitRatePct)
        : undefined,
  });

  const touchesBlackjackConfig = [
    payload.blackjackMinStake,
    payload.blackjackMaxStake,
    payload.blackjackWinPayoutMultiplier,
    payload.blackjackPushPayoutMultiplier,
    payload.blackjackNaturalPayoutMultiplier,
    payload.blackjackDealerHitsSoft17,
    payload.blackjackDoubleDownAllowed,
    payload.blackjackSplitAcesAllowed,
    payload.blackjackHitSplitAcesAllowed,
    payload.blackjackResplitAllowed,
    payload.blackjackMaxSplitHands,
    payload.blackjackSplitTenValueCardsAllowed,
  ].some((value) => value !== undefined);

  if (!touchesBlackjackConfig) {
    return;
  }

  const currentBlackjackConfig = await getBlackjackConfig(executor);
  const minStake =
    payload.blackjackMinStake !== undefined
      ? toDecimal(payload.blackjackMinStake)
      : toDecimal(currentBlackjackConfig.minStake);
  const maxStake =
    payload.blackjackMaxStake !== undefined
      ? toDecimal(payload.blackjackMaxStake)
      : toDecimal(currentBlackjackConfig.maxStake);
  const winPayoutMultiplier =
    payload.blackjackWinPayoutMultiplier !== undefined
      ? toDecimal(payload.blackjackWinPayoutMultiplier)
      : toDecimal(currentBlackjackConfig.winPayoutMultiplier);
  const pushPayoutMultiplier =
    payload.blackjackPushPayoutMultiplier !== undefined
      ? toDecimal(payload.blackjackPushPayoutMultiplier)
      : toDecimal(currentBlackjackConfig.pushPayoutMultiplier);
  const naturalPayoutMultiplier =
    payload.blackjackNaturalPayoutMultiplier !== undefined
      ? toDecimal(payload.blackjackNaturalPayoutMultiplier)
      : toDecimal(currentBlackjackConfig.naturalPayoutMultiplier);
  const resplitAllowed =
    payload.blackjackResplitAllowed !== undefined
      ? payload.blackjackResplitAllowed
      : currentBlackjackConfig.resplitAllowed;
  const maxSplitHands =
    payload.blackjackMaxSplitHands !== undefined
      ? Math.trunc(payload.blackjackMaxSplitHands)
      : currentBlackjackConfig.maxSplitHands;

  if (minStake.lte(0)) {
    throw unprocessableEntityError("Blackjack minimum stake must be > 0.", {
      code: API_ERROR_CODES.BLACKJACK_MIN_STAKE_INVALID,
    });
  }

  if (maxStake.lt(minStake)) {
    throw unprocessableEntityError(
      "Blackjack maximum stake must be greater than or equal to minimum stake.",
      {
        code: API_ERROR_CODES.BLACKJACK_MAX_STAKE_BELOW_MIN,
      },
    );
  }

  if (winPayoutMultiplier.lte(0)) {
    throw unprocessableEntityError(
      "Blackjack win payout multiplier must be > 0.",
      {
        code: API_ERROR_CODES.BLACKJACK_WIN_PAYOUT_MULTIPLIER_INVALID,
      },
    );
  }

  if (pushPayoutMultiplier.lt(0)) {
    throw unprocessableEntityError(
      "Blackjack push payout multiplier must be >= 0.",
      {
        code: API_ERROR_CODES.BLACKJACK_PUSH_PAYOUT_MULTIPLIER_INVALID,
      },
    );
  }

  if (naturalPayoutMultiplier.lt(winPayoutMultiplier)) {
    throw unprocessableEntityError(
      "Blackjack natural payout multiplier must be greater than or equal to the normal win multiplier.",
      {
        code: API_ERROR_CODES.BLACKJACK_NATURAL_PAYOUT_MULTIPLIER_INVALID,
      },
    );
  }

  if (
    !Number.isInteger(maxSplitHands) ||
    maxSplitHands < 2 ||
    maxSplitHands > 8
  ) {
    throw unprocessableEntityError(
      "Blackjack maximum split hands must be an integer between 2 and 8.",
      {
        code: API_ERROR_CODES.BLACKJACK_MAX_SPLIT_HANDS_INVALID,
      },
    );
  }

  if (resplitAllowed && maxSplitHands < 3) {
    throw unprocessableEntityError(
      "Blackjack maximum split hands must be at least 3 when re-split is enabled.",
      {
        code: API_ERROR_CODES.BLACKJACK_RESPLIT_REQUIRES_HIGHER_MAX_HANDS,
      },
    );
  }

  await setBlackjackConfig(executor, {
    minStake,
    maxStake,
    winPayoutMultiplier,
    pushPayoutMultiplier,
    naturalPayoutMultiplier,
    dealerHitsSoft17: payload.blackjackDealerHitsSoft17,
    doubleDownAllowed: payload.blackjackDoubleDownAllowed,
    splitAcesAllowed: payload.blackjackSplitAcesAllowed,
    hitSplitAcesAllowed: payload.blackjackHitSplitAcesAllowed,
    resplitAllowed: payload.blackjackResplitAllowed,
    maxSplitHands,
    splitTenValueCardsAllowed: payload.blackjackSplitTenValueCardsAllowed,
  });
};

const buildProviderConfigPayload = (
  baseConfig: Record<string, unknown>,
  payload: PaymentProviderDraftPayload,
) => {
  const nextConfig = { ...baseConfig };

  delete nextConfig.priority;
  nextConfig.supportedFlows = payload.supportedFlows;
  nextConfig.supportsDeposit = payload.supportedFlows.includes("deposit");
  nextConfig.supportsWithdraw = payload.supportedFlows.includes("withdrawal");
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
  payload: PaymentProviderDraftPayload,
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
      throw notFoundError(`Payment provider ${payload.providerId} not found.`, {
        code: API_ERROR_CODES.PAYMENT_PROVIDER_NOT_FOUND,
      });
    }

    const nextConfig = buildProviderConfigPayload(
      toRecord(provider.config),
      payload,
    );

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
    throw persistenceError("Failed to create payment provider.");
  }

  return created.id;
};

const applySaasTenantRiskEnvelopeDraft = async (
  executor: DbExecutor,
  payload: SaasTenantRiskEnvelopeDraftPayload,
) => {
  const normalized = normalizeSaasTenantRiskEnvelopeDraft(payload);
  const [tenant] = await executor
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.id, normalized.tenantId))
    .limit(1);

  if (!tenant) {
    throw notFoundError(`Tenant ${normalized.tenantId} not found.`, {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  await executor
    .update(saasTenants)
    .set({
      ...(normalized.dailyBudgetCap !== undefined
        ? { riskEnvelopeDailyBudgetCap: normalized.dailyBudgetCap }
        : {}),
      ...(normalized.maxSinglePayout !== undefined
        ? { riskEnvelopeMaxSinglePayout: normalized.maxSinglePayout }
        : {}),
      ...(normalized.varianceCap !== undefined
        ? { riskEnvelopeVarianceCap: normalized.varianceCap }
        : {}),
      ...(normalized.emergencyStop !== undefined
        ? { riskEnvelopeEmergencyStop: normalized.emergencyStop }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(saasTenants.id, normalized.tenantId));

  return normalized.tenantId;
};

const applyChangeRequest = async (
  executor: DbExecutor,
  request: ConfigChangeRequestRow,
  adminId: number,
) => {
  const payload = toRecord(request.changePayload);

  if (
    request.changeType === "system_config_update" &&
    isSystemConfigChangePayload(payload)
  ) {
    await applySystemConfigDraft(executor, payload);
    return request.targetId ?? null;
  }

  if (
    request.changeType === "payment_provider_upsert" &&
    isProviderDraftPayload(payload)
  ) {
    return applyPaymentProviderDraft(executor, payload);
  }

  if (
    request.changeType === "legal_document_publish" &&
    isLegalDocumentPublishPayload(payload)
  ) {
    const publication = await publishLegalDocumentVersion(executor, {
      ...payload,
      adminId,
      changeRequestId: request.id,
    });
    return publication.documentId;
  }

  if (
    request.changeType === "saas_tenant_risk_envelope_upsert" &&
    isSaasTenantRiskEnvelopeDraftPayload(payload)
  ) {
    return applySaasTenantRiskEnvelopeDraft(executor, payload);
  }

  throw internalInvariantError(
    `Unsupported config change payload for request ${request.id}.`,
  );
};

const readPaymentProviderAuditState = async (
  executor: DbExecutor,
  providerId: number | null,
) => {
  if (!providerId) {
    return null;
  }

  const [row] = await executor
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
    .where(eq(paymentProviders.id, providerId))
    .limit(1);

  if (!row) {
    return null;
  }

  const provider = toControlPaymentProviderRecord(row);
  return {
    resource: "payment_provider" as const,
    targetId: row.id,
    state: {
      name: provider.name,
      providerType: provider.providerType,
      priority: provider.priority,
      isActive: provider.isActive,
      supportedFlows: provider.supportedFlows,
      executionMode: provider.executionMode,
      adapter: provider.adapter,
      grayPercent: provider.grayPercent,
      grayUserIds: provider.grayUserIds,
      grayCountryCodes: provider.grayCountryCodes,
      grayCurrencies: provider.grayCurrencies,
      grayMinAmount: provider.grayMinAmount,
      grayMaxAmount: provider.grayMaxAmount,
      grayRules: provider.grayRules,
    } satisfies Record<string, unknown>,
  };
};

const readSaasTenantRiskEnvelopeAuditState = async (
  executor: DbExecutor,
  tenantId: number | null,
) => {
  if (!tenantId) {
    return null;
  }

  const [tenant] = await executor
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return null;
  }

  return {
    resource: "saas_tenant_risk_envelope" as const,
    targetId: tenant.id,
    state: {
      dailyBudgetCap: tenant.riskEnvelopeDailyBudgetCap
        ? tenant.riskEnvelopeDailyBudgetCap.toString()
        : null,
      maxSinglePayout: tenant.riskEnvelopeMaxSinglePayout
        ? tenant.riskEnvelopeMaxSinglePayout.toString()
        : null,
      varianceCap: tenant.riskEnvelopeVarianceCap
        ? tenant.riskEnvelopeVarianceCap.toString()
        : null,
      emergencyStop: Boolean(tenant.riskEnvelopeEmergencyStop),
    } satisfies Record<string, unknown>,
  };
};

const readChangeRequestAuditSnapshot = async (
  executor: DbExecutor,
  request: ConfigChangeRequestRow,
  targetId: number | null,
) => {
  const payload = toRecord(request.changePayload);

  if (
    request.changeType === "system_config_update" &&
    isSystemConfigChangePayload(payload)
  ) {
    return {
      resource: "system_config" as const,
      targetId: null,
      state: (await toSystemConfigResponse(executor)) as Record<
        string,
        unknown
      >,
    };
  }

  if (
    request.changeType === "payment_provider_upsert" &&
    isProviderDraftPayload(payload)
  ) {
    return readPaymentProviderAuditState(executor, targetId);
  }

  if (
    request.changeType === "legal_document_publish" &&
    isLegalDocumentPublishPayload(payload)
  ) {
    return readActiveLegalPublicationAuditState(executor, {
      documentKey: payload.documentKey,
      locale: payload.locale,
    });
  }

  if (
    request.changeType === "saas_tenant_risk_envelope_upsert" &&
    isSaasTenantRiskEnvelopeDraftPayload(payload)
  ) {
    return readSaasTenantRiskEnvelopeAuditState(
      executor,
      targetId ?? payload.tenantId,
    );
  }

  return null;
};

const buildFieldDiff = (
  keys: string[],
  previousState: Record<string, unknown>,
  nextState: Record<string, unknown>,
): ControlChangeAuditField[] =>
  keys.map((key) => ({
    key,
    from: Reflect.get(previousState, key) ?? null,
    to: Reflect.get(nextState, key) ?? null,
  }));

const buildPublishedChangeRequestAudit = (
  request: ConfigChangeRequestRow,
  previousSnapshot: Awaited<ReturnType<typeof readChangeRequestAuditSnapshot>>,
  nextSnapshot: Awaited<ReturnType<typeof readChangeRequestAuditSnapshot>>,
) => {
  if (!nextSnapshot) {
    return null;
  }

  const payload = toRecord(request.changePayload);

  if (
    request.changeType === "system_config_update" &&
    isSystemConfigChangePayload(payload)
  ) {
    const changedKeys = Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    return {
      resource: nextSnapshot.resource,
      targetId: nextSnapshot.targetId,
      changedKeys,
      fieldDiff: buildFieldDiff(
        changedKeys,
        previousSnapshot?.state ?? {},
        nextSnapshot.state,
      ),
    };
  }

  if (
    request.changeType === "payment_provider_upsert" &&
    isProviderDraftPayload(payload)
  ) {
    const changedKeys = Object.entries(payload)
      .filter(([key, value]) => key !== "providerId" && value !== undefined)
      .map(([key]) => key);

    return {
      resource: nextSnapshot.resource,
      targetId: nextSnapshot.targetId,
      changedKeys,
      fieldDiff: buildFieldDiff(
        changedKeys,
        previousSnapshot?.state ?? {},
        nextSnapshot.state,
      ),
    };
  }

  if (
    request.changeType === "legal_document_publish" &&
    isLegalDocumentPublishPayload(payload)
  ) {
    const changedKeys = [
      "documentId",
      "documentKey",
      "locale",
      "title",
      "version",
      "releaseMode",
      "rolloutPercent",
    ];

    return {
      resource: nextSnapshot.resource,
      targetId: nextSnapshot.targetId,
      changedKeys,
      fieldDiff: buildFieldDiff(
        changedKeys,
        previousSnapshot?.state ?? {},
        nextSnapshot.state,
      ),
    };
  }

  if (
    request.changeType === "saas_tenant_risk_envelope_upsert" &&
    isSaasTenantRiskEnvelopeDraftPayload(payload)
  ) {
    const changedKeys = Object.entries(payload)
      .filter(([key, value]) => key !== "tenantId" && value !== undefined)
      .map(([key]) => key);

    return {
      resource: nextSnapshot.resource,
      targetId: nextSnapshot.targetId,
      changedKeys,
      fieldDiff: buildFieldDiff(
        changedKeys,
        previousSnapshot?.state ?? {},
        nextSnapshot.state,
      ),
    };
  }

  return null;
};

export async function createSystemConfigDraft(payload: {
  adminId: number;
  values: SystemConfigDraftPayload;
  reason?: string | null;
}) {
  assertHighRiskReviewNotes(payload);
  const normalizedReason = normalizeReason(payload.reason);
  const requiresMfa = hasHighRiskSystemConfigChange(payload.values);
  const [created] = await db
    .insert(configChangeRequests)
    .values({
      changeType: "system_config_update" satisfies ControlChangeRequestType,
      status: "draft",
      targetType: "system_config",
      targetId: null,
      changePayload: payload.values as Record<string, unknown>,
      reason: normalizedReason,
      requiresSecondConfirmation: true,
      requiresMfa,
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
    throw unprocessableEntityError("Provider priority must be >= 0.", {
      code: API_ERROR_CODES.PAYMENT_PROVIDER_PRIORITY_NEGATIVE,
    });
  }

  const requiresMfa =
    payload.provider.isActive &&
    payload.provider.executionMode === "automated" &&
    payload.provider.supportedFlows.includes("withdrawal");

  const [created] = await db
    .insert(configChangeRequests)
    .values({
      changeType: "payment_provider_upsert" satisfies ControlChangeRequestType,
      status: "draft",
      targetType: "payment_provider",
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

export async function createLegalDocumentPublishDraft(payload: {
  adminId: number;
  documentId: number;
  rolloutPercent: number;
  reason?: string | null;
}) {
  const normalizedReason = normalizeReason(payload.reason);
  const publishPayload = await buildLegalDocumentPublishPayload(db, {
    documentId: payload.documentId,
    rolloutPercent: payload.rolloutPercent,
  });

  const [created] = await db
    .insert(configChangeRequests)
    .values({
      changeType: "legal_document_publish" satisfies ControlChangeRequestType,
      status: "draft",
      targetType: "legal_document",
      targetId: publishPayload.documentId,
      changePayload: publishPayload as unknown as Record<string, unknown>,
      reason: normalizedReason,
      requiresSecondConfirmation: true,
      requiresMfa: true,
      createdByAdminId: payload.adminId,
    })
    .returning();

  return mapChangeRequestRecord(created);
}

export async function createSaasTenantRiskEnvelopeDraft(payload: {
  adminId: number;
  riskEnvelope: SaasTenantRiskEnvelopeDraftPayload;
  reason?: string | null;
}) {
  const normalizedReason = normalizeReason(payload.reason);
  const normalizedEnvelope = normalizeSaasTenantRiskEnvelopeDraft(
    payload.riskEnvelope,
  );
  const hasChanges = [
    normalizedEnvelope.dailyBudgetCap,
    normalizedEnvelope.maxSinglePayout,
    normalizedEnvelope.varianceCap,
    normalizedEnvelope.emergencyStop,
  ].some((value) => value !== undefined);

  if (!hasChanges) {
    throw unprocessableEntityError(
      "At least one risk envelope field must be provided.",
      {
        code: API_ERROR_CODES.INVALID_REQUEST,
      },
    );
  }

  const [tenant] = await db
    .select({
      id: saasTenants.id,
    })
    .from(saasTenants)
    .where(eq(saasTenants.id, normalizedEnvelope.tenantId))
    .limit(1);

  if (!tenant) {
    throw notFoundError(`Tenant ${normalizedEnvelope.tenantId} not found.`, {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  const [created] = await db
    .insert(configChangeRequests)
    .values({
      changeType:
        "saas_tenant_risk_envelope_upsert" satisfies ControlChangeRequestType,
      status: "draft",
      targetType: "saas_tenant_risk_envelope",
      targetId: normalizedEnvelope.tenantId,
      changePayload: Object.fromEntries(
        Object.entries(normalizedEnvelope).filter(
          ([, value]) => value !== undefined,
        ),
      ) as Record<string, unknown>,
      reason: normalizedReason,
      requiresSecondConfirmation: true,
      requiresMfa: true,
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
      payload.requestId,
    );

    if (request.status !== "draft") {
      throw conflictError("Only draft requests can be submitted.", {
        code: API_ERROR_CODES.ONLY_DRAFT_REQUESTS_SUBMITTABLE,
      });
    }

    assertConfirmationPhrase({
      request,
      action: "submit",
      confirmationText: payload.confirmationText,
    });

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: "pending_approval",
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
      payload.requestId,
    );

    if (request.status !== "pending_approval") {
      throw conflictError("Only pending requests can be approved.", {
        code: API_ERROR_CODES.ONLY_PENDING_REQUESTS_APPROVABLE,
      });
    }

    if (request.createdByAdminId === payload.adminId) {
      throw conflictError(
        "The requester cannot approve their own config change.",
        {
          code: API_ERROR_CODES.CONFIG_CHANGE_SELF_APPROVAL_FORBIDDEN,
        },
      );
    }

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: "approved",
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
      payload.requestId,
    );

    if (request.status === "published" || request.status === "rejected") {
      throw conflictError("The request is already finalized.", {
        code: API_ERROR_CODES.CONFIG_CHANGE_REQUEST_FINALIZED,
      });
    }

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: "rejected",
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
}): Promise<PublishControlChangeRequestResult> {
  return db.transaction(async (tx) => {
    const request = assertChangeRequestExists(
      await readChangeRequest(tx, payload.requestId),
      payload.requestId,
    );

    if (request.status !== "approved") {
      throw conflictError("Only approved requests can be published.", {
        code: API_ERROR_CODES.ONLY_APPROVED_REQUESTS_PUBLISHABLE,
      });
    }

    assertConfirmationPhrase({
      request,
      action: "publish",
      confirmationText: payload.confirmationText,
    });

    const previousAuditSnapshot = await readChangeRequestAuditSnapshot(
      tx,
      request,
      request.targetId ?? null,
    );
    const appliedTargetId = await applyChangeRequest(
      tx,
      request,
      payload.adminId,
    );
    const nextAuditSnapshot = await readChangeRequestAuditSnapshot(
      tx,
      request,
      appliedTargetId ?? request.targetId ?? null,
    );

    const [updated] = await tx
      .update(configChangeRequests)
      .set({
        status: "published",
        targetId: appliedTargetId ?? request.targetId,
        publishedByAdminId: payload.adminId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(configChangeRequests.id, payload.requestId))
      .returning();

    return {
      changeRequest: mapChangeRequestRecord(updated),
      audit: buildPublishedChangeRequestAudit(
        request,
        previousAuditSnapshot,
        nextAuditSnapshot,
      ),
    };
  });
}
