import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveAdminDefaultRoute } from '$lib/admin/access';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.admin) {
    throw redirect(303, resolveAdminDefaultRoute(locals.admin));
  }

  throw redirect(303, '/login');
};
