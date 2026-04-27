import type { ApiError, ApiResponse } from "@reward/shared-types/api";
import type {
  AuthCredentials,
  RegisterRequest,
  RegisterResponse,
  UserSessionResponse,
} from "@reward/shared-types/auth";
import type {
  BlackjackActionRequest,
  BlackjackMutationResponse,
  BlackjackOverviewResponse,
  BlackjackStartRequest,
} from "@reward/shared-types/blackjack";
import type {
  DrawCatalogResponse,
  DrawPlayRequest,
  DrawPlayResponse,
  DrawRequest,
  DrawOverviewResponse,
  DrawResult,
} from "@reward/shared-types/draw";
import type {
  QuickEightRequest,
  QuickEightRound,
} from "@reward/shared-types/quick-eight";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

export type ApiResult<T> = ApiResponse<T>;

export const USER_API_ROUTES = {
  auth: {
    register: "/auth/register",
    session: "/auth/user/session",
  },
  wallet: "/wallet",
  blackjack: "/blackjack",
  blackjackStart: "/blackjack/start",
  draw: "/draw",
  quickEight: "/quick-eight",
  drawCatalog: "/draw/catalog",
  drawOverview: "/draw/overview",
  drawPlay: "/draw/play",
} as const;

const fallbackError: ApiError = { message: "Request failed." };

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const parseApiResponse = async <T>(
  response: Response,
): Promise<ApiResult<T>> => {
  const payload = await response.json().catch(() => ({}));
  const traceId =
    payload?.traceId ?? response.headers.get("x-trace-id") ?? undefined;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? fallbackError,
      requestId: payload?.requestId,
      traceId,
      status: response.status,
    };
  }

  return {
    ok: true,
    data: payload.data as T,
    requestId: payload?.requestId,
    traceId,
    status: response.status,
  };
};

export type UserApiRequestOptions = {
  path: string;
  baseUrl: string;
  init?: RequestInit;
  locale?: string | null;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
};

export async function requestUserApi<T>({
  path,
  baseUrl,
  init = {},
  locale,
  authToken,
  fetchImpl = fetch,
}: UserApiRequestOptions): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});

  if (locale) {
    headers.set("x-locale", locale);
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;

  try {
    response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (typeof window !== "undefined") {
      const { captureFrontendApiFailure } =
        await import("@/lib/observability/client");
      captureFrontendApiFailure({
        path,
        message:
          error instanceof Error ? error.message : "Network request failed.",
      });
    }
    throw error;
  }

  const parsed = await parseApiResponse<T>(response);

  if (!parsed.ok && typeof window !== "undefined") {
    const { captureFrontendApiFailure } =
      await import("@/lib/observability/client");
    captureFrontendApiFailure({
      path,
      status: parsed.status,
      requestId: parsed.requestId,
      traceId: parsed.traceId,
      message: parsed.error.message,
    });
  }

  return parsed;
}

type AsyncValue<T> = T | Promise<T>;

export type UserApiRuntime = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getLocale?: () => AsyncValue<string | null | undefined>;
  getAuthToken?: () => AsyncValue<string | null | undefined>;
};

export type UserApiOverrides = {
  baseUrl?: string;
  locale?: string | null;
  authToken?: string | null;
  auth?: boolean;
  fetchImpl?: typeof fetch;
};

export function createUserApiClient(runtime: UserApiRuntime) {
  const resolveLocale = async (overrides: UserApiOverrides) => {
    if (overrides.locale !== undefined) {
      return overrides.locale;
    }

    return runtime.getLocale ? await runtime.getLocale() : undefined;
  };

  const resolveAuthToken = async (overrides: UserApiOverrides) => {
    if (overrides.auth === false) {
      return null;
    }

    if (overrides.authToken !== undefined) {
      return overrides.authToken;
    }

    return runtime.getAuthToken ? await runtime.getAuthToken() : undefined;
  };

  const request = async <T>(
    path: string,
    init: RequestInit = {},
    overrides: UserApiOverrides = {},
  ) =>
    requestUserApi<T>({
      path,
      init,
      baseUrl: overrides.baseUrl ?? runtime.baseUrl,
      locale: await resolveLocale(overrides),
      authToken: await resolveAuthToken(overrides),
      fetchImpl: overrides.fetchImpl ?? runtime.fetchImpl,
    });

  return {
    request,
    register(payload: RegisterRequest) {
      return request<RegisterResponse>(
        USER_API_ROUTES.auth.register,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        { auth: false },
      );
    },
    createSession(payload: AuthCredentials) {
      return request<UserSessionResponse>(
        USER_API_ROUTES.auth.session,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        { auth: false },
      );
    },
    getWalletBalance() {
      return request<WalletBalanceResponse>(USER_API_ROUTES.wallet);
    },
    getBlackjackOverview() {
      return request<BlackjackOverviewResponse>(USER_API_ROUTES.blackjack, {
        cache: "no-store",
      });
    },
    startBlackjack(payload: BlackjackStartRequest) {
      return request<BlackjackMutationResponse>(
        USER_API_ROUTES.blackjackStart,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
    },
    actOnBlackjack(gameId: number, payload: BlackjackActionRequest) {
      return request<BlackjackMutationResponse>(
        `${USER_API_ROUTES.blackjack}/${gameId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
    },
    getDrawOverview() {
      return request<DrawOverviewResponse>(USER_API_ROUTES.drawOverview);
    },
    getDrawCatalog() {
      return request<DrawCatalogResponse>(USER_API_ROUTES.drawCatalog);
    },
    runDraw(payload: DrawRequest = {}) {
      return request<DrawResult>(USER_API_ROUTES.draw, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    playQuickEight(payload: QuickEightRequest) {
      return request<QuickEightRound>(USER_API_ROUTES.quickEight, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    playDraw(payload: DrawPlayRequest) {
      return request<DrawPlayResponse>(USER_API_ROUTES.drawPlay, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  };
}
