import { randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  admins,
  agentBlocklist,
  agentRiskState,
  saasAgentGroupCorrelations,
  saasApiKeys,
  saasAgents,
  saasBillingAccounts,
  saasDrawRecords,
  saasFairnessSeeds,
  saasLedgerEntries,
  saasPlayers,
  saasProjectPrizes,
  saasProjects,
  saasTenants,
  saasTenantMemberships,
  saasUsageEvents,
  users,
} from "@reward/database";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  sql,
} from "@reward/database/orm";
import type {
  PrizeEngineAgentInput,
  PrizeEngineApiKeyScope,
  PrizeEngineBehaviorInput,
  PrizeEngineDrawRequest,
  PrizeEngineDrawResponse,
  PrizeEngineLegacyRouteMetadata,
  PrizeEngineProjectObservability,
  PrizeEngineOverview,
  PrizeEngineRewardRequest,
  PrizeEngineRewardEnvelopeOutcome,
  PrizeEngineRewardResponse,
  SaaSEnvironment,
} from "@reward/shared-types/saas";

import { db, type DbTransaction } from "../../db";
import { sendSaasOnboardingCompleteNotification } from "../auth/notification-service";
import {
  buildSaasProjectPlayerExperimentSubject,
  resolveExperimentConfig,
} from "../experiments/service";
import {
  badRequestError,
  conflictError,
  forbiddenError,
  notFoundError,
  unauthorizedError,
} from "../../shared/errors";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import {
  buildLegacyDecisionPricing,
  resolveBillingDecisionPricing,
} from "./billing";
import {
  isSaasBillingHardCapActive,
  markSaasBillingHardCapReached,
  readSaasBillingBudgetPolicy,
  resolveBillingBudgetMonthKey,
} from "./billing-budget";
import {
  DEFAULT_FAIRNESS_EPOCH_SECONDS,
  buildPrizePresentations,
  currentEpoch,
  type FairnessSeedRow,
  hashValue,
  type LockedAgentRow,
  type LockedPlayerRow,
  type LockedPrizeRow,
  type LockedProjectRow,
  PRIZE_ENGINE_LEGACY_DRAW_WRITE_SCOPE,
  PRIZE_ENGINE_REWARD_WRITE_SCOPE,
  PRIZE_ENGINE_WRITE_SCOPE_ALIASES,
  type ProjectAgentPolicy,
  type ProjectApiAuth,
  normalizeProjectStrategyParams,
  resolveEpochSeconds,
  resolveProjectRiskStateHalfLifeSeconds,
  resolveProjectSelectionStrategy,
} from "./prize-engine-domain";
import {
  applyPrizeEngineRiskEnvelope,
  buildPrizeEngineEnvelopeTrigger,
  computePositiveVariance,
  hasPrizeEngineConstraintLimit,
  resolvePrizeEngineConstraintConfig,
  resolvePrizeEngineConstraintWindow,
  resolvePrizeEngineGroupId,
} from "./prize-engine-constraints";
import { buildDrawDistributionTelemetry } from "./distribution-monitoring";
import {
  selectReward,
  type PrizeEngineSelectionStats,
} from "./prize-engine-selection";
import { enqueueRewardCompletedWebhookDeliveries } from "./outbound-webhook-service";
import {
  getCachedSaasProjectConfig,
  loadSaasProjectConfigFromDb,
} from "./project-config-cache";
import {
  assertRewardEnvelopeNotRejected,
  consumeRewardEnvelopeStates,
  evaluateRewardEnvelopeDecision,
  loadLockedRewardEnvelopeStates,
} from "./reward-envelope";
import {
  normalizeMetadata,
  normalizeScopes,
  toSaasAgent,
  toPrizeEngineLedgerEntry,
} from "./records";
import type { PrizeEngineAntiExploitTrace } from "./prize-engine-rate-limit";
import { jsonbTextPathSql } from "./metadata-sql";

const DEFAULT_PRIZE_ENGINE_OBSERVABILITY_DAYS = 30;
const MAX_PRIZE_ENGINE_OBSERVABILITY_DAYS = 90;
const REWARD_RISK_SCORE_SCALE = 1_000_000;
const REWARD_RISK_PLUGIN = "reward_risk_score";
const REWARD_RISK_SEVERE_THRESHOLD = 0.8;
const LEGACY_DRAW_ROUTE_METADATA: PrizeEngineLegacyRouteMetadata = {
  route: "/v1/engine/draws",
  mode: "legacy_gacha",
  deprecated: true,
  sunsetAt: "2026-10-28T00:00:00.000Z",
};

type LockedTenantRiskEnvelopeRow = {
  id: number;
  riskEnvelopeDailyBudgetCap: string | null;
  riskEnvelopeMaxSinglePayout: string | null;
  riskEnvelopeVarianceCap: string | null;
  riskEnvelopeEmergencyStop: boolean;
};

type LockedBillingAccountBudgetRow = {
  id: number;
  baseMonthlyFee: string;
  metadata: Record<string, unknown> | null;
};

type LockedProjectStateRow = Pick<
  LockedProjectRow,
  "id" | "tenantId" | "status" | "prizePoolBalance"
>;

type LockedRewardRiskStateRow = {
  id: number;
  hitCount: number;
  severeHitCount: number;
  riskScore: number;
  lastHitAt: Date | string;
  updatedAt: Date | string;
  metadata: Record<string, unknown> | null;
};

const toRewardRiskStateDate = (
  value: Date | string,
  field: "lastHitAt" | "updatedAt",
) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid reward risk state ${field} timestamp.`);
  }

  return parsed;
};

const clampUnitInterval = (value: number | null | undefined) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(1, Math.max(0, parsed));
};

const roundRiskMetric = (value: number) =>
  Number(clampUnitInterval(value).toFixed(6));

const toStoredRiskScore = (value: number) =>
  Math.max(
    0,
    Math.min(
      REWARD_RISK_SCORE_SCALE,
      Math.round(clampUnitInterval(value) * REWARD_RISK_SCORE_SCALE),
    ),
  );

const fromStoredRiskScore = (value: number | null | undefined) =>
  clampUnitInterval(Number(value ?? 0) / REWARD_RISK_SCORE_SCALE);

const decayAccumulatedRisk = (
  accumulatedRisk: number,
  elapsedMs: number,
  halfLifeSeconds: number,
) => {
  if (accumulatedRisk <= 0) {
    return 0;
  }

  if (elapsedMs <= 0) {
    return clampUnitInterval(accumulatedRisk);
  }

  const halfLifeMs = Math.max(1, halfLifeSeconds) * 1000;
  return clampUnitInterval(
    accumulatedRisk * Math.pow(0.5, elapsedMs / halfLifeMs),
  );
};

const accumulateRewardRisk = (existingRisk: number, inputRisk: number) =>
  clampUnitInterval(existingRisk + inputRisk - existingRisk * inputRisk);

const resolveRewardRiskSeverity = (risk: number) => {
  if (risk >= 0.85) {
    return "critical" as const;
  }
  if (risk >= 0.65) {
    return "high" as const;
  }
  if (risk >= 0.35) {
    return "medium" as const;
  }
  return "low" as const;
};

type EffectiveRiskEnvelope = {
  dailyBudgetCap: Decimal | null;
  maxSinglePayout: Decimal | null;
  varianceCap: Decimal | null;
  emergencyStop: boolean;
};

type PrizeEngineConstraintStatsRow = {
  drawCount: number;
  distinctPlayerCount: number;
  rewardAmount: string;
  expectedRewardAmount: string;
  containsCurrentPlayer: boolean;
};

type PrizeEngineConstraintPrizeRow = {
  id: number;
  projectId: number;
  name: string;
  stock: number;
  weight: number;
  rewardAmount: string;
  isActive: boolean;
  deletedAt: Date | null;
  metadata: Record<string, unknown> | null;
};

type PrizeEngineScopeConstraintResult = {
  prizeRows: PrizeEngineConstraintPrizeRow[];
  triggered: Array<ReturnType<typeof buildPrizeEngineEnvelopeTrigger>>;
  mode: "normal" | "mute";
};

type PrizeEnginePlayerUpsertInput = {
  externalPlayerId: string;
  displayName?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PrizeEngineRewardExecutionResult = {
  response: PrizeEngineRewardResponse;
  replayed: boolean;
};

type PrizeEngineRewardExecutionInput = {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  player: PrizeEnginePlayerUpsertInput;
  agent: PrizeEngineAgentInput;
  behavior: PrizeEngineBehaviorInput;
  idempotencyKey: string;
  clientNonce?: string | null;
  enforceIdempotency: boolean;
  riskEnvelope?: PrizeEngineDrawRequest["riskEnvelope"];
  budget?: PrizeEngineRewardRequest["budget"];
  usageEventType: PrizeEngineApiKeyScope;
  usageReferenceType: "draw" | "reward";
  legacy?: PrizeEngineLegacyRouteMetadata;
  antiExploitTrace?: PrizeEngineAntiExploitTrace | null;
};

type PrizeEngineAgentUpsertInput = {
  agentId: string;
  groupId?: string | null;
  ownerMetadata?: Record<string, unknown> | null;
  fingerprint?: string | null;
  status?: "active" | "suspended" | "archived";
};

const loadProjectState = async (
  tx: DbTransaction,
  projectId: number,
  environment: SaaSEnvironment,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      status,
      prize_pool_balance AS "prizePoolBalance"
    FROM ${saasProjects}
    WHERE ${saasProjects.id} = ${projectId}
      AND ${saasProjects.environment} = ${environment}
  `);

  return readSqlRows<LockedProjectStateRow>(result)[0] ?? null;
};

const lockProjectStateForSettlement = async (
  tx: DbTransaction,
  projectId: number,
  environment: SaaSEnvironment,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      status,
      prize_pool_balance AS "prizePoolBalance"
    FROM ${saasProjects}
    WHERE ${saasProjects.id} = ${projectId}
      AND ${saasProjects.environment} = ${environment}
    FOR UPDATE
  `);

  return readSqlRows<LockedProjectStateRow>(result)[0] ?? null;
};

const loadProject = async (
  tx: DbTransaction,
  projectId: number,
  environment: SaaSEnvironment,
) => {
  const [stateRow, cachedConfig] = await Promise.all([
    loadProjectState(tx, projectId, environment),
    getCachedSaasProjectConfig(projectId, environment),
  ]);

  if (!stateRow) {
    return null;
  }

  const configRow =
    cachedConfig ?? (await loadSaasProjectConfigFromDb(tx, projectId, environment));
  if (!configRow) {
    return null;
  }

  return {
    ...stateRow,
    ...configRow,
    metadata: normalizeMetadata(configRow.metadata),
  };
};

const loadLockedPlayer = async (
  tx: DbTransaction,
  projectId: number,
  externalPlayerId: string,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      project_id AS "projectId",
      external_player_id AS "externalPlayerId",
      display_name AS "displayName",
      balance,
      pity_streak AS "pityStreak",
      metadata
    FROM ${saasPlayers}
    WHERE ${saasPlayers.projectId} = ${projectId}
      AND ${saasPlayers.externalPlayerId} = ${externalPlayerId}
    FOR UPDATE
  `);

  const row = readSqlRows<LockedPlayerRow>(result)[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: normalizeMetadata(row.metadata),
  };
};

const loadLockedAgent = async (
  tx: DbTransaction,
  projectId: number,
  agentId: string,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      project_id AS "projectId",
      external_id AS "agentId",
      group_id AS "groupId",
      owner_metadata AS "ownerMetadata",
      fingerprint,
      status,
      created_at AS "createdAt"
    FROM ${saasAgents}
    WHERE ${saasAgents.projectId} = ${projectId}
      AND ${saasAgents.externalId} = ${agentId}
    FOR UPDATE
  `);

  const row = readSqlRows<LockedAgentRow>(result)[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    ownerMetadata: normalizeMetadata(row.ownerMetadata),
  };
};

const loadLockedPrize = async (
  tx: DbTransaction,
  projectId: number,
  prizeId: number,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      project_id AS "projectId",
      name,
      stock,
      weight,
      reward_amount AS "rewardAmount",
      is_active AS "isActive",
      deleted_at AS "deletedAt",
      metadata
    FROM ${saasProjectPrizes}
    WHERE ${saasProjectPrizes.id} = ${prizeId}
      AND ${saasProjectPrizes.projectId} = ${projectId}
    FOR UPDATE
  `);

  const row = readSqlRows<LockedPrizeRow>(result)[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: normalizeMetadata(row.metadata),
  };
};

const loadLockedTenantRiskEnvelope = async (
  tx: DbTransaction,
  tenantId: number,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      risk_envelope_daily_budget_cap AS "riskEnvelopeDailyBudgetCap",
      risk_envelope_max_single_payout AS "riskEnvelopeMaxSinglePayout",
      risk_envelope_variance_cap AS "riskEnvelopeVarianceCap",
      risk_envelope_emergency_stop AS "riskEnvelopeEmergencyStop"
    FROM ${saasTenants}
    WHERE ${saasTenants.id} = ${tenantId}
    FOR UPDATE
  `);

  return readSqlRows<LockedTenantRiskEnvelopeRow>(result)[0] ?? null;
};

const loadLockedBillingAccountBudget = async (
  tx: DbTransaction,
  tenantId: number,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      base_monthly_fee AS "baseMonthlyFee",
      metadata
    FROM ${saasBillingAccounts}
    WHERE ${saasBillingAccounts.tenantId} = ${tenantId}
    FOR UPDATE
  `);

  const row = readSqlRows<LockedBillingAccountBudgetRow>(result)[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: normalizeMetadata(row.metadata),
  };
};

