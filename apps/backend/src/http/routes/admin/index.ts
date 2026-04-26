import type { AppInstance } from '../types';

import { requireAdminGuard } from '../../guards';
import { registerAdminAuditRoutes } from './audit';
import { registerAdminConfigRoutes } from './config';
import { registerAdminFinanceRoutes } from './finance';
import { registerAdminMfaRoutes } from './mfa';
import { registerAdminPrizeRoutes } from './prizes';
import { registerAdminSecurityRoutes } from './security';

export async function registerAdminRoutes(app: AppInstance) {
  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', requireAdminGuard);
    const adminRoutes = protectedRoutes as unknown as AppInstance;

    await registerAdminMfaRoutes(adminRoutes);
    await registerAdminPrizeRoutes(adminRoutes);
    await registerAdminAuditRoutes(adminRoutes);
    await registerAdminSecurityRoutes(adminRoutes);
    await registerAdminConfigRoutes(adminRoutes);
    await registerAdminFinanceRoutes(adminRoutes);
  });
}
