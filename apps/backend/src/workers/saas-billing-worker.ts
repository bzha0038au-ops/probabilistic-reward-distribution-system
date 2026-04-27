import 'dotenv/config';

import { client } from '../db';
import {
  startSaasBillingDispatcher,
  stopSaasBillingDispatcher,
} from '../modules/saas/billing-dispatcher';
import { getConfigView } from '../shared/config';
import { logger } from '../shared/logger';
import {
  captureException,
  initializeObservability,
  shutdownObservability,
} from '../shared/telemetry';

initializeObservability();
const config = getConfigView();

type ShutdownSignal =
  | NodeJS.Signals
  | 'uncaughtException'
  | 'unhandledRejection';

let shuttingDown = false;

const shutdown = async (signal: ShutdownSignal, error?: unknown) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (error) {
    logger.error('saas billing worker shutting down after fatal error', {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: 'saas_billing_worker',
        signal,
      },
    });
  } else {
    logger.info('saas billing worker shutting down', {
      signal,
    });
  }

  stopSaasBillingDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close saas billing worker database client', {
      err: closeError,
    });
  }

  await shutdownObservability();

  process.exit(error ? 1 : 0);
};

process.on('uncaughtException', (error) => {
  void shutdown('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  void shutdown('unhandledRejection', reason);
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

startSaasBillingDispatcher();

logger.info('saas billing worker booted', {
  enabled: config.saasBillingWorkerEnabled,
  intervalMs: config.saasBillingWorkerIntervalMs,
  webhookBatchSize: config.saasBillingWebhookBatchSize,
  webhookLockTimeoutMs: config.saasBillingWebhookLockTimeoutMs,
  automationEnabled: config.saasBillingAutomationEnabled,
  automationBatchSize: config.saasBillingAutomationBatchSize,
});
