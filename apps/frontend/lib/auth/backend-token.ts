import { getToken } from '@auth/core/jwt';

import { readBackendTokenCookie } from './backend-token-cookie';
import { resolveAuthSessionCookieName } from './session-cookie';

type AuthTokenWithBackendAccess = {
  backendToken?: unknown;
} | null;

const resolveAuthSecret = () => {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to read the Auth.js session.');
  }
  return secret;
};

const readBackendAccessToken = (token: AuthTokenWithBackendAccess) => {
  const backendToken = token?.backendToken;
  return typeof backendToken === 'string' ? backendToken : null;
};

export async function getBackendAccessTokenFromHeaders(
  requestHeaders: Headers
) {
  const backendTokenCookie = readBackendTokenCookie(requestHeaders.get('cookie'));
  if (backendTokenCookie) {
    return backendTokenCookie;
  }

  const cookieName = resolveAuthSessionCookieName(requestHeaders.get('cookie'));

  const token = await getToken({
    req: { headers: requestHeaders },
    secret: resolveAuthSecret(),
    cookieName,
    salt: cookieName,
    secureCookie: cookieName.startsWith('__Secure-'),
  });

  return readBackendAccessToken(token as AuthTokenWithBackendAccess);
}

export async function getBackendAccessTokenFromRequest(
  request: Pick<Request, 'headers'>
) {
  return getBackendAccessTokenFromHeaders(new Headers(request.headers));
}