const startOfCurrentUtcDay = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

const startOfCurrentUtcMonth = (value = new Date()) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const normalizeOptionalString = (value: string | null | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const loadTenantDailyRewardPayout = async (
  tx: DbTransaction,
  tenantId: number,
) => {
  const startOfDay = startOfCurrentUtcDay();
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${saasDrawRecords.rewardAmount}), '0')`,
    })
    .from(saasDrawRecords)
    .innerJoin(saasProjects, eq(saasDrawRecords.projectId, saasProjects.id))
    .where(
      and(
        eq(saasProjects.tenantId, tenantId),
        gte(saasDrawRecords.createdAt, startOfDay),
      ),
    );

  return {
    amount: toDecimal(row?.total ?? 0),
    startOfDay,
  };
};

const loadTenantCurrentMonthBillableUsageAmount = async (
  tx: DbTransaction,
  tenantId: number,
  now = new Date(),
) => {
  const monthStart = startOfCurrentUtcMonth(now);
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${saasUsageEvents.amount}), '0')`,
    })
    .from(saasUsageEvents)
    .where(
      and(
        eq(saasUsageEvents.tenantId, tenantId),
        eq(saasUsageEvents.environment, "live"),
        gte(saasUsageEvents.createdAt, monthStart),
        sql`coalesce(${saasUsageEvents.metadata} ->> 'billable', 'true') <> 'false'`,
      ),
    );

  return {
    amount: toDecimal(row?.total ?? 0),
    monthStart,
  };
};

const normalizeRequestedRiskEnvelopeCap = (
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
    throw badRequestError(`${fieldLabel} must be >= 0.`, {
      code: API_ERROR_CODES.INVALID_REQUEST,
    });
  }

  return parsed;
};

const toStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toStableValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, toStableValue(nestedValue)]),
    );
  }

  return value;
};

const stableJsonHash = (value: unknown) =>
  hashValue(JSON.stringify(toStableValue(value)));

const resolveEffectiveRiskEnvelope = (
  tenantEnvelope: LockedTenantRiskEnvelopeRow,
  requestedEnvelope?: PrizeEngineDrawRequest["riskEnvelope"],
): EffectiveRiskEnvelope => {
  const tenantDailyBudgetCap = tenantEnvelope.riskEnvelopeDailyBudgetCap
    ? toDecimal(tenantEnvelope.riskEnvelopeDailyBudgetCap)
    : null;
  const tenantMaxSinglePayout = tenantEnvelope.riskEnvelopeMaxSinglePayout
    ? toDecimal(tenantEnvelope.riskEnvelopeMaxSinglePayout)
    : null;
  const tenantVarianceCap = tenantEnvelope.riskEnvelopeVarianceCap
    ? toDecimal(tenantEnvelope.riskEnvelopeVarianceCap)
    : null;

  const requestedDailyBudgetCap = normalizeRequestedRiskEnvelopeCap(
    requestedEnvelope?.dailyBudgetCap,
    "Risk envelope dailyBudgetCap",
  );
  const requestedMaxSinglePayout = normalizeRequestedRiskEnvelopeCap(
    requestedEnvelope?.maxSinglePayout,
    "Risk envelope maxSinglePayout",
  );
  const requestedVarianceCap = normalizeRequestedRiskEnvelopeCap(
    requestedEnvelope?.varianceCap,
    "Risk envelope varianceCap",
  );

  const resolveCap = (
    tenantCap: Decimal | null,
    requestedCap: Decimal | null | undefined,
  ) => {
    if (tenantCap === null) {
      return requestedCap === undefined ? null : requestedCap;
    }

    if (requestedCap === undefined || requestedCap === null) {
      return tenantCap;
    }

    return Decimal.min(tenantCap, requestedCap);
  };

  return {
    dailyBudgetCap: resolveCap(tenantDailyBudgetCap, requestedDailyBudgetCap),
    maxSinglePayout: resolveCap(
      tenantMaxSinglePayout,
      requestedMaxSinglePayout,
    ),
    varianceCap: resolveCap(tenantVarianceCap, requestedVarianceCap),
    emergencyStop: Boolean(tenantEnvelope.riskEnvelopeEmergencyStop),
  };
};

const lockPrizeEngineScope = async (
  tx: DbTransaction,
  projectId: number,
  scopeKey: string,
) => {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${projectId}, hashtext(${scopeKey}))`,
  );
};

const emptyConstraintStats = () => ({
  drawCount: 0,
  distinctPlayerCount: 0,
  rewardAmount: new Decimal(0),
  expectedRewardAmount: new Decimal(0),
  positiveVariance: new Decimal(0),
  containsCurrentPlayer: false,
});

const toConstraintStats = (row?: PrizeEngineConstraintStatsRow | null) => {
  const rewardAmount = toDecimal(row?.rewardAmount ?? 0);
  const expectedRewardAmount = toDecimal(row?.expectedRewardAmount ?? 0);

  return {
    drawCount: Number(row?.drawCount ?? 0),
    distinctPlayerCount: Number(row?.distinctPlayerCount ?? 0),
    rewardAmount,
    expectedRewardAmount,
    positiveVariance: computePositiveVariance(
      rewardAmount,
      expectedRewardAmount,
    ),
    containsCurrentPlayer: Boolean(row?.containsCurrentPlayer),
  };
};

const loadGroupConstraintStats = async (params: {
  tx: DbTransaction;
  projectId: number;
  environment: SaaSEnvironment;
  groupId: string;
  currentPlayerId: number;
  windowSeconds: number;
}) => {
  const {
    tx,
    projectId,
    environment,
    groupId,
    currentPlayerId,
    windowSeconds,
  } = params;
  const result = await tx.execute(sql`
    SELECT
      count(*)::int AS "drawCount",
      count(DISTINCT ${saasDrawRecords.playerId})::int AS "distinctPlayerCount",
      coalesce(sum(${saasDrawRecords.rewardAmount}), 0)::text AS "rewardAmount",
      coalesce(sum(${saasDrawRecords.expectedRewardAmount}), 0)::text AS "expectedRewardAmount",
      coalesce(bool_or(${saasDrawRecords.playerId} = ${currentPlayerId}), false) AS "containsCurrentPlayer"
    FROM ${saasDrawRecords}
    WHERE ${saasDrawRecords.projectId} = ${projectId}
      AND ${saasDrawRecords.environment} = ${environment}
      AND ${saasDrawRecords.groupId} = ${groupId}
      AND ${saasDrawRecords.createdAt} >= now() - make_interval(secs => ${windowSeconds})
  `);

  return toConstraintStats(
    readSqlRows<PrizeEngineConstraintStatsRow>(result)[0],
  );
};

const loadAgentConstraintStats = async (params: {
  tx: DbTransaction;
  projectId: number;
  environment: SaaSEnvironment;
  agentId: string;
  windowSeconds: number;
}) => {
  const { tx, projectId, environment, agentId, windowSeconds } = params;
  const result = await tx.execute(sql`
    SELECT
      count(*)::int AS "drawCount",
      count(DISTINCT ${saasDrawRecords.playerId})::int AS "distinctPlayerCount",
      coalesce(sum(${saasDrawRecords.rewardAmount}), 0)::text AS "rewardAmount",
      coalesce(sum(${saasDrawRecords.expectedRewardAmount}), 0)::text AS "expectedRewardAmount",
      true AS "containsCurrentPlayer"
    FROM ${saasDrawRecords}
    WHERE ${saasDrawRecords.projectId} = ${projectId}
      AND ${saasDrawRecords.environment} = ${environment}
      AND ${saasDrawRecords.agentId} = ${agentId}
      AND ${saasDrawRecords.createdAt} >= now() - make_interval(secs => ${windowSeconds})
  `);

  return toConstraintStats(
    readSqlRows<PrizeEngineConstraintStatsRow>(result)[0],
  );
};

const computeExpectedRewardAmount = (params: {
  prizeRows: PrizeEngineConstraintPrizeRow[];
  missWeight: number;
  rewardMultiplier: number;
}) => {
  const { prizeRows, missWeight, rewardMultiplier } = params;
  let totalWeight = Math.max(missWeight, 0);
  let weightedReward = new Decimal(0);

  for (const row of prizeRows) {
    const weight = Math.max(Number(row.weight ?? 0), 0);
    if (weight <= 0 || Number(row.stock ?? 0) <= 0) {
      continue;
    }

    totalWeight += weight;
    weightedReward = weightedReward.plus(
      scaleRewardAmount(row.rewardAmount, rewardMultiplier).mul(weight),
    );
  }

  if (totalWeight <= 0) {
    return new Decimal(0);
  }

  return weightedReward.div(totalWeight);
};

const applyScopeConstraintEnvelope = (params: {
  scope: "group" | "agent";
  prizeRows: PrizeEngineConstraintPrizeRow[];
  stats: ReturnType<typeof emptyConstraintStats>;
  windowSeconds: number;
  missWeight: number;
  rewardMultiplier: number;
  maxDrawCount: number | null;
  maxRewardBudget: Decimal | null;
  maxPositiveVariance: Decimal | null;
}): PrizeEngineScopeConstraintResult => {
  const {
    scope,
    prizeRows,
    stats,
    windowSeconds,
    missWeight,
    rewardMultiplier,
    maxDrawCount,
    maxRewardBudget,
    maxPositiveVariance,
  } = params;

  if (
    maxDrawCount === null &&
    maxRewardBudget === null &&
    maxPositiveVariance === null
  ) {
    return {
      prizeRows,
      triggered: [] as Array<
        ReturnType<typeof buildPrizeEngineEnvelopeTrigger>
      >,
      mode: "normal" as const,
    };
  }

  if (maxDrawCount !== null && stats.drawCount + 1 > maxDrawCount) {
    return {
      prizeRows: [] as PrizeEngineConstraintPrizeRow[],
      triggered: [
        buildPrizeEngineEnvelopeTrigger({
          scope,
          windowSeconds,
          reason: "anti_exploit",
        }),
      ],
      mode: "mute" as const,
    };
  }

  const expectedRewardAmount = computeExpectedRewardAmount({
    prizeRows,
    missWeight,
    rewardMultiplier,
  });

  let budgetTriggered = false;
  let varianceTriggered = false;

  const filteredPrizeRows = prizeRows.filter((row) => {
    const scaledRewardAmount = scaleRewardAmount(
      row.rewardAmount,
      rewardMultiplier,
    );

    if (
      maxRewardBudget !== null &&
      stats.rewardAmount.plus(scaledRewardAmount).gt(maxRewardBudget)
    ) {
      budgetTriggered = true;
      return false;
    }

    if (
      maxPositiveVariance !== null &&
      computePositiveVariance(
        stats.rewardAmount.plus(scaledRewardAmount),
        stats.expectedRewardAmount.plus(expectedRewardAmount),
      ).gt(maxPositiveVariance)
    ) {
      varianceTriggered = true;
      return false;
    }

    return true;
  });

  const triggered: Array<ReturnType<typeof buildPrizeEngineEnvelopeTrigger>> =
    [];
  if (budgetTriggered) {
    triggered.push(
      buildPrizeEngineEnvelopeTrigger({
        scope,
        windowSeconds,
        reason: "budget_cap",
      }),
    );
  }
  if (varianceTriggered) {
    triggered.push(
      buildPrizeEngineEnvelopeTrigger({
        scope,
        windowSeconds,
        reason: "variance_cap",
      }),
    );
  }

  return {
    prizeRows: filteredPrizeRows,
    triggered,
    mode:
      triggered.length > 0 && filteredPrizeRows.length === 0
        ? "mute"
        : "normal",
  };
};

const ensureProjectAgent = async (
  tx: DbTransaction,
  projectId: number,
  payload: PrizeEngineAgentUpsertInput,
) => {
  let agent = await loadLockedAgent(tx, projectId, payload.agentId);
  const legacyPlayer = await loadLockedPlayer(tx, projectId, payload.agentId);
  const nextGroupId = normalizeOptionalString(payload.groupId);
  const nextFingerprint = normalizeOptionalString(payload.fingerprint);
  const nextOwnerMetadata =
    payload.ownerMetadata === undefined
      ? undefined
      : normalizeMetadata(payload.ownerMetadata);

  if (!agent) {
    await tx
      .insert(saasAgents)
      .values({
        projectId,
        externalId: payload.agentId,
        groupId: nextGroupId ?? null,
        ownerMetadata: nextOwnerMetadata ?? legacyPlayer?.metadata ?? null,
        fingerprint: nextFingerprint ?? null,
        status: payload.status ?? "active",
      })
      .onConflictDoNothing();
    agent = await loadLockedAgent(tx, projectId, payload.agentId);
  } else {
    const updatePatch: Partial<typeof saasAgents.$inferInsert> = {};

    if (payload.groupId !== undefined) {
      updatePatch.groupId = nextGroupId ?? null;
    }

    if (payload.fingerprint !== undefined) {
      updatePatch.fingerprint = nextFingerprint ?? null;
    }

    if (payload.ownerMetadata !== undefined) {
      updatePatch.ownerMetadata = nextOwnerMetadata;
    } else if (agent.ownerMetadata === null && legacyPlayer?.metadata) {
      updatePatch.ownerMetadata = legacyPlayer.metadata;
    }

    if (payload.status !== undefined && payload.status !== agent.status) {
      updatePatch.status = payload.status;
    }

    if (Object.keys(updatePatch).length > 0) {
      const [updated] = await tx
        .update(saasAgents)
        .set(updatePatch)
        .where(
          and(eq(saasAgents.id, agent.id), eq(saasAgents.projectId, projectId)),
        )
        .returning();

      if (updated) {
        agent = {
          id: updated.id,
          projectId: updated.projectId,
          agentId: updated.externalId,
          groupId: updated.groupId,
          ownerMetadata: normalizeMetadata(updated.ownerMetadata),
          fingerprint: updated.fingerprint,
          status: updated.status,
          createdAt: updated.createdAt,
        };
      }
    }
  }

  if (!agent) {
    throw conflictError("Failed to initialize project agent.");
  }

  return agent;
};

const ensureProjectPlayer = async (
  tx: DbTransaction,
  projectId: number,
  payload: PrizeEnginePlayerUpsertInput,
) => {
  let player = await loadLockedPlayer(tx, projectId, payload.externalPlayerId);
  const nextMetadata = normalizeMetadata(payload.metadata);

  if (!player) {
    await tx
      .insert(saasPlayers)
      .values({
        projectId,
        externalPlayerId: payload.externalPlayerId,
        displayName: payload.displayName ?? null,
        balance: "0",
        pityStreak: 0,
        metadata: nextMetadata,
      })
      .onConflictDoNothing();
    player = await loadLockedPlayer(tx, projectId, payload.externalPlayerId);
  } else if (
    payload.displayName !== undefined ||
    payload.metadata !== undefined
  ) {
    const [updated] = await tx
      .update(saasPlayers)
      .set({
        ...(payload.displayName !== undefined
          ? { displayName: payload.displayName ?? null }
          : {}),
        ...(payload.metadata !== undefined ? { metadata: nextMetadata } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasPlayers.id, player.id),
          eq(saasPlayers.projectId, projectId),
        ),
      )
      .returning();

    player = {
      ...player,
      displayName: updated?.displayName ?? player.displayName,
      metadata:
        normalizeMetadata(updated?.metadata) ??
        (payload.metadata !== undefined ? nextMetadata : player.metadata),
    };
  }

  if (!player) {
    throw conflictError("Failed to initialize project player.", {
      code: API_ERROR_CODES.FAILED_TO_INITIALIZE_PROJECT_PLAYER,
    });
  }

  return player;
};

const loadLockedRewardRiskState = async (
  tx: DbTransaction,
  projectId: number,
  identityValueHash: string,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      hit_count AS "hitCount",
      severe_hit_count AS "severeHitCount",
      risk_score AS "riskScore",
      last_hit_at AS "lastHitAt",
      updated_at AS "updatedAt",
      metadata
    FROM ${agentRiskState}
    WHERE ${agentRiskState.projectId} = ${projectId}
      AND ${agentRiskState.identityType} = 'agent_id'
      AND ${agentRiskState.identityValueHash} = ${identityValueHash}
    FOR UPDATE
  `);

  return readSqlRows<LockedRewardRiskStateRow>(result)[0] ?? null;
};

