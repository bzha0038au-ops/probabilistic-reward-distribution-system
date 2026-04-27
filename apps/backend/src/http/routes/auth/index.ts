import type { AppInstance } from '../types';

import { registerAuthPublicRoutes } from './public';
import { registerAuthSessionRoutes } from './session';
import { registerAuthVerificationRoutes } from './verification';

export async function registerAuthRoutes(app: AppInstance) {
  await registerAuthPublicRoutes(app);
  await registerAuthSessionRoutes(app);
  await registerAuthVerificationRoutes(app);
}
