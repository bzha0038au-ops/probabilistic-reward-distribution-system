import { env } from '$env/dynamic/private';
import { ADMIN_SESSION_COOKIE } from '$lib/server/admin-session';
import { LOCALE_COOKIE } from '$lib/i18n';

const defaultBaseUrl = 'http://localhost:4000';

export const getApiBaseUrl = () =>
  env.API_BASE_URL || env.PUBLIC_API_BASE_URL || defaultBaseUrl;

export async function apiFetch(
  fetcher: typeof fetch,
  cookies: { get: (key: string) => string | undefined },
  path: string,
  init: RequestInit = {}
) {
  const baseUrl = getApiBaseUrl();
  const token = cookies.get(ADMIN_SESSION_COOKIE);
  const locale = cookies.get(LOCALE_COOKIE);
  const headers = new Headers(init.headers ?? {});

  if (token) {
    headers.set('cookie', `${ADMIN_SESSION_COOKIE}=${token}`);
  }
  if (locale) {
    headers.set('x-locale', locale);
  }

  return fetcher(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
}

export type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string; code?: string; details?: string[] };
  requestId?: string;
  status: number;
};

export async function apiRequest<T>(
  fetcher: typeof fetch,
  cookies: { get: (key: string) => string | undefined },
  path: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const response = await apiFetch(fetcher, cookies, path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? { message: 'Request failed.' },
      requestId: payload?.requestId,
      status: response.status,
    };
  }

  return {
    ok: true,
    data: payload.data as T,
    requestId: payload?.requestId,
    status: response.status,
  };
}
