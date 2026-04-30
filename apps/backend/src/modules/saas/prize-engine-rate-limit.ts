import {
  agentBlocklist,
  agentRiskState,
  auditEvents,
  saasDrawRecords,
} from "@reward/database";
import { sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  PrizeEngineAgentSignalInput,
  PrizeEngineApiRateLimitUsage,
  PrizeEngineApiRateLimitWindow,
  PrizeEngineDrawRequest,
  PrizeEngineProjectApiRateLimitUsage,
} from "@reward/shared-types/saas";

import { db } from "../../db";
import { conflictError, forbiddenError } from "../../shared/errors";
import {
  createRateLimiter,
  type RateLimitResult,
  type RateLimitSnapshot,
} from "../../shared/rate-limit";
import { readSqlRows } from "../../shared/sql-result";
import {
  DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  hashValue,
  PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS,
  PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS,
  PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS,
  type ProjectApiAuth,
  resolveProjectApiRateLimit,
} from "./prize-engine-domain";
import { jsonbTextPathSql } from "./metadata-sql";

type ProjectApiRateLimitSource = Pick<
  ProjectApiAuth,
  "apiRateLimitBurst" | "apiRateLimitHourly" | "apiRateLimitDaily"
>;

type AntiExploitSeverity = "low" | "medium" | "high" | "critical";
type AntiExploitPluginId =
  | "idempotency_check"
  | "signature_anomaly"
  | "fingerprint_dedup"
  | "behavior_template_anomaly"
  | "group_correlation_spike";
type AntiExploitTraceField =
  | "idempotencyKeyHash"
  | "requestSignatureHash"
  | "fingerprintHash"
  | "behaviorTemplateHash"
  | "correlationGroupHash";

