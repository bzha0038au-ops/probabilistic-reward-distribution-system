import { NextResponse, type NextRequest } from 'next/server';

import { buildBackendUrl } from '@/lib/api/server';
import { resolveBackendProxyRoute } from '@/lib/api/proxy';
import { getBackendAccessToken } from '@/lib/auth/server-token';
import { captureFrontendServerException } from '@/lib/observability/server';

export const runtime = 'nodejs';

type RouteContext = {
  params: {
    path: string[];
  };
};

const jsonError = (status: number, message: string, headers?: HeadersInit) =>
  NextResponse.json(
    { ok: false, error: { message } },
    {
      status,
      headers,
    }
  );

const buildForwardHeaders = async (request: NextRequest, requiresAuth: boolean) => {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const locale = request.headers.get('x-locale');
  const traceId = request.headers.get('x-trace-id');

  if (contentType) headers.set('content-type', contentType);
  if (locale) headers.set('x-locale', locale);
  if (traceId) headers.set('x-trace-id', traceId);

  if (requiresAuth) {
    const backendToken = await getBackendAccessToken(request);
    if (!backendToken) {
      return null;
    }
    headers.set('Authorization', `Bearer ${backendToken}`);
  }

  return headers;
};

async function proxyRequest(request: NextRequest, { params }: RouteContext) {
  const backendPath = `/${params.path.join('/')}`;
  const route = resolveBackendProxyRoute(request.method, backendPath);

  if (!route.matched) {
    return jsonError(404, 'Not found.');
  }

  if (!route.methodAllowed) {
    return jsonError(405, 'Method not allowed.', {
      Allow: route.methods.join(', '),
    });
  }

  const headers = await buildForwardHeaders(request, route.requiresAuth);
  if (!headers) {
    return jsonError(401, 'Unauthorized');
  }

  const upstreamUrl = new URL(buildBackendUrl(route.normalizedPath));
  upstreamUrl.search = new URL(request.url).search;

  try {
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await request.arrayBuffer(),
      cache: 'no-store',
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    const traceId = response.headers.get('x-trace-id');
    const requestId = response.headers.get('x-request');
    if (contentType) {
      responseHeaders.set('content-type', contentType);
    }
    if (traceId) {
      responseHeaders.set('x-trace-id', traceId);
    }
    if (requestId) {
      responseHeaders.set('x-request', requestId);
    }
    responseHeaders.set('cache-control', 'no-store');

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    captureFrontendServerException(error, {
      tags: {
        kind: 'backend_proxy_failure',
      },
      extra: {
        backendPath: route.normalizedPath,
        method: request.method,
      },
    });
    return jsonError(502, 'Backend request failed.');
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
