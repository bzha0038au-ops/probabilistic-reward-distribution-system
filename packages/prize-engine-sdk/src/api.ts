import type { ApiError, ApiResponse } from "@reward/shared-types/api";
import {
  PrizeEngineDrawRequestSchema,
  PrizeEngineRewardRequestSchema,
  type PrizeEngineDrawRequest,
  type PrizeEngineDrawResponse,
  type PrizeEngineLedgerResponse,
  type PrizeEngineObservabilityDistributionQuery,
  type PrizeEngineOverview,
  type PrizeEngineProjectObservability,
  type PrizeEngineRewardRequest,
  type PrizeEngineRewardResponse,
  type SaaSEnvironment,
} from "@reward/shared-types/saas";

export type PrizeEngineApiResult<T> = ApiResponse<T>;

export const PRIZE_ENGINE_API_ROUTES = {
  overview: "/v1/engine/overview",
  fairnessCommit: "/v1/engine/fairness/commit",
  fairnessReveal: "/v1/engine/fairness/reveal",
  observabilityDistribution: "/v1/engine/observability/distribution",
  rewards: "/v1/engine/rewards",
  draws: "/v1/engine/draws",
  ledger: "/v1/engine/ledger",
} as const;
export const PRIZE_ENGINE_AGENT_ID_HEADER = "X-Agent-Id";

type AsyncValue<T> = T | Promise<T>;

type PrizeEngineSleep = (delayMs: number) => Promise<void>;
type PrizeEngineObservabilityDistributionInput = Omit<
  PrizeEngineObservabilityDistributionQuery,
  "environment"
>;

export type PrizeEngineRetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  retryableStatusCodes: readonly number[];
  respectRetryAfter: boolean;
};

export type PrizeEngineRuntime = {
  baseUrl: string;
  environment: SaaSEnvironment;
  fetchImpl?: typeof fetch;
  getApiKey?: () => AsyncValue<string | null | undefined>;
  getHeaders?: () => AsyncValue<Record<string, string> | undefined>;
  retry?: Partial<PrizeEngineRetryOptions> | false;
  sleep?: PrizeEngineSleep;
  random?: () => number;
};

export type PrizeEngineRequestOverrides = {
  baseUrl?: string;
  apiKey?: string | null;
  agentId?: string | null;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  retry?: Partial<PrizeEngineRetryOptions> | false;
  idempotencyKey?: string;
};

const fallbackError: ApiError = { message: "Request failed." };

const DEFAULT_RETRY_OPTIONS: PrizeEngineRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_500,
  jitterRatio: 0.2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  respectRetryAfter: true,
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const toSearch = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const output = search.toString();
  return output ? `?${output}` : "";
};

const sleepFor: PrizeEngineSleep = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const resolveRetryOptions = (
  runtimeRetry: PrizeEngineRuntime["retry"],
  overrideRetry: PrizeEngineRequestOverrides["retry"],
): PrizeEngineRetryOptions | false => {
  if (overrideRetry === false) {
    return false;
  }

  if (runtimeRetry === false && overrideRetry === undefined) {
    return false;
  }

  const runtimeRetryOptions =
    typeof runtimeRetry === "object" ? runtimeRetry : undefined;
  const overrideRetryOptions =
    typeof overrideRetry === "object" ? overrideRetry : undefined;

  return {
    ...DEFAULT_RETRY_OPTIONS,
    ...runtimeRetryOptions,
    ...overrideRetryOptions,
  };
};

const resolveRequestMethod = (method: string | undefined) =>
  (method ?? "GET").toUpperCase();

const isSafeMethod = (method: string) =>
  method === "GET" || method === "HEAD" || method === "OPTIONS";

const canRetryRequest = (
  method: string,
  idempotencyKey: string | undefined,
) => isSafeMethod(method) || Boolean(idempotencyKey);

const parseRetryAfterMs = (value: string | null) => {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const parsedAt = Date.parse(value);
  if (Number.isNaN(parsedAt)) {
    return null;
  }

  return Math.max(parsedAt - Date.now(), 0);
};

const calculateRetryDelayMs = (params: {
  attempt: number;
  response: Response | null;
  options: PrizeEngineRetryOptions;
  random: () => number;
}) => {
  const { attempt, response, options, random } = params;
  const retryAfterMs =
    options.respectRetryAfter && response
      ? parseRetryAfterMs(response.headers.get("Retry-After"))
      : null;
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, 0), options.maxDelayMs);
  }

  const exponentialDelay = Math.min(
    options.baseDelayMs * Math.pow(2, Math.max(attempt - 1, 0)),
    options.maxDelayMs,
  );
  const jitterWindow = exponentialDelay * options.jitterRatio;
  const jitterOffset = jitterWindow > 0 ? (random() * 2 - 1) * jitterWindow : 0;

  return Math.max(
    Math.min(exponentialDelay + jitterOffset, options.maxDelayMs),
    0,
  );
};

