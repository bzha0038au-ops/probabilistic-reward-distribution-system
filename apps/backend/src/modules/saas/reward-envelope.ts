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
import {
  deleteCacheKeys,
  readJsonCacheMany,
  writeJsonCacheMany,
} from "../../shared/cache";
import { domainError } from "../../shared/errors";
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
const REWARD_ENVELOPE_CONFIG_CACHE_TTL_SECONDS = 300;

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

type RewardEnvelopeConfigRow = Pick<
  RewardEnvelopeRow,
  | "id"
  | "tenantId"
  | "projectId"
  | "window"
  | "onCapHitStrategy"
  | "budgetCap"
  | "expectedPayoutPerCall"
  | "varianceCap"
>;

type RewardEnvelopeStateRow = Pick<
  RewardEnvelopeRow,
  | "id"
  | "tenantId"
  | "projectId"
  | "window"
  | "currentConsumed"
  | "currentCallCount"
  | "currentWindowStartedAt"
  | "updatedAt"
>;

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

const buildRewardEnvelopeConfigCacheKey = (payload: {
  scope: RewardEnvelopeScope;
  tenantId: number;
  projectId: number | null;
  window: SaasRewardEnvelopeWindow;
}) =>
  payload.scope === "tenant"
    ? `saas:reward-envelope:tenant:${payload.tenantId}:window:${payload.window}`
    : `saas:reward-envelope:project:${payload.projectId}:window:${payload.window}`;

const buildRewardEnvelopeConfigCacheKeys = (params: {
  tenantId: number;
  projectId?: number | null;
}) => {
  const projectId =
    typeof params.projectId === "number" ? params.projectId : null;

  return [
    ...REWARD_ENVELOPE_WINDOWS.map((window) =>
      buildRewardEnvelopeConfigCacheKey({
        scope: "tenant",
        tenantId: params.tenantId,
        projectId: null,
        window,
      }),
    ),
    ...(projectId === null
      ? []
      : REWARD_ENVELOPE_WINDOWS.map((window) =>
          buildRewardEnvelopeConfigCacheKey({
            scope: "project",
            tenantId: params.tenantId,
            projectId,
            window,
          }),
        )),
  ];
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseCachedRewardEnvelopeConfigRow = (
  value: unknown,
): RewardEnvelopeConfigRow | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = Reflect.get(value, "id");
  const tenantId = Reflect.get(value, "tenantId");
  const projectId = Reflect.get(value, "projectId");
  const window = Reflect.get(value, "window");
  const onCapHitStrategy = Reflect.get(value, "onCapHitStrategy");
  const budgetCap = Reflect.get(value, "budgetCap");
  const expectedPayoutPerCall = Reflect.get(value, "expectedPayoutPerCall");
  const varianceCap = Reflect.get(value, "varianceCap");

  if (
    typeof id !== "number" ||
    typeof tenantId !== "number" ||
    typeof window !== "string" ||
    !REWARD_ENVELOPE_WINDOWS.includes(window as SaasRewardEnvelopeWindow) ||
    typeof onCapHitStrategy !== "string" ||
    !REWARD_ENVELOPE_CAP_HIT_STRATEGIES.includes(
      onCapHitStrategy as SaasRewardEnvelopeCapHitStrategy,
    ) ||
    typeof budgetCap !== "string" ||
    typeof expectedPayoutPerCall !== "string" ||
    typeof varianceCap !== "string" ||
    (projectId !== null && projectId !== undefined && typeof projectId !== "number")
  ) {
    return null;
  }

  return {
    id,
    tenantId,
    projectId: typeof projectId === "number" ? projectId : null,
    window: window as SaasRewardEnvelopeWindow,
    onCapHitStrategy:
      onCapHitStrategy as SaasRewardEnvelopeCapHitStrategy,
    budgetCap,
    expectedPayoutPerCall,
    varianceCap,
  };
};

