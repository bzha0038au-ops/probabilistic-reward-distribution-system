import '@fastify/cookie';
import 'fastify';

import type { ProjectApiAuth } from '../modules/saas/service';
import type { RealtimeService } from '../realtime/service';
import type { AuthenticatedAdmin } from '../shared/admin-session';
import type { UserSessionPayload } from '../shared/user-session';

declare module 'fastify' {
  interface FastifyInstance {
    realtime: RealtimeService;
  }

  interface FastifyRequest {
    user?: UserSessionPayload;
    admin?: AuthenticatedAdmin;
    userStepUp?: {
      verified: true;
      method: 'totp';
      verifiedAt: string;
      amountThreshold: string;
    };
    adminStepUp?: {
      verified: true;
      method: 'totp' | 'recovery_code';
      verifiedAt: string;
      recoveryCodesRemaining: number;
      breakGlassVerified?: boolean;
    };
    prizeEngineProject?: ProjectApiAuth;
  }
}
