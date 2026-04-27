import { env } from "$env/dynamic/private"
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
} from "$lib/server/admin-session"
import { LOCALE_COOKIE } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import type { ApiResponse } from "@reward/shared-types/api"

const defaultBaseUrl = "http://localhost:4000"

export const getApiBaseUrl = () =>
  env.API_BASE_URL || env.PUBLIC_API_BASE_URL || defaultBaseUrl

const getAdminOrigin = () =>
  env.ADMIN_BASE_URL || env.PUBLIC_ADMIN_BASE_URL || "http://localhost:5173"

export async function apiFetch(
  fetcher: typeof fetch,
  cookies: { get: (key: string) => string | undefined },
  path: string,
  init: RequestInit = {},
) {
  const baseUrl = getApiBaseUrl()
  const token = cookies.get(ADMIN_SESSION_COOKIE)
  const csrfToken = cookies.get(ADMIN_CSRF_COOKIE)
  const locale = cookies.get(LOCALE_COOKIE)
  const headers = new Headers(init.headers ?? {})

  const cookieParts: string[] = []
  if (token) cookieParts.push(`${ADMIN_SESSION_COOKIE}=${token}`)
  if (csrfToken) cookieParts.push(`${ADMIN_CSRF_COOKIE}=${csrfToken}`)
  if (cookieParts.length > 0) {
    headers.set("cookie", cookieParts.join("; "))
  }
  if (csrfToken) {
    headers.set("x-csrf-token", csrfToken)
  }
  headers.set("origin", getAdminOrigin())
  if (locale) {
    headers.set("x-locale", locale)
  }

  return fetcher(`${baseUrl}${path}`, {
    ...init,
    headers,
  })
}

export type ApiResult<T> = ApiResponse<T> & { status: number }

export async function apiRequest<T>(
  fetcher: typeof fetch,
  cookies: { get: (key: string) => string | undefined },
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  let response: Response

  try {
    response = await apiFetch(fetcher, cookies, path, init)
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "backend_api_network_failure",
      },
      extra: {
        backendPath: path,
      },
    })
    throw error
  }

  const payload = await response.json().catch(() => ({}))
  const traceId =
    payload?.traceId ?? response.headers.get("x-trace-id") ?? undefined

  if (!response.ok || !payload?.ok) {
    if (response.status >= 500) {
      captureAdminServerException(
        new Error(
          payload?.error?.message ?? `Backend request failed for ${path}`,
        ),
        {
          tags: {
            kind: "backend_api_failure",
            status_code: response.status,
          },
          extra: {
            backendPath: path,
            requestId: payload?.requestId,
            traceId,
          },
        },
      )
    }

    return {
      ok: false,
      error: payload?.error ?? { message: "Request failed." },
      requestId: payload?.requestId,
      traceId,
      status: response.status,
    }
  }

  return {
    ok: true,
    data: payload.data as T,
    requestId: payload?.requestId,
    traceId,
    status: response.status,
  }
}
