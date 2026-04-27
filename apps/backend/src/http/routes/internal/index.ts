import type { AppInstance } from '../types';

import { registerAlertRelayRoutes } from './alert-relay';
import { registerBillingAnomalyRoutes } from './billing-anomaly';

export async function registerInternalRoutes(app: AppInstance) {
  await registerAlertRelayRoutes(app);
  await registerBillingAnomalyRoutes(app);
}
