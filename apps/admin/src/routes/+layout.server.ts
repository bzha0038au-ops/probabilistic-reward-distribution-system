import type { LayoutServerLoad } from './$types';

import { getMessages } from '$lib/i18n';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    locale: locals.locale,
    messages: getMessages(locals.locale),
  };
};