const resolveRewardRiskState = async (
  tx: DbTransaction,
  params: {
    auth: ProjectApiAuth;
    trackedAgent: LockedAgentRow;
    player: LockedPlayerRow;
    strategyParams: ReturnType<typeof normalizeProjectStrategyParams>;
    requestedRisk: number;
  },
) => {
  const inputRisk = clampUnitInterval(params.requestedRisk);
  const riskStateHalfLifeSeconds = resolveProjectRiskStateHalfLifeSeconds(
    params.strategyParams,
  );
  const identityValueHash = hashValue(params.trackedAgent.agentId);
  const existingState = await loadLockedRewardRiskState(
    tx,
    params.auth.projectId,
    identityValueHash,
  );
  const normalizedExistingState = existingState
    ? {
        ...existingState,
        lastHitAt: toRewardRiskStateDate(existingState.lastHitAt, "lastHitAt"),
        updatedAt: toRewardRiskStateDate(existingState.updatedAt, "updatedAt"),
      }
    : null;
  const previousAccumulatedRisk = normalizedExistingState
    ? fromStoredRiskScore(normalizedExistingState.riskScore)
    : 0;
  const now = new Date();
  const decayedAccumulatedRisk = normalizedExistingState
    ? decayAccumulatedRisk(
        previousAccumulatedRisk,
        now.getTime() - normalizedExistingState.updatedAt.getTime(),
        riskStateHalfLifeSeconds,
      )
    : 0;
  const effectiveRisk = accumulateRewardRisk(decayedAccumulatedRisk, inputRisk);

  if (normalizedExistingState || inputRisk > 0 || effectiveRisk > 0) {
    const nextMetadata = {
      ...(normalizeMetadata(normalizedExistingState?.metadata) ?? {}),
      rewardRisk: {
        inputRisk: roundRiskMetric(inputRisk),
        previousAccumulatedRisk: roundRiskMetric(previousAccumulatedRisk),
        decayedAccumulatedRisk: roundRiskMetric(decayedAccumulatedRisk),
        effectiveRisk: roundRiskMetric(effectiveRisk),
        riskStateHalfLifeSeconds,
        updatedAt: now.toISOString(),
      },
    };

    if (normalizedExistingState) {
      await tx
        .update(agentRiskState)
        .set({
          apiKeyId: params.auth.apiKeyId,
          agentId: params.trackedAgent.agentId,
          playerExternalId: params.player.externalPlayerId,
          identityHint: params.trackedAgent.agentId.slice(0, 160),
          riskScore: toStoredRiskScore(effectiveRisk),
          hitCount:
            normalizedExistingState.hitCount + (inputRisk > 0 ? 1 : 0),
          severeHitCount:
            normalizedExistingState.severeHitCount +
            (inputRisk >= REWARD_RISK_SEVERE_THRESHOLD ? 1 : 0),
          lastSeverity: resolveRewardRiskSeverity(
            Math.max(inputRisk, effectiveRisk),
          ),
          lastPlugin: REWARD_RISK_PLUGIN,
          lastReason:
            inputRisk > 0 ? "reward_risk_signal" : "reward_risk_decay_refresh",
          metadata: nextMetadata,
          lastHitAt: inputRisk > 0 ? now : normalizedExistingState.lastHitAt,
          updatedAt: now,
        })
        .where(eq(agentRiskState.id, normalizedExistingState.id));
    } else {
      await tx.insert(agentRiskState).values({
        tenantId: params.auth.tenantId,
        projectId: params.auth.projectId,
        apiKeyId: params.auth.apiKeyId,
        agentId: params.trackedAgent.agentId,
        playerExternalId: params.player.externalPlayerId,
        identityType: "agent_id",
        identityValueHash,
        identityHint: params.trackedAgent.agentId.slice(0, 160),
        riskScore: toStoredRiskScore(effectiveRisk),
        hitCount: inputRisk > 0 ? 1 : 0,
        severeHitCount: inputRisk >= REWARD_RISK_SEVERE_THRESHOLD ? 1 : 0,
        lastSeverity: resolveRewardRiskSeverity(
          Math.max(inputRisk, effectiveRisk),
        ),
        lastPlugin: REWARD_RISK_PLUGIN,
        lastReason:
          inputRisk > 0 ? "reward_risk_signal" : "reward_risk_decay_refresh",
        metadata: nextMetadata,
        firstHitAt: now,
        lastHitAt: now,
      });
    }
  }

  return {
    inputRisk: roundRiskMetric(inputRisk),
    previousAccumulatedRisk: roundRiskMetric(previousAccumulatedRisk),
    decayedAccumulatedRisk: roundRiskMetric(decayedAccumulatedRisk),
    effectiveRisk: roundRiskMetric(effectiveRisk),
    riskStateHalfLifeSeconds,
  };
};

const ensureProjectFairnessSeed = async (
  tx: DbTransaction,
  projectId: number,
  environment: SaaSEnvironment,
  epochSeconds: number,
) => {
  const seconds = resolveEpochSeconds(epochSeconds);
  const epoch = currentEpoch(seconds);

  const [existing] = await tx
    .select()
    .from(saasFairnessSeeds)
    .where(
      and(
        eq(saasFairnessSeeds.projectId, projectId),
        eq(saasFairnessSeeds.environment, environment),
        eq(saasFairnessSeeds.epoch, epoch),
        eq(saasFairnessSeeds.epochSeconds, seconds),
      ),
    )
    .limit(1);

  if (existing?.seed && existing.commitHash) {
    return {
      epoch,
      epochSeconds: seconds,
      commitHash: existing.commitHash,
      seed: existing.seed,
    };
  }

  const seed = randomBytes(32).toString("hex");
  const commitHash = hashValue(seed);

  await tx
    .insert(saasFairnessSeeds)
    .values({
      projectId,
      environment,
      epoch,
      epochSeconds: seconds,
      commitHash,
      seed,
    })
    .onConflictDoNothing();

  const [created] = await tx
    .select()
    .from(saasFairnessSeeds)
    .where(
      and(
        eq(saasFairnessSeeds.projectId, projectId),
        eq(saasFairnessSeeds.environment, environment),
        eq(saasFairnessSeeds.epoch, epoch),
        eq(saasFairnessSeeds.epochSeconds, seconds),
      ),
    )
    .limit(1);

  if (!created?.seed) {
    throw conflictError("Failed to create fairness seed.", {
      code: API_ERROR_CODES.FAILED_TO_CREATE_FAIRNESS_SEED,
    });
  }

  return {
    epoch,
    epochSeconds: seconds,
    commitHash: created.commitHash,
    seed: created.seed,
  };
};

const loadProjectPrizeRows = async (projectId: number) =>
  db
    .select({
      id: saasProjectPrizes.id,
      name: saasProjectPrizes.name,
      stock: saasProjectPrizes.stock,
      weight: saasProjectPrizes.weight,
      rewardAmount: saasProjectPrizes.rewardAmount,
    })
    .from(saasProjectPrizes)
    .where(
      and(
        eq(saasProjectPrizes.projectId, projectId),
        eq(saasProjectPrizes.isActive, true),
        isNull(saasProjectPrizes.deletedAt),
      ),
    )
    .orderBy(desc(saasProjectPrizes.rewardAmount), saasProjectPrizes.id);

const loadProjectSelectionStats = async (
  tx: DbTransaction,
  projectId: number,
  environment: SaaSEnvironment,
) => {
  const rows = await tx
    .select({
      prizeId: saasDrawRecords.prizeId,
      pulls: sql<number>`count(*)`,
      totalRewardAmount: sql<string>`coalesce(sum(${saasDrawRecords.rewardAmount}), 0)::text`,
    })
    .from(saasDrawRecords)
    .where(
      and(
        eq(saasDrawRecords.projectId, projectId),
        eq(saasDrawRecords.environment, environment),
      ),
    )
    .groupBy(saasDrawRecords.prizeId);

  return new Map<number, PrizeEngineSelectionStats>(
    rows
      .filter(
        (
          row,
        ): row is {
          prizeId: number;
          pulls: number;
          totalRewardAmount: string;
        } => typeof row.prizeId === "number",
      )
      .map((row) => [
        row.prizeId,
        {
          pulls: Number(row.pulls ?? 0),
          totalRewardAmount: row.totalRewardAmount ?? "0",
        },
      ]),
  );
};

export const recordPrizeEngineUsageEvent = async (
  payload: {
    tenantId: number;
    projectId: number;
    apiKeyId: number;
    playerId?: number | null;
    environment: SaaSEnvironment;
    eventType: PrizeEngineApiKeyScope;
    decisionType?: "reject" | "mute" | "payout" | null;
    referenceType?: string | null;
    referenceId?: number | null;
    units?: number;
    amount?: string;
    currency?: string;
    metadata?: Record<string, unknown> | null;
  },
  dbExecutor: Pick<typeof db, "insert"> | DbTransaction = db,
) => {
  await dbExecutor.insert(saasUsageEvents).values({
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    apiKeyId: payload.apiKeyId,
    playerId: payload.playerId ?? null,
    environment: payload.environment,
    eventType: payload.eventType,
    decisionType: payload.decisionType ?? null,
    referenceType: payload.referenceType ?? null,
    referenceId: payload.referenceId ?? null,
    units: payload.units ?? 1,
    amount: payload.amount ?? "0",
    currency: payload.currency ?? "USD",
    metadata: payload.metadata ?? null,
  });
};

const buildAgentUsageMetadata = (
  auth: ProjectApiAuth,
  metadata: Record<string, unknown>,
) => ({
  billable: auth.environment === "live",
  billingMode: auth.environment === "live" ? "live" : "sandbox",
  ...metadata,
  agentId: auth.agentId,
  agentMode: auth.agentPolicy?.mode ?? null,
  agentBudgetMultiplier: auth.agentPolicy?.budgetMultiplier ?? null,
});

