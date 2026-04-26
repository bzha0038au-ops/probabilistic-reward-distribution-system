import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE } from '$lib/server/admin-session';
import { apiRequest } from '$lib/server/api';

export const GET: RequestHandler = async ({ cookies, fetch }) => {
  await apiRequest(fetch, cookies, '/auth/admin/session', {
    method: 'DELETE',
  }).catch(() => null);
  cookies.delete(ADMIN_SESSION_COOKIE, { path: '/' });
  cookies.delete(ADMIN_CSRF_COOKIE, { path: '/' });
  throw redirect(303, '/login');
};
