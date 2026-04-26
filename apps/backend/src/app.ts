import fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

import {
  RequestContextPlugin,
  fastifyErrorHandler,
  getConfig,
  getPinoLogger,
  installProcessHandlers,
  validateSessionSecrets,
  getRedis,
} from './shared';
import { registerHttpMetricsHooks } from './shared/observability';
import { CsrfPlugin } from './http/csrf';
import { registerRoutes } from './http/routes';
import type { AppInstance } from './http/routes/types';
import { assertAutomatedPaymentModeSupported } from './modules/payment/service';

export async function buildApp(options: { installProcessHandlers?: boolean } = {}) {
  validateSessionSecrets();
  const config = getConfig();
  assertAutomatedPaymentModeSupported(config);
  const app = fastify({ logger: getPinoLogger() }) as unknown as AppInstance;

  if (options.installProcessHandlers !== false) {
    installProcessHandlers(app.server);
  }

  app.setErrorHandler(fastifyErrorHandler);
  registerHttpMetricsHooks(app);

  await app.register(cookie);
  await app.register(RequestContextPlugin);
  await app.register(cors, {
    origin: [config.webBaseUrl, config.adminBaseUrl],
    credentials: true,
  });

  const redis = getRedis();
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitGlobalMax,
    timeWindow: config.rateLimitGlobalWindowMs,
    keyGenerator: (request: FastifyRequest) => request.ip,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    ...(redis ? { redis } : {}),
  });
  await app.register(CsrfPlugin);

  await registerRoutes(app);

  return app;
}
