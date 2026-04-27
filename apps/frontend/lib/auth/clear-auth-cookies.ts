import type { NextResponse } from 'next/server';

import {
  getBackendTokenCookieName,
  getBackendTokenCookieOptions,
} from './backend-token-cookie';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from './session-cookie';

const clearCookie = (
  response: NextResponse,
  name: string,
  options: {
    httpOnly: boolean;
    sameSite: 'lax';
    path: string;
    secure: boolean;
    maxAge?: number;
  }
) => {
  response.cookies.set(name, '', {
    ...options,
    maxAge: 0,
  });
};

const getAuthSessionCookieOptions = (name: string) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: name === SECURE_AUTH_SESSION_COOKIE_NAME,
});

export const clearFrontendAuthCookies = (response: NextResponse) => {
  clearCookie(response, getBackendTokenCookieName(), getBackendTokenCookieOptions());
  clearCookie(
    response,
    AUTH_SESSION_COOKIE_NAME,
    getAuthSessionCookieOptions(AUTH_SESSION_COOKIE_NAME)
  );
  clearCookie(
    response,
    SECURE_AUTH_SESSION_COOKIE_NAME,
    getAuthSessionCookieOptions(SECURE_AUTH_SESSION_COOKIE_NAME)
  );

  return response;
};
