import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { ADMIN_SESSION_COOKIE } from '$lib/server/admin-session';

export const GET: RequestHandler = async ({ cookies }) => {
  cookies.delete(ADMIN_SESSION_COOKIE, { path: '/' });
  throw redirect(303, '/login');
};
