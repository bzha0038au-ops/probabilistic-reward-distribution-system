import type { ApiError, ApiResponse } from "@reward/shared-types/api";

export type ApiResult<T> = ApiResponse<T>;

export const USER_API_ROUTES = {
  auth: {
    session: "/auth/user/session",
  },
} as const;

const fallbackError: ApiError = { message: "Request failed." };

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
