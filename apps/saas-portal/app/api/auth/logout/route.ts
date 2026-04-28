import { NextResponse } from 'next/server';

import { USER_API_ROUTES } from '@/lib/api/user';
import { buildBackendUrl } from '@/lib/api/server';
import { readBackendTokenCookie } from '@/lib/auth/backend-token-cookie';
import { clearFrontendAuthCookies } from '@/lib/auth/clear-auth-cookies';

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
  return clearFrontendAuthCookies(response);
}
