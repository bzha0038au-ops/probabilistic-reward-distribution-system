import { PrizeEngineDrawRequestSchema, PrizeEngineRewardRequestSchema, } from "@reward/shared-types/saas";
export const PRIZE_ENGINE_API_ROUTES = {
    overview: "/v1/engine/overview",
    fairnessCommit: "/v1/engine/fairness/commit",
    fairnessReveal: "/v1/engine/fairness/reveal",
    observabilityDistribution: "/v1/engine/observability/distribution",
    rewards: "/v1/engine/rewards",
    draws: "/v1/engine/draws",
    ledger: "/v1/engine/ledger",
};
export const PRIZE_ENGINE_AGENT_ID_HEADER = "X-Agent-Id";
const fallbackError = { message: "Request failed." };
const DEFAULT_RETRY_OPTIONS = {
    maxAttempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 2500,
    jitterRatio: 0.2,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    respectRetryAfter: true,
};
const trimTrailingSlash = (value) => value.replace(/\/+$/, "");
const toSearch = (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "")
            continue;
        search.set(key, String(value));
    }
    const output = search.toString();
    return output ? `?${output}` : "";
};
const sleepFor = (delayMs) => new Promise((resolve) => {
    setTimeout(resolve, delayMs);
});
const resolveRetryOptions = (runtimeRetry, overrideRetry) => {
    if (overrideRetry === false) {
        return false;
    }
    if (runtimeRetry === false && overrideRetry === undefined) {
        return false;
    }
    const runtimeRetryOptions = typeof runtimeRetry === "object" ? runtimeRetry : undefined;
    const overrideRetryOptions = typeof overrideRetry === "object" ? overrideRetry : undefined;
    return {
        ...DEFAULT_RETRY_OPTIONS,
        ...runtimeRetryOptions,
        ...overrideRetryOptions,
    };
};
const resolveRequestMethod = (method) => (method ?? "GET").toUpperCase();
const isSafeMethod = (method) => method === "GET" || method === "HEAD" || method === "OPTIONS";
const canRetryRequest = (method, idempotencyKey) => isSafeMethod(method) || Boolean(idempotencyKey);
const parseRetryAfterMs = (value) => {
    if (!value) {
        return null;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    const parsedAt = Date.parse(value);
    if (Number.isNaN(parsedAt)) {
        return null;
    }
    return Math.max(parsedAt - Date.now(), 0);
};
const calculateRetryDelayMs = (params) => {
    const { attempt, response, options, random } = params;
    const retryAfterMs = options.respectRetryAfter && response
        ? parseRetryAfterMs(response.headers.get("Retry-After"))
        : null;
    if (retryAfterMs !== null) {
        return Math.min(Math.max(retryAfterMs, 0), options.maxDelayMs);
    }
    const exponentialDelay = Math.min(options.baseDelayMs * Math.pow(2, Math.max(attempt - 1, 0)), options.maxDelayMs);
    const jitterWindow = exponentialDelay * options.jitterRatio;
    const jitterOffset = jitterWindow > 0 ? (random() * 2 - 1) * jitterWindow : 0;
    return Math.max(Math.min(exponentialDelay + jitterOffset, options.maxDelayMs), 0);
};
const shouldRetryResponse = (params) => {
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
const shouldRetryError = (params) => {
    const { attempt, method, retryOptions, idempotencyKey } = params;
    if (!retryOptions) {
        return false;
    }
    if (attempt >= retryOptions.maxAttempts) {
        return false;
    }
    return canRetryRequest(method, idempotencyKey);
};
const stableStringify = (value) => {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
        .join(",")}}`;
};
const hashText = (value) => {
    let hash = 0x811c9dc5;
    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
};
const buildRewardRequestSignature = (payload) => `rw-${hashText(stableStringify({
    environment: payload.environment ?? null,
    agent: payload.agent,
    behavior: payload.behavior,
    riskEnvelope: payload.riskEnvelope ?? null,
    budget: payload.budget ?? null,
    clientNonce: payload.clientNonce ?? null,
}))}`;
const resolveFetch = (runtime, overrides) => {
    const fetchImpl = overrides.fetchImpl ?? runtime.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error("Fetch is not available in this runtime.");
    }
    return fetchImpl;
};
const resolveEnvironment = (runtime, payloadEnvironment) => {
    const environment = payloadEnvironment ?? runtime.environment;
    if (!environment) {
        throw new Error("Prize engine environment is required. Use either runtime.environment or payload.environment.");
    }
    return environment;
};
const resolveIdempotencyKey = (value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
};
const resolveAgentId = (value) => {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    if (trimmed.length > 128) {
        throw new RangeError("Prize engine agent id must be 128 characters or fewer.");
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
export async function parsePrizeEngineResponse(response) {
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
        data: payload.data,
        requestId: payload?.requestId,
        traceId: payload?.traceId,
        status: response.status,
    };
}
export async function requestPrizeEngineApi(runtime, path, init = {}, overrides = {}) {
    const requestMethod = resolveRequestMethod(init.method);
    const retryOptions = resolveRetryOptions(runtime.retry, overrides.retry);
    const idempotencyKey = resolveIdempotencyKey(overrides.idempotencyKey);
    const agentId = resolveAgentId(overrides.agentId);
    const fetchImpl = resolveFetch(runtime, overrides);
    const random = runtime.random ?? Math.random;
    const sleep = runtime.sleep ?? sleepFor;
    const apiKey = overrides.apiKey !== undefined
        ? overrides.apiKey
        : runtime.getApiKey
            ? await runtime.getApiKey()
            : undefined;
    const inheritedHeaders = runtime.getHeaders !== undefined ? await runtime.getHeaders() : undefined;
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
            const response = await fetchImpl(`${trimTrailingSlash(overrides.baseUrl ?? runtime.baseUrl)}${path}`, {
                ...init,
                method: requestMethod,
                headers,
            });
            const parsed = await parsePrizeEngineResponse(response);
            if (!retryOptions ||
                !shouldRetryResponse({
                    attempt,
                    method: requestMethod,
                    response,
                    retryOptions,
                    idempotencyKey,
                })) {
                return parsed;
            }
            const delayMs = calculateRetryDelayMs({
                attempt,
                response,
                options: retryOptions,
                random,
            });
            await sleep(delayMs);
        }
        catch (error) {
            if (!retryOptions ||
                !shouldRetryError({
                    attempt,
                    method: requestMethod,
                    retryOptions,
                    idempotencyKey,
                })) {
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
export function createPrizeEngineClient(runtime) {
    const request = (path, init = {}, overrides = {}) => requestPrizeEngineApi(runtime, path, init, overrides);
    const observability = {
        distribution(query = {}, overrides = {}) {
            const environment = resolveEnvironment(runtime, undefined);
            return request(`${PRIZE_ENGINE_API_ROUTES.observabilityDistribution}${toSearch({
                environment,
                days: query.days,
            })}`, { cache: "no-store" }, overrides);
        },
    };
    return {
        request,
        getOverview(overrides = {}) {
            const environment = resolveEnvironment(runtime, undefined);
            return request(`${PRIZE_ENGINE_API_ROUTES.overview}${toSearch({
                environment,
            })}`, { cache: "no-store" }, overrides);
        },
        getFairnessCommit(overrides = {}) {
            const environment = resolveEnvironment(runtime, undefined);
            return request(`${PRIZE_ENGINE_API_ROUTES.fairnessCommit}${toSearch({
                environment,
            })}`, { cache: "no-store" }, overrides);
        },
        revealFairnessSeed(epoch, overrides = {}) {
            const environment = resolveEnvironment(runtime, undefined);
            return request(`${PRIZE_ENGINE_API_ROUTES.fairnessReveal}${toSearch({
                environment,
                epoch,
            })}`, { cache: "no-store" }, overrides);
        },
        async reward(payload, overrides = {}) {
            const normalizedPayload = PrizeEngineRewardRequestSchema.parse({
                ...payload,
                environment: resolveEnvironment(runtime, payload.environment),
            });
            const idempotencyKey = resolveIdempotencyKey(overrides.idempotencyKey) ??
                resolveIdempotencyKey(normalizedPayload.idempotencyKey);
            if (!idempotencyKey) {
                throw new Error("Prize engine reward requests require idempotencyKey.");
            }
            const requestPayload = {
                ...normalizedPayload,
                idempotencyKey,
            };
            const requestSignature = buildRewardRequestSignature(requestPayload);
            const rewardAgentId = overrides.agentId !== undefined
                ? overrides.agentId
                : requestPayload.agent.agentId;
            return request(PRIZE_ENGINE_API_ROUTES.rewards, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Prize-Engine-Request-Signature": requestSignature,
                    "X-Prize-Engine-Behavior-Template": requestPayload.behavior.actionType,
                    ...(requestPayload.agent.groupId
                        ? {
                            "X-Prize-Engine-Correlation-Group": requestPayload.agent.groupId,
                        }
                        : {}),
                },
                body: JSON.stringify(requestPayload),
            }, {
                ...overrides,
                agentId: rewardAgentId,
                idempotencyKey,
            });
        },
        /**
         * @deprecated Use `client.reward()` so agent/behavior context, idempotency,
         * and retry semantics stay aligned.
         */
        draw(payload, overrides = {}) {
            const normalizedPayload = PrizeEngineDrawRequestSchema.parse({
                ...payload,
                environment: resolveEnvironment(runtime, payload.environment),
            });
            const agentId = overrides.agentId !== undefined
                ? overrides.agentId
                : normalizedPayload.rewardContext?.agent.agentId;
            const idempotencyKey = resolveIdempotencyKey(overrides.idempotencyKey) ??
                resolveIdempotencyKey(normalizedPayload.idempotencyKey);
            return request(PRIZE_ENGINE_API_ROUTES.draws, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(normalizedPayload),
            }, {
                ...overrides,
                agentId,
                ...(idempotencyKey ? { idempotencyKey } : {}),
            });
        },
        getLedger(playerId, limit = 50, overrides = {}) {
            const environment = resolveEnvironment(runtime, undefined);
            return request(`${PRIZE_ENGINE_API_ROUTES.ledger}${toSearch({
                environment,
                playerId,
                limit,
            })}`, { cache: "no-store" }, overrides);
        },
        observability,
        /**
         * @deprecated Use `client.observability.distribution()` instead.
         */
        getObservabilityDistribution(query = {}, overrides = {}) {
            return observability.distribution(query, overrides);
        },
    };
}
