import type { AppInstance } from '../types';

import { registerSaasBillingRoutes } from './billing';

export async function registerSaasRoutes(app: AppInstance) {
  await registerSaasBillingRoutes(app);
}
