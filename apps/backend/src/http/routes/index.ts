import type { AppInstance } from './types';

const minimalBackend = process.env.PLAYWRIGHT_MINIMAL_BACKEND === 'true';

export async function registerRoutes(app: AppInstance) {
  const { registerObservabilityRoutes } = await import('./observability');
  const { registerSaasStatusRoutes } = await import('./saas-status');
  const { registerInternalRoutes } = await import('./internal');
  const { registerIapRoutes } = await import('./iap');
  const { registerPaymentRoutes } = await import('./payment');
  const { registerAuthRoutes } = await import('./auth');
  const { registerCommunityRoutes } = await import('./community');
  const { registerLegalRoutes } = await import('./legal');
  const { registerUserRoutes } = await import('./user');
  const { registerAdminRoutes } = await import('./admin');

  await registerObservabilityRoutes(app);
  await registerSaasStatusRoutes(app);
  await registerInternalRoutes(app);
  await registerIapRoutes(app);
  await registerPaymentRoutes(app);
  if (!minimalBackend) {
    const { registerPortalRoutes } = await import('./portal');
    const { registerSaasRoutes } = await import('./saas');
    const { registerPrizeEngineRoutes } = await import('./prize-engine');

    await registerSaasRoutes(app);
    await registerPortalRoutes(app);
    await registerPrizeEngineRoutes(app);
  }
  await registerAuthRoutes(app);
  await registerCommunityRoutes(app);
  await registerLegalRoutes(app);
  await registerUserRoutes(app);
  await registerAdminRoutes(app);
}
