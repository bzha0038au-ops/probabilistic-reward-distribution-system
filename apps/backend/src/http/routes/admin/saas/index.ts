import type { AppInstance } from '../../types';

import { registerAdminSaasBillingRoutes } from './billing';
import { registerAdminSaasManagementRoutes } from './management';
import { registerAdminSaasProjectRoutes } from './project';
import { registerAdminSaasUsageRoutes } from './usage';

export async function registerAdminSaasRoutes(protectedRoutes: AppInstance) {
  await registerAdminSaasManagementRoutes(protectedRoutes);
  await registerAdminSaasProjectRoutes(protectedRoutes);
  await registerAdminSaasBillingRoutes(protectedRoutes);
  await registerAdminSaasUsageRoutes(protectedRoutes);
}
