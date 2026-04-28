import Decimal from "decimal.js";
import { saasRewardEnvelopes } from "@reward/database";
import { eq, sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  PrizeEngineRewardEnvelopeTrigger,
  SaasRewardEnvelopeCapHitStrategy,
  SaasRewardEnvelopeScope,
  SaasRewardEnvelopeTriggerReason,
  SaasRewardEnvelopeWindow,
} from "@reward/shared-types/saas";

import type { DbTransaction } from "../../db";
import { domainError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { getRedis } from "../../shared/redis";
import { readSqlRows } from "../../shared/sql-result";

const REWARD_ENVELOPE_WINDOWS: SaasRewardEnvelopeWindow[] = [
  "minute",
  "hour",
  "day",
];
const REWARD_ENVELOPE_CAP_HIT_STRATEGIES: SaasRewardEnvelopeCapHitStrategy[] = [
  "reject",
  "mute",
];

export type RewardEnvelopeScope = Extract<
  SaasRewardEnvelopeScope,
  "tenant" | "project"
>;
export type RewardEnvelopeDecisionMode = "allow" | "mute" | "reject";

export type RewardEnvelopeRow = {
  id: number;
  tenantId: number;
  projectId: number | null;
  window: SaasRewardEnvelopeWindow;
  onCapHitStrategy: SaasRewardEnvelopeCapHitStrategy;
  budgetCap: string;
  expectedPayoutPerCall: string;
  varianceCap: string;
  currentConsumed: string;
  currentCallCount: number;
  currentWindowStartedAt: Date | string;
  updatedAt: Date | string;
};

type CachedRewardEnvelopeRow = Omit<
  RewardEnvelopeRow,
  "currentWindowStartedAt" | "updatedAt"
> & {
  currentWindowStartedAt: string;
  updatedAt: string;
};

export type RewardEnvelopeState = Omit<
  RewardEnvelopeRow,
  "currentWindowStartedAt" | "updatedAt"
> & {
  scope: RewardEnvelopeScope;
  currentWindowStartedAt: Date;
  updatedAt: Date;
};

export type RewardEnvelopeDecision = {
  mode: RewardEnvelopeDecisionMode;
  triggered: PrizeEngineRewardEnvelopeTrigger[];
};

export type RewardEnvelopePayout =
  | { kind: "expected" }
  | { kind: "actual"; rewardAmount: Decimal.Value };

const resolveRewardEnvelopeWindowMs = (window: SaasRewardEnvelopeWindow) => {
  switch (window) {
    case "minute":
      return 60 * 1000;
    case "hour":
      return 60 * 60 * 1000;
    case "day":
      return 24 * 60 * 60 * 1000;
  }
};

const resolveRewardEnvelopeWindowStart = (
  window: SaasRewardEnvelopeWindow,
  now: Date,
) => {
  const start = new Date(now);
  start.setUTCSeconds(0, 0);

  if (window === "hour" || window === "day") {
    start.setUTCMinutes(0);
  }
  if (window === "day") {
    start.setUTCHours(0);
  }

  return start;
};

const resolveRewardEnvelopeWindowResetAt = (
  window: SaasRewardEnvelopeWindow,
  windowStart: Date,
) => new Date(windowStart.getTime() + resolveRewardEnvelopeWindowMs(window));

const resolveRewardEnvelopeScope = (
  projectId: number | null,
): RewardEnvelopeScope => (projectId === null ? "tenant" : "project");

const toRewardEnvelopeDate = (
  value: Date | string,
  field: "currentWindowStartedAt" | "updatedAt",
) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid reward envelope ${field} timestamp.`);
  }

  return parsed;
};

const buildRewardEnvelopeCacheKey = (payload: {
  scope: RewardEnvelopeScope;
  tenantId: number;
  projectId: number | null;
  window: SaasRewardEnvelopeWindow;
}) =>
  payload.scope === "tenant"
    ? `saas:reward-envelope:tenant:${payload.tenantId}:window:${payload.window}`
    : `saas:reward-envelope:project:${payload.projectId}:window:${payload.window}`;

const buildRewardEnvelopeCacheKeys = (params: {
  tenantId: number;
  projectId: number;
}) => [
  ...REWARD_ENVELOPE_WINDOWS.map((window) =>
    buildRewardEnvelopeCacheKey({
      scope: "tenant",
      tenantId: params.tenantId,
      projectId: null,
      window,
    }),
  ),
  ...REWARD_ENVELOPE_WINDOWS.map((window) =>
    buildRewardEnvelopeCacheKey({
      scope: "project",
      tenantId: params.tenantId,
      projectId: params.projectId,
      window,
    }),
  ),
];

const parseCachedRewardEnvelopeRow = (value: string) => {
  const parsed = JSON.parse(value) as Partial<CachedRewardEnvelopeRow>;
  if (
    typeof parsed.id !== "number" ||
    typeof parsed.tenantId !== "number" ||
    typeof parsed.window !== "string" ||
    !REWARD_ENVELOPE_WINDOWS.includes(
      parsed.window as SaasRewardEnvelopeWindow,
    ) ||
    typeof parsed.onCapHitStrategy !== "string" ||
    !REWARD_ENVELOPE_CAP_HIT_STRATEGIES.includes(
      parsed.onCapHitStrategy as SaasRewardEnvelopeCapHitStrategy,
    ) ||
    typeof parsed.budgetCap !== "string" ||
    typeof parsed.expectedPayoutPerCall !== "string" ||
    typeof parsed.varianceCap !== "string" ||
    typeof parsed.currentConsumed !== "string" ||
    typeof parsed.currentCallCount !== "number" ||
    typeof parsed.currentWindowStartedAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.id,
    tenantId: parsed.tenantId,
    projectId: typeof parsed.projectId === "number" ? parsed.projectId : null,
    window: parsed.window as SaasRewardEnvelopeWindow,
    onCapHitStrategy:
      parsed.onCapHitStrategy as SaasRewardEnvelopeCapHitStrategy,
    budgetCap: parsed.budgetCap,
    expectedPayoutPerCall: parsed.expectedPayoutPerCall,
    varianceCap: parsed.varianceCap,
    currentConsumed: parsed.currentConsumed,
    currentCallCount: parsed.currentCallCount,
    currentWindowStartedAt: toRewardEnvelopeDate(
      parsed.currentWindowStartedAt,
      "currentWindowStartedAt",
    ),
    updatedAt: toRewardEnvelopeDate(parsed.updatedAt, "updatedAt"),
  } satisfies RewardEnvelopeRow;
};

const readRewardEnvelopeCache = async (params: {
  tenantId: number;
  projectId: number;
}) => {
  const redis = getRedis();
  if (!redis) {
    return new Map<string, RewardEnvelopeRow>();
  }

  const keys = buildRewardEnvelopeCacheKeys(params);

  try {
    const values = await redis.mget(keys);
    const output = new Map<string, RewardEnvelopeRow>();

    values.forEach((value, index) => {
      if (!value) {
        return;
      }

      const parsed = parseCachedRewardEnvelopeRow(value);
      if (parsed) {
        output.set(keys[index]!, parsed);
      }
    });

    return output;
  } catch (error) {
    logger.warning("saas reward envelope cache read failed", { err: error });
    return new Map<string, RewardEnvelopeRow>();
  }
};

const normalizeRewardEnvelopeState = (
  row: RewardEnvelopeRow,
  now: Date,
): RewardEnvelopeState => {
  const rowCurrentWindowStartedAt = toRewardEnvelopeDate(
    row.currentWindowStartedAt,
    "currentWindowStartedAt",
  );
  const rowUpdatedAt = toRewardEnvelopeDate(row.updatedAt, "updatedAt");
  const currentWindowStartedAt = resolveRewardEnvelopeWindowStart(row.window, now);
  const shouldReset =
    rowCurrentWindowStartedAt.getTime() !== currentWindowStartedAt.getTime();

  return {
    ...row,
    scope: resolveRewardEnvelopeScope(row.projectId),
    currentConsumed: shouldReset ? "0.0000" : row.currentConsumed,
    currentCallCount: shouldReset ? 0 : Math.max(0, Number(row.currentCallCount)),
    currentWindowStartedAt,
    updatedAt: rowUpdatedAt,
  };
};

const resolveProjectedPayout = (
  state: RewardEnvelopeState,
  payout: RewardEnvelopePayout,
) =>
  payout.kind === "expected"
    ? new Decimal(state.expectedPayoutPerCall)
    : new Decimal(payout.rewardAmount);

const resolveRewardEnvelopeTrigger = (
  state: RewardEnvelopeState,
  payout: RewardEnvelopePayout,
): PrizeEngineRewardEnvelopeTrigger | null => {
  const currentConsumed = new Decimal(state.currentConsumed);
  const projectedPayout = resolveProjectedPayout(state, payout);
  const budgetCap = new Decimal(state.budgetCap);
  const varianceCap = new Decimal(state.varianceCap);
  const expectedPayoutPerCall = new Decimal(state.expectedPayoutPerCall);
  const projectedConsumed = currentConsumed.plus(projectedPayout);
  const projectedCallCount = state.currentCallCount + 1;
  const projectedPositiveDrift = Decimal.max(
    projectedConsumed.minus(expectedPayoutPerCall.mul(projectedCallCount)),
    0,
  );

  const reason: SaasRewardEnvelopeTriggerReason | null =
    projectedConsumed.gt(budgetCap)
      ? "budget_cap"
      : projectedPositiveDrift.gt(varianceCap)
        ? "variance_cap"
        : null;

  if (!reason) {
    return null;
  }

  return {
    scope: state.scope,
    window: state.window,
    reason,
    strategy: state.onCapHitStrategy,
  } satisfies PrizeEngineRewardEnvelopeTrigger;
};

const buildRewardEnvelopeDecision = (
  states: RewardEnvelopeState[],
  payout: RewardEnvelopePayout,
): RewardEnvelopeDecision => {
  const triggered = states
    .map((state) => resolveRewardEnvelopeTrigger(state, payout))
    .filter(
      (trigger): trigger is PrizeEngineRewardEnvelopeTrigger => trigger !== null,
    );

  if (triggered.length === 0) {
    return { mode: "allow", triggered: [] };
  }

  return {
    mode: triggered.some((trigger) => trigger.strategy === "reject")
      ? "reject"
      : "mute",
    triggered,
  };
};

const buildRewardEnvelopeRejectionDetails = (
  triggered: PrizeEngineRewardEnvelopeTrigger[],
) =>
  triggered.map(
    (trigger) =>
      `${trigger.scope}:${trigger.window} ${trigger.reason} triggered (${trigger.strategy})`,
  );

const toCachedRewardEnvelopeRow = (
  state: RewardEnvelopeState,
): CachedRewardEnvelopeRow => ({
  id: state.id,
  tenantId: state.tenantId,
  projectId: state.projectId,
  window: state.window,
  onCapHitStrategy: state.onCapHitStrategy,
  budgetCap: state.budgetCap,
  expectedPayoutPerCall: state.expectedPayoutPerCall,
  varianceCap: state.varianceCap,
  currentConsumed: state.currentConsumed,
  currentCallCount: state.currentCallCount,
  currentWindowStartedAt: state.currentWindowStartedAt.toISOString(),
  updatedAt: state.updatedAt.toISOString(),
});

export const syncRewardEnvelopeCache = async (states: RewardEnvelopeState[]) => {
  if (states.length === 0) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    return;
  }

  const now = Date.now();
  const pipeline = redis.pipeline();

  for (const state of states) {
    const key = buildRewardEnvelopeCacheKey({
      scope: state.scope,
      tenantId: state.tenantId,
      projectId: state.projectId,
      window: state.window,
    });
    const ttlMs =
      resolveRewardEnvelopeWindowResetAt(
        state.window,
        state.currentWindowStartedAt,
      ).getTime() - now;

    if (ttlMs <= 0) {
      pipeline.del(key);
      continue;
    }

    pipeline.set(key, JSON.stringify(toCachedRewardEnvelopeRow(state)), "PX", ttlMs);
  }

  try {
    await pipeline.exec();
  } catch (error) {
    logger.warning("saas reward envelope cache write failed", { err: error });
  }
};

export const loadLockedRewardEnvelopeStates = async (
  tx: DbTransaction,
  params: {
    tenantId: number;
    projectId: number;
    now?: Date;
  },
) => {
  const now = params.now ?? new Date();
  const cachedRows = await readRewardEnvelopeCache(params);
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      project_id AS "projectId",
      ${saasRewardEnvelopes.window} AS "window",
      on_cap_hit_strategy AS "onCapHitStrategy",
      budget_cap AS "budgetCap",
      expected_payout_per_call AS "expectedPayoutPerCall",
      variance_cap AS "varianceCap",
      current_consumed AS "currentConsumed",
      current_call_count AS "currentCallCount",
      current_window_started_at AS "currentWindowStartedAt",
      updated_at AS "updatedAt"
    FROM ${saasRewardEnvelopes}
    WHERE ${saasRewardEnvelopes.tenantId} = ${params.tenantId}
      AND (
        ${saasRewardEnvelopes.projectId} IS NULL
        OR ${saasRewardEnvelopes.projectId} = ${params.projectId}
      )
    ORDER BY ${saasRewardEnvelopes.projectId} NULLS FIRST, ${saasRewardEnvelopes.id}
    FOR UPDATE
  `);

  return readSqlRows<RewardEnvelopeRow>(result).map((row) => {
    const scope = resolveRewardEnvelopeScope(row.projectId);
    const cacheKey = buildRewardEnvelopeCacheKey({
      scope,
      tenantId: row.tenantId,
      projectId: row.projectId,
      window: row.window,
    });
    const cachedRow = cachedRows.get(cacheKey);
    const sourceRow =
      cachedRow &&
      cachedRow.id === row.id &&
      toRewardEnvelopeDate(cachedRow.updatedAt, "updatedAt").getTime() >=
        toRewardEnvelopeDate(row.updatedAt, "updatedAt").getTime()
        ? cachedRow
        : row;

    return normalizeRewardEnvelopeState(sourceRow, now);
  });
};

