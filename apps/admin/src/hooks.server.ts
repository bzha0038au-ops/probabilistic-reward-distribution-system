import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from '$lib/server/admin-session';
import { resolveLocaleFromRequest } from '$lib/i18n';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(ADMIN_SESSION_COOKIE);
  const admin = await verifyAdminSessionToken(token);
  event.locals.admin = admin;
  event.locals.locale = resolveLocaleFromRequest(event);

  const path = event.url.pathname;

  if (path.startsWith('/account')) {
    throw redirect(303, '/admin');
  }

  if (path.startsWith('/admin') && !admin) {
    throw redirect(303, '/login');
  }

  if (path.startsWith('/login') && admin) {
    throw redirect(303, '/admin');
  }

  return resolve(event);
};
