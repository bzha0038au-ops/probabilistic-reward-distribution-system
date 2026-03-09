import type { FastifyInstance } from 'fastify';

import { registerAdminRoutes } from './admin';
import { registerAuthRoutes } from './auth';
import { registerUserRoutes } from './user';

type AppInstance = FastifyInstance<any, any, any, any, any>;

export async function registerRoutes(app: AppInstance) {
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerAdminRoutes(app);
}
