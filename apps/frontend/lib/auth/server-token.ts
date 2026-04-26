import 'server-only';

import { getToken } from '@auth/core/jwt';
import { headers } from 'next/headers';

import { resolveAuthSessionCookieName } from './session-cookie';

const resolveAuthSecret = () => {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to read the Auth.js session.');
  }
  return secret;
};

export async function getBackendAccessToken(request?: Request) {
  const requestHeaders = new Headers(request?.headers ?? headers());
  const cookieName = resolveAuthSessionCookieName(
    requestHeaders.get('cookie')
  );

  const token = await getToken({
    req: { headers: requestHeaders },
    secret: resolveAuthSecret(),
    cookieName,
    salt: cookieName,
    secureCookie: cookieName.startsWith('__Secure-'),
  });

  const backendToken = (token as { backendToken?: unknown } | null)?.backendToken;
  return typeof backendToken === 'string' ? backendToken : null;
}
