import { API_ERROR_CODES } from "@reward/shared-types/api";

import { domainError } from "../../shared/errors";
import { getRedis } from "../../shared/redis";
import type { ProjectApiAuth } from "./prize-engine-domain";

const DEFAULT_TENANT_MAX_CONCURRENT = 48;
const DEFAULT_PROJECT_MAX_CONCURRENT = 16;
const DEFAULT_PROJECT_MAX_QUEUE_DEPTH = 32;
const DEFAULT_PROJECT_MAX_QUEUE_WAIT_MS = 250;
const DEFAULT_COUNTER_TTL_MS = 30_000;
const DEFAULT_QUEUE_POLL_INTERVAL_MS = 10;

type GovernorNode = Record<string, unknown>;

type PrizeEngineGovernorConfig = {
  tenantMaxConcurrent: number;
  projectMaxConcurrent: number;
  projectQueueDepth: number;
  projectQueueWaitMs: number;
  counterTtlMs: number;
  queuePollIntervalMs: number;
};

type PrizeEngineGovernorLeaseScope = {
  key: string;
  ttlMs: number;
};

export type PrizeEngineExecutionLease = {
  queuedMs: number;
  release: () => Promise<void>;
};

type GovernorError = Error & {
  retryAfterSeconds?: number;
};

const localActiveCounters = new Map<string, number>();
const localQueueCounters = new Map<string, number>();

const sleep = async (delayMs: number) => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const toNode = (value: unknown): GovernorNode | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as GovernorNode)
    : null;

const readValue = (node: GovernorNode | null, keys: string[]) => {
  if (!node) {
    return undefined;
  }

  for (const key of keys) {
    if (key in node) {
      return node[key];
    }
  }

  return undefined;
};

const readPositiveInt = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : fallback;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0
      ? normalized
      : fallback;
  }

  return fallback;
};

const readNonNegativeInt = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 0 ? normalized : fallback;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized >= 0
      ? normalized
      : fallback;
  }

  return fallback;
};

const resolveGovernorConfig = (
  auth: Pick<ProjectApiAuth, "tenantMetadata" | "projectMetadata">,
): PrizeEngineGovernorConfig => {
  const tenantNode = toNode(
    readValue(toNode(auth.tenantMetadata), [
      "prizeEngineAdmission",
      "prize_engine_admission",
    ]),
  );
  const projectNode = toNode(
    readValue(toNode(auth.projectMetadata), [
      "prizeEngineExecution",
      "prize_engine_execution",
      "prizeEngineAdmission",
      "prize_engine_admission",
    ]),
  );

  return {
    tenantMaxConcurrent: readPositiveInt(
      readValue(tenantNode, ["maxConcurrent", "max_concurrent"]),
      DEFAULT_TENANT_MAX_CONCURRENT,
    ),
    projectMaxConcurrent: readPositiveInt(
      readValue(projectNode, [
        "maxConcurrency",
        "max_concurrency",
        "maxConcurrent",
        "max_concurrent",
      ]),
      DEFAULT_PROJECT_MAX_CONCURRENT,
    ),
    projectQueueDepth: readNonNegativeInt(
      readValue(projectNode, [
        "queueDepth",
        "queue_depth",
        "maxQueueDepth",
        "max_queue_depth",
      ]),
      DEFAULT_PROJECT_MAX_QUEUE_DEPTH,
    ),
    projectQueueWaitMs: readNonNegativeInt(
      readValue(projectNode, [
        "queueWaitMs",
        "queue_wait_ms",
        "maxQueueWaitMs",
        "max_queue_wait_ms",
      ]),
      DEFAULT_PROJECT_MAX_QUEUE_WAIT_MS,
    ),
    counterTtlMs: readPositiveInt(
      readValue(projectNode, ["counterTtlMs", "counter_ttl_ms"]),
      DEFAULT_COUNTER_TTL_MS,
    ),
    queuePollIntervalMs: readPositiveInt(
      readValue(projectNode, ["queuePollIntervalMs", "queue_poll_interval_ms"]),
      DEFAULT_QUEUE_POLL_INTERVAL_MS,
    ),
  };
};

const buildActiveKey = (scope: "tenant" | "project", id: number) =>
  `prize-engine:governor:active:${scope}:${id}`;

const buildQueueKey = (projectId: number) =>
  `prize-engine:governor:queue:project:${projectId}`;

const incrementLocalCounter = (store: Map<string, number>, key: string) => {
  const next = (store.get(key) ?? 0) + 1;
  store.set(key, next);
  return next;
};

const decrementLocalCounter = (store: Map<string, number>, key: string) => {
  const current = store.get(key) ?? 0;
  const next = Math.max(current - 1, 0);
  if (next === 0) {
    store.delete(key);
  } else {
    store.set(key, next);
  }

  return next;
};

const refreshCounterTtl = async (key: string, ttlMs: number) => {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  const currentValue = Number(await redis.get(key) ?? 0);
  if (currentValue > 0) {
    await redis.pexpire(key, ttlMs);
  }
};