const markTenantOnboardedAfterSuccess = async (params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  activityType: "reward" | "draw";
  subjectId?: string | null;
}) => {
  try {
    await db.transaction(async (tx) => {
      const completedAt = new Date();
      const [tenant] = await tx
        .update(saasTenants)
        .set({
          onboardedAt: completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(saasTenants.id, params.auth.tenantId),
            isNull(saasTenants.onboardedAt),
          ),
        )
        .returning({
          id: saasTenants.id,
          name: saasTenants.name,
          billingEmail: saasTenants.billingEmail,
        });

      if (!tenant) {
        return;
      }

      let recipient = tenant.billingEmail?.trim() || null;
      if (!recipient) {
        const [owner] = await tx
          .select({
            email: users.email,
          })
          .from(saasTenantMemberships)
          .innerJoin(admins, eq(saasTenantMemberships.adminId, admins.id))
          .innerJoin(users, eq(admins.userId, users.id))
          .where(
            and(
              eq(saasTenantMemberships.tenantId, params.auth.tenantId),
              eq(saasTenantMemberships.role, "tenant_owner"),
            ),
          )
          .limit(1);

        recipient = owner?.email?.trim() || null;
      }

      if (!recipient) {
        return;
      }

      await sendSaasOnboardingCompleteNotification(
        {
          email: recipient,
          tenantName: tenant.name,
          projectName: params.auth.projectName,
          environment: params.environment,
          activityType: params.activityType,
          subjectId: params.subjectId ?? null,
          completedAt,
        },
        tx,
      );
    });
  } catch (error) {
    logger.warning("failed to finalize saas tenant onboarding", {
      tenantId: params.auth.tenantId,
      projectId: params.auth.projectId,
      environment: params.environment,
      err: error,
    });
  }
};

const resolveAgentRewardMultiplier = (auth: ProjectApiAuth) =>
  auth.agentPolicy?.mode === "throttled"
    ? (auth.agentPolicy.budgetMultiplier ?? 1)
    : 1;

const scaleRewardAmount = (value: Decimal.Value, multiplier: number) => {
  const base = toDecimal(value);
  if (multiplier >= 1 || base.lte(0)) {
    return base;
  }

  const scaled = base.mul(multiplier).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return scaled.gt(0) ? scaled : new Decimal(0.01);
};

const assertProjectScope = (
  auth: ProjectApiAuth,
  scope: PrizeEngineApiKeyScope,
) => {
  const allowedScopes =
    scope === "draw:write" || scope === "reward:write"
      ? PRIZE_ENGINE_WRITE_SCOPE_ALIASES
      : [scope];

  if (
    allowedScopes.some((allowedScope) => auth.scopes.includes(allowedScope))
  ) {
    return;
  }

  throw forbiddenError("API key scope does not allow this operation.", {
    code: API_ERROR_CODES.API_KEY_SCOPE_FORBIDDEN,
  });
};

const assertProjectEnvironment = (
  auth: ProjectApiAuth,
  environment: SaaSEnvironment,
) => {
  if (auth.environment === environment) {
    return;
  }

  throw badRequestError("Requested environment does not match API key.", {
    code: API_ERROR_CODES.PRIZE_ENGINE_ENVIRONMENT_MISMATCH,
  });
};

const asProjectFairnessCommit = (seed: FairnessSeedRow) => ({
  epoch: seed.epoch,
  epochSeconds: seed.epochSeconds,
  commitHash: seed.commitHash,
});

const readRecordMetadata = (value: unknown) => normalizeMetadata(value);

const buildRewardRequestFingerprint = (input: {
  agent: PrizeEngineAgentInput;
  behavior: PrizeEngineBehaviorInput;
  clientNonce?: string | null;
  riskEnvelope?: PrizeEngineDrawRequest["riskEnvelope"];
  budget?: PrizeEngineRewardRequest["budget"];
  usageReferenceType: "draw" | "reward";
}) =>
  stableJsonHash({
    agent: input.agent,
    behavior: input.behavior,
    clientNonce: input.clientNonce ?? null,
    riskEnvelope: input.riskEnvelope ?? null,
    budget: input.budget ?? null,
    usageReferenceType: input.usageReferenceType,
  });

const readRewardRequestMetadata = (metadata: unknown) => {
  const record = readRecordMetadata(metadata);
  const rewardRequest = record?.rewardRequest;
  return readRecordMetadata(rewardRequest);
};

const readRewardResponseSnapshot = (metadata: unknown) => {
  const record = readRecordMetadata(metadata);
  const snapshot = record?.responseSnapshot;
  return readRecordMetadata(snapshot) as PrizeEngineRewardResponse | null;
};

const loadIdempotentRewardReplay = async (params: {
  tx: DbTransaction;
  projectId: number;
  playerId: number;
  environment: SaaSEnvironment;
  idempotencyKey: string;
  requestFingerprint: string;
}) => {
  const [existingRecord] = await params.tx
    .select()
    .from(saasDrawRecords)
    .where(
      and(
        eq(saasDrawRecords.projectId, params.projectId),
        eq(saasDrawRecords.playerId, params.playerId),
        eq(saasDrawRecords.environment, params.environment),
        sql`${jsonbTextPathSql(
          saasDrawRecords.metadata,
          "rewardRequest",
          "idempotencyKey",
        )} = ${params.idempotencyKey}`,
      ),
    )
    .orderBy(desc(saasDrawRecords.id))
    .limit(1);

  if (!existingRecord) {
    return null;
  }

  const rewardRequest = readRewardRequestMetadata(existingRecord.metadata);
  if (rewardRequest?.requestFingerprint !== params.requestFingerprint) {
    throw conflictError(
      "Idempotency key was reused with a different request.",
      {
        code: API_ERROR_CODES.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST,
      },
    );
  }

  const responseSnapshot = readRewardResponseSnapshot(existingRecord.metadata);
  if (!responseSnapshot) {
    throw conflictError("Stored idempotent reward snapshot is unavailable.", {
      code: API_ERROR_CODES.INVALID_REQUEST,
    });
  }

  return {
    response: {
      ...responseSnapshot,
      replayed: true,
    } satisfies PrizeEngineRewardResponse,
    replayed: true,
  } satisfies PrizeEngineRewardExecutionResult;
};

const normalizeObservabilityDays = (value?: number | null) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_PRIZE_ENGINE_OBSERVABILITY_DAYS;
  }

  const days = Math.trunc(value ?? DEFAULT_PRIZE_ENGINE_OBSERVABILITY_DAYS);
  return Math.min(Math.max(days, 1), MAX_PRIZE_ENGINE_OBSERVABILITY_DAYS);
};

const toRate = (value: Decimal.Value) =>
  Number(toDecimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString());

type ProjectObservabilityDrawRow = {
  projectId: number;
  prizeId: number | null;
  status: string;
  drawCount: number;
  rewardAmountTotal: string;
  drawCostTotal: string;
};

type ProjectObservabilityPrizeRow = {
  id: number;
  projectId: number;
  name: string;
  stock: number | null;
  weight: number | null;
  rewardAmount: string;
  isActive: boolean | null;
  deletedAt: Date | null;
};

const buildPrizeEngineObservabilityDistributions = async (
  projectIds: number[],
  options?: { days?: number | null },
): Promise<PrizeEngineProjectObservability[]> => {
  if (projectIds.length === 0) {
    return [];
  }

  const days = normalizeObservabilityDays(options?.days);
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - days * 24 * 60 * 60 * 1000);

  const [projects, prizeRows, drawRows, playerRows] = await Promise.all([
    db
      .select()
      .from(saasProjects)
      .where(inArray(saasProjects.id, projectIds))
      .orderBy(saasProjects.id),
    db
      .select({
        id: saasProjectPrizes.id,
        projectId: saasProjectPrizes.projectId,
        name: saasProjectPrizes.name,
        stock: saasProjectPrizes.stock,
        weight: saasProjectPrizes.weight,
        rewardAmount: sql<string>`${saasProjectPrizes.rewardAmount}::text`,
        isActive: saasProjectPrizes.isActive,
        deletedAt: saasProjectPrizes.deletedAt,
      })
      .from(saasProjectPrizes)
      .where(inArray(saasProjectPrizes.projectId, projectIds)),
    db
      .select({
        projectId: saasDrawRecords.projectId,
        prizeId: saasDrawRecords.prizeId,
        status: saasDrawRecords.status,
        drawCount: sql<number>`count(*)`,
        rewardAmountTotal: sql<string>`coalesce(sum(${saasDrawRecords.rewardAmount}), 0)::text`,
        drawCostTotal: sql<string>`coalesce(sum(${saasDrawRecords.drawCost}), 0)::text`,
      })
      .from(saasDrawRecords)
      .where(
        and(
          inArray(saasDrawRecords.projectId, projectIds),
          gte(saasDrawRecords.createdAt, startedAt),
        ),
      )
      .groupBy(
        saasDrawRecords.projectId,
        saasDrawRecords.prizeId,
        saasDrawRecords.status,
      ),
    db
      .select({
        projectId: saasDrawRecords.projectId,
        uniquePlayerCount: sql<number>`count(distinct ${saasDrawRecords.playerId})`,
      })
      .from(saasDrawRecords)
      .where(
        and(
          inArray(saasDrawRecords.projectId, projectIds),
          gte(saasDrawRecords.createdAt, startedAt),
        ),
      )
      .groupBy(saasDrawRecords.projectId),
  ]);

  const prizeRowsByProject = new Map<number, ProjectObservabilityPrizeRow[]>();
  const prizeRowsById = new Map<number, ProjectObservabilityPrizeRow>();
  for (const row of prizeRows) {
    prizeRowsById.set(row.id, row);
    const projectPrizeRows = prizeRowsByProject.get(row.projectId) ?? [];
    projectPrizeRows.push(row);
    prizeRowsByProject.set(row.projectId, projectPrizeRows);
  }

  const drawRowsByProject = new Map<number, ProjectObservabilityDrawRow[]>();
  for (const row of drawRows) {
    const projectDrawRows = drawRowsByProject.get(row.projectId) ?? [];
    projectDrawRows.push(row);
    drawRowsByProject.set(row.projectId, projectDrawRows);
  }

  const playerCountByProject = new Map(
    playerRows.map((row) => [row.projectId, Number(row.uniquePlayerCount)]),
  );

  return projects.map((project) => {
    const activePrizeRows = (prizeRowsByProject.get(project.id) ?? []).filter(
      (row) =>
        Boolean(row.isActive) &&
        row.deletedAt === null &&
        Number(row.stock ?? 0) > 0 &&
        Number(row.weight ?? 0) > 0,
    );
    const currentDrawCost = toDecimal(project.drawCost);
    const currentMissWeight = Math.max(Number(project.missWeight ?? 0), 0);
    const configuredTotalWeight =
      activePrizeRows.reduce((sum, row) => sum + Number(row.weight ?? 0), 0) +
      currentMissWeight;

    const expectedDistribution = new Map<
      string,
      {
        bucketKey: string;
        kind: "prize" | "miss";
        prizeId: number | null;
        label: string;
        configuredWeight: number;
        configuredRewardAmount: string | null;
        expectedProbability: number;
        expectedPayoutRateContribution: number;
      }
    >();

    for (const prize of activePrizeRows) {
      const configuredWeight = Number(prize.weight ?? 0);
      const rewardAmount = toMoneyString(prize.rewardAmount);
      const expectedProbability =
        configuredTotalWeight > 0
          ? configuredWeight / configuredTotalWeight
          : 0;
      const expectedPayoutRateContribution =
        currentDrawCost.gt(0) && expectedProbability > 0
          ? toRate(
              toDecimal(rewardAmount)
                .mul(expectedProbability)
                .div(currentDrawCost),
            )
          : 0;

      expectedDistribution.set(`prize:${prize.id}`, {
        bucketKey: `prize:${prize.id}`,
        kind: "prize",
        prizeId: prize.id,
        label: prize.name,
        configuredWeight,
        configuredRewardAmount: rewardAmount,
        expectedProbability: toRate(expectedProbability),
        expectedPayoutRateContribution,
      });
    }

    if (currentMissWeight > 0) {
      expectedDistribution.set("miss", {
        bucketKey: "miss",
        kind: "miss",
        prizeId: null,
        label: "Miss",
        configuredWeight: currentMissWeight,
        configuredRewardAmount: "0.00",
        expectedProbability:
          configuredTotalWeight > 0
            ? toRate(currentMissWeight / configuredTotalWeight)
            : 0,
        expectedPayoutRateContribution: 0,
      });
    }

    const actualDistribution = new Map<
      string,
      {
        kind: "prize" | "miss" | "retired_prize";
        prizeId: number | null;
        label: string;
        actualDrawCount: number;
        actualRewardAmount: Decimal;
      }
    >();

    let totalDrawCount = 0;
    let winCount = 0;
    let actualDrawCostAmount = new Decimal(0);
    let actualRewardAmount = new Decimal(0);

    for (const row of drawRowsByProject.get(project.id) ?? []) {
      const drawCount = Number(row.drawCount ?? 0);
      const rewardAmountTotal = toDecimal(row.rewardAmountTotal);
      const drawCostTotal = toDecimal(row.drawCostTotal);
      totalDrawCount += drawCount;
      actualDrawCostAmount = actualDrawCostAmount.plus(drawCostTotal);
      actualRewardAmount = actualRewardAmount.plus(rewardAmountTotal);

      const isWin = row.status === "won";
      if (isWin) {
        winCount += drawCount;
      }

      const bucketKey = isWin
        ? row.prizeId !== null
          ? `prize:${row.prizeId}`
          : "retired_prize"
        : "miss";
      const currentPrize = row.prizeId ? prizeRowsById.get(row.prizeId) : null;
      const existingBucket = actualDistribution.get(bucketKey);

      actualDistribution.set(bucketKey, {
        kind: isWin
          ? row.prizeId !== null
            ? "prize"
            : "retired_prize"
          : "miss",
        prizeId: row.prizeId,
        label: isWin
          ? (currentPrize?.name ??
            (row.prizeId ? `Prize #${row.prizeId}` : "Retired prize"))
          : "Miss",
        actualDrawCount: (existingBucket?.actualDrawCount ?? 0) + drawCount,
        actualRewardAmount: (
          existingBucket?.actualRewardAmount ?? new Decimal(0)
        ).plus(rewardAmountTotal),
      });
    }

    const missCount = Math.max(totalDrawCount - winCount, 0);
    const distributionKeys = new Set<string>([
      ...expectedDistribution.keys(),
      ...actualDistribution.keys(),
    ]);
    const expectedHitRate = Array.from(expectedDistribution.values()).reduce(
      (sum, bucket) =>
        bucket.kind === "prize" ? sum + bucket.expectedProbability : sum,
      0,
    );
    const expectedRewardPerDraw = Array.from(
      expectedDistribution.values(),
    ).reduce(
      (sum, bucket) =>
        sum.plus(
          toDecimal(bucket.configuredRewardAmount ?? "0").mul(
            bucket.expectedProbability,
          ),
        ),
      new Decimal(0),
    );
    const expectedRewardAmount = expectedRewardPerDraw.mul(totalDrawCount);
    const actualPayoutRate = actualDrawCostAmount.gt(0)
      ? toRate(actualRewardAmount.div(actualDrawCostAmount))
      : 0;
    const expectedPayoutRate = currentDrawCost.gt(0)
      ? toRate(expectedRewardPerDraw.div(currentDrawCost))
      : 0;
    const hitRate = totalDrawCount > 0 ? toRate(winCount / totalDrawCount) : 0;

    const distribution = Array.from(distributionKeys)
      .map((bucketKey) => {
        const expectedBucket = expectedDistribution.get(bucketKey);
        const actualBucket = actualDistribution.get(bucketKey);
        const actualDrawCount = actualBucket?.actualDrawCount ?? 0;
        const actualProbability =
          totalDrawCount > 0 ? toRate(actualDrawCount / totalDrawCount) : 0;

        return {
          bucketKey,
          kind: actualBucket?.kind ?? expectedBucket?.kind ?? "miss",
          prizeId: actualBucket?.prizeId ?? expectedBucket?.prizeId ?? null,
          label: actualBucket?.label ?? expectedBucket?.label ?? "Miss",
          configuredWeight: expectedBucket?.configuredWeight ?? 0,
          configuredRewardAmount:
            expectedBucket?.configuredRewardAmount ?? null,
          expectedProbability: expectedBucket?.expectedProbability ?? 0,
          actualDrawCount,
          actualProbability,
          actualRewardAmount: toMoneyString(
            actualBucket?.actualRewardAmount ?? new Decimal(0),
          ),
          probabilityDrift: toRate(
            actualProbability - (expectedBucket?.expectedProbability ?? 0),
          ),
          expectedPayoutRateContribution:
            expectedBucket?.expectedPayoutRateContribution ?? 0,
          actualPayoutRateContribution: actualDrawCostAmount.gt(0)
            ? toRate(
                (actualBucket?.actualRewardAmount ?? new Decimal(0)).div(
                  actualDrawCostAmount,
                ),
              )
            : 0,
        };
      })
      .sort((left, right) => {
        if (right.actualDrawCount !== left.actualDrawCount) {
          return right.actualDrawCount - left.actualDrawCount;
        }

        if (right.expectedProbability !== left.expectedProbability) {
          return right.expectedProbability - left.expectedProbability;
        }

        return left.label.localeCompare(right.label);
      });

    return {
      project: {
        id: project.id,
        tenantId: project.tenantId,
        slug: project.slug,
        name: project.name,
        environment: project.environment,
        status: project.status,
        currency: project.currency,
        drawCost: toMoneyString(project.drawCost),
        prizePoolBalance: toMoneyString(project.prizePoolBalance),
        fairnessEpochSeconds: Number(
          project.fairnessEpochSeconds ?? DEFAULT_FAIRNESS_EPOCH_SECONDS,
        ),
        maxDrawCount: Number(project.maxDrawCount ?? 1),
        missWeight: Number(project.missWeight ?? 0),
      },
      window: {
        days,
        startedAt,
        endedAt,
        baseline: "current_catalog" as const,
      },
      summary: {
        totalDrawCount,
        uniquePlayerCount: playerCountByProject.get(project.id) ?? 0,
        winCount,
        missCount,
        hitRate,
        expectedHitRate: toRate(expectedHitRate),
        hitRateDrift: toRate(hitRate - expectedHitRate),
        actualDrawCostAmount: toMoneyString(actualDrawCostAmount),
        actualRewardAmount: toMoneyString(actualRewardAmount),
        expectedRewardAmount: toMoneyString(expectedRewardAmount),
        actualPayoutRate,
        expectedPayoutRate,
        payoutRateDrift: toRate(actualPayoutRate - expectedPayoutRate),
      },
      distribution,
    };
  });
};

