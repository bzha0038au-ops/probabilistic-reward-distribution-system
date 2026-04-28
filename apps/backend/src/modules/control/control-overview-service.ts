import { desc, inArray } from "@reward/database/orm";

import {
  configChangeRequests,
  paymentProviders,
  saasTenants,
} from "@reward/database";
import { db } from "../../db";
import { toMoneyString } from "../../shared/money";
import { reviewPaymentProviderConfig } from "../payment/provider-config";
import {
  getAuthFailureConfig,
  getBlackjackConfig,
  getBonusReleaseConfig,
  getDrawCost,
  getGamificationRewardConfig,
  getPoolBalance,
  getRandomizationConfig,
  getSaasUsageAlertConfig,
} from "../system/service";
import {
  buildSaasTenantRiskEnvelopeSummary,
  buildLegalDocumentPublishSummary,
  buildConfirmationPhrase,
  buildProviderSummary,
  buildSystemConfigSummary,
  isLegalDocumentPublishPayload,
  isProviderDraftPayload,
  isSaasTenantRiskEnvelopeDraftPayload,
  normalizeReason,
  parseProviderConfig,
  toRecord,
} from "./change-request";
import type {
  ControlCenterOverview,
  ControlChangeRequestRecord,
  ControlChangeRequestStatus,
  ControlChangeRequestType,
  ControlPaymentProviderRecord,
  ControlSystemConfig,
  DbExecutor,
  SystemConfigDraftPayload,
} from "./service";

type ConfigChangeRequestRow = typeof configChangeRequests.$inferSelect;
type SaasTenantSummaryRow = Pick<
  typeof saasTenants.$inferSelect,
  | "id"
  | "name"
  | "slug"
  | "riskEnvelopeDailyBudgetCap"
  | "riskEnvelopeMaxSinglePayout"
  | "riskEnvelopeVarianceCap"
  | "riskEnvelopeEmergencyStop"
>;

const SAAS_RISK_ENVELOPE_KEYS = [
  "dailyBudgetCap",
  "maxSinglePayout",
  "varianceCap",
  "emergencyStop",
] as const;

const toSaasTenantRiskEnvelopeState = (tenant: SaasTenantSummaryRow | null) =>
  tenant
    ? {
        dailyBudgetCap: tenant.riskEnvelopeDailyBudgetCap
          ? toMoneyString(tenant.riskEnvelopeDailyBudgetCap)
          : null,
        maxSinglePayout: tenant.riskEnvelopeMaxSinglePayout
          ? toMoneyString(tenant.riskEnvelopeMaxSinglePayout)
          : null,
        varianceCap: tenant.riskEnvelopeVarianceCap
          ? toMoneyString(tenant.riskEnvelopeVarianceCap)
          : null,
        emergencyStop: Boolean(tenant.riskEnvelopeEmergencyStop),
      }
    : null;

