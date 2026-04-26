import type {
  ApiError,
  ApiResponse,
  AuthCredentials,
  DrawRequest,
  DrawResult,
  RegisterRequest,
  RegisterResponse,
  UserSessionResponse,
  WalletBalanceResponse,
} from '@reward/shared-types';

export type ApiResult<T> = ApiResponse<T>;

export const USER_API_ROUTES = {
  auth: {
    register: '/auth/register',
    session: '/auth/user/session',
  },
  wallet: '/wallet',
  draw: '/draw',
} as const;

export type SupportedUserPlatform = 'web' | 'ios' | 'android';

export const LOCAL_API_BASE_URLS: Record<SupportedUserPlatform, string> = {
  web: 'http://localhost:4000',
  ios: 'http://127.0.0.1:4000',
  android: 'http://10.0.2.2:4000',
};

const fallbackError: ApiError = { message: 'Request failed.' };

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const resolveLocalApiBaseUrl = (platform: SupportedUserPlatform) =>
  LOCAL_API_BASE_URLS[platform];

export const parseApiResponse = async <T>(
  response: Response
): Promise<ApiResult<T>> => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? fallbackError,
      requestId: payload?.requestId,
    };
  }

  return {
    ok: true,
    data: payload.data as T,
    requestId: payload?.requestId,
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
    headers.set('x-locale', locale);
  }

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
    ...init,
    headers,
  });

  return parseApiResponse<T>(response);
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
    overrides: UserApiOverrides = {}
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        { auth: false }
      );
    },
    createSession(payload: AuthCredentials) {
      return request<UserSessionResponse>(
        USER_API_ROUTES.auth.session,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        },
        { auth: false }
      );
    },
    getWalletBalance() {
      return request<WalletBalanceResponse>(USER_API_ROUTES.wallet);
    },
    runDraw(payload: DrawRequest = {}) {
      return request<DrawResult>(
        USER_API_ROUTES.draw,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    },
  };
}