const shouldRetryResponse = (params: {
  attempt: number;
  method: string;
  response: Response;
  retryOptions: PrizeEngineRetryOptions | false;
  idempotencyKey: string | undefined;
}) => {
  const { attempt, method, response, retryOptions, idempotencyKey } = params;
  if (!retryOptions) {
    return false;
  }

  if (attempt >= retryOptions.maxAttempts) {
    return false;
  }

  if (!canRetryRequest(method, idempotencyKey)) {
    return false;
  }

  return retryOptions.retryableStatusCodes.includes(response.status);
};

const shouldRetryError = (params: {
  attempt: number;
  method: string;
  retryOptions: PrizeEngineRetryOptions | false;
  idempotencyKey: string | undefined;
}) => {
  const { attempt, method, retryOptions, idempotencyKey } = params;
  if (!retryOptions) {
    return false;
  }

  if (attempt >= retryOptions.maxAttempts) {
    return false;
  }

  return canRetryRequest(method, idempotencyKey);
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
};

const hashText = (value: string) => {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const buildRewardRequestSignature = (
  payload: PrizeEngineRewardRequest,
) =>
  `rw-${hashText(
    stableStringify({
      environment: payload.environment ?? null,
      agent: payload.agent,
      behavior: payload.behavior,
      riskEnvelope: payload.riskEnvelope ?? null,
      budget: payload.budget ?? null,
      clientNonce: payload.clientNonce ?? null,
    }),
  )}`;

const resolveFetch = (
  runtime: PrizeEngineRuntime,
  overrides: PrizeEngineRequestOverrides,
) => {
  const fetchImpl = overrides.fetchImpl ?? runtime.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Fetch is not available in this runtime.");
  }

  return fetchImpl;
};

const resolveEnvironment = (
  runtime: PrizeEngineRuntime,
  payloadEnvironment: SaaSEnvironment | undefined,
) => {
  const environment = payloadEnvironment ?? runtime.environment;
  if (!environment) {
    throw new Error(
      "Prize engine environment is required. Use either runtime.environment or payload.environment.",
    );
  }

  return environment;
};

const resolveIdempotencyKey = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveAgentId = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > 128) {
    throw new RangeError(
      "Prize engine agent id must be 128 characters or fewer.",
    );
  }

  return trimmed;
};

