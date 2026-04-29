import 'dotenv/config';

import fastify from 'fastify';
import type { FastifyRequest } from 'fastify';

import { registerPrizeEngineRoutes } from './http/routes/prize-engine';
import type { AppInstance } from './http/routes/types';
import { resetDb } from './db';
import {
  RequestContextPlugin,
  closeRedis,
  fastifyErrorHandler,
  getConfig,
  getPinoLogger,
  logger,
  shutdownObservability,
  validateSessionSecrets,
} from './shared';

const debugBoot =
  process.env.PRIZE_ENGINE_LOAD_SERVER_DEBUG === 'true'
    ? (...values: unknown[]) => {
        console.error('[prize-engine-load-server]', ...values);
      }
    : () => undefined;

const TRACKED_REQUEST_DONE = Symbol('tracked-request-done');

async function main() {
  debugBoot('boot:start');
  validateSessionSecrets();
  debugBoot('boot:secrets-validated');

  const config = getConfig();
  debugBoot('boot:config-loaded', { port: config.port });
  const app = fastify({
    loggerInstance: getPinoLogger(),
  }) as unknown as AppInstance;
  debugBoot('boot:app-created');

  let activeRequestCount = 0;
  const drainWaiters = new Set<() => void>();
  const notifyDrainWaiters = () => {
    if (activeRequestCount !== 0) {
      return;
    }

    for (const resolve of drainWaiters) {
      resolve();
    }
    drainWaiters.clear();
  };
  const markRequestDone = (request: FastifyRequest) => {
    const trackedRequest = request as FastifyRequest & {
      [TRACKED_REQUEST_DONE]?: boolean;
    };
    if (trackedRequest[TRACKED_REQUEST_DONE]) {
      return;
    }

    trackedRequest[TRACKED_REQUEST_DONE] = true;
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyDrainWaiters();
  };
  const waitForActiveRequestsToDrain = async (timeoutMs: number) => {
    if (activeRequestCount === 0) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        drainWaiters.delete(onDrain);
        resolve(false);
      }, timeoutMs);
      timeout.unref();

      const onDrain = () => {
        clearTimeout(timeout);
        drainWaiters.delete(onDrain);
        resolve(true);
      };

      drainWaiters.add(onDrain);
    });
  };

  app.setErrorHandler(fastifyErrorHandler);
  app.addHook('onRequest', async (request) => {
    if (request.url === '/health') {
      return;
    }

    activeRequestCount += 1;
  });
  app.addHook('onResponse', async (request) => {
    markRequestDone(request);
  });
  app.addHook('onError', async (request) => {
    markRequestDone(request);
  });
  app.addHook('onTimeout', async (request) => {
    markRequestDone(request);
  });
  app.addHook('onRequestAbort', async (request) => {
    markRequestDone(request);
  });
  await app.register(RequestContextPlugin);
  debugBoot('boot:request-context-registered');

  app.get('/health', async () => ({
    ok: true,
    activeRequestCount,
  }));
  debugBoot('boot:health-registered');

  await registerPrizeEngineRoutes(app);
  debugBoot('boot:prize-engine-routes-registered');

  let shuttingDown = false;
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    const forceExitTimer = setTimeout(() => {
      logger.error('prize-engine load server forced shutdown timeout', { signal });
      process.exit(1);
    }, 30_000);
    forceExitTimer.unref();

    try {
      logger.info('prize-engine load server shutting down', { signal });
      await app.close();
      const drained = await waitForActiveRequestsToDrain(30_000);
      if (!drained) {
        logger.warning('prize-engine load server requests did not drain before shutdown timeout', {
          signal,
          activeRequestCount,
        });
      }
      await Promise.allSettled([
        resetDb(),
        closeRedis(),
        shutdownObservability(),
      ]);
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('prize-engine load server shutdown failed', {
        signal,
        error,
      });
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await app.listen({
    host: '127.0.0.1',
    port: config.port,
  });
  debugBoot('boot:listening', { port: config.port });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
