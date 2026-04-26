import type { HandleClientError } from '@sveltejs/kit';

import {
  captureAdminClientException,
  initAdminClientObservability,
} from '$lib/observability/client';

initAdminClientObservability();

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  captureAdminClientException(error, {
    tags: {
      kind: 'client_navigation_error',
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