export async function authenticateProjectApiKey(apiKey: string) {
  const hash = hashValue(apiKey.trim());
  const now = new Date();

  const rows = await db
    .select({
      apiKeyId: saasApiKeys.id,
      projectId: saasProjects.id,
      tenantId: saasTenants.id,
      tenantName: saasTenants.name,
      projectSlug: saasProjects.slug,
      projectName: saasProjects.name,
      environment: saasProjects.environment,
      currency: saasProjects.currency,
      scopes: saasApiKeys.scopes,
      baseMonthlyFee: saasBillingAccounts.baseMonthlyFee,
      drawFee: saasBillingAccounts.drawFee,
      billingMetadata: saasBillingAccounts.metadata,
      billingCurrency: saasBillingAccounts.currency,
      apiRateLimitBurst: saasProjects.apiRateLimitBurst,
      apiRateLimitHourly: saasProjects.apiRateLimitHourly,
      apiRateLimitDaily: saasProjects.apiRateLimitDaily,
    })
    .from(saasApiKeys)
    .innerJoin(saasProjects, eq(saasApiKeys.projectId, saasProjects.id))
    .innerJoin(saasTenants, eq(saasProjects.tenantId, saasTenants.id))
    .leftJoin(
      saasBillingAccounts,
      eq(saasBillingAccounts.tenantId, saasTenants.id),
    )
    .where(
      and(
        eq(saasApiKeys.keyHash, hash),
        isNull(saasApiKeys.revokedAt),
        gt(saasApiKeys.expiresAt, now),
        eq(saasProjects.status, "active"),
        eq(saasTenants.status, "active"),
      ),
    )
    .limit(1);

  const auth = rows[0];
  if (!auth) {
    throw unauthorizedError("Invalid API key.", {
      code: API_ERROR_CODES.INVALID_API_KEY,
    });
  }

  await db
    .update(saasApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(saasApiKeys.id, auth.apiKeyId),
        eq(saasApiKeys.projectId, auth.projectId),
      ),
    );

  const drawFee =
    auth.environment === "sandbox"
      ? "0.0000"
      : auth.drawFee
        ? new Decimal(auth.drawFee).toFixed(4)
        : "0.0000";
  const decisionPricing =
    auth.environment === "sandbox"
      ? buildLegacyDecisionPricing("0")
      : resolveBillingDecisionPricing(auth.billingMetadata, drawFee);

  return {
    tenantId: auth.tenantId,
    tenantName: auth.tenantName,
    projectId: auth.projectId,
    projectSlug: auth.projectSlug,
    projectName: auth.projectName,
    environment: auth.environment,
    currency: auth.currency,
    apiKeyId: auth.apiKeyId,
    scopes: normalizeScopes(auth.scopes),
    drawFee,
    baseMonthlyFee:
      auth.environment === "sandbox"
        ? "0.00"
        : toMoneyString(auth.baseMonthlyFee ?? 0),
    decisionPricing,
    billingBudgetPolicy: readSaasBillingBudgetPolicy(auth.billingMetadata),
    billingCurrency:
      auth.environment === "sandbox"
        ? auth.currency
        : (auth.billingCurrency ?? auth.currency),
    apiRateLimitBurst: Number(auth.apiRateLimitBurst ?? 120),
    apiRateLimitHourly: Number(auth.apiRateLimitHourly ?? 3600),
    apiRateLimitDaily: Number(auth.apiRateLimitDaily ?? 86400),
    agentId: null,
    agentPolicy: null,
  } satisfies ProjectApiAuth;
}

const readProjectAgentPolicy = async (
  tenantId: number,
  agentId: string,
): Promise<ProjectAgentPolicy | null> => {
  const [control] = await db
    .select()
    .from(agentBlocklist)
    .where(
      and(
        eq(agentBlocklist.tenantId, tenantId),
        eq(agentBlocklist.agentId, agentId),
      ),
    )
    .limit(1);

  if (!control) {
    return null;
  }

  return {
    agentId: control.agentId,
    mode: control.mode,
    reason: control.reason,
    budgetMultiplier:
      control.budgetMultiplier === null
        ? null
        : new Decimal(control.budgetMultiplier).toNumber(),
  };
};

const hasTenantAgentControls = async (tenantId: number) => {
  const [row] = await db
    .select({ id: agentBlocklist.id })
    .from(agentBlocklist)
    .where(eq(agentBlocklist.tenantId, tenantId))
    .limit(1);

  return Boolean(row);
};

export async function applyProjectAgentControl(
  auth: ProjectApiAuth,
  agentId: string | null,
) {
  const normalizedAgentId = agentId?.trim() || null;
  const tenantHasControls = await hasTenantAgentControls(auth.tenantId);

  if (!normalizedAgentId) {
    if (tenantHasControls) {
      throw badRequestError(
        "Agent id is required when tenant agent controls are enabled.",
        {
          code: API_ERROR_CODES.AGENT_ID_REQUIRED,
        },
      );
    }

    return auth;
  }

  const policy = await readProjectAgentPolicy(auth.tenantId, normalizedAgentId);
  if (policy?.mode === "blocked") {
    throw forbiddenError(
      `Agent ${normalizedAgentId} is blocked for this tenant: ${policy.reason}`,
      {
        code: API_ERROR_CODES.AGENT_REQUEST_BLOCKED,
      },
    );
  }

  return {
    ...auth,
    agentId: normalizedAgentId,
    agentPolicy: policy,
  } satisfies ProjectApiAuth;
}

async function getProjectFairnessCommit(
  projectId: number,
  environment: SaaSEnvironment,
) {
  const project = await getCachedSaasProjectConfig(projectId, environment);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  return db.transaction(async (tx) => {
    const seed = await ensureProjectFairnessSeed(
      tx,
      projectId,
      environment,
      Number(project.fairnessEpochSeconds ?? DEFAULT_FAIRNESS_EPOCH_SECONDS),
    );
    return asProjectFairnessCommit(seed);
  });
}

async function revealProjectFairnessSeed(
  projectId: number,
  environment: SaaSEnvironment,
  epoch: number,
) {
  const project = await getCachedSaasProjectConfig(projectId, environment);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  const epochSeconds = resolveEpochSeconds(project.fairnessEpochSeconds);
  const current = currentEpoch(epochSeconds);
  if (!Number.isFinite(epoch) || epoch < 0 || epoch >= current) {
    throw notFoundError("Fairness reveal not available for this epoch.", {
      code: API_ERROR_CODES.FAIRNESS_REVEAL_NOT_AVAILABLE,
    });
  }

  const [seed] = await db
    .select()
    .from(saasFairnessSeeds)
    .where(
      and(
        eq(saasFairnessSeeds.projectId, projectId),
        eq(saasFairnessSeeds.environment, environment),
        eq(saasFairnessSeeds.epoch, epoch),
        eq(saasFairnessSeeds.epochSeconds, epochSeconds),
      ),
    )
    .limit(1);

  if (!seed) {
    throw notFoundError("Fairness reveal not found.", {
      code: API_ERROR_CODES.FAIRNESS_REVEAL_NOT_FOUND,
    });
  }

  if (!seed.revealedAt) {
    await db
      .update(saasFairnessSeeds)
      .set({ revealedAt: new Date() })
      .where(
        and(
          eq(saasFairnessSeeds.id, seed.id),
          eq(saasFairnessSeeds.projectId, projectId),
          eq(saasFairnessSeeds.environment, environment),
        ),
      );
  }

  return {
    epoch: seed.epoch,
    epochSeconds: seed.epochSeconds,
    commitHash: seed.commitHash,
    seed: seed.seed,
    revealedAt: seed.revealedAt ?? new Date(),
  };
}

