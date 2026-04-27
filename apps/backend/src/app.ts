import 'dotenv/config';

import fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

import {
  RequestContextPlugin,
  captureMessage,
  fastifyErrorHandler,
  getConfig,
  getPinoLogger,
  installProcessHandlers,
  initializeObservability,
  logger,
  validateSessionSecrets,
  closeRedis,
  getRedis,
} from './shared';
import { registerHttpMetricsHooks } from './shared/observability';
import { CsrfPlugin } from './http/csrf';
import { registerRoutes } from './http/routes';
import type { AppInstance } from './http/routes/types';
import {
  assertActivePaymentProviderSecretsResolvable,
  assertAutomatedPaymentModeSupported,
  getPaymentCapabilitySummary,
} from './modules/payment/service';

const reportPaymentAutomationStartupStatus = (config = getConfig()) => {
  const summary = getPaymentCapabilitySummary(config);

  logger.info('payment automation startup status', {
    operatingMode: summary.operatingMode,
    automatedExecutionRequested: summary.automatedExecutionRequested,
    automatedModeOptIn: summary.automatedModeOptIn,
    automatedExecutionEnabled: summary.automatedExecutionEnabled,
    automatedExecutionReady: summary.automatedExecutionReady,
    implementedAutomatedAdapters: summary.implementedAutomatedAdapters,
    missingCapabilities: summary.missingCapabilities,
    registeredAdapterKeys: summary.registeredAdapterKeys,
  });

  if (summary.automatedExecutionEnabled) {
    logger.warning('payment automation entered automated execution mode', {
      alertPriority: 'high',
      operatingMode: summary.operatingMode,
      implementedAutomatedAdapters: summary.implementedAutomatedAdapters,
      missingCapabilities: summary.missingCapabilities,
      registeredAdapterKeys: summary.registeredAdapterKeys,
    });
    captureMessage('Payment backend started with automated payment execution enabled.', {
      level: 'warning',
      tags: {
        alert_priority: 'high',
        payment_operating_mode: summary.operatingMode,
        payment_automation_enabled: summary.automatedExecutionEnabled,
      },
      extra: {
        automatedExecutionRequested: summary.automatedExecutionRequested,
        automatedModeOptIn: summary.automatedModeOptIn,
        automatedExecutionReady: summary.automatedExecutionReady,
        implementedAutomatedAdapters: summary.implementedAutomatedAdapters,
        missingCapabilities: summary.missingCapabilities,
        registeredAdapterKeys: summary.registeredAdapterKeys,
      },
    });
  }
};

export type BuildAppOptions = {
  installProcessHandlers?: boolean;
  initializeObservability?: boolean;
};

export type StartAppOptions = BuildAppOptions & {
  host?: string;
  port?: number;
};

const initializeAppRuntime = (options: BuildAppOptions = {}) => {
  validateSessionSecrets();

  if (options.initializeObservability !== false) {
    initializeObservability();
  }

  return getConfig();
};

export async function buildApp(options: BuildAppOptions = {}) {
  const config = initializeAppRuntime(options);
  reportPaymentAutomationStartupStatus(config);
  assertAutomatedPaymentModeSupported(config);
  const { db, resetDb } = await import('./db');
  await assertActivePaymentProviderSecretsResolvable(db);
  const app = fastify({ logger: getPinoLogger() }) as unknown as AppInstance;

  const installHandlers =
    options.installProcessHandlers ?? config.nodeEnv !== 'test';
  if (installHandlers) {
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
  app.addHook('onClose', async () => {
    await Promise.all([resetDb(), closeRedis()]);
  });

  return app;
}

export async function startApp(options: StartAppOptions = {}) {
  const app = await buildApp(options);
  const config = getConfig();
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? config.port;

  await app.listen({ port, host });

  return { app, host, port };
}