const enrichSaasTenantRiskEnvelopeRequests = async (
  executor: DbExecutor,
  requests: ControlChangeRequestRecord[],
) => {
  const tenantIds = Array.from(
    new Set(
      requests
        .filter(
          (request) =>
            request.changeType === "saas_tenant_risk_envelope_upsert",
        )
        .map((request) => {
          const payload = toRecord(request.changePayload);
          return typeof payload.tenantId === "number"
            ? payload.tenantId
            : request.targetId;
        })
        .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
    ),
  );

  if (tenantIds.length === 0) {
    return requests;
  }

  const tenantRows = await executor
    .select({
      id: saasTenants.id,
      name: saasTenants.name,
      slug: saasTenants.slug,
      riskEnvelopeDailyBudgetCap: saasTenants.riskEnvelopeDailyBudgetCap,
      riskEnvelopeMaxSinglePayout: saasTenants.riskEnvelopeMaxSinglePayout,
      riskEnvelopeVarianceCap: saasTenants.riskEnvelopeVarianceCap,
      riskEnvelopeEmergencyStop: saasTenants.riskEnvelopeEmergencyStop,
    })
    .from(saasTenants)
    .where(inArray(saasTenants.id, tenantIds));
  const tenantById = new Map(tenantRows.map((tenant) => [tenant.id, tenant]));

  return requests.map((request) => {
    if (request.changeType !== "saas_tenant_risk_envelope_upsert") {
      return request;
    }

    const payload = toRecord(request.changePayload);
    if (!isSaasTenantRiskEnvelopeDraftPayload(payload)) {
      return request;
    }

    const tenant = tenantById.get(payload.tenantId) ?? null;
    const currentEnvelope = toSaasTenantRiskEnvelopeState(tenant);
    const changedKeys = SAAS_RISK_ENVELOPE_KEYS.filter((key) =>
      Reflect.has(payload, key),
    );
    const proposedEnvelope = {
      dailyBudgetCap:
        payload.dailyBudgetCap !== undefined
          ? (payload.dailyBudgetCap as string | null)
          : (currentEnvelope?.dailyBudgetCap ?? null),
      maxSinglePayout:
        payload.maxSinglePayout !== undefined
          ? (payload.maxSinglePayout as string | null)
          : (currentEnvelope?.maxSinglePayout ?? null),
      varianceCap:
        payload.varianceCap !== undefined
          ? (payload.varianceCap as string | null)
          : (currentEnvelope?.varianceCap ?? null),
      emergencyStop:
        payload.emergencyStop !== undefined
          ? Boolean(payload.emergencyStop)
          : (currentEnvelope?.emergencyStop ?? false),
    };
    const tenantLabel = tenant
      ? `${tenant.name} (#${tenant.id})`
      : `#${payload.tenantId}`;

    return {
      ...request,
      summary: `SaaS 租户 ${tenantLabel} 风险包络兜底`,
      changePayload: {
        ...payload,
        displayContext: {
          tenant: tenant
            ? {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
              }
            : {
                id: payload.tenantId,
                name: null,
                slug: null,
              },
          currentEnvelope,
          proposedEnvelope,
          changedKeys,
        },
      },
    };
  });
};

export const toSystemConfigResponse = async (
  executor: DbExecutor = db,
): Promise<ControlSystemConfig> => {
  const [
    poolBalance,
    drawCost,
    randomization,
    bonusRelease,
    authFailure,
    gamificationReward,
    blackjackConfig,
    saasUsageAlertConfig,
  ] = await Promise.all([
    getPoolBalance(executor),
    getDrawCost(executor),
    getRandomizationConfig(executor),
    getBonusReleaseConfig(executor),
    getAuthFailureConfig(executor),
    getGamificationRewardConfig(executor),
    getBlackjackConfig(executor),
    getSaasUsageAlertConfig(executor),
  ]);

  return {
    poolBalance: toMoneyString(poolBalance),
    drawCost: toMoneyString(drawCost),
    weightJitterEnabled: randomization.weightJitterEnabled,
    weightJitterPct: toMoneyString(randomization.weightJitterPct),
    bonusAutoReleaseEnabled: bonusRelease.bonusAutoReleaseEnabled,
    bonusUnlockWagerRatio: toMoneyString(bonusRelease.bonusUnlockWagerRatio),
    authFailureWindowMinutes: toMoneyString(
      authFailure.authFailureWindowMinutes,
    ),
    authFailureFreezeThreshold: toMoneyString(
      authFailure.authFailureFreezeThreshold,
    ),
    adminFailureFreezeThreshold: toMoneyString(
      authFailure.adminFailureFreezeThreshold,
    ),
    profileSecurityRewardAmount: toMoneyString(
      gamificationReward.profileSecurityRewardAmount,
    ),
    firstDrawRewardAmount: toMoneyString(
      gamificationReward.firstDrawRewardAmount,
    ),
    drawStreakDailyRewardAmount: toMoneyString(
      gamificationReward.drawStreakDailyRewardAmount,
    ),
    topUpStarterRewardAmount: toMoneyString(
      gamificationReward.topUpStarterRewardAmount,
    ),
    blackjackMinStake: blackjackConfig.minStake,
    blackjackMaxStake: blackjackConfig.maxStake,
    blackjackWinPayoutMultiplier: blackjackConfig.winPayoutMultiplier,
    blackjackPushPayoutMultiplier: blackjackConfig.pushPayoutMultiplier,
    blackjackNaturalPayoutMultiplier: blackjackConfig.naturalPayoutMultiplier,
    blackjackDealerHitsSoft17: blackjackConfig.dealerHitsSoft17,
    blackjackDoubleDownAllowed: blackjackConfig.doubleDownAllowed,
    blackjackSplitAcesAllowed: blackjackConfig.splitAcesAllowed,
    blackjackHitSplitAcesAllowed: blackjackConfig.hitSplitAcesAllowed,
    blackjackResplitAllowed: blackjackConfig.resplitAllowed,
    blackjackMaxSplitHands: blackjackConfig.maxSplitHands,
    blackjackSplitTenValueCardsAllowed:
      blackjackConfig.splitTenValueCardsAllowed,
    saasUsageAlertMaxMinuteQps: toMoneyString(
      saasUsageAlertConfig.maxMinuteQps,
    ),
    saasUsageAlertMaxSinglePayoutAmount: toMoneyString(
      saasUsageAlertConfig.maxSinglePayoutAmount,
    ),
    saasUsageAlertMaxAntiExploitRatePct: toMoneyString(
      saasUsageAlertConfig.maxAntiExploitRatePct,
    ),
  };
};

