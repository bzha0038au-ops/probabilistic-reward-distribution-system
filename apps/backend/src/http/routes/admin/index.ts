import type { AppInstance } from '../types';

import { requireAdminGuard } from '../../guards';

const minimalBackend = process.env.PLAYWRIGHT_MINIMAL_BACKEND === 'true';

export async function registerAdminRoutes(app: AppInstance) {
  const { registerPublicAdminKycRoutes } = await import('./kyc');
  await registerPublicAdminKycRoutes(app);

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', requireAdminGuard);
    const adminRoutes = protectedRoutes as unknown as AppInstance;
    const { registerAdminMfaRoutes } = await import('./mfa');
    const { registerAdminAuditRoutes } = await import('./audit');
    const { registerAdminCommunityRoutes } = await import('./community');
    const { registerAdminForumRoutes } = await import('./forum');
    const { registerAdminKycRoutes } = await import('./kyc');
    const { registerAdminSecurityRoutes } = await import('./security');
    const { registerAdminUserRoutes } = await import('./users');
    const { registerAdminConfigRoutes } = await import('./config');
    const { registerAdminControlRoutes } = await import('./control');
    const { registerAdminEngineReconciliationRoutes } = await import(
      './engine-reconciliation'
    );
    const { registerAdminEconomyRoutes } = await import('./economy');
    const { registerAdminFinanceRoutes } = await import('./finance');

    await registerAdminMfaRoutes(adminRoutes);
    await registerAdminAuditRoutes(adminRoutes);
    await registerAdminCommunityRoutes(adminRoutes);
    await registerAdminForumRoutes(adminRoutes);
    await registerAdminKycRoutes(adminRoutes);
    await registerAdminSecurityRoutes(adminRoutes);
    await registerAdminUserRoutes(adminRoutes);
    await registerAdminConfigRoutes(adminRoutes);
    await registerAdminControlRoutes(adminRoutes);
    await registerAdminEngineReconciliationRoutes(adminRoutes);
    await registerAdminEconomyRoutes(adminRoutes);
    await registerAdminFinanceRoutes(adminRoutes);

    if (!minimalBackend) {
      const { registerAdminMissionRoutes } = await import('./missions');
      const { registerAdminPredictionMarketRoutes } = await import(
        './prediction-markets'
      );
      const { registerAdminPrizeRoutes } = await import('./prizes');
      const { registerAdminPermissionRoutes } = await import('./permissions');
      const { registerAdminLegalRoutes } = await import('./legal');
      const { registerAdminDataRightsRoutes } = await import('./data-rights');
      const { registerAdminSaasRoutes } = await import('./saas');
      const { registerAdminTableRoutes } = await import('./tables');

      await registerAdminMissionRoutes(adminRoutes);
      await registerAdminPredictionMarketRoutes(adminRoutes);
      await registerAdminPrizeRoutes(adminRoutes);
      await registerAdminPermissionRoutes(adminRoutes);
      await registerAdminLegalRoutes(adminRoutes);
      await registerAdminDataRightsRoutes(adminRoutes);
      await registerAdminSaasRoutes(adminRoutes);
      await registerAdminTableRoutes(adminRoutes);
    }
  });
}
