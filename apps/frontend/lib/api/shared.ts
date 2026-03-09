import type { ApiError, ApiResponse } from '@reward/shared-types';

export type ApiResult<T> = ApiResponse<T>;

const fallbackError: ApiError = { message: 'Request failed.' };

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