const tryAcquireCounterSlot = async (params: {
  key: string;
  limit: number;
  ttlMs: number;
}) => {
  const redis = getRedis();
  if (!redis) {
    const next = incrementLocalCounter(localActiveCounters, params.key);
    if (next <= params.limit) {
      return true;
    }

    decrementLocalCounter(localActiveCounters, params.key);
    return false;
  }

  const next = await redis.incr(params.key);
  await redis.pexpire(params.key, params.ttlMs);
  if (next <= params.limit) {
    return true;
  }

  const remaining = await redis.decr(params.key);
  if (remaining <= 0) {
    await redis.del(params.key);
  } else {
    await redis.pexpire(params.key, params.ttlMs);
  }
  return false;
};

const releaseCounterSlot = async (params: { key: string; ttlMs: number }) => {
  const redis = getRedis();
  if (!redis) {
    decrementLocalCounter(localActiveCounters, params.key);
    return;
  }

  const remaining = await redis.decr(params.key);
  if (remaining <= 0) {
    await redis.del(params.key);
    return;
  }

  await redis.pexpire(params.key, params.ttlMs);
};

const tryEnterQueue = async (params: {
  key: string;
  limit: number;
  ttlMs: number;
}) => {
  const redis = getRedis();
  if (!redis) {
    const next = incrementLocalCounter(localQueueCounters, params.key);
    if (next <= params.limit) {
      return true;
    }

    decrementLocalCounter(localQueueCounters, params.key);
    return false;
  }

  const next = await redis.incr(params.key);
  await redis.pexpire(params.key, params.ttlMs);
  if (next <= params.limit) {
    return true;
  }

  const remaining = await redis.decr(params.key);
  if (remaining <= 0) {
    await redis.del(params.key);
  } else {
    await redis.pexpire(params.key, params.ttlMs);
  }
  return false;
};

const leaveQueue = async (params: { key: string; ttlMs: number }) => {
  const redis = getRedis();
  if (!redis) {
    decrementLocalCounter(localQueueCounters, params.key);
    return;
  }

  const remaining = await redis.decr(params.key);
  if (remaining <= 0) {
    await redis.del(params.key);
    return;
  }

  await redis.pexpire(params.key, params.ttlMs);
};

const createGovernorError = (params: {
  message: string;
  code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
  details: string[];
  retryAfterSeconds: number;
}) => {
  const error = domainError(429, params.message, {
    code: params.code,
    details: params.details,
  }) as GovernorError;
  error.retryAfterSeconds = params.retryAfterSeconds;
  return error;
};

const tryAcquireExecutionScopes = async (params: {
  tenantScope: PrizeEngineGovernorLeaseScope & { limit: number };
  projectScope: PrizeEngineGovernorLeaseScope & { limit: number };
}) => {
  const tenantAcquired = await tryAcquireCounterSlot({
    key: params.tenantScope.key,
    limit: params.tenantScope.limit,
    ttlMs: params.tenantScope.ttlMs,
  });
  if (!tenantAcquired) {
    return {
      status: "tenant_rejected" as const,
    };
  }

  const projectAcquired = await tryAcquireCounterSlot({
    key: params.projectScope.key,
    limit: params.projectScope.limit,
    ttlMs: params.projectScope.ttlMs,
  });
  if (projectAcquired) {
    return {
      status: "acquired" as const,
    };
  }

  await releaseCounterSlot({
    key: params.tenantScope.key,
    ttlMs: params.tenantScope.ttlMs,
  });
  return {
    status: "project_busy" as const,
  };
};

export const readPrizeEngineGovernorRetryAfterSeconds = (error: unknown) => {
  const retryAfterSeconds = Reflect.get(
    error as Record<string, unknown>,
    "retryAfterSeconds",
  );
  if (typeof retryAfterSeconds !== "number" || !Number.isFinite(retryAfterSeconds)) {
    return null;
  }

  return Math.max(1, Math.ceil(retryAfterSeconds));
};

