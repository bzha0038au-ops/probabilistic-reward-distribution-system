import { getClientLocale } from '@/lib/i18n/client';

import { parseApiResponse, type ApiResult } from './shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function apiRequestClient<T>(
  path: string,
  init: RequestInit = {},
  options: { baseUrl?: string; locale?: string } = {}
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});
  const locale = options.locale ?? getClientLocale();
  if (locale) headers.set('x-locale', locale);

  const response = await fetch(`${options.baseUrl ?? API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  return parseApiResponse<T>(response);
}
