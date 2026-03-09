import { getServerLocale } from '@/lib/i18n/server';

import { parseApiResponse, type ApiResult } from './shared';

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

const getAuthSession = async () => {
  const { auth } = await import('@/lib/auth');
  return auth();
};

export async function apiRequestServer<T>(
  path: string,
  init: RequestInit = {},
  options: { baseUrl?: string; locale?: string; auth?: boolean } = {}
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});
  const locale = options.locale ?? getServerLocale();
  if (locale) headers.set('x-locale', locale);
  if (options.auth !== false) {
    const session = await getAuthSession();
    if (session?.backendToken) {
      headers.set('Authorization', `Bearer ${session.backendToken}`);
    }
  }

  const response = await fetch(`${options.baseUrl ?? API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  return parseApiResponse<T>(response);
}
