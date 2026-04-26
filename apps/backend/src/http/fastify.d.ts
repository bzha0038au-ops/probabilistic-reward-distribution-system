import 'fastify';

import type { AuthenticatedAdmin } from '../shared/admin-session';
import type { UserSessionPayload } from '../shared/user-session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserSessionPayload;
    admin?: AuthenticatedAdmin;
  }
}