const readRewardEnvelopeConfigCache = async (params: {
  tenantId: number;
  projectId: number;
}) => {
  return readJsonCacheMany(
    buildRewardEnvelopeConfigCacheKeys(params),
    parseCachedRewardEnvelopeConfigRow,
  );
};

const loadRewardEnvelopeConfigRows = async (
  tx: DbTransaction,
  params: {
    tenantId: number;
    projectId: number;
  },
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      project_id AS "projectId",
      ${saasRewardEnvelopes.window} AS "window",
      on_cap_hit_strategy AS "onCapHitStrategy",
      budget_cap AS "budgetCap",
      expected_payout_per_call AS "expectedPayoutPerCall",
      variance_cap AS "varianceCap"
    FROM ${saasRewardEnvelopes}
    WHERE ${saasRewardEnvelopes.tenantId} = ${params.tenantId}
      AND (
        ${saasRewardEnvelopes.projectId} IS NULL
        OR ${saasRewardEnvelopes.projectId} = ${params.projectId}
      )
  `);

  return readSqlRows<RewardEnvelopeConfigRow>(result);
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

const syncRewardEnvelopeConfigCache = async (rows: RewardEnvelopeConfigRow[]) => {
  if (rows.length === 0) {
    return;
  }

  await writeJsonCacheMany(
    rows.map((row) => ({
      key: buildRewardEnvelopeConfigCacheKey({
        scope: resolveRewardEnvelopeScope(row.projectId),
        tenantId: row.tenantId,
        projectId: row.projectId,
        window: row.window,
      }),
      value: row,
      ttlSeconds: REWARD_ENVELOPE_CONFIG_CACHE_TTL_SECONDS,
    })),
  );
};

export const invalidateRewardEnvelopeConfigCache = async (params: {
  tenantId: number;
  projectId?: number | null;
}) => {
  await deleteCacheKeys(buildRewardEnvelopeConfigCacheKeys(params));
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
  const cachedRows = await readRewardEnvelopeConfigCache(params);
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      project_id AS "projectId",
      ${saasRewardEnvelopes.window} AS "window",
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

  const stateRows = readSqlRows<RewardEnvelopeStateRow>(result);
  const needsRefresh = stateRows.some((row) => {
    const scope = resolveRewardEnvelopeScope(row.projectId);
    const cacheKey = buildRewardEnvelopeConfigCacheKey({
      scope,
      tenantId: row.tenantId,
      projectId: row.projectId,
      window: row.window,
    });
    const cachedRow = cachedRows.get(cacheKey);
    return !cachedRow || cachedRow.id !== row.id;
  });

  const freshConfigRows = needsRefresh
    ? await loadRewardEnvelopeConfigRows(tx, params)
    : [];

  if (freshConfigRows.length > 0) {
    await syncRewardEnvelopeConfigCache(freshConfigRows);
  }

  const freshConfigRowsByKey = new Map<string, RewardEnvelopeConfigRow>();
  freshConfigRows.forEach((row) => {
    freshConfigRowsByKey.set(
      buildRewardEnvelopeConfigCacheKey({
        scope: resolveRewardEnvelopeScope(row.projectId),
        tenantId: row.tenantId,
        projectId: row.projectId,
        window: row.window,
      }),
      row,
    );
  });

  return stateRows.map((row) => {
    const scope = resolveRewardEnvelopeScope(row.projectId);
    const cacheKey = buildRewardEnvelopeConfigCacheKey({
      scope,
      tenantId: row.tenantId,
      projectId: row.projectId,
      window: row.window,
    });
    const cachedRow = cachedRows.get(cacheKey);
    const configRow =
      freshConfigRowsByKey.get(cacheKey) ??
      (cachedRow && cachedRow.id === row.id ? cachedRow : null);

    if (!configRow) {
      throw new Error("Missing reward envelope config row.");
    }

    return normalizeRewardEnvelopeState(
      {
        ...row,
        ...configRow,
      },
      now,
    );
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
