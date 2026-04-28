import { normalizeBackendPath } from "@/lib/api/proxy";
import { getBackendAccessToken } from "@/lib/auth/server-token";
import { parseApiResponse, type ApiResult } from "@/lib/api/user";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

const withTrailingSlash = (value: string) =>
  value.endsWith("/") ? value : `${value}/`;

export const buildBackendUrl = (path: string, baseUrl = API_BASE_URL) =>
  new URL(
    normalizeBackendPath(path).slice(1),
    withTrailingSlash(baseUrl),
  ).toString();

export async function apiRequestServer<T>(
  path: string,
  init: RequestInit = {},
  options: { baseUrl?: string; auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});
  const authToken =
    options.auth === false ? null : await getBackendAccessToken();

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(buildBackendUrl(path, options.baseUrl), {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });

  return parseApiResponse<T>(response);
}
