import 'dotenv/config';

import { client } from '../db';
import {
  startPaymentReconciliationDispatcher,
  stopPaymentReconciliationDispatcher,
} from '../modules/payment/reconciliation-dispatcher';
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
    logger.error('payment reconciliation worker shutting down after fatal error', {
      signal,
      err: error,
    });
  } else {
    logger.info('payment reconciliation worker shutting down', {
      signal,
    });
  }

  stopPaymentReconciliationDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close payment reconciliation worker database client', {
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

startPaymentReconciliationDispatcher();

logger.info('payment reconciliation worker booted', {
  enabled: config.paymentReconciliationEnabled,
  intervalMs: config.paymentReconciliationIntervalMs,
  lookbackMinutes: config.paymentReconciliationLookbackMinutes,
  pendingTimeoutMinutes: config.paymentReconciliationPendingTimeoutMinutes,
});