export const createPrizeEngineIdempotencyKey = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `pe_reward_${globalThis.crypto.randomUUID()}`;
  }

  return `pe_reward_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;
};

export async function parsePrizeEngineResponse<T>(
  response: Response,
): Promise<PrizeEngineApiResult<T>> {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? fallbackError,
      requestId: payload?.requestId,
      traceId: payload?.traceId,
      status: response.status,
    };
  }

  return {
    ok: true,
    data: payload.data as T,
    requestId: payload?.requestId,
    traceId: payload?.traceId,
    status: response.status,
  };
}

export async function requestPrizeEngineApi<T>(
  runtime: PrizeEngineRuntime,
  path: string,
  init: RequestInit = {},
  overrides: PrizeEngineRequestOverrides = {},
) {
  const requestMethod = resolveRequestMethod(init.method);
  const retryOptions = resolveRetryOptions(runtime.retry, overrides.retry);
  const idempotencyKey = resolveIdempotencyKey(overrides.idempotencyKey);
  const agentId = resolveAgentId(overrides.agentId);
  const fetchImpl = resolveFetch(runtime, overrides);
  const random = runtime.random ?? Math.random;
  const sleep = runtime.sleep ?? sleepFor;

  const apiKey =
    overrides.apiKey !== undefined
      ? overrides.apiKey
      : runtime.getApiKey
        ? await runtime.getApiKey()
        : undefined;

  const inheritedHeaders =
    runtime.getHeaders !== undefined ? await runtime.getHeaders() : undefined;

  let attempt = 0;
  while (true) {
    attempt += 1;

    const headers = new Headers(init.headers ?? {});
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }

    for (const [key, value] of Object.entries(inheritedHeaders ?? {})) {
      headers.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides.headers ?? {})) {
      headers.set(key, value);
    }
    if (idempotencyKey) {
      headers.set("Idempotency-Key", idempotencyKey);
    }
    if (agentId) {
      headers.set(PRIZE_ENGINE_AGENT_ID_HEADER, agentId);
    }

    try {
      const response = await fetchImpl(
        `${trimTrailingSlash(overrides.baseUrl ?? runtime.baseUrl)}${path}`,
        {
          ...init,
          method: requestMethod,
          headers,
        },
      );

      const parsed = await parsePrizeEngineResponse<T>(response);
      if (
        !retryOptions ||
        !shouldRetryResponse({
          attempt,
          method: requestMethod,
          response,
          retryOptions,
          idempotencyKey,
        })
      ) {
        return parsed;
      }

      const delayMs = calculateRetryDelayMs({
        attempt,
        response,
        options: retryOptions,
        random,
      });
      await sleep(delayMs);
    } catch (error) {
      if (
        !retryOptions ||
        !shouldRetryError({
          attempt,
          method: requestMethod,
          retryOptions,
          idempotencyKey,
        })
      ) {
        throw error;
      }

      const delayMs = calculateRetryDelayMs({
        attempt,
        response: null,
        options: retryOptions,
        random,
      });
      await sleep(delayMs);
    }
  }
}

export function createPrizeEngineClient(runtime: PrizeEngineRuntime) {
  const request = <T>(
    path: string,
    init: RequestInit = {},
    overrides: PrizeEngineRequestOverrides = {},
  ) => requestPrizeEngineApi<T>(runtime, path, init, overrides);

  const observability = {
    distribution(
      query: PrizeEngineObservabilityDistributionInput = {},
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      const environment = resolveEnvironment(runtime, undefined);
      return request<PrizeEngineProjectObservability>(
        `${PRIZE_ENGINE_API_ROUTES.observabilityDistribution}${toSearch({
          environment,
          days: query.days,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
  };

  return {
    request,
    getOverview(overrides: PrizeEngineRequestOverrides = {}) {
      const environment = resolveEnvironment(runtime, undefined);
      return request<PrizeEngineOverview>(
        `${PRIZE_ENGINE_API_ROUTES.overview}${toSearch({
          environment,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getFairnessCommit(overrides: PrizeEngineRequestOverrides = {}) {
      const environment = resolveEnvironment(runtime, undefined);
      return request<{
        epoch: number;
        epochSeconds: number;
        commitHash: string;
      }>(
        `${PRIZE_ENGINE_API_ROUTES.fairnessCommit}${toSearch({
          environment,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    revealFairnessSeed(
      epoch: number,
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      const environment = resolveEnvironment(runtime, undefined);
      return request<{
        epoch: number;
        epochSeconds: number;
        commitHash: string;
        seed: string;
        revealedAt: string | Date;
      }>(
        `${PRIZE_ENGINE_API_ROUTES.fairnessReveal}${toSearch({
          environment,
          epoch,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    async reward(
      payload: PrizeEngineRewardRequest,
      overrides: PrizeEngineRequestOverrides = {},
    ): Promise<PrizeEngineApiResult<PrizeEngineRewardResponse>> {
      const normalizedPayload = PrizeEngineRewardRequestSchema.parse({
        ...payload,
        environment: resolveEnvironment(runtime, payload.environment),
      });
      const idempotencyKey =
        resolveIdempotencyKey(overrides.idempotencyKey) ??
        resolveIdempotencyKey(normalizedPayload.idempotencyKey);
      if (!idempotencyKey) {
        throw new Error("Prize engine reward requests require idempotencyKey.");
      }
      const requestPayload = {
        ...normalizedPayload,
        idempotencyKey,
      } satisfies PrizeEngineRewardRequest;
      const requestSignature = buildRewardRequestSignature(requestPayload);
      const rewardAgentId =
        overrides.agentId !== undefined
          ? overrides.agentId
          : requestPayload.agent.agentId;

      return request<PrizeEngineRewardResponse>(
        PRIZE_ENGINE_API_ROUTES.rewards,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Prize-Engine-Request-Signature": requestSignature,
            "X-Prize-Engine-Behavior-Template":
              requestPayload.behavior.actionType,
            ...(requestPayload.agent.groupId
              ? {
                  "X-Prize-Engine-Correlation-Group":
                    requestPayload.agent.groupId,
                }
              : {}),
          },
          body: JSON.stringify(requestPayload),
        },
        {
          ...overrides,
          agentId: rewardAgentId,
          idempotencyKey,
        },
      );
    },
    /**
     * @deprecated Use `client.reward()` so agent/behavior context, idempotency,
     * and retry semantics stay aligned.
     */
    draw(
      payload: PrizeEngineDrawRequest,
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      const normalizedPayload = PrizeEngineDrawRequestSchema.parse({
        ...payload,
        environment: resolveEnvironment(runtime, payload.environment),
      });
      const agentId =
        overrides.agentId !== undefined
          ? overrides.agentId
          : normalizedPayload.rewardContext?.agent.agentId;
      const idempotencyKey =
        resolveIdempotencyKey(overrides.idempotencyKey) ??
        resolveIdempotencyKey(normalizedPayload.idempotencyKey);

      return request<PrizeEngineDrawResponse>(
        PRIZE_ENGINE_API_ROUTES.draws,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizedPayload),
        },
        {
          ...overrides,
          agentId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      );
    },
    getLedger(
      playerId: string,
      limit = 50,
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      const environment = resolveEnvironment(runtime, undefined);
      return request<PrizeEngineLedgerResponse>(
        `${PRIZE_ENGINE_API_ROUTES.ledger}${toSearch({
          environment,
          playerId,
          limit,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    observability,
    /**
     * @deprecated Use `client.observability.distribution()` instead.
     */
    getObservabilityDistribution(
      query: PrizeEngineObservabilityDistributionInput = {},
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      return observability.distribution(query, overrides);
    },
  };
}

export type PrizeEngineClient = ReturnType<typeof createPrizeEngineClient>;
