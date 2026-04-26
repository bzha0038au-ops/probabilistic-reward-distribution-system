import 'dotenv/config';

import { client } from '../db';
import {
  startPaymentOperationsDispatcher,
  stopPaymentOperationsDispatcher,
} from '../modules/payment/operations-dispatcher';
import { getConfig } from '../shared/config';
import { logger } from '../shared/logger';

type PaymentOperationsWorkerConfig = ReturnType<typeof getConfig> & {
  paymentOperationsEnabled: boolean;
  paymentOperationsIntervalMs: number;
  paymentOperationsTimeoutMinutes: number;
  paymentOperationsBatchSize: number;
};

const config = getConfig() as PaymentOperationsWorkerConfig;

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
    logger.error('payment operations worker shutting down after fatal error', {
      signal,
      err: error,
    });
  } else {
    logger.info('payment operations worker shutting down', {
      signal,
    });
  }

  stopPaymentOperationsDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close payment operations worker database client', {
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

startPaymentOperationsDispatcher();

logger.info('payment operations worker booted', {
  enabled: config.paymentOperationsEnabled,
  intervalMs: config.paymentOperationsIntervalMs,
  timeoutMinutes: config.paymentOperationsTimeoutMinutes,
  batchSize: config.paymentOperationsBatchSize,
});
