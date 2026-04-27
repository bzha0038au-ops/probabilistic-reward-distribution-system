import 'fastify';

import type { ProjectApiAuth } from '../modules/saas/service';
import type { AuthenticatedAdmin } from '../shared/admin-session';
import type { UserSessionPayload } from '../shared/user-session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserSessionPayload;
    admin?: AuthenticatedAdmin;
    adminStepUp?: {
      verified: true;
      method: 'totp' | 'recovery_code';
      verifiedAt: string;
      recoveryCodesRemaining: number;
    };
    prizeEngineProject?: ProjectApiAuth;
  }
}
