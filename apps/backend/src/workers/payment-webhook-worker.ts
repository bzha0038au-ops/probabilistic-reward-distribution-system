import 'dotenv/config';

import { client } from '../db';
import {
  startPaymentWebhookDispatcher,
  stopPaymentWebhookDispatcher,
} from '../modules/payment/webhook';
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
    logger.error('payment webhook worker shutting down after fatal error', {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: 'payment_webhook_worker',
        signal,
      },
    });
  } else {
    logger.info('payment webhook worker shutting down', {
      signal,
    });
  }

  stopPaymentWebhookDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close payment webhook worker database client', {
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

startPaymentWebhookDispatcher();

logger.info('payment webhook worker booted', {
  intervalMs: config.paymentWebhookWorkerIntervalMs,
  batchSize: config.paymentWebhookBatchSize,
  lockTimeoutMs: config.paymentWebhookLockTimeoutMs,
});