export const enterPrizeEngineExecutionGovernor = async (
  auth: Pick<
    ProjectApiAuth,
    "tenantId" | "projectId" | "tenantMetadata" | "projectMetadata"
  >,
): Promise<PrizeEngineExecutionLease> => {
  const config = resolveGovernorConfig(auth);
  const tenantScope = {
    key: buildActiveKey("tenant", auth.tenantId),
    limit: config.tenantMaxConcurrent,
    ttlMs: config.counterTtlMs,
  };
  const projectScope = {
    key: buildActiveKey("project", auth.projectId),
    limit: config.projectMaxConcurrent,
    ttlMs: config.counterTtlMs,
  };
  const queueKey = buildQueueKey(auth.projectId);
  const queueCounterTtlMs = Math.max(
    config.counterTtlMs,
    config.projectQueueWaitMs + 1_000,
  );
  const queueWaitDeadline = Date.now() + config.projectQueueWaitMs;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(config.projectQueueWaitMs / 1000),
  );
  const directAdmission = await tryAcquireExecutionScopes({
    tenantScope,
    projectScope,
  });

  if (directAdmission.status === "acquired") {
    let released = false;
    const refreshTimer = (() => {
      const redis = getRedis();
      if (!redis) {
        return null;
      }

      const timer = setInterval(() => {
        void Promise.all([
          refreshCounterTtl(tenantScope.key, tenantScope.ttlMs),
          refreshCounterTtl(projectScope.key, projectScope.ttlMs),
        ]);
      }, Math.max(1_000, Math.floor(config.counterTtlMs / 3)));
      timer.unref();
      return timer;
    })();

    return {
      queuedMs: 0,
      release: async () => {
        if (released) {
          return;
        }

        released = true;
        if (refreshTimer) {
          clearInterval(refreshTimer);
        }
        await Promise.all([
          releaseCounterSlot({
            key: tenantScope.key,
            ttlMs: tenantScope.ttlMs,
          }),
          releaseCounterSlot({
            key: projectScope.key,
            ttlMs: projectScope.ttlMs,
          }),
        ]);
      },
    };
  }

  if (directAdmission.status === "tenant_rejected") {
    throw createGovernorError({
      message: "Tenant admission control limit exceeded.",
      code: API_ERROR_CODES.TENANT_ADMISSION_CONTROL_LIMIT_EXCEEDED,
      details: [
        `tenantId=${auth.tenantId}`,
        `projectId=${auth.projectId}`,
        `tenantMaxConcurrent=${config.tenantMaxConcurrent}`,
      ],
      retryAfterSeconds,
    });
  }

  if (config.projectQueueDepth <= 0 || config.projectQueueWaitMs <= 0) {
    throw createGovernorError({
      message: "Project concurrency limit exceeded.",
      code: API_ERROR_CODES.PROJECT_CONCURRENCY_LIMIT_EXCEEDED,
      details: [
        `tenantId=${auth.tenantId}`,
        `projectId=${auth.projectId}`,
        `projectMaxConcurrent=${config.projectMaxConcurrent}`,
      ],
      retryAfterSeconds,
    });
  }

  const enteredQueue = await tryEnterQueue({
    key: queueKey,
    limit: config.projectQueueDepth,
    ttlMs: queueCounterTtlMs,
  });
  if (!enteredQueue) {
    throw createGovernorError({
      message: "Project reward queue is full.",
      code: API_ERROR_CODES.PROJECT_QUEUE_DEPTH_EXCEEDED,
      details: [
        `tenantId=${auth.tenantId}`,
        `projectId=${auth.projectId}`,
        `projectQueueDepth=${config.projectQueueDepth}`,
      ],
      retryAfterSeconds,
    });
  }

  const queuedAt = Date.now();
  try {
    while (Date.now() <= queueWaitDeadline) {
      const result = await tryAcquireExecutionScopes({
        tenantScope,
        projectScope,
      });

      if (result.status === "acquired") {
        let released = false;
        const refreshTimer = (() => {
          const redis = getRedis();
          if (!redis) {
            return null;
          }

          const timer = setInterval(() => {
            void Promise.all([
              refreshCounterTtl(tenantScope.key, tenantScope.ttlMs),
              refreshCounterTtl(projectScope.key, projectScope.ttlMs),
            ]);
          }, Math.max(1_000, Math.floor(config.counterTtlMs / 3)));
          timer.unref();
          return timer;
        })();

        return {
          queuedMs: Date.now() - queuedAt,
          release: async () => {
            if (released) {
              return;
            }

            released = true;
            if (refreshTimer) {
              clearInterval(refreshTimer);
            }
            await Promise.all([
              releaseCounterSlot({
                key: tenantScope.key,
                ttlMs: tenantScope.ttlMs,
              }),
              releaseCounterSlot({
                key: projectScope.key,
                ttlMs: projectScope.ttlMs,
              }),
            ]);
          },
        };
      }

      if (result.status === "tenant_rejected") {
        throw createGovernorError({
          message: "Tenant admission control limit exceeded.",
          code: API_ERROR_CODES.TENANT_ADMISSION_CONTROL_LIMIT_EXCEEDED,
          details: [
            `tenantId=${auth.tenantId}`,
            `projectId=${auth.projectId}`,
            `tenantMaxConcurrent=${config.tenantMaxConcurrent}`,
            "queued=true",
          ],
          retryAfterSeconds,
        });
      }

      await sleep(config.queuePollIntervalMs);
    }
  } finally {
    await leaveQueue({
      key: queueKey,
      ttlMs: queueCounterTtlMs,
    });
  }

  throw createGovernorError({
    message: "Project reward queue wait timed out.",
    code: API_ERROR_CODES.PROJECT_QUEUE_WAIT_TIMEOUT,
    details: [
      `tenantId=${auth.tenantId}`,
      `projectId=${auth.projectId}`,
      `projectMaxConcurrent=${config.projectMaxConcurrent}`,
      `projectQueueWaitMs=${config.projectQueueWaitMs}`,
    ],
    retryAfterSeconds,
  });
};

export const resetPrizeEngineExecutionGovernorState = () => {
  localActiveCounters.clear();
  localQueueCounters.clear();
};