export const evaluateRewardEnvelopeDecision = (
  states: RewardEnvelopeState[],
  payout: RewardEnvelopePayout,
) => buildRewardEnvelopeDecision(states, payout);

export const assertRewardEnvelopeNotRejected = (
  decision: RewardEnvelopeDecision,
) => {
  if (decision.mode !== "reject") {
    return;
  }

  throw domainError(429, "Reward envelope limit exceeded.", {
    code: API_ERROR_CODES.REWARD_ENVELOPE_LIMIT_EXCEEDED,
    details: buildRewardEnvelopeRejectionDetails(decision.triggered),
  });
};

export const consumeRewardEnvelopeStates = async (
  tx: DbTransaction,
  params: {
    states: RewardEnvelopeState[];
    rewardAmount: Decimal.Value;
    now?: Date;
  },
) => {
  const now = params.now ?? new Date();
  const nextRewardAmount = new Decimal(params.rewardAmount);

  for (const state of params.states) {
    const nextConsumed = new Decimal(state.currentConsumed).plus(nextRewardAmount);
    state.currentConsumed = nextConsumed.toFixed(4);
    state.currentCallCount += 1;
    state.updatedAt = now;

    await tx
      .update(saasRewardEnvelopes)
      .set({
        currentConsumed: state.currentConsumed,
        currentCallCount: state.currentCallCount,
        currentWindowStartedAt: state.currentWindowStartedAt,
        updatedAt: now,
      })
      .where(eq(saasRewardEnvelopes.id, state.id));
  }

  return params.states;
};
