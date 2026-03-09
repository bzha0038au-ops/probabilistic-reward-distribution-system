import type { AppInstance } from './types';

import { registerAdminRoutes } from './admin';
import { registerAuthRoutes } from './auth';
import { registerUserRoutes } from './user';

export async function registerRoutes(app: AppInstance) {
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerAdminRoutes(app);
}
