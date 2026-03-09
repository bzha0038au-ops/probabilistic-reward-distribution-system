import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.admin) {
    throw redirect(303, '/admin');
  }

  throw redirect(303, '/login');
};
