import type { AppInstance } from '../types';

import { registerAuthPublicRoutes } from './public';
import { registerAuthMfaRoutes } from './mfa';
import { registerAuthSessionRoutes } from './session';
import { registerAuthVerificationRoutes } from './verification';

export async function registerAuthRoutes(app: AppInstance) {
  await registerAuthPublicRoutes(app);
  await registerAuthMfaRoutes(app);
  await registerAuthSessionRoutes(app);
  await registerAuthVerificationRoutes(app);
}
