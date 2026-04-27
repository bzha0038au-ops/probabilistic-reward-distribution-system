export const PRIZE_ENGINE_API_ROUTES = {
    overview: "/v1/engine/overview",
    fairnessCommit: "/v1/engine/fairness/commit",
    fairnessReveal: "/v1/engine/fairness/reveal",
    draws: "/v1/engine/draws",
    ledger: "/v1/engine/ledger",
};
const fallbackError = { message: "Request failed." };
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
    const headers = new Headers(init.headers ?? {});
    const apiKey = overrides.apiKey !== undefined
        ? overrides.apiKey
        : runtime.getApiKey
            ? await runtime.getApiKey()
            : undefined;
    if (apiKey) {
        headers.set("Authorization", `Bearer ${apiKey}`);
    }
    const inheritedHeaders = runtime.getHeaders !== undefined ? await runtime.getHeaders() : undefined;
    for (const [key, value] of Object.entries(inheritedHeaders ?? {})) {
        headers.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides.headers ?? {})) {
        headers.set(key, value);
    }
    const response = await (overrides.fetchImpl ?? runtime.fetchImpl ?? fetch)(`${trimTrailingSlash(overrides.baseUrl ?? runtime.baseUrl)}${path}`, {
        ...init,
        headers,
    });
    return parsePrizeEngineResponse(response);
}
export function createPrizeEngineClient(runtime) {
    const request = (path, init = {}, overrides = {}) => requestPrizeEngineApi(runtime, path, init, overrides);
    return {
        request,
        getOverview(overrides = {}) {
            return request(PRIZE_ENGINE_API_ROUTES.overview, { cache: "no-store" }, overrides);
        },
        getFairnessCommit(overrides = {}) {
            return request(PRIZE_ENGINE_API_ROUTES.fairnessCommit, { cache: "no-store" }, overrides);
        },
        revealFairnessSeed(epoch, overrides = {}) {
            return request(`${PRIZE_ENGINE_API_ROUTES.fairnessReveal}${toSearch({ epoch })}`, { cache: "no-store" }, overrides);
        },
        draw(payload, overrides = {}) {
            return request(PRIZE_ENGINE_API_ROUTES.draws, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, overrides);
        },
        getLedger(playerId, limit = 50, overrides = {}) {
            return request(`${PRIZE_ENGINE_API_ROUTES.ledger}${toSearch({ playerId, limit })}`, { cache: "no-store" }, overrides);
        },
    };
}
