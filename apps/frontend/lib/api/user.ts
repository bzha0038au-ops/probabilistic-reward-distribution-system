import type { ApiError, ApiResponse } from "@reward/shared-types/api";
import type {
  AuthCredentials,
  CurrentUserSessionResponse,
  RegisterRequest,
  RegisterResponse,
  UserRealtimeTokenResponse,
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
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import type {
  HoldemCreateTableRequest,
  HoldemJoinTableRequest,
  HoldemPresenceResponse,
  HoldemSeatModeRequest,
  HoldemTableMessage,
  HoldemTableMessageRequest,
  HoldemTableMessagesResponse,
  HoldemTableActionRequest,
  HoldemTableResponse,
  HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import type {
  AcceptCurrentLegalDocumentsRequest,
  CurrentLegalAcceptanceState,
  CurrentLegalDocumentsResponse,
} from "@reward/shared-types/legal";
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
    realtimeToken: "/auth/user/realtime-token",
  },
  legal: {
    current: "/legal/current",
    acceptances: "/legal/acceptances",
  },
  communityThreads: "/community/threads",
  wallet: "/wallet",
  handHistory: "/hand-history",
  holdemTables: "/holdem/tables",
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
    getCurrentLegalDocuments(overrides: UserApiOverrides = {}) {
      return request<CurrentLegalDocumentsResponse>(
        USER_API_ROUTES.legal.current,
        { cache: "no-store" },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    acceptCurrentLegalDocuments(
      payload: AcceptCurrentLegalDocumentsRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<CurrentLegalAcceptanceState>(
        USER_API_ROUTES.legal.acceptances,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
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
    getCurrentSession(overrides: UserApiOverrides = {}) {
      return request<CurrentUserSessionResponse>(
        USER_API_ROUTES.auth.session,
        { cache: "no-store" },
        overrides,
      );
    },
    getUserRealtimeToken(overrides: UserApiOverrides = {}) {
      return request<UserRealtimeTokenResponse>(
        USER_API_ROUTES.auth.realtimeToken,
        { cache: "no-store" },
        overrides,
      );
    },
    getHandHistory(roundId: string) {
      return request<HandHistory>(
        `${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}`,
        {
          cache: "no-store",
        }
      );
    },
    getHandHistoryEvidenceBundle(roundId: string) {
      return request<HoldemSignedEvidenceBundle>(
        `${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}/evidence-bundle`,
        {
          cache: "no-store",
        },
      );
    },
    getBlackjackOverview() {
      return request<BlackjackOverviewResponse>(USER_API_ROUTES.blackjack, {
        cache: "no-store",
      });
    },
    getHoldemTables() {
      return request<HoldemTablesResponse>(USER_API_ROUTES.holdemTables, {
        cache: "no-store",
      });
    },
    getHoldemTable(tableId: number) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}`,
        {
          cache: "no-store",
        },
      );
    },
    getHoldemTableMessages(tableId: number) {
      return request<HoldemTableMessagesResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/messages`,
        {
          cache: "no-store",
        },
      );
    },
    touchHoldemTablePresence(tableId: number) {
      return request<HoldemPresenceResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/presence`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
    },
    setHoldemSeatMode(tableId: number, payload: HoldemSeatModeRequest) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/seat-mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
    },
    postHoldemTableMessage(
      tableId: number,
      payload: HoldemTableMessageRequest,
    ) {
      return request<HoldemTableMessage>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
    },
    createHoldemTable(payload: HoldemCreateTableRequest) {
      return request<HoldemTableResponse>(USER_API_ROUTES.holdemTables, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    },
    joinHoldemTable(tableId: number, payload: HoldemJoinTableRequest) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
    },
    leaveHoldemTable(tableId: number) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/leave`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
    },
    startHoldemTable(tableId: number) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/start`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
    },
    actOnHoldemTable(tableId: number, payload: HoldemTableActionRequest) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
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
