import { NextResponse } from 'next/server';
import type { UserSessionResponse } from '@reward/shared-types';

import { USER_API_ROUTES, parseApiResponse } from '@/lib/api/user';
import { buildBackendUrl } from '@/lib/api/server';
import {
  getBackendTokenCookieName,
  getBackendTokenCookieOptions,
} from '@/lib/auth/backend-token-cookie';

const APP_PATH = '/app';

const sanitizeRedirectPath = (value: FormDataEntryValue | null) => {
  const redirectTo = typeof value === 'string' ? value.trim() : '';

  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return APP_PATH;
  }

  return redirectTo;
};

const errorResponse = (error: string, status = 400) =>
  NextResponse.json(
    {
      ok: false,
      error: { message: error },
    },
    { status }
  );

const successResponse = (redirectTo: string) =>
  NextResponse.json({
    ok: true,
    redirectTo,
  });

const withCookie = (response: NextResponse, token: string) => {
  response.cookies.set(
    getBackendTokenCookieName(),
    encodeURIComponent(token),
    getBackendTokenCookieOptions()
  );

  return response;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const redirectTo = sanitizeRedirectPath(formData.get('redirectTo'));

  if (!email || !password) {
    return errorResponse('Missing email or password.');
  }

  let result;
  try {
    const response = await fetch(buildBackendUrl(USER_API_ROUTES.auth.session), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    result = await parseApiResponse<UserSessionResponse>(response);
  } catch {
    return errorResponse('Login request failed.', 502);
  }

  if (!result.ok) {
    return errorResponse(result.error.message, result.status ?? 401);
  }

  if (!result.data?.token) {
    return errorResponse('CredentialsSignin', 401);
  }

  return withCookie(successResponse(redirectTo), result.data.token);
}
