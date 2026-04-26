import 'dotenv/config';

import { client } from '../db';
import {
  startPaymentWebhookDispatcher,
  stopPaymentWebhookDispatcher,
} from '../modules/payment/webhook-dispatcher';
import { getConfig } from '../shared/config';
import { logger } from '../shared/logger';

const config = getConfig();

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
