import { NextResponse } from 'next/server';

import { USER_API_ROUTES } from '@/lib/api/user';
import { buildBackendUrl } from '@/lib/api/server';
import {
  getBackendTokenCookieName,
  getBackendTokenCookieOptions,
  readBackendTokenCookie,
} from '@/lib/auth/backend-token-cookie';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from '@/lib/auth/session-cookie';

const clearCookie = (response: NextResponse, name: string) => {
  response.cookies.set(name, '', {
    ...getBackendTokenCookieOptions(),
    maxAge: 0,
  });
};

export async function POST(request: Request) {
  const backendToken = readBackendTokenCookie(request.headers.get('cookie'));

  if (backendToken) {
    await fetch(buildBackendUrl(USER_API_ROUTES.auth.session), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${backendToken}`,
      },
      cache: 'no-store',
    }).catch(() => undefined);
  }

  const response = NextResponse.json({
    ok: true,
    redirectTo: '/login',
  });
  clearCookie(response, getBackendTokenCookieName());
  clearCookie(response, AUTH_SESSION_COOKIE_NAME);
  clearCookie(response, SECURE_AUTH_SESSION_COOKIE_NAME);

  return response;
}
