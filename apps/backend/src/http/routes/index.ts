import type { AppInstance } from './types';

import { registerAdminRoutes } from './admin';
import { registerAuthRoutes } from './auth';
import { registerInternalRoutes } from './internal';
import { registerObservabilityRoutes } from './observability';
import { registerPaymentRoutes } from './payment';
import { registerPrizeEngineRoutes } from './prize-engine';
import { registerSaasRoutes } from './saas';
import { registerUserRoutes } from './user';

export async function registerRoutes(app: AppInstance) {
  await registerObservabilityRoutes(app);
  await registerInternalRoutes(app);
  await registerPaymentRoutes(app);
  await registerSaasRoutes(app);
  await registerPrizeEngineRoutes(app);
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerAdminRoutes(app);
}
