export type ApiError = {
  message: string;
  code?: string;
  details?: string[];
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
  requestId?: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

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
