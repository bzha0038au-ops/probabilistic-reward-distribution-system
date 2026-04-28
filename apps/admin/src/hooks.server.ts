import type { Handle, HandleServerError } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  type AdminSessionPayload,
  verifyAdminSessionToken,
} from '$lib/server/admin-session';
import { apiRequest } from '$lib/server/api';
import { resolveLocaleFromRequest } from '$lib/i18n';
import {
  captureAdminServerException,
  initAdminServerObservability,
} from '$lib/observability/server';
import { resolveAdminDefaultRoute } from '$lib/admin/access';

initAdminServerObservability();

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(ADMIN_SESSION_COOKIE);
  const localSession = await verifyAdminSessionToken(token);
  let admin: AdminSessionPayload | null = localSession;

  if (localSession) {
    const response = await apiRequest<{ admin?: AdminSessionPayload }>(
      event.fetch,
      event.cookies,
      '/auth/admin/session',
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

    if (response.ok && response.data?.admin) {
      admin = response.data.admin;
    } else {
      admin = null;
      event.cookies.delete(ADMIN_SESSION_COOKIE, { path: '/' });
      event.cookies.delete(ADMIN_CSRF_COOKIE, { path: '/' });
    }
  }

  event.locals.admin = admin;
  event.locals.locale = resolveLocaleFromRequest(event);

  const path = event.url.pathname;
  const routeId = event.route.id;
  const isAdminRoute = routeId?.startsWith('/(admin)') ?? false;

  if (path.startsWith('/account')) {
    throw redirect(303, admin ? resolveAdminDefaultRoute(admin) : '/login');
  }

  if (isAdminRoute && !admin) {
    throw redirect(303, '/login');
  }

  if (path.startsWith('/login') && admin) {
    throw redirect(303, resolveAdminDefaultRoute(admin));
  }

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale),
  });
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  captureAdminServerException(error, {
    tags: {
      kind: 'server_request_error',
      status_code: status,
    },
    extra: {
      path: event.url.pathname,
      message,
    },
  });

  return {
    message,
  };
};
