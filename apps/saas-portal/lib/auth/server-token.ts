import 'server-only';

import { headers } from 'next/headers';

import {
  getBackendAccessTokenFromHeaders,
  getBackendAccessTokenFromRequest,
} from './backend-token';

export async function getBackendAccessToken(request?: Request) {
  if (request) {
    return getBackendAccessTokenFromRequest(request);
  }

  return getBackendAccessTokenFromHeaders(new Headers(await headers()));
}