export async function getPrizeEngineOverview(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
}): Promise<PrizeEngineOverview> {
  const { auth, environment } = params;
  assertProjectScope(auth, "catalog:read");
  assertProjectEnvironment(auth, environment);

  const [projectStateRows, projectConfig, prizes, fairness] = await Promise.all([
    db
      .select({
        id: saasProjects.id,
        tenantId: saasProjects.tenantId,
        status: saasProjects.status,
        prizePoolBalance: saasProjects.prizePoolBalance,
      })
      .from(saasProjects)
      .where(
        and(
          eq(saasProjects.id, auth.projectId),
          eq(saasProjects.tenantId, auth.tenantId),
          eq(saasProjects.environment, environment),
        ),
      )
      .limit(1),
    getCachedSaasProjectConfig(auth.projectId, environment),
    loadProjectPrizeRows(auth.projectId),
    getProjectFairnessCommit(auth.projectId, environment),
  ]);

  const projectState = projectStateRows[0];
  if (!projectState || !projectConfig) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  const presentations = buildPrizePresentations(
    prizes.map((row) => ({
      id: row.id,
      name: row.name,
      stock: Number(row.stock ?? 0),
      weight: Number(row.weight ?? 1),
      rewardAmount: toMoneyString(row.rewardAmount),
    })),
  );

  await recordPrizeEngineUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    environment,
    eventType: "catalog:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: buildAgentUsageMetadata(auth, { route: "overview" }),
  });

  return {
    project: {
      id: projectState.id,
      tenantId: projectState.tenantId,
      slug: projectConfig.slug,
      name: projectConfig.name,
      environment: projectConfig.environment,
      status: projectState.status,
      currency: projectConfig.currency,
      drawCost: toMoneyString(projectConfig.drawCost),
      prizePoolBalance: toMoneyString(projectState.prizePoolBalance),
      strategy: resolveProjectSelectionStrategy(projectConfig.strategy),
      strategyParams: normalizeProjectStrategyParams(projectConfig.strategyParams),
      fairnessEpochSeconds: Number(projectConfig.fairnessEpochSeconds),
      maxDrawCount: Number(projectConfig.maxDrawCount),
      missWeight: Number(projectConfig.missWeight),
    },
    fairness,
    prizes: presentations,
    featuredPrizes: presentations.filter((item) => item.isFeatured),
  };
}

export async function listPrizeEngineObservabilityDistributions(
  projectIds: number[],
  query: {
    days?: number;
    environment?: SaaSEnvironment;
  } = {},
) {
  return buildPrizeEngineObservabilityDistributions(projectIds, {
    days: query.days,
  });
}

export async function getPrizeEngineObservabilityDistribution(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  query?: {
    days?: number;
  };
}) {
  const { auth, environment, query = {} } = params;
  assertProjectScope(auth, "ledger:read");
  assertProjectEnvironment(auth, environment);

  const [distribution] = await buildPrizeEngineObservabilityDistributions(
    [auth.projectId],
    query,
  );

  if (
    !distribution ||
    distribution.project.tenantId !== auth.tenantId ||
    distribution.project.environment !== environment
  ) {
    throw notFoundError("Project observability not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  await recordPrizeEngineUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    environment,
    eventType: "ledger:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: buildAgentUsageMetadata(auth, {
      route: "observability_distribution",
      days: distribution.window.days,
    }),
  });

  return distribution;
}

export async function getPrizeEngineFairnessCommit(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
}) {
  const { auth, environment } = params;
  assertProjectScope(auth, "fairness:read");
  assertProjectEnvironment(auth, environment);

  const commit = await getProjectFairnessCommit(auth.projectId, environment);
  await recordPrizeEngineUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    environment,
    eventType: "fairness:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: buildAgentUsageMetadata(auth, { route: "commit" }),
  });

  return commit;
}

export async function revealPrizeEngineFairnessSeed(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  epoch: number;
}) {
  const { auth, environment, epoch } = params;
  assertProjectScope(auth, "fairness:read");
  assertProjectEnvironment(auth, environment);

  const reveal = await revealProjectFairnessSeed(
    auth.projectId,
    environment,
    epoch,
  );
  await recordPrizeEngineUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    environment,
    eventType: "fairness:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: buildAgentUsageMetadata(auth, { route: "reveal", epoch }),
  });

  return reveal;
}

