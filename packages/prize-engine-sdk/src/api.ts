import type { ApiError, ApiResponse } from "@reward/shared-types/api";
import type {
  PrizeEngineDrawRequest,
  PrizeEngineDrawResponse,
  PrizeEngineLedgerEntry,
  PrizeEngineOverview,
  SaasPlayer,
} from "@reward/shared-types/saas";

export type PrizeEngineApiResult<T> = ApiResponse<T>;

export const PRIZE_ENGINE_API_ROUTES = {
  overview: "/v1/engine/overview",
  fairnessCommit: "/v1/engine/fairness/commit",
  fairnessReveal: "/v1/engine/fairness/reveal",
  draws: "/v1/engine/draws",
  ledger: "/v1/engine/ledger",
} as const;

type AsyncValue<T> = T | Promise<T>;

export type PrizeEngineRuntime = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getApiKey?: () => AsyncValue<string | null | undefined>;
  getHeaders?: () => AsyncValue<Record<string, string> | undefined>;
};

export type PrizeEngineRequestOverrides = {
  baseUrl?: string;
  apiKey?: string | null;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

const fallbackError: ApiError = { message: "Request failed." };

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
  const headers = new Headers(init.headers ?? {});
  const apiKey =
    overrides.apiKey !== undefined
      ? overrides.apiKey
      : runtime.getApiKey
        ? await runtime.getApiKey()
        : undefined;

  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  const inheritedHeaders =
    runtime.getHeaders !== undefined ? await runtime.getHeaders() : undefined;
  for (const [key, value] of Object.entries(inheritedHeaders ?? {})) {
    headers.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides.headers ?? {})) {
    headers.set(key, value);
  }

  const response = await (overrides.fetchImpl ?? runtime.fetchImpl ?? fetch)(
    `${trimTrailingSlash(overrides.baseUrl ?? runtime.baseUrl)}${path}`,
    {
      ...init,
      headers,
    },
  );

  return parsePrizeEngineResponse<T>(response);
}

export function createPrizeEngineClient(runtime: PrizeEngineRuntime) {
  const request = <T>(
    path: string,
    init: RequestInit = {},
    overrides: PrizeEngineRequestOverrides = {},
  ) => requestPrizeEngineApi<T>(runtime, path, init, overrides);

  return {
    request,
    getOverview(overrides: PrizeEngineRequestOverrides = {}) {
      return request<PrizeEngineOverview>(
        PRIZE_ENGINE_API_ROUTES.overview,
        { cache: "no-store" },
        overrides,
      );
    },
    getFairnessCommit(overrides: PrizeEngineRequestOverrides = {}) {
      return request<{
        epoch: number;
        epochSeconds: number;
        commitHash: string;
      }>(
        PRIZE_ENGINE_API_ROUTES.fairnessCommit,
        { cache: "no-store" },
        overrides,
      );
    },
    revealFairnessSeed(
      epoch: number,
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      return request<{
        epoch: number;
        epochSeconds: number;
        commitHash: string;
        seed: string;
        revealedAt: string | Date;
      }>(
        `${PRIZE_ENGINE_API_ROUTES.fairnessReveal}${toSearch({ epoch })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    draw(
      payload: PrizeEngineDrawRequest,
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      return request<PrizeEngineDrawResponse>(
        PRIZE_ENGINE_API_ROUTES.draws,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        overrides,
      );
    },
    getLedger(
      playerId: string,
      limit = 50,
      overrides: PrizeEngineRequestOverrides = {},
    ) {
      return request<{ player: SaasPlayer; entries: PrizeEngineLedgerEntry[] }>(
        `${PRIZE_ENGINE_API_ROUTES.ledger}${toSearch({ playerId, limit })}`,
        { cache: "no-store" },
        overrides,
      );
    },
  };
}
