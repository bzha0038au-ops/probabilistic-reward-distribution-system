import { NextResponse, type NextRequest } from "next/server";
import {
  API_ERROR_CODES,
  normalizeApiErrorCode,
  type ApiErrorCode,
} from "@reward/shared-types/api";

import { buildBackendUrl } from "@/lib/api/server";
import { resolveBackendProxyRoute } from "@/lib/api/proxy";
import { clearFrontendAuthCookies } from "@/lib/auth/clear-auth-cookies";
import { getBackendAccessToken } from "@/lib/auth/server-token";
import { captureFrontendServerException } from "@/lib/observability/server";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    path: string[];
  };
};

const jsonError = (
  status: number,
  message: string,
  headers?: HeadersInit,
  code?: ApiErrorCode,
) =>
  NextResponse.json(
    {
      ok: false,
      error: {
        message,
        code:
          status >= 500 ? undefined : (code ?? normalizeApiErrorCode(message)),
      },
    },
    {
      status,
      headers,
    },
  );

const buildForwardHeaders = async (
  request: NextRequest,
  requiresAuth: boolean,
) => {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const traceId = request.headers.get("x-trace-id");

  if (contentType) headers.set("content-type", contentType);
  if (traceId) headers.set("x-trace-id", traceId);

  if (requiresAuth) {
    const backendToken = await getBackendAccessToken(request);
    if (!backendToken) {
      return null;
    }
    headers.set("Authorization", `Bearer ${backendToken}`);
  }

  return headers;
};

async function proxyRequest(request: NextRequest, { params }: RouteContext) {
  const backendPath = `/${params.path.join("/")}`;
  const route = resolveBackendProxyRoute(request.method, backendPath);

  if (!route.matched) {
    return jsonError(404, "Not found.", undefined, API_ERROR_CODES.NOT_FOUND);
  }

  if (!route.methodAllowed) {
    return jsonError(
      405,
      "Method not allowed.",
      {
        Allow: route.methods.join(", "),
      },
      API_ERROR_CODES.METHOD_NOT_ALLOWED,
    );
  }

  const headers = await buildForwardHeaders(request, route.requiresAuth);
  if (!headers) {
    return clearFrontendAuthCookies(
      jsonError(401, "Unauthorized", undefined, API_ERROR_CODES.UNAUTHORIZED),
    );
  }

  const upstreamUrl = new URL(buildBackendUrl(route.normalizedPath));
  upstreamUrl.search = new URL(request.url).search;

  try {
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    const traceId = response.headers.get("x-trace-id");
    const requestId = response.headers.get("x-request");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }
    if (traceId) {
      responseHeaders.set("x-trace-id", traceId);
    }
    if (requestId) {
      responseHeaders.set("x-request", requestId);
    }
    responseHeaders.set("cache-control", "no-store");

    const proxiedResponse = new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
    if (route.requiresAuth && response.status === 401) {
      clearFrontendAuthCookies(proxiedResponse);
    }

    return proxiedResponse;
  } catch (error) {
    captureFrontendServerException(error, {
      tags: {
        kind: "backend_proxy_failure",
      },
      extra: {
        backendPath: route.normalizedPath,
        method: request.method,
      },
    });
    return jsonError(
      502,
      "Backend request failed.",
      undefined,
      API_ERROR_CODES.BACKEND_REQUEST_FAILED,
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