const executePrizeEngineReward = async (
  input: PrizeEngineRewardExecutionInput,
): Promise<PrizeEngineRewardExecutionResult> => {
  const {
    auth,
    environment,
    player: playerInput,
    agent,
    behavior,
    idempotencyKey,
    clientNonce,
    enforceIdempotency,
    riskEnvelope,
    budget,
    usageEventType,
    usageReferenceType,
    legacy,
    antiExploitTrace,
  } = input;

  assertProjectScope(auth, usageEventType);
  assertProjectEnvironment(auth, environment);
  const rewardMultiplier = resolveAgentRewardMultiplier(auth);

  const { response, replayed } = await db.transaction(
    async (tx) => {
      const project = await loadProject(tx, auth.projectId, environment);
      if (!project || project.status !== "active") {
        throw notFoundError("Project not found.", {
          code: API_ERROR_CODES.PROJECT_NOT_FOUND,
        });
      }

      const rewardEnvelopeStates = await loadLockedRewardEnvelopeStates(tx, {
        tenantId: auth.tenantId,
        projectId: project.id,
      });
      const preflightRewardEnvelopeDecision = evaluateRewardEnvelopeDecision(
        rewardEnvelopeStates,
        { kind: "expected" },
      );
      assertRewardEnvelopeNotRejected(preflightRewardEnvelopeDecision);

      const tenantRiskEnvelope = await loadLockedTenantRiskEnvelope(
        tx,
        project.tenantId,
      );
      if (!tenantRiskEnvelope) {
        throw notFoundError("Tenant not found.", {
          code: API_ERROR_CODES.TENANT_NOT_FOUND,
        });
      }

      const effectiveRiskEnvelope = resolveEffectiveRiskEnvelope(
        tenantRiskEnvelope,
        riskEnvelope,
      );
      const groupId = resolvePrizeEngineGroupId(agent.groupId);
      const agentScopeId = auth.agentId?.trim() || agent.agentId;
      const constraintConfig = applyPrizeEngineRiskEnvelope(
        resolvePrizeEngineConstraintConfig(project.metadata),
        riskEnvelope,
      );
      const drawCost = toDecimal(project.drawCost);
      const { amount: tenantDailyRewardPayout, startOfDay } =
        await loadTenantDailyRewardPayout(tx, project.tenantId);
      const billingObservedAt = new Date();
      const currentBillingMonthKey = resolveBillingBudgetMonthKey(
        billingObservedAt,
      );
      const shouldCheckBillingHardCap =
        environment === "live" &&
        (Boolean(auth.billingBudgetPolicy.hardCap) ||
          (auth.billingBudgetPolicy.state.month === currentBillingMonthKey &&
            Boolean(auth.billingBudgetPolicy.state.hardCapReachedAt)));
      const billingBudgetAccount = shouldCheckBillingHardCap
        ? await loadLockedBillingAccountBudget(tx, project.tenantId)
        : null;
      const liveBillingBudgetPolicy = billingBudgetAccount
        ? readSaasBillingBudgetPolicy(billingBudgetAccount.metadata)
        : auth.billingBudgetPolicy;
      const liveBillingHardCapActive = billingBudgetAccount
        ? isSaasBillingHardCapActive(
            billingBudgetAccount.metadata,
            billingObservedAt,
          )
        : auth.billingBudgetPolicy.state.month === currentBillingMonthKey &&
          Boolean(auth.billingBudgetPolicy.state.hardCapReachedAt);
      const { amount: currentMonthBillableUsageAmount } = billingBudgetAccount
        ? await loadTenantCurrentMonthBillableUsageAmount(
            tx,
            project.tenantId,
            billingObservedAt,
          )
        : { amount: new Decimal(0) };
      const currentMonthBillableTotalAmount = toDecimal(
        billingBudgetAccount?.baseMonthlyFee ?? auth.baseMonthlyFee,
      ).plus(currentMonthBillableUsageAmount);
      const shouldLockGroupScope =
        Boolean(groupId) && hasPrizeEngineConstraintLimit(constraintConfig.group);
      const shouldLockAgentScope =
        hasPrizeEngineConstraintLimit(constraintConfig.agent);

      if (groupId && shouldLockGroupScope) {
        await lockPrizeEngineScope(
          tx,
          project.id,
          `reward-group:${environment}:${groupId}`,
        );
      }
      if (shouldLockAgentScope) {
        await lockPrizeEngineScope(
          tx,
          project.id,
          `reward-agent:${environment}:${agentScopeId}`,
        );
      }

      const trackedAgent = await ensureProjectAgent(tx, project.id, {
        agentId: agentScopeId,
        groupId,
        ownerMetadata: agent.ownerMetadata ?? agent.metadata,
        fingerprint: agent.fingerprint,
      });
      const player = await ensureProjectPlayer(tx, project.id, playerInput);
      const requestFingerprint = buildRewardRequestFingerprint({
        agent,
        behavior,
        clientNonce,
        riskEnvelope,
        budget,
        usageReferenceType,
      });
      if (enforceIdempotency) {
        const replay = await loadIdempotentRewardReplay({
          tx,
          projectId: project.id,
          playerId: player.id,
          environment,
          idempotencyKey,
          requestFingerprint,
        });
        if (replay) {
          return {
            rewardEnvelopeStates,
            response: replay.response,
            replayed: true,
          };
        }
      }
      const groupConstraintStats = groupId
        ? await loadGroupConstraintStats({
            tx,
            projectId: project.id,
            environment,
            groupId,
            currentPlayerId: player.id,
            windowSeconds: constraintConfig.evaluationWindowSeconds,
          })
        : emptyConstraintStats();
      const agentConstraintStats =
        groupId || hasPrizeEngineConstraintLimit(constraintConfig.agent)
          ? await loadAgentConstraintStats({
              tx,
              projectId: project.id,
              environment,
              agentId: agentScopeId,
              windowSeconds: constraintConfig.evaluationWindowSeconds,
            })
          : emptyConstraintStats();
      const fairnessSeed = await ensureProjectFairnessSeed(
        tx,
        project.id,
        environment,
        project.fairnessEpochSeconds,
      );
      const rawPrizeRows = await tx
        .select({
          id: saasProjectPrizes.id,
          projectId: saasProjectPrizes.projectId,
          name: saasProjectPrizes.name,
          stock: saasProjectPrizes.stock,
          weight: saasProjectPrizes.weight,
          rewardAmount: saasProjectPrizes.rewardAmount,
          isActive: saasProjectPrizes.isActive,
          deletedAt: saasProjectPrizes.deletedAt,
          metadata: saasProjectPrizes.metadata,
        })
        .from(saasProjectPrizes)
        .where(
          and(
            eq(saasProjectPrizes.projectId, project.id),
            eq(saasProjectPrizes.isActive, true),
            isNull(saasProjectPrizes.deletedAt),
          ),
        );
      const prizeRows: PrizeEngineConstraintPrizeRow[] = rawPrizeRows.map(
        (row) => ({
          ...row,
          metadata: normalizeMetadata(row.metadata),
        }),
      );
      const riskEligiblePrizeRows = prizeRows.filter((row) => {
        if (effectiveRiskEnvelope.emergencyStop) {
          return false;
        }

        const scaledRewardAmount = scaleRewardAmount(
          row.rewardAmount,
          rewardMultiplier,
        );
        if (
          effectiveRiskEnvelope.maxSinglePayout &&
          scaledRewardAmount.gt(effectiveRiskEnvelope.maxSinglePayout)
        ) {
          return false;
        }

        if (
          effectiveRiskEnvelope.varianceCap &&
          Decimal.max(scaledRewardAmount.minus(drawCost), 0).gt(
            effectiveRiskEnvelope.varianceCap,
          )
        ) {
          return false;
        }

        if (
          effectiveRiskEnvelope.dailyBudgetCap &&
          tenantDailyRewardPayout
            .plus(scaledRewardAmount)
            .gt(effectiveRiskEnvelope.dailyBudgetCap)
        ) {
          return false;
        }

        return true;
      });
      const availablePrizes = riskEligiblePrizeRows.filter(
        (row) => Number(row.stock ?? 0) > 0 && Number(row.weight ?? 0) > 0,
      );
      const groupScopedPrizeRows: PrizeEngineScopeConstraintResult =
        groupId && hasPrizeEngineConstraintLimit(constraintConfig.group)
          ? applyScopeConstraintEnvelope({
              scope: "group",
              prizeRows: availablePrizes,
              stats: groupConstraintStats,
              windowSeconds: constraintConfig.evaluationWindowSeconds,
              missWeight: Number(project.missWeight ?? 0),
              rewardMultiplier,
              maxDrawCount: constraintConfig.group.maxDrawCount,
              maxRewardBudget: constraintConfig.group.maxRewardBudget,
              maxPositiveVariance: constraintConfig.group.maxPositiveVariance,
            })
          : {
              prizeRows: availablePrizes,
              triggered: [] as Array<
                ReturnType<typeof buildPrizeEngineEnvelopeTrigger>
              >,
              mode: "normal" as const,
            };
      const agentScopedPrizeRows: PrizeEngineScopeConstraintResult =
        hasPrizeEngineConstraintLimit(constraintConfig.agent)
          ? applyScopeConstraintEnvelope({
              scope: "agent",
              prizeRows: groupScopedPrizeRows.prizeRows,
              stats: agentConstraintStats,
              windowSeconds: constraintConfig.evaluationWindowSeconds,
              missWeight: Number(project.missWeight ?? 0),
              rewardMultiplier,
              maxDrawCount: constraintConfig.agent.maxDrawCount,
              maxRewardBudget: constraintConfig.agent.maxRewardBudget,
              maxPositiveVariance: constraintConfig.agent.maxPositiveVariance,
            })
          : {
              prizeRows: groupScopedPrizeRows.prizeRows,
              triggered: [] as Array<
                ReturnType<typeof buildPrizeEngineEnvelopeTrigger>
              >,
              mode: "normal" as const,
            };
      const projectStrategy = resolveProjectSelectionStrategy(project.strategy);
      const projectStrategyParams = (
        await resolveExperimentConfig({
          subject: buildSaasProjectPlayerExperimentSubject(
            project.id,
            player.externalPlayerId,
          ),
          config: normalizeProjectStrategyParams(project.strategyParams),
          executor: tx,
        })
      ).config;
      const selectionStats =
        projectStrategy === "epsilon_greedy"
          ? await loadProjectSelectionStats(tx, project.id, environment)
          : new Map<number, PrizeEngineSelectionStats>();
      const riskAdjustment = await resolveRewardRiskState(tx, {
        auth,
        trackedAgent,
        player,
        strategyParams: projectStrategyParams,
        requestedRisk: behavior.risk ?? 0,
      });

      const normalizedClientNonce = clientNonce?.trim() || null;
      const serverNonce = randomBytes(12).toString("hex");
      const fairnessNonce = normalizedClientNonce
        ? `${normalizedClientNonce}:${serverNonce}`
        : serverNonce;
      const selection = selectReward({
        strategy: projectStrategy,
        strategyParams: projectStrategyParams,
        prizeRows: agentScopedPrizeRows.prizeRows,
        missWeight: Number(project.missWeight ?? 0),
        fairnessSeed: fairnessSeed.seed,
        fairnessNonce,
        historyByPrizeId: selectionStats,
        behavior,
        riskAdjustment,
      });

      let selectedPrize: LockedPrizeRow | null = null;
      if (selection.selection?.kind === "prize") {
        selectedPrize = await loadLockedPrize(
          tx,
          project.id,
          selection.selection.id,
        );
        const scaledSelectedRewardAmount = selectedPrize
          ? scaleRewardAmount(selectedPrize.rewardAmount, rewardMultiplier)
          : new Decimal(0);
        if (
          !selectedPrize ||
          selectedPrize.projectId !== project.id ||
          !selectedPrize.isActive ||
          selectedPrize.deletedAt ||
          selectedPrize.stock <= 0 ||
          scaledSelectedRewardAmount.gt(project.prizePoolBalance) ||
          effectiveRiskEnvelope.emergencyStop ||
          (effectiveRiskEnvelope.maxSinglePayout !== null &&
            scaledSelectedRewardAmount.gt(
              effectiveRiskEnvelope.maxSinglePayout,
            )) ||
          (effectiveRiskEnvelope.varianceCap !== null &&
            Decimal.max(scaledSelectedRewardAmount.minus(drawCost), 0).gt(
              effectiveRiskEnvelope.varianceCap,
            )) ||
          (effectiveRiskEnvelope.dailyBudgetCap !== null &&
            tenantDailyRewardPayout
              .plus(scaledSelectedRewardAmount)
              .gt(effectiveRiskEnvelope.dailyBudgetCap))
        ) {
          selectedPrize = null;
        }
      }

      let rewardAmount = selectedPrize
        ? scaleRewardAmount(selectedPrize.rewardAmount, rewardMultiplier)
        : new Decimal(0);
      const scopeEnvelopeOutcome: PrizeEngineRewardEnvelopeOutcome = {
        mode:
          groupScopedPrizeRows.mode === "mute" ||
          agentScopedPrizeRows.mode === "mute"
            ? "mute"
            : "normal",
        triggered: [
          ...groupScopedPrizeRows.triggered,
          ...agentScopedPrizeRows.triggered,
        ],
      };
      let rewardEnvelopeDecision = preflightRewardEnvelopeDecision;

      if (preflightRewardEnvelopeDecision.mode === "allow") {
        const finalRewardEnvelopeDecision = evaluateRewardEnvelopeDecision(
          rewardEnvelopeStates,
          { kind: "actual", rewardAmount },
        );
        assertRewardEnvelopeNotRejected(finalRewardEnvelopeDecision);

        if (finalRewardEnvelopeDecision.mode === "mute") {
          selectedPrize = null;
          rewardAmount = new Decimal(0);
        }

        rewardEnvelopeDecision =
          finalRewardEnvelopeDecision.mode === "allow"
            ? preflightRewardEnvelopeDecision
            : finalRewardEnvelopeDecision;
      } else {
        selectedPrize = null;
        rewardAmount = new Decimal(0);
      }

      let rewardEnvelopeOutcome: PrizeEngineRewardEnvelopeOutcome = {
        mode:
          rewardEnvelopeDecision.mode === "mute" ||
          scopeEnvelopeOutcome.mode === "mute"
            ? "mute"
            : "normal",
        triggered: [
          ...rewardEnvelopeDecision.triggered,
          ...scopeEnvelopeOutcome.triggered,
        ],
      };
      let billingThrottleReason: "monthly_hard_cap" | null = null;
      if (environment === "live" && liveBillingBudgetPolicy.hardCap) {
        const hardCapAmount = toDecimal(liveBillingBudgetPolicy.hardCap);
        const preThrottleDecisionType = rewardAmount.gt(0) ? "payout" : "mute";
        const decisionFee = toDecimal(auth.decisionPricing[preThrottleDecisionType]);
        if (
          liveBillingHardCapActive ||
          currentMonthBillableTotalAmount.plus(decisionFee).gt(hardCapAmount)
        ) {
          selectedPrize = null;
          rewardAmount = new Decimal(0);
          billingThrottleReason = "monthly_hard_cap";
          rewardEnvelopeOutcome = {
            ...rewardEnvelopeOutcome,
            mode: "mute",
          };

          if (billingBudgetAccount && !liveBillingHardCapActive) {
            const nextMetadata = normalizeMetadata(
              markSaasBillingHardCapReached(
                billingBudgetAccount.metadata,
                billingObservedAt,
              ),
            );
            billingBudgetAccount.metadata = nextMetadata;
            await tx
              .update(saasBillingAccounts)
              .set({
                metadata: nextMetadata,
                updatedAt: billingObservedAt,
              })
              .where(eq(saasBillingAccounts.id, billingBudgetAccount.id));
          }
        }
      }
      const lockedProjectState = await lockProjectStateForSettlement(
        tx,
        project.id,
        environment,
      );
      if (!lockedProjectState || lockedProjectState.status !== "active") {
        throw notFoundError("Project not found.", {
          code: API_ERROR_CODES.PROJECT_NOT_FOUND,
        });
      }

      if (selectedPrize) {
        const scaledSelectedRewardAmount = scaleRewardAmount(
          selectedPrize.rewardAmount,
          rewardMultiplier,
        );
        if (scaledSelectedRewardAmount.gt(lockedProjectState.prizePoolBalance)) {
          selectedPrize = null;
          rewardAmount = new Decimal(0);
        }
      }

      const expectedRewardAmount = computeExpectedRewardAmount({
        prizeRows: agentScopedPrizeRows.prizeRows,
        missWeight: Number(project.missWeight ?? 0),
        rewardMultiplier,
      });
      const distributionTelemetry = buildDrawDistributionTelemetry({
        availablePrizes: agentScopedPrizeRows.prizeRows.map((row) => ({
          rewardAmount: scaleRewardAmount(
            row.rewardAmount,
            rewardMultiplier,
          ).toFixed(2),
          weight: Number(row.weight ?? 0),
        })),
        missWeight: Number(project.missWeight ?? 0),
        actualRewardAmount: rewardAmount.toFixed(2),
      });
      const startingBalance = toDecimal(player.balance);
      const endingBalance = startingBalance.minus(drawCost).plus(rewardAmount);
      const startingPoolBalance = toDecimal(lockedProjectState.prizePoolBalance);
      const endingPoolBalance = Decimal.max(
        startingPoolBalance.plus(drawCost).minus(rewardAmount),
        0,
      );
      const won = rewardAmount.gt(0);
      const nextPityStreak = won ? 0 : Number(player.pityStreak ?? 0) + 1;

      if (selectedPrize) {
        await tx
          .update(saasProjectPrizes)
          .set({
            stock: selectedPrize.stock - 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(saasProjectPrizes.id, selectedPrize.id),
              eq(saasProjectPrizes.projectId, project.id),
            ),
          );
      }

      const [updatedPlayer] = await tx
        .update(saasPlayers)
        .set({
          balance: endingBalance.toFixed(2),
          pityStreak: nextPityStreak,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(saasPlayers.id, player.id),
            eq(saasPlayers.projectId, project.id),
          ),
        )
        .returning();

      if (!updatedPlayer) {
        throw conflictError("Failed to update project player.", {
          code: API_ERROR_CODES.FAILED_TO_UPDATE_PROJECT_PLAYER,
        });
      }

      await tx
        .update(saasProjects)
        .set({
          prizePoolBalance: endingPoolBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(saasProjects.id, project.id));

      if (!drawCost.eq(0)) {
        await tx.insert(saasLedgerEntries).values({
          projectId: project.id,
          playerId: player.id,
          environment,
          entryType: "draw_cost",
          amount: drawCost.negated().toFixed(2),
          balanceBefore: startingBalance.toFixed(2),
          balanceAfter: startingBalance.minus(drawCost).toFixed(2),
          referenceType: usageReferenceType,
          metadata: {
            externalPlayerId: player.externalPlayerId,
            agentId: agentScopeId,
            agentRecordId: trackedAgent.id,
            agentGroupId: trackedAgent.groupId,
            agentMode: auth.agentPolicy?.mode ?? null,
          },
        });
      }

      const fairnessMetadata = {
        epoch: fairnessSeed.epoch,
        epochSeconds: fairnessSeed.epochSeconds,
        commitHash: fairnessSeed.commitHash,
        clientNonce: normalizedClientNonce,
        serverNonce,
        nonceSource: (normalizedClientNonce ? "client" : "server") as
          | "client"
          | "server",
        ...selection.fairness,
      };
      const rewardRequestMetadata = {
        idempotencyKey,
        requestFingerprint,
        usageReferenceType,
        agent,
        behavior,
        riskEnvelope: riskEnvelope ?? null,
        budget: budget ?? null,
        legacy: legacy ?? null,
      };

      const [record] = await tx
        .insert(saasDrawRecords)
        .values({
          projectId: project.id,
          playerId: player.id,
          environment,
          agentId: agentScopeId,
          groupId,
          prizeId: selectedPrize?.id ?? null,
          drawCost: drawCost.toFixed(2),
          rewardAmount: rewardAmount.toFixed(2),
          expectedRewardAmount: expectedRewardAmount.toFixed(4),
          status: won ? "won" : "miss",
          metadata: {
            idempotencyKey,
            rewardRequest: rewardRequestMetadata,
            fairness: fairnessMetadata,
            envelope: rewardEnvelopeOutcome,
            distribution: distributionTelemetry,
            ...(antiExploitTrace ? { antiExploit: antiExploitTrace } : {}),
            agentId: agentScopeId,
            agentRecordId: trackedAgent.id,
            groupId,
            billingThrottleReason,
            agentMode: auth.agentPolicy?.mode ?? null,
            agentBudgetMultiplier: auth.agentPolicy?.budgetMultiplier ?? null,
            riskEnvelope: {
              requested: riskEnvelope ?? null,
              effective: {
                dailyBudgetCap:
                  effectiveRiskEnvelope.dailyBudgetCap?.toFixed(2) ?? null,
                maxSinglePayout:
                  effectiveRiskEnvelope.maxSinglePayout?.toFixed(2) ?? null,
                varianceCap:
                  effectiveRiskEnvelope.varianceCap?.toFixed(2) ?? null,
                emergencyStop: effectiveRiskEnvelope.emergencyStop,
              },
              filteredPrizeCount: Math.max(
                prizeRows.length - riskEligiblePrizeRows.length,
                0,
              ),
              groupFilteredPrizeCount: Math.max(
                availablePrizes.length - groupScopedPrizeRows.prizeRows.length,
                0,
              ),
              agentFilteredPrizeCount: Math.max(
                groupScopedPrizeRows.prizeRows.length -
                  agentScopedPrizeRows.prizeRows.length,
                0,
              ),
              tenantDailyRewardPayoutBefore: tenantDailyRewardPayout.toFixed(2),
              tenantDailyRewardPayoutAfter: tenantDailyRewardPayout
                .plus(rewardAmount)
                .toFixed(2),
              tenantDailyRewardPayoutWindowStart: startOfDay.toISOString(),
            },
            constraintWindow: {
              window: resolvePrizeEngineConstraintWindow(
                constraintConfig.evaluationWindowSeconds,
              ),
              windowSeconds: constraintConfig.evaluationWindowSeconds,
              groupId,
              agentScopeId,
              group: {
                drawCount: groupConstraintStats.drawCount,
                distinctPlayerCount: groupConstraintStats.distinctPlayerCount,
                rewardAmount: groupConstraintStats.rewardAmount.toFixed(2),
                expectedRewardAmount:
                  groupConstraintStats.expectedRewardAmount.toFixed(4),
                positiveVariance:
                  groupConstraintStats.positiveVariance.toFixed(4),
              },
              agent: {
                drawCount: agentConstraintStats.drawCount,
                rewardAmount: agentConstraintStats.rewardAmount.toFixed(2),
                expectedRewardAmount:
                  agentConstraintStats.expectedRewardAmount.toFixed(4),
                positiveVariance:
                  agentConstraintStats.positiveVariance.toFixed(4),
              },
            },
            prizeBaseRewardAmount: selectedPrize
              ? toMoneyString(selectedPrize.rewardAmount)
              : null,
            playerBalanceBefore: startingBalance.toFixed(2),
            playerBalanceAfter: endingBalance.toFixed(2),
            prizePoolBalanceBefore: startingPoolBalance.toFixed(2),
            prizePoolBalanceAfter: endingPoolBalance.toFixed(2),
            legacy: legacy ?? null,
          },
        })
        .returning();

      if (groupId) {
        const groupRewardAmountAfter =
          groupConstraintStats.rewardAmount.plus(rewardAmount);
        const groupExpectedRewardAmountAfter =
          groupConstraintStats.expectedRewardAmount.plus(expectedRewardAmount);
        const agentRewardAmountAfter =
          agentConstraintStats.rewardAmount.plus(rewardAmount);
        const agentExpectedRewardAmountAfter =
          agentConstraintStats.expectedRewardAmount.plus(expectedRewardAmount);

        await tx.insert(saasAgentGroupCorrelations).values({
          projectId: project.id,
          agentId: agentScopeId,
          playerId: player.id,
          drawRecordId: record.id,
          groupId,
          windowSeconds: constraintConfig.evaluationWindowSeconds,
          groupDrawCountWindow: groupConstraintStats.drawCount + 1,
          groupDistinctPlayerCountWindow:
            groupConstraintStats.distinctPlayerCount +
            (groupConstraintStats.containsCurrentPlayer ? 0 : 1),
          groupRewardAmountWindow: groupRewardAmountAfter.toFixed(4),
          groupExpectedRewardAmountWindow:
            groupExpectedRewardAmountAfter.toFixed(4),
          groupPositiveVarianceWindow: computePositiveVariance(
            groupRewardAmountAfter,
            groupExpectedRewardAmountAfter,
          ).toFixed(4),
          agentDrawCountWindow: agentConstraintStats.drawCount + 1,
          agentRewardAmountWindow: agentRewardAmountAfter.toFixed(4),
          agentExpectedRewardAmountWindow:
            agentExpectedRewardAmountAfter.toFixed(4),
          agentPositiveVarianceWindow: computePositiveVariance(
            agentRewardAmountAfter,
            agentExpectedRewardAmountAfter,
          ).toFixed(4),
          metadata: {
            environment,
            playerExternalId: player.externalPlayerId,
            agentId: agentScopeId,
            agentRecordId: trackedAgent.id,
            agentScopeId,
            rewardEnvelopeMode: rewardEnvelopeOutcome.mode,
            groupTriggered: groupScopedPrizeRows.triggered,
            agentTriggered: agentScopedPrizeRows.triggered,
          },
        });
      }

      if (!rewardAmount.eq(0)) {
        await tx.insert(saasLedgerEntries).values({
          projectId: project.id,
          playerId: player.id,
          environment,
          entryType: "prize_reward",
          amount: rewardAmount.toFixed(2),
          balanceBefore: startingBalance.minus(drawCost).toFixed(2),
          balanceAfter: endingBalance.toFixed(2),
          referenceType: usageReferenceType,
          referenceId: record.id,
          metadata: {
            prizeId: selectedPrize?.id ?? null,
            prizeName: selectedPrize?.name ?? null,
            agentId: agentScopeId,
            agentRecordId: trackedAgent.id,
            groupId,
            agentMode: auth.agentPolicy?.mode ?? null,
            rewardEnvelopeMode: rewardEnvelopeOutcome.mode,
            prizeBaseRewardAmount: selectedPrize
              ? toMoneyString(selectedPrize.rewardAmount)
              : null,
          },
        });
      }

      const decisionType = won ? "payout" : "mute";
      await recordPrizeEngineUsageEvent(
        {
          tenantId: auth.tenantId,
          projectId: auth.projectId,
          apiKeyId: auth.apiKeyId,
          playerId: updatedPlayer.id,
          environment,
          eventType: usageEventType,
          decisionType,
          referenceType: usageReferenceType,
          referenceId: record.id,
          amount:
            environment === "live" && !billingThrottleReason
              ? auth.decisionPricing[decisionType]
              : "0",
          currency: auth.billingCurrency,
          metadata: buildAgentUsageMetadata(auth, {
            decisionType,
            externalPlayerId: updatedPlayer.externalPlayerId,
            groupId,
            status: record.status,
            prizeId: record.prizeId,
            billable: environment === "live" && !billingThrottleReason,
            billingThrottleReason,
            rewardEnvelopeMode: rewardEnvelopeOutcome.mode,
            rewardEnvelopeTriggered: rewardEnvelopeOutcome.triggered,
          }),
        },
        tx,
      );

      const nextRewardEnvelopeStates = await consumeRewardEnvelopeStates(tx, {
        states: rewardEnvelopeStates,
        rewardAmount,
      });

      const response = {
        agent: toSaasAgent({
          id: trackedAgent.id,
          projectId: trackedAgent.projectId,
          externalId: trackedAgent.agentId,
          groupId: trackedAgent.groupId,
          ownerMetadata: trackedAgent.ownerMetadata,
          fingerprint: trackedAgent.fingerprint,
          status: trackedAgent.status,
          createdAt: trackedAgent.createdAt,
        }),
        behavior,
        ...(riskEnvelope ? { riskEnvelope } : {}),
        ...(budget ? { budget } : {}),
        idempotencyKey,
        replayed: false,
        player: {
          id: updatedPlayer.id,
          projectId: updatedPlayer.projectId,
          externalPlayerId: updatedPlayer.externalPlayerId,
          displayName: updatedPlayer.displayName,
          balance: toMoneyString(updatedPlayer.balance),
          pityStreak: updatedPlayer.pityStreak,
          metadata: normalizeMetadata(updatedPlayer.metadata),
          createdAt: updatedPlayer.createdAt,
          updatedAt: updatedPlayer.updatedAt,
        },
        result: {
          id: record.id,
          playerId: player.id,
          prizeId: selectedPrize?.id ?? null,
          drawCost: toMoneyString(record.drawCost),
          rewardAmount: toMoneyString(record.rewardAmount),
          status: record.status,
          createdAt: record.createdAt,
          selectionStrategy: selection.fairness.strategy,
          fairness: fairnessMetadata,
          envelope: rewardEnvelopeOutcome,
          prize: selectedPrize
            ? buildPrizePresentations([
                {
                  id: selectedPrize.id,
                  name: selectedPrize.name,
                  stock: Math.max(selectedPrize.stock - 1, 0),
                  weight: selectedPrize.weight,
                  rewardAmount: rewardAmount.toFixed(2),
                },
              ])[0]
            : null,
        },
        ...(legacy ? { legacy } : {}),
      } satisfies PrizeEngineRewardResponse;

      await tx
        .update(saasDrawRecords)
        .set({
          metadata: {
            ...(normalizeMetadata(record.metadata) ?? {}),
            agentSnapshot: response.agent,
            playerSnapshot: response.player,
            prizeSnapshot: response.result.prize ?? null,
            responseSnapshot: response,
            legacy: legacy ?? null,
          },
        })
        .where(eq(saasDrawRecords.id, record.id));

      await enqueueRewardCompletedWebhookDeliveries(tx, {
        project: {
          id: project.id,
          tenantId: project.tenantId,
          slug: project.slug,
          name: project.name,
          environment: project.environment,
          currency: project.currency,
        },
        response,
      });

      return {
        rewardEnvelopeStates: nextRewardEnvelopeStates,
        response,
        replayed: false,
      };
    },
  );
  return {
    response,
    replayed,
  };
};

export async function createPrizeEngineReward(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  payload: PrizeEngineRewardRequest;
  antiExploitTrace?: PrizeEngineAntiExploitTrace | null;
}): Promise<PrizeEngineRewardResponse> {
  const { auth, environment, payload, antiExploitTrace } = params;

  const result = await executePrizeEngineReward({
    auth,
    environment,
    player: {
      externalPlayerId: payload.agent.agentId,
      metadata: payload.agent.metadata,
    },
    agent: payload.agent,
    behavior: payload.behavior,
    idempotencyKey: payload.idempotencyKey ?? randomBytes(16).toString("hex"),
    clientNonce: payload.clientNonce ?? null,
    enforceIdempotency: true,
    riskEnvelope: payload.riskEnvelope,
    budget: payload.budget,
    usageEventType: PRIZE_ENGINE_REWARD_WRITE_SCOPE,
    usageReferenceType: "reward",
    antiExploitTrace,
  });

  await markTenantOnboardedAfterSuccess({
    auth,
    environment,
    activityType: "reward",
    subjectId: payload.agent.agentId,
  });

  return result.response;
}

