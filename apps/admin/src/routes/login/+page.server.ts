import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
} from '$lib/server/admin-session';
import { apiRequest } from '$lib/server/api';
import { randomBytes } from 'node:crypto';

export const load: PageServerLoad = async ({ locals }) => {
  return {
    admin: locals.admin ?? null,
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, fetch }) => {
    const formData = await request.formData();
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';
    const totpCode = formData.get('totpCode')?.toString().trim() ?? '';

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required.' });
    }

    const result = await apiRequest<{ token?: string }>(
      fetch,
      cookies,
      '/auth/admin/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(totpCode ? { totpCode } : {}),
        }),
      }
    );

    if (!result.ok) {
      return fail(result.status, {
        error: result.error?.message ?? 'Invalid admin credentials.',
      });
    }

    const token = result.data?.token as string | undefined;

    if (!token) {
      return fail(500, { error: 'Missing session token.' });
    }

    cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ADMIN_SESSION_TTL_SECONDS,
      path: '/',
    });

    const existingCsrf = cookies.get(ADMIN_CSRF_COOKIE);
    if (!existingCsrf) {
      const csrfToken = randomBytes(32).toString('hex');
      cookies.set(ADMIN_CSRF_COOKIE, csrfToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ADMIN_SESSION_TTL_SECONDS,
        path: '/',
      });
    }

    throw redirect(303, '/admin');
  },
};
