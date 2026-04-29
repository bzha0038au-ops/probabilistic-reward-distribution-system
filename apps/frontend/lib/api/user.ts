import {
  USER_API_ROUTES,
  createUserApiClient,
  parseApiResponse,
  requestUserApi as requestSharedUserApi,
  type ApiResult,
  type UserApiOverrides,
  type UserApiRequestOptions,
  type UserApiRuntime,
} from "@reward/user-core";

export {
  createUserApiClient,
  parseApiResponse,
  USER_API_ROUTES,
  type ApiResult,
  type UserApiOverrides,
  type UserApiRequestOptions,
  type UserApiRuntime,
};

export async function requestUserApi<T>(
  options: UserApiRequestOptions,
): Promise<ApiResult<T>> {
  const result = await requestSharedUserApi<T>(options);

  if (!result.ok && typeof window !== "undefined") {
    const { captureFrontendApiFailure } =
      await import("@/lib/observability/client");
    captureFrontendApiFailure({
      path: options.path,
      status: result.status,
      requestId: result.requestId,
      traceId: result.traceId,
      message: result.error.message,
    });
  }

  return result;
}
