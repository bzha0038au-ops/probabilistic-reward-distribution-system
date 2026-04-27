import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authConfig } from '@/lib/auth.config';
import { getBackendTokenCookieName } from '@/lib/auth/backend-token-cookie';

const encoder = new TextEncoder();

const toBase64Url = (value: string | Uint8Array) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const createBackendToken = async (
  payloadOverrides: Record<string, unknown> = {},
  secret = process.env.USER_JWT_SECRET ?? ''
) => {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      userId: 42,
      sub: '42',
      jti: 'session-42',
      exp: now + 60,
      email: 'user@example.com',
      role: 'user',
      ...payloadOverrides,
    })
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return `${data}.${toBase64Url(new Uint8Array(signature))}`;
};

const buildRequest = (pathname: string, backendToken?: string) =>
  new NextRequest(`https://example.com${pathname}`, {
    headers: backendToken
      ? {
          cookie: `${getBackendTokenCookieName()}=${encodeURIComponent(backendToken)}`,
        }
      : undefined,
  });

describe('authConfig callbacks', () => {
  beforeEach(() => {
    process.env.USER_JWT_SECRET = 'frontend-user-jwt-secret-1234567890';
    delete process.env.USER_JWT_SECRET_PREVIOUS;
  });

  afterEach(() => {
    delete process.env.USER_JWT_SECRET;
    delete process.env.USER_JWT_SECRET_PREVIOUS;
  });

  it('stores the backend token on the server JWT state', async () => {
    const token = await authConfig.callbacks.jwt?.({
      token: {},
      user: {
        id: '42',
        role: 'admin',
        backendToken: 'server-only-token',
      },
    } as never);

    expect(token).toMatchObject({
      backendToken: 'server-only-token',
      role: 'admin',
      userId: 42,
    });
  });

  it('keeps the session payload free of the backend token', async () => {
    const session = await authConfig.callbacks.session?.({
      session: {
        expires: '2099-01-01T00:00:00.000Z',
        user: {},
      },
      token: {
        backendToken: 'server-only-token',
        role: 'admin',
        userId: 42,
      },
    } as never);

    expect(session).toMatchObject({
      user: {
        id: 42,
        role: 'admin',
      },
    });
    expect(session).not.toHaveProperty('backendToken');
  });

  it('allows /app requests with a locally verifiable backend token', async () => {
    const allowed = await authConfig.callbacks.authorized?.({
      request: buildRequest('/app', await createBackendToken()),
    } as never);

    expect(allowed).toBe(true);
  });

  it('allows /app requests during rotation when the token uses the previous backend secret', async () => {
    process.env.USER_JWT_SECRET_PREVIOUS =
      'frontend-user-jwt-secret-previous-1234567890';

    const allowed = await authConfig.callbacks.authorized?.({
      request: buildRequest(
        '/app',
        await createBackendToken({}, process.env.USER_JWT_SECRET_PREVIOUS)
      ),
    } as never);

    expect(allowed).toBe(true);
  });

  it('blocks /app requests when the backend token signature is invalid', async () => {
    const denied = await authConfig.callbacks.authorized?.({
      request: buildRequest('/app', 'invalid.token.value'),
    } as never);

    expect(denied).toBe(false);
  });

  it('redirects authenticated users away from login without calling the backend', async () => {
    const result = await authConfig.callbacks.authorized?.({
      request: buildRequest('/login', await createBackendToken()),
    } as never);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('location')).toBe('https://example.com/app');
  });
});
