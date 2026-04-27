import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getBackendAccessToken } = vi.hoisted(() => ({
  getBackendAccessToken: vi.fn(async () => 'signed-backend-token'),
}));

vi.mock('@/lib/auth/server-token', () => ({
  getBackendAccessToken,
}));

import {
  DELETE,
  GET,
  POST,
} from '@/app/api/backend/[...path]/route';
import { getBackendTokenCookieName } from '@/lib/auth/backend-token-cookie';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from '@/lib/auth/session-cookie';

describe('backend proxy route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getBackendAccessToken).mockResolvedValue('signed-backend-token');
  });

  it('clears frontend auth cookies when an authenticated upstream request returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { message: 'Unauthorized' } }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      })
    );

    const response = await GET(
      new NextRequest('https://example.com/api/backend/wallet'),
      { params: { path: ['wallet'] } }
    );

    expect(response.status).toBe(401);
    expect(response.cookies.get(getBackendTokenCookieName())?.maxAge).toBe(0);
    expect(response.cookies.get(AUTH_SESSION_COOKIE_NAME)?.maxAge).toBe(0);
    expect(response.cookies.get(SECURE_AUTH_SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it('forwards valid whitelisted routes to the backend with the original query string', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [{ id: 1 }] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    );

    const response = await GET(
      new NextRequest('https://example.com/api/backend/transactions?limit=8'),
      { params: { path: ['transactions'] } }
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('http://localhost:4000/transactions?limit=8'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('returns 404 for backend routes that are not exposed to the browser', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(
      new NextRequest('https://example.com/api/backend/admin/deposits'),
      { params: { path: ['admin', 'deposits'] } }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { message: 'Not found.', code: 'NOT_FOUND' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 405 with an allow header when the route exists but the method is wrong', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await POST(
      new NextRequest('https://example.com/api/backend/wallet', {
        method: 'POST',
      }),
      { params: { path: ['wallet'] } }
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(await response.json()).toEqual({
      ok: false,
      error: { message: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 401 and clears cookies when an authenticated browser route has no backend token', async () => {
    vi.mocked(getBackendAccessToken).mockResolvedValueOnce(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await DELETE(
      new NextRequest('https://example.com/api/backend/auth/user/session', {
        method: 'DELETE',
      }),
      { params: { path: ['auth', 'user', 'session'] } }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
    expect(response.cookies.get(getBackendTokenCookieName())?.maxAge).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
