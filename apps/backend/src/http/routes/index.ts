import type { AppInstance } from './types';

import { registerAdminRoutes } from './admin';
import { registerAuthRoutes } from './auth';
import { registerObservabilityRoutes } from './observability';
import { registerPaymentRoutes } from './payment';
import { registerUserRoutes } from './user';

export async function registerRoutes(app: AppInstance) {
  await registerObservabilityRoutes(app);
  await registerPaymentRoutes(app);
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerAdminRoutes(app);
}
