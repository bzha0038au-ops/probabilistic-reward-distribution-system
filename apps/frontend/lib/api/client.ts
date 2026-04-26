import { getClientLocale } from '@/lib/i18n/client';
import { BFF_BASE_PATH, normalizeBackendPath } from '@/lib/api/proxy';
import { requestUserApi, type ApiResult } from '@/lib/api/user';

export async function apiRequestClient<T>(
  path: string,
  init: RequestInit = {},
  options: { locale?: string } = {}
): Promise<ApiResult<T>> {
  const locale = options.locale ?? getClientLocale();

  return requestUserApi<T>({
    path: normalizeBackendPath(path),
    init,
    baseUrl: BFF_BASE_PATH,
    locale,
  });
}
