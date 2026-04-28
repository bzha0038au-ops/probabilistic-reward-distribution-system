import { getServerLocale } from '@/lib/i18n/server';
import { normalizeBackendPath } from '@/lib/api/proxy';
import { getBackendAccessToken } from '@/lib/auth/server-token';
import { requestUserApi, type ApiResult } from '@/lib/api/user';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

const withTrailingSlash = (value: string) =>
  value.endsWith('/') ? value : `${value}/`;

export const buildBackendUrl = (path: string, baseUrl = API_BASE_URL) =>
  new URL(normalizeBackendPath(path).slice(1), withTrailingSlash(baseUrl)).toString();

export async function apiRequestServer<T>(
  path: string,
  init: RequestInit = {},
  options: { baseUrl?: string; locale?: string; auth?: boolean } = {}
): Promise<ApiResult<T>> {
  const locale = options.locale ?? (await getServerLocale());
  const authToken =
    options.auth === false ? null : await getBackendAccessToken();

  return requestUserApi<T>({
    path: normalizeBackendPath(path),
    init,
    baseUrl: options.baseUrl ?? API_BASE_URL,
    locale,
    authToken,
  });
}
