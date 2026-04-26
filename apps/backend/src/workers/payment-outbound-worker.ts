import 'dotenv/config';

import { client } from '../db';
import {
  startPaymentOutboundDispatcher,
  stopPaymentOutboundDispatcher,
} from '../modules/payment/outbound-dispatcher';
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
    logger.error('payment outbound worker shutting down after fatal error', {
      signal,
      err: error,
    });
  } else {
    logger.info('payment outbound worker shutting down', {
      signal,
    });
  }

  stopPaymentOutboundDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close payment outbound worker database client', {
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

startPaymentOutboundDispatcher();

logger.info('payment outbound worker booted', {
  intervalMs: config.paymentOutboundWorkerIntervalMs,
  batchSize: config.paymentOutboundBatchSize,
  lockTimeoutMs: config.paymentOutboundLockTimeoutMs,
  unknownRetryDelayMs: config.paymentOutboundUnknownRetryDelayMs,
});
