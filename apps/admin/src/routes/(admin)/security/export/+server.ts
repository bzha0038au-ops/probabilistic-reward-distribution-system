import type { RequestHandler } from './$types';

import { apiFetch } from '$lib/server/api';

export const GET: RequestHandler = async ({ fetch, cookies, url }) => {
  const params = url.searchParams.toString();
  const response = await apiFetch(
    fetch,
    cookies,
    `/admin/auth-events/export${params ? `?${params}` : ''}`
  );

  const csv = await response.text();
  return new Response(csv, {
    status: response.status,
    headers: {
      'content-type':
        response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'content-disposition':
        response.headers.get('content-disposition') ??
        'attachment; filename="auth-events.csv"',
    },
  });
};