export async function createPrizeEngineDraw(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  payload: PrizeEngineDrawRequest;
  antiExploitTrace?: PrizeEngineAntiExploitTrace | null;
}): Promise<PrizeEngineDrawResponse | PrizeEngineRewardResponse> {
  const { auth, environment, payload, antiExploitTrace } = params;
  const rewardContext = payload.rewardContext;
  const legacyAgentMetadata = payload.agent?.metadata ?? payload.player.metadata;
  const result = await executePrizeEngineReward({
    auth,
    environment,
    player: {
      externalPlayerId: payload.player.playerId,
      displayName: payload.player.displayName ?? null,
      metadata: payload.player.metadata,
    },
    agent: rewardContext?.agent ?? {
      agentId: auth.agentId?.trim() || payload.player.playerId,
      groupId: payload.groupId ?? null,
      ...(legacyAgentMetadata ? { metadata: legacyAgentMetadata } : {}),
      ...(legacyAgentMetadata ? { ownerMetadata: legacyAgentMetadata } : {}),
      ...(payload.agent?.fingerprint
        ? { fingerprint: payload.agent.fingerprint }
        : {}),
      status: "active",
    },
    behavior: rewardContext?.behavior
      ? {
          ...rewardContext.behavior,
          risk: rewardContext.behavior.risk ?? payload.risk,
        }
      : {
          actionType: "legacy.gacha.draw",
          score: 1,
          risk: payload.risk,
          context: {
            legacyPlayerId: payload.player.playerId,
            legacyDisplayName: payload.player.displayName ?? null,
          },
          signals: {
            legacyRoute: true,
          },
        },
    idempotencyKey: payload.idempotencyKey ?? randomBytes(16).toString("hex"),
    clientNonce: payload.clientNonce ?? null,
    enforceIdempotency: Boolean(payload.idempotencyKey),
    riskEnvelope: rewardContext?.riskEnvelope ?? payload.riskEnvelope,
    budget: rewardContext?.budget,
    usageEventType: rewardContext
      ? PRIZE_ENGINE_REWARD_WRITE_SCOPE
      : PRIZE_ENGINE_LEGACY_DRAW_WRITE_SCOPE,
    usageReferenceType: rewardContext ? "reward" : "draw",
    legacy: LEGACY_DRAW_ROUTE_METADATA,
    antiExploitTrace,
  });

  await markTenantOnboardedAfterSuccess({
    auth,
    environment,
    activityType: rewardContext ? "reward" : "draw",
    subjectId: rewardContext?.agent.agentId ?? payload.player.playerId,
  });

  if (rewardContext) {
    return result.response;
  }

  return {
    agent: result.response.agent,
    player: result.response.player,
    result: result.response.result,
    ...(result.response.legacy ? { legacy: result.response.legacy } : {}),
  };
}

export async function getPrizeEngineLedger(params: {
  auth: ProjectApiAuth;
  environment: SaaSEnvironment;
  externalPlayerId: string;
  limit?: number;
}) {
  const { auth, environment, externalPlayerId, limit = 50 } = params;
  assertProjectScope(auth, "ledger:read");
  assertProjectEnvironment(auth, environment);

  const normalizedLimit = Math.min(Math.max(limit, 1), 200);
  const { agent, player, entries } = await db.transaction(async (tx) => {
    const trackedAgent = await ensureProjectAgent(tx, auth.projectId, {
      agentId: auth.agentId?.trim() || externalPlayerId,
    });
    const [player] = await tx
      .select()
      .from(saasPlayers)
      .where(
        and(
          eq(saasPlayers.projectId, auth.projectId),
          eq(saasPlayers.externalPlayerId, externalPlayerId),
        ),
      )
      .limit(1);

    if (!player) {
      throw notFoundError("Project player not found.", {
        code: API_ERROR_CODES.PROJECT_PLAYER_NOT_FOUND,
      });
    }

    const entries = await tx
      .select()
      .from(saasLedgerEntries)
      .where(
        and(
          eq(saasLedgerEntries.projectId, auth.projectId),
          eq(saasLedgerEntries.playerId, player.id),
          eq(saasLedgerEntries.environment, environment),
        ),
      )
      .orderBy(desc(saasLedgerEntries.id))
      .limit(normalizedLimit);

    return {
      agent: trackedAgent,
      player,
      entries,
    };
  });

  await recordPrizeEngineUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    playerId: player.id,
    environment,
    eventType: "ledger:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: buildAgentUsageMetadata(auth, {
      externalPlayerId,
      agentRecordId: agent.id,
      limit: normalizedLimit,
    }),
  });

  return {
    agent: toSaasAgent({
      id: agent.id,
      projectId: agent.projectId,
      externalId: agent.agentId,
      groupId: agent.groupId,
      ownerMetadata: agent.ownerMetadata,
      fingerprint: agent.fingerprint,
      status: agent.status,
      createdAt: agent.createdAt,
    }),
    player: {
      id: player.id,
      projectId: player.projectId,
      externalPlayerId: player.externalPlayerId,
      displayName: player.displayName,
      balance: toMoneyString(player.balance),
      pityStreak: player.pityStreak,
      metadata: normalizeMetadata(player.metadata),
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    },
    entries: entries.map(toPrizeEngineLedgerEntry),
  };
}

export type { ProjectApiAuth } from "./prize-engine-domain";