type PrizeEngineResolvedAgentSignals = {
  idempotencyKey: string | null;
  requestSignature: string | null;
  fingerprint: string | null;
  behaviorTemplate: string | null;
  correlationGroup: string | null;
  occurredAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type PrizeEngineAntiExploitTrace = {
  agentId: string | null;
  playerExternalId: string;
  idempotencyKeyHash: string | null;
  requestSignatureHash: string | null;
  fingerprintHash: string | null;
  behaviorTemplateHash: string | null;
  correlationGroupHash: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  payloadDigest: string;
  occurredAt: string | null;
  agentMetadata: Record<string, unknown> | null;
};

type AntiExploitHit = {
  plugin: AntiExploitPluginId;
  severity: AntiExploitSeverity;
  reason: string;
  shouldDeny: boolean;
  metadata: Record<string, unknown>;
};

type AntiExploitContext = {
  auth: ProjectApiAuth;
  payload: PrizeEngineDrawRequest;
  requestPath: string;
  requestMethod: string;
  ip: string | null;
  userAgent: string | null;
  allowIdempotentReplay: boolean;
  signals: PrizeEngineResolvedAgentSignals;
  trace: PrizeEngineAntiExploitTrace;
};

type HistoricalDrawTraceRow = {
  id: number;
  playerId: number;
  createdAt: Date | string;
  playerExternalId: string | null;
  agentId: string | null;
  payloadDigest: string | null;
  idempotencyKeyHash: string | null;
  requestSignatureHash: string | null;
  fingerprintHash: string | null;
  behaviorTemplateHash: string | null;
  correlationGroupHash: string | null;
};

const ANTI_EXPLOIT_SCORE_BY_SEVERITY: Record<AntiExploitSeverity, number> = {
  low: 10,
  medium: 25,
  high: 55,
  critical: 90,
};

const POSTGRES_DEADLOCK_SQLSTATE = "40P01";
const ANTI_EXPLOIT_DEADLOCK_RETRY_LIMIT = 3;
const ANTI_EXPLOIT_DEADLOCK_RETRY_DELAY_MS = 10;

const ANTI_EXPLOIT_SEVERITY_RANK: Record<AntiExploitSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const FINGERPRINT_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FINGERPRINT_WARN_DISTINCT_PLAYERS = 2;
const FINGERPRINT_BLOCK_DISTINCT_PLAYERS = 3;
const FINGERPRINT_WARN_RATE = 5;
const FINGERPRINT_BLOCK_RATE = 8;
const FINGERPRINT_RATE_WINDOW_MS = 5 * 60 * 1000;

const BEHAVIOR_TEMPLATE_HISTORY_WINDOW_MS = 10 * 60 * 1000;
const BEHAVIOR_TEMPLATE_WARN_RATE = 4;
const BEHAVIOR_TEMPLATE_BLOCK_RATE = 7;
const BEHAVIOR_TEMPLATE_BLOCK_DISTINCT_PLAYERS = 4;
const BEHAVIOR_TEMPLATE_BLOCK_DISTINCT_FINGERPRINTS = 3;
const BEHAVIOR_TEMPLATE_RATE_WINDOW_MS = 3 * 60 * 1000;

const GROUP_CORRELATION_HISTORY_WINDOW_MS = 10 * 60 * 1000;
const GROUP_CORRELATION_WARN_RATE = 4;
const GROUP_CORRELATION_BLOCK_RATE = 6;
const GROUP_CORRELATION_WARN_DISTINCT_PLAYERS = 3;
const GROUP_CORRELATION_BLOCK_DISTINCT_PLAYERS = 4;
const GROUP_CORRELATION_RATE_WINDOW_MS = 5 * 60 * 1000;

const burstRateLimiter = createRateLimiter({
  limit: DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  windowMs: PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS,
  prefix: "prize-engine:burst",
});

const hourlyRateLimiter = createRateLimiter({
  limit: DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  windowMs: PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS,
  prefix: "prize-engine:hourly",
});

const dailyRateLimiter = createRateLimiter({
  limit: DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  windowMs: PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS,
  prefix: "prize-engine:daily",
});

const fingerprintSpikeRateLimiter = createRateLimiter({
  limit: FINGERPRINT_BLOCK_RATE,
  windowMs: FINGERPRINT_RATE_WINDOW_MS,
  prefix: "prize-engine:anti-exploit:fingerprint",
});

const behaviorTemplateSpikeRateLimiter = createRateLimiter({
  limit: BEHAVIOR_TEMPLATE_BLOCK_RATE,
  windowMs: BEHAVIOR_TEMPLATE_RATE_WINDOW_MS,
  prefix: "prize-engine:anti-exploit:behavior-template",
});

const groupCorrelationSpikeRateLimiter = createRateLimiter({
  limit: GROUP_CORRELATION_BLOCK_RATE,
  windowMs: GROUP_CORRELATION_RATE_WINDOW_MS,
  prefix: "prize-engine:anti-exploit:group-correlation",
});

const toRateLimitWindow = (
  snapshot: RateLimitResult | RateLimitSnapshot,
): PrizeEngineApiRateLimitWindow => ({
  limit: snapshot.limit,
  used: snapshot.used,
  remaining: snapshot.remaining,
  resetAt: snapshot.resetAt ? new Date(snapshot.resetAt) : null,
  windowMs: snapshot.windowMs,
});

const buildUsage = (windows: {
  burst: RateLimitResult | RateLimitSnapshot;
  hourly: RateLimitResult | RateLimitSnapshot;
  daily: RateLimitResult | RateLimitSnapshot;
}): PrizeEngineApiRateLimitUsage => ({
  burst: toRateLimitWindow(windows.burst),
  hourly: toRateLimitWindow(windows.hourly),
  daily: toRateLimitWindow(windows.daily),
});

const aggregateWindows = (
  windows: PrizeEngineApiRateLimitWindow[],
  windowMs: number,
): PrizeEngineApiRateLimitWindow => {
  const limit = windows.reduce((sum, item) => sum + item.limit, 0);
  const used = windows.reduce((sum, item) => sum + item.used, 0);
  const remaining = Math.max(limit - used, 0);
  const resetAtValues = windows
    .map((item) => (item.resetAt ? new Date(item.resetAt).getTime() : null))
    .filter((value): value is number => value !== null);

  return {
    limit,
    used,
    remaining,
    resetAt:
      resetAtValues.length > 0 ? new Date(Math.max(...resetAtValues)) : null,
    windowMs,
  };
};

const normalizeOptionalText = (
  value: unknown,
  maxLength: number,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
};

const normalizeRecord = (
  value: unknown,
): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (Object.fromEntries(Object.entries(value)) as Record<string, unknown>)
    : null;

const normalizeOccurredAt = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const pickFirstNonEmpty = (values: Array<string | null | undefined>) =>
  values.find((value): value is string => typeof value === "string") ?? null;

const stableStringify = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const summarizeOpaqueValue = (value: string | null) => {
  if (!value) {
    return null;
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 12)}…${value.slice(-4)}`;
};

const toIsoString = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid prize engine timestamp.");
  }

  return parsed.toISOString();
};

const isSevereHit = (severity: AntiExploitSeverity) =>
  ANTI_EXPLOIT_SEVERITY_RANK[severity] >=
  ANTI_EXPLOIT_SEVERITY_RANK.high;

const selectHighestSeverityHit = (hits: AntiExploitHit[]) =>
  hits.reduce((current, candidate) =>
    ANTI_EXPLOIT_SEVERITY_RANK[candidate.severity] >
    ANTI_EXPLOIT_SEVERITY_RANK[current.severity]
      ? candidate
      : current,
  );

const antiExploitTraceFieldSql = (field: AntiExploitTraceField) => {
  switch (field) {
    case "idempotencyKeyHash":
      return jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "idempotencyKeyHash",
      );
    case "requestSignatureHash":
      return jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "requestSignatureHash",
      );
    case "fingerprintHash":
      return jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "fingerprintHash",
      );
    case "behaviorTemplateHash":
      return jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "behaviorTemplateHash",
      );
    case "correlationGroupHash":
      return jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "correlationGroupHash",
      );
  }
};

const loadHistoricalDrawTraces = async (params: {
  projectId: number;
  field: AntiExploitTraceField;
  value: string;
  since?: Date;
  limit?: number;
}) => {
  const fieldSql = antiExploitTraceFieldSql(params.field);
  const sinceIso = params.since?.toISOString() ?? null;
  const sinceClause = params.since
    ? sql`AND ${saasDrawRecords.createdAt} >= ${sinceIso}`
    : sql``;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const result = await db.execute(sql`
    SELECT
      ${saasDrawRecords.id} AS "id",
      ${saasDrawRecords.playerId} AS "playerId",
      ${saasDrawRecords.createdAt} AS "createdAt",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "playerExternalId",
      )} AS "playerExternalId",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "agentId",
      )} AS "agentId",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "payloadDigest",
      )} AS "payloadDigest",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "idempotencyKeyHash",
      )} AS "idempotencyKeyHash",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "requestSignatureHash",
      )} AS "requestSignatureHash",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "fingerprintHash",
      )} AS "fingerprintHash",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "behaviorTemplateHash",
      )} AS "behaviorTemplateHash",
      ${jsonbTextPathSql(
        saasDrawRecords.metadata,
        "antiExploit",
        "correlationGroupHash",
      )} AS "correlationGroupHash"
    FROM ${saasDrawRecords}
    WHERE ${saasDrawRecords.projectId} = ${params.projectId}
      AND ${fieldSql} = ${params.value}
      ${sinceClause}
    ORDER BY ${saasDrawRecords.id} DESC
    LIMIT ${limit}
  `);

  return readSqlRows<HistoricalDrawTraceRow>(result);
};

const resolveRiskIdentity = (context: AntiExploitContext) => {
  if (context.auth.agentId) {
    return {
      type: "agent_id" as const,
      valueHash: hashValue(context.auth.agentId),
      hint: summarizeOpaqueValue(context.auth.agentId),
    };
  }

  if (context.signals.fingerprint) {
    return {
      type: "fingerprint" as const,
      valueHash: context.trace.fingerprintHash ?? hashValue(context.signals.fingerprint),
      hint: summarizeOpaqueValue(context.signals.fingerprint),
    };
  }

  return {
    type: "player_external_id" as const,
    valueHash: hashValue(context.payload.player.playerId),
    hint: summarizeOpaqueValue(context.payload.player.playerId),
  };
};

const readDatabaseErrorCode = (error: unknown) => {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    typeof error.code !== "string"
  ) {
    return null;
  }

  return error.code;
};

const waitForRetryDelay = (attempt: number) =>
  new Promise<void>((resolve) => {
    setTimeout(
      resolve,
      attempt * ANTI_EXPLOIT_DEADLOCK_RETRY_DELAY_MS,
    );
  });

export const normalizePrizeEngineAgentSignals = (
  value?: PrizeEngineAgentSignalInput | Partial<PrizeEngineResolvedAgentSignals> | null,
): PrizeEngineResolvedAgentSignals => ({
  idempotencyKey: normalizeOptionalText(value?.idempotencyKey, 191),
  requestSignature: normalizeOptionalText(value?.requestSignature, 512),
  fingerprint: normalizeOptionalText(value?.fingerprint, 255),
  behaviorTemplate: normalizeOptionalText(value?.behaviorTemplate, 255),
  correlationGroup: normalizeOptionalText(value?.correlationGroup, 191),
  occurredAt: normalizeOccurredAt(value?.occurredAt),
  metadata: normalizeRecord(value?.metadata),
});

export const mergePrizeEngineAgentSignals = (
  ...sources: Array<
    PrizeEngineAgentSignalInput | Partial<PrizeEngineResolvedAgentSignals> | null | undefined
  >
): PrizeEngineResolvedAgentSignals => {
  const normalized = sources.map((source) =>
    normalizePrizeEngineAgentSignals(source),
  );

  return {
    idempotencyKey: pickFirstNonEmpty(
      normalized.map((item) => item.idempotencyKey),
    ),
    requestSignature: pickFirstNonEmpty(
      normalized.map((item) => item.requestSignature),
    ),
    fingerprint: pickFirstNonEmpty(normalized.map((item) => item.fingerprint)),
    behaviorTemplate: pickFirstNonEmpty(
      normalized.map((item) => item.behaviorTemplate),
    ),
    correlationGroup: pickFirstNonEmpty(
      normalized.map((item) => item.correlationGroup),
    ),
    occurredAt: pickFirstNonEmpty(normalized.map((item) => item.occurredAt)),
    metadata: normalized.find((item) => item.metadata)?.metadata ?? null,
  };
};

const deriveBehaviorTemplate = (payload: PrizeEngineDrawRequest) => {
  const behavior = payload.rewardContext?.behavior;
  if (!behavior) {
    return null;
  }

  return stableStringify({
    actionType: behavior.actionType,
    score: Number(behavior.score.toFixed(4)),
    novelty:
      typeof behavior.novelty === "number"
        ? Number(behavior.novelty.toFixed(4))
        : null,
    risk:
      typeof behavior.risk === "number"
        ? Number(behavior.risk.toFixed(4))
        : null,
    contextKeys: Object.keys(behavior.context ?? {}).sort(),
    signalKeys: Object.keys(behavior.signals ?? {}).sort(),
  });
};

const deriveSignalsFromPayload = (
  payload: PrizeEngineDrawRequest,
): Partial<PrizeEngineResolvedAgentSignals> => ({
  idempotencyKey: payload.idempotencyKey ?? null,
  fingerprint: payload.rewardContext?.agent.fingerprint ?? null,
  behaviorTemplate: deriveBehaviorTemplate(payload),
  correlationGroup:
    payload.groupId ?? payload.rewardContext?.agent.groupId ?? null,
});

const buildAntiExploitTrace = (params: {
  auth: ProjectApiAuth;
  payload: PrizeEngineDrawRequest;
  signals: PrizeEngineResolvedAgentSignals;
  ip: string | null;
  userAgent: string | null;
}): PrizeEngineAntiExploitTrace => ({
  agentId: params.auth.agentId,
  playerExternalId: params.payload.player.playerId,
  idempotencyKeyHash: params.signals.idempotencyKey
    ? hashValue(params.signals.idempotencyKey)
    : null,
  requestSignatureHash: params.signals.requestSignature
    ? hashValue(params.signals.requestSignature)
    : null,
  fingerprintHash: params.signals.fingerprint
    ? hashValue(params.signals.fingerprint)
    : null,
  behaviorTemplateHash: params.signals.behaviorTemplate
    ? hashValue(params.signals.behaviorTemplate)
    : null,
  correlationGroupHash: params.signals.correlationGroup
    ? hashValue(params.signals.correlationGroup)
    : null,
  ipHash: params.ip ? hashValue(params.ip) : null,
  userAgentHash: params.userAgent ? hashValue(params.userAgent) : null,
  payloadDigest: hashValue(
    stableStringify({
      playerId: params.payload.player.playerId,
      displayName: params.payload.player.displayName ?? null,
      playerMetadata: params.payload.player.metadata ?? null,
      clientNonce: params.payload.clientNonce ?? null,
      groupId: params.payload.groupId ?? null,
      idempotencyKey: params.payload.idempotencyKey ?? null,
      riskEnvelope: params.payload.riskEnvelope ?? null,
      rewardContext: params.payload.rewardContext ?? null,
    }),
  ),
  occurredAt: params.signals.occurredAt,
  agentMetadata: params.signals.metadata,
});

const runIdempotencyCheck = async (
  context: AntiExploitContext,
): Promise<AntiExploitHit | null> => {
  if (!context.trace.idempotencyKeyHash) {
    return null;
  }

  const matches = await loadHistoricalDrawTraces({
    projectId: context.auth.projectId,
    field: "idempotencyKeyHash",
    value: context.trace.idempotencyKeyHash,
    limit: 5,
  });
  const latest = matches[0];
  if (!latest) {
    return null;
  }

  const samePlayer =
    latest.playerExternalId === context.payload.player.playerId;
  const samePayload = latest.payloadDigest === context.trace.payloadDigest;
  if (samePlayer && samePayload && context.allowIdempotentReplay) {
    return null;
  }
  const severity: AntiExploitSeverity =
    samePlayer && samePayload ? "medium" : "high";

  return {
    plugin: "idempotency_check",
    severity,
    shouldDeny: true,
    reason:
      samePlayer && samePayload
        ? "Duplicate idempotency key replay blocked."
        : "Idempotency key reused with a different player or payload.",
    metadata: {
      signalType: "idempotency_key",
      signalHash: context.trace.idempotencyKeyHash,
      signalHint: summarizeOpaqueValue(context.signals.idempotencyKey),
      previousDrawId: latest.id,
      previousPlayerExternalId: latest.playerExternalId,
      previousAgentId: latest.agentId,
      previousCreatedAt: toIsoString(latest.createdAt),
      samePlayer,
      samePayload,
      duplicateCount: matches.length,
    },
  };
};

const runSignatureAnomalyCheck = async (
  context: AntiExploitContext,
): Promise<AntiExploitHit | null> => {
  if (!context.trace.requestSignatureHash) {
    return null;
  }

  const matches = await loadHistoricalDrawTraces({
    projectId: context.auth.projectId,
    field: "requestSignatureHash",
    value: context.trace.requestSignatureHash,
    limit: 5,
  });
  const latest = matches[0];
  if (!latest) {
    return null;
  }

  const samePlayer =
    latest.playerExternalId === context.payload.player.playerId;
  const samePayload = latest.payloadDigest === context.trace.payloadDigest;
  const sameFingerprint =
    latest.fingerprintHash === context.trace.fingerprintHash;
  const severity: AntiExploitSeverity =
    samePlayer && samePayload && sameFingerprint ? "high" : "critical";

  return {
    plugin: "signature_anomaly",
    severity,
    shouldDeny: true,
    reason:
      severity === "critical"
        ? "Request signature replay detected across players or payloads."
        : "Request signature replay detected.",
    metadata: {
      signalType: "request_signature",
      signalHash: context.trace.requestSignatureHash,
      signalHint: summarizeOpaqueValue(context.signals.requestSignature),
      previousDrawId: latest.id,
      previousPlayerExternalId: latest.playerExternalId,
      previousAgentId: latest.agentId,
      previousCreatedAt: toIsoString(latest.createdAt),
      samePlayer,
      samePayload,
      sameFingerprint,
      replayCount: matches.length,
    },
  };
};

const runFingerprintDedupCheck = async (
  context: AntiExploitContext,
): Promise<AntiExploitHit | null> => {
  if (!context.trace.fingerprintHash) {
    return null;
  }

  const since = new Date(Date.now() - FINGERPRINT_HISTORY_WINDOW_MS);
  const [matches, spike] = await Promise.all([
    loadHistoricalDrawTraces({
      projectId: context.auth.projectId,
      field: "fingerprintHash",
      value: context.trace.fingerprintHash,
      since,
      limit: 50,
    }),
    fingerprintSpikeRateLimiter.consume(
      `${context.auth.projectId}:${context.trace.fingerprintHash}`,
    ),
  ]);

  const distinctPlayers = new Set(
    matches
      .map((row) => row.playerExternalId)
      .filter((value): value is string => typeof value === "string"),
  );
  distinctPlayers.add(context.payload.player.playerId);

  if (
    distinctPlayers.size < FINGERPRINT_WARN_DISTINCT_PLAYERS &&
    spike.used < FINGERPRINT_WARN_RATE
  ) {
    return null;
  }

  const blockForReuse =
    distinctPlayers.size >= FINGERPRINT_BLOCK_DISTINCT_PLAYERS;
  const blockForBurst = !spike.allowed;
  const shouldDeny = blockForReuse || blockForBurst;

  return {
    plugin: "fingerprint_dedup",
    severity: shouldDeny ? "high" : "medium",
    shouldDeny,
    reason: blockForBurst
      ? "Fingerprint request frequency exceeded the short-window ceiling."
      : shouldDeny
        ? "Fingerprint reused across too many distinct players."
        : "Fingerprint reused across multiple distinct players.",
    metadata: {
      signalType: "fingerprint",
      signalHash: context.trace.fingerprintHash,
      signalHint: summarizeOpaqueValue(context.signals.fingerprint),
      historyWindowMs: FINGERPRINT_HISTORY_WINDOW_MS,
      distinctPlayerCount: distinctPlayers.size,
      requestCount: matches.length + 1,
      rateUsed: spike.used,
      rateLimit: spike.limit,
      rateWindowMs: spike.windowMs,
      blockForReuse,
      blockForBurst,
    },
  };
};

const runBehaviorTemplateAnomalyCheck = async (
  context: AntiExploitContext,
): Promise<AntiExploitHit | null> => {
  if (!context.trace.behaviorTemplateHash) {
    return null;
  }

  const since = new Date(Date.now() - BEHAVIOR_TEMPLATE_HISTORY_WINDOW_MS);
  const [matches, spike] = await Promise.all([
    loadHistoricalDrawTraces({
      projectId: context.auth.projectId,
      field: "behaviorTemplateHash",
      value: context.trace.behaviorTemplateHash,
      since,
      limit: 75,
    }),
    behaviorTemplateSpikeRateLimiter.consume(
      `${context.auth.projectId}:${context.trace.behaviorTemplateHash}`,
    ),
  ]);

  if (spike.used < BEHAVIOR_TEMPLATE_WARN_RATE) {
    return null;
  }

  const distinctPlayers = new Set(
    matches
      .map((row) => row.playerExternalId)
      .filter((value): value is string => typeof value === "string"),
  );
  distinctPlayers.add(context.payload.player.playerId);

  const distinctFingerprints = new Set(
    matches
      .map((row) => row.fingerprintHash)
      .filter((value): value is string => typeof value === "string"),
  );
  if (context.trace.fingerprintHash) {
    distinctFingerprints.add(context.trace.fingerprintHash);
  }

  const shouldDeny =
    !spike.allowed ||
    distinctPlayers.size >= BEHAVIOR_TEMPLATE_BLOCK_DISTINCT_PLAYERS ||
    distinctFingerprints.size >=
      BEHAVIOR_TEMPLATE_BLOCK_DISTINCT_FINGERPRINTS;

  return {
    plugin: "behavior_template_anomaly",
    severity: shouldDeny ? "high" : "medium",
    shouldDeny,
    reason: shouldDeny
      ? "Behavior template burst exceeded expected diversity thresholds."
      : "Behavior template burst exceeded the warning threshold.",
    metadata: {
      signalType: "behavior_template",
      signalHash: context.trace.behaviorTemplateHash,
      signalHint: summarizeOpaqueValue(context.signals.behaviorTemplate),
      historyWindowMs: BEHAVIOR_TEMPLATE_HISTORY_WINDOW_MS,
      requestCount: matches.length + 1,
      distinctPlayerCount: distinctPlayers.size,
      distinctFingerprintCount: distinctFingerprints.size,
      rateUsed: spike.used,
      rateLimit: spike.limit,
      rateWindowMs: spike.windowMs,
    },
  };
};

const runGroupCorrelationSpikeCheck = async (
  context: AntiExploitContext,
): Promise<AntiExploitHit | null> => {
  if (!context.trace.correlationGroupHash) {
    return null;
  }

  const since = new Date(Date.now() - GROUP_CORRELATION_HISTORY_WINDOW_MS);
  const [matches, spike] = await Promise.all([
    loadHistoricalDrawTraces({
      projectId: context.auth.projectId,
      field: "correlationGroupHash",
      value: context.trace.correlationGroupHash,
      since,
      limit: 100,
    }),
    groupCorrelationSpikeRateLimiter.consume(
      `${context.auth.projectId}:${context.trace.correlationGroupHash}`,
    ),
  ]);

  const distinctPlayers = new Set(
    matches
      .map((row) => row.playerExternalId)
      .filter((value): value is string => typeof value === "string"),
  );
  distinctPlayers.add(context.payload.player.playerId);

  if (
    distinctPlayers.size < GROUP_CORRELATION_WARN_DISTINCT_PLAYERS &&
    spike.used < GROUP_CORRELATION_WARN_RATE
  ) {
    return null;
  }

  const shouldDeny =
    !spike.allowed ||
    distinctPlayers.size >= GROUP_CORRELATION_BLOCK_DISTINCT_PLAYERS;

  return {
    plugin: "group_correlation_spike",
    severity: shouldDeny ? "critical" : "medium",
    shouldDeny,
    reason: shouldDeny
      ? "Correlation group spiked across too many players in a short window."
      : "Correlation group activity crossed the warning threshold.",
    metadata: {
      signalType: "correlation_group",
      signalHash: context.trace.correlationGroupHash,
      signalHint: summarizeOpaqueValue(context.signals.correlationGroup),
      historyWindowMs: GROUP_CORRELATION_HISTORY_WINDOW_MS,
      requestCount: matches.length + 1,
      distinctPlayerCount: distinctPlayers.size,
      rateUsed: spike.used,
      rateLimit: spike.limit,
      rateWindowMs: spike.windowMs,
    },
  };
};

const persistAntiExploitHits = async (
  context: AntiExploitContext,
  hits: AntiExploitHit[],
) => {
  if (hits.length === 0) {
    return;
  }

  const identity = resolveRiskIdentity(context);
  const scoreDelta = hits.reduce(
    (sum, hit) => sum + ANTI_EXPLOIT_SCORE_BY_SEVERITY[hit.severity],
    0,
  );
  const severeHitCount = hits.filter((hit) => isSevereHit(hit.severity)).length;
  const highestSeverityHit = selectHighestSeverityHit(hits);
  const blocklistReason = `anti_exploit:${highestSeverityHit.plugin}:${highestSeverityHit.reason}`.slice(
    0,
    255,
  );
  const shouldApplyBlocklist =
    severeHitCount > 0 && Boolean(context.auth.agentId);
  const now = new Date();

  for (
    let attempt = 1;
    attempt <= ANTI_EXPLOIT_DEADLOCK_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(auditEvents).values(
          hits.map((hit) => ({
            tenantId: context.auth.tenantId,
            projectId: context.auth.projectId,
            apiKeyId: context.auth.apiKeyId,
            agentId: context.auth.agentId,
            playerExternalId: context.payload.player.playerId,
            eventType: "anti_exploit_hit" as const,
            severity: hit.severity,
            plugin: hit.plugin,
            identityType: identity.type,
            identityValueHash: identity.valueHash,
            identityHint: identity.hint,
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: {
              route: context.requestPath,
              method: context.requestMethod,
              riskEnvelope: context.payload.riskEnvelope ?? null,
              trace: context.trace,
              hit: hit.metadata,
            },
          })),
        );

        await tx
          .insert(agentRiskState)
          .values({
            tenantId: context.auth.tenantId,
            projectId: context.auth.projectId,
            apiKeyId: context.auth.apiKeyId,
            agentId: context.auth.agentId,
            playerExternalId: context.payload.player.playerId,
            identityType: identity.type,
            identityValueHash: identity.valueHash,
            identityHint: identity.hint,
            riskScore: scoreDelta,
            hitCount: hits.length,
            severeHitCount,
            lastSeverity: highestSeverityHit.severity,
            lastPlugin: highestSeverityHit.plugin,
            lastReason: highestSeverityHit.reason,
            metadata: {
              route: context.requestPath,
              method: context.requestMethod,
              trace: context.trace,
              hits: hits.map((hit) => ({
                plugin: hit.plugin,
                severity: hit.severity,
                reason: hit.reason,
                metadata: hit.metadata,
              })),
            },
            firstHitAt: now,
            lastHitAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              agentRiskState.projectId,
              agentRiskState.identityType,
              agentRiskState.identityValueHash,
            ],
            set: {
              apiKeyId: context.auth.apiKeyId,
              agentId: context.auth.agentId,
              playerExternalId: context.payload.player.playerId,
              riskScore: sql`${agentRiskState.riskScore} + ${scoreDelta}`,
              hitCount: sql`${agentRiskState.hitCount} + ${hits.length}`,
              severeHitCount: sql`${agentRiskState.severeHitCount} + ${severeHitCount}`,
              lastSeverity: highestSeverityHit.severity,
              lastPlugin: highestSeverityHit.plugin,
              lastReason: highestSeverityHit.reason,
              metadata: {
                route: context.requestPath,
                method: context.requestMethod,
                trace: context.trace,
                hits: hits.map((hit) => ({
                  plugin: hit.plugin,
                  severity: hit.severity,
                  reason: hit.reason,
                  metadata: hit.metadata,
                })),
              },
              lastHitAt: now,
              updatedAt: now,
            },
          });

        if (!shouldApplyBlocklist || !context.auth.agentId) {
          return;
        }

        await tx
          .insert(agentBlocklist)
          .values({
            tenantId: context.auth.tenantId,
            agentId: context.auth.agentId,
            mode: "blocked",
            reason: blocklistReason,
            budgetMultiplier: null,
            createdByAdminId: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [agentBlocklist.tenantId, agentBlocklist.agentId],
            set: {
              mode: "blocked",
              reason: blocklistReason,
              budgetMultiplier: null,
              updatedAt: now,
            },
          });

        await tx.insert(auditEvents).values({
          tenantId: context.auth.tenantId,
          projectId: context.auth.projectId,
          apiKeyId: context.auth.apiKeyId,
          agentId: context.auth.agentId,
          playerExternalId: context.payload.player.playerId,
          eventType: "agent_blocklist_applied" as const,
          severity: highestSeverityHit.severity,
          plugin: highestSeverityHit.plugin,
          identityType: identity.type,
          identityValueHash: identity.valueHash,
          identityHint: identity.hint,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: {
            route: context.requestPath,
            method: context.requestMethod,
            blocklistReason,
            severeHitCount,
            trace: context.trace,
          },
        });
      });

      return;
    } catch (error) {
      const isDeadlock =
        readDatabaseErrorCode(error) === POSTGRES_DEADLOCK_SQLSTATE;
      if (!isDeadlock || attempt === ANTI_EXPLOIT_DEADLOCK_RETRY_LIMIT) {
        throw error;
      }

      await waitForRetryDelay(attempt);
    }
  }
};

export const peekPrizeEngineApiRateLimitUsage = async (
  apiKeyId: number,
  source: ProjectApiRateLimitSource,
) => {
  const config = resolveProjectApiRateLimit(source);
  const key = String(apiKeyId);
  const [burst, hourly, daily] = await Promise.all([
    burstRateLimiter.peek(key, config.apiRateLimitBurst),
    hourlyRateLimiter.peek(key, config.apiRateLimitHourly),
    dailyRateLimiter.peek(key, config.apiRateLimitDaily),
  ]);

  return buildUsage({ burst, hourly, daily });
};

export const summarizePrizeEngineProjectRateLimitUsage = async (
  source: ProjectApiRateLimitSource,
  activeApiKeyIds: number[],
): Promise<PrizeEngineProjectApiRateLimitUsage> => {
  const usages = await Promise.all(
    activeApiKeyIds.map((apiKeyId) =>
      peekPrizeEngineApiRateLimitUsage(apiKeyId, source),
    ),
  );

  return {
    activeKeyCount: activeApiKeyIds.length,
    aggregate: {
      burst: aggregateWindows(
        usages.map((usage) => usage.burst),
        PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS,
      ),
      hourly: aggregateWindows(
        usages.map((usage) => usage.hourly),
        PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS,
      ),
      daily: aggregateWindows(
        usages.map((usage) => usage.daily),
        PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS,
      ),
    },
  };
};

export const consumePrizeEngineApiRateLimit = async (
  apiKeyId: number,
  source: ProjectApiRateLimitSource,
) => {
  const config = resolveProjectApiRateLimit(source);
  const key = String(apiKeyId);
  const [burst, hourly, daily] = await Promise.all([
    burstRateLimiter.consume(key, config.apiRateLimitBurst),
    hourlyRateLimiter.consume(key, config.apiRateLimitHourly),
    dailyRateLimiter.consume(key, config.apiRateLimitDaily),
  ]);

  const blockedWindows = (
    [
      ["burst", burst],
      ["hourly", hourly],
      ["daily", daily],
    ] as const
  )
    .filter(([, result]) => !result.allowed)
    .map(([window]) => window);

  const blockedResetAt = [burst, hourly, daily]
    .filter((result) => !result.allowed)
    .map((result) => result.resetAt);

  const retryAfterSeconds =
    blockedResetAt.length > 0
      ? Math.max(
          Math.ceil((Math.max(...blockedResetAt) - Date.now()) / 1000),
          1,
        )
      : 0;

  return {
    allowed: blockedWindows.length === 0,
    usage: buildUsage({ burst, hourly, daily }),
    blockedWindows,
    retryAfterSeconds,
  };
};

export const runPrizeEngineAntiExploitPipeline = async (params: {
  auth: ProjectApiAuth;
  payload: PrizeEngineDrawRequest;
  requestPath: string;
  requestMethod: string;
  ip?: string | null;
  userAgent?: string | null;
  allowIdempotentReplay?: boolean;
  agentSignals?: PrizeEngineAgentSignalInput | Partial<PrizeEngineResolvedAgentSignals> | null;
}) => {
  const signals = mergePrizeEngineAgentSignals(
    deriveSignalsFromPayload(params.payload),
    params.payload.agent ?? null,
    params.agentSignals ?? null,
  );
  const context: AntiExploitContext = {
    auth: params.auth,
    payload: params.payload,
    requestPath: params.requestPath,
    requestMethod: params.requestMethod,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    allowIdempotentReplay: params.allowIdempotentReplay ?? false,
    signals,
    trace: buildAntiExploitTrace({
      auth: params.auth,
      payload: params.payload,
      signals,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    }),
  };

  const hits = (
    await Promise.all([
      runIdempotencyCheck(context),
      runSignatureAnomalyCheck(context),
      runFingerprintDedupCheck(context),
      runBehaviorTemplateAnomalyCheck(context),
      runGroupCorrelationSpikeCheck(context),
    ])
  ).filter((hit): hit is AntiExploitHit => hit !== null);

  if (hits.length === 0) {
    return {
      signals,
      trace: context.trace,
    };
  }

  await persistAntiExploitHits(context, hits);

  const denyHits = hits.filter((hit) => hit.shouldDeny);
  if (denyHits.length === 0) {
    return {
      signals,
      trace: context.trace,
    };
  }

  const details = denyHits.map((hit) => hit.reason);
  if (denyHits.some((hit) => isSevereHit(hit.severity))) {
    throw forbiddenError("Agent request blocked by anti-exploit policy.", {
      code: API_ERROR_CODES.AGENT_REQUEST_BLOCKED,
      details,
    });
  }

  throw conflictError("Duplicate agent request blocked.", {
    code: API_ERROR_CODES.AGENT_DUPLICATE_REQUEST,
    details,
  });
};
