import 'dotenv/config';

import { client } from '../db';
import {
  startWalletReconciliationDispatcher,
  stopWalletReconciliationDispatcher,
} from '../modules/wallet/reconciliation-dispatcher';
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
    logger.error('wallet reconciliation worker shutting down after fatal error', {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: 'wallet_reconciliation_worker',
        signal,
      },
    });
  } else {
    logger.info('wallet reconciliation worker shutting down', {
      signal,
    });
  }

  stopWalletReconciliationDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning(
      'failed to close wallet reconciliation worker database client',
      {
        err: closeError,
      }
    );
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

startWalletReconciliationDispatcher();

logger.info('wallet reconciliation worker booted', {
  enabled: config.walletReconciliationEnabled,
  intervalMs: config.walletReconciliationIntervalMs,
});
