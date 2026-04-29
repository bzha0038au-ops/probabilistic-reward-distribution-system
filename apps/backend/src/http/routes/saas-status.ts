import type { AppInstance } from './types';

import { getPublicSaasStatusPage } from '../../modules/saas-status/service';
import { sendErrorForException, sendSuccess } from '../respond';

export async function registerSaasStatusRoutes(app: AppInstance) {
  app.get(
    '/status/saas',
    { config: { rateLimit: false } },
    async (_request, reply) => {
      try {
        const page = await getPublicSaasStatusPage();
        return sendSuccess(reply, page);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to load SaaS status.'
        );
      }
    }
  );
}
