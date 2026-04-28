import type { AppInstance } from './types';

const minimalBackend = process.env.PLAYWRIGHT_MINIMAL_BACKEND === 'true';

export async function registerRoutes(app: AppInstance) {
  const { registerObservabilityRoutes } = await import('./observability');
  const { registerInternalRoutes } = await import('./internal');
  const { registerPaymentRoutes } = await import('./payment');
  const { registerPortalRoutes } = await import('./portal');
  const { registerAuthRoutes } = await import('./auth');
  const { registerCommunityRoutes } = await import('./community');
  const { registerLegalRoutes } = await import('./legal');
  const { registerUserRoutes } = await import('./user');
  const { registerAdminRoutes } = await import('./admin');

  await registerObservabilityRoutes(app);
  await registerInternalRoutes(app);
  await registerPaymentRoutes(app);
  if (!minimalBackend) {
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