const listConfigChangeRequestRows = (executor: DbExecutor = db, limit = 30) =>
  executor
    .select()
    .from(configChangeRequests)
    .orderBy(
      desc(configChangeRequests.createdAt),
      desc(configChangeRequests.id),
    )
    .limit(limit);

export const mapChangeRequestRecord = (
  row: ConfigChangeRequestRow,
): ControlChangeRequestRecord => {
  const payload = toRecord(row.changePayload);
  const changeType = row.changeType as ControlChangeRequestType;
  const summary =
    changeType === "payment_provider_upsert" && isProviderDraftPayload(payload)
      ? buildProviderSummary(payload)
      : changeType === "legal_document_publish" &&
          isLegalDocumentPublishPayload(payload)
        ? buildLegalDocumentPublishSummary(payload)
        : changeType === "saas_tenant_risk_envelope_upsert" &&
            isSaasTenantRiskEnvelopeDraftPayload(payload)
          ? buildSaasTenantRiskEnvelopeSummary(payload)
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
        ? buildConfirmationPhrase("submit", row.id)
        : null,
      publish: row.requiresSecondConfirmation
        ? buildConfirmationPhrase("publish", row.id)
        : null,
    },
  };
};

export const toControlPaymentProviderRecord = (row: {
  id: number;
  name: string;
  providerType: string;
  priority: number | null;
  isActive: boolean;
  isCircuitBroken: boolean;
  circuitBrokenAt: Date | null;
  circuitBreakReason: string | null;
  config: unknown;
}): ControlPaymentProviderRecord => {
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
    configViolations: (
      parsed.review as ReturnType<typeof reviewPaymentProviderConfig>
    ).violations,
  };
};

export async function listPaymentProvidersForAdmin(
  executor: DbExecutor = db,
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

  return rows.map((row) => toControlPaymentProviderRecord(row));
}

export async function listControlChangeRequests(
  executor: DbExecutor = db,
  limit = 30,
) {
  const rows = await listConfigChangeRequestRows(executor, limit);
  const requests = rows.map(mapChangeRequestRecord);
  return enrichSaasTenantRiskEnvelopeRequests(executor, requests);
}

export async function getControlCenterOverview(
  executor: DbExecutor = db,
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
