import 'dotenv/config';

import { client } from '../db';
import {
  startFairnessAuditDispatcher,
  stopFairnessAuditDispatcher,
} from '../modules/fairness/audit-dispatcher';
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
    logger.error('fairness audit worker shutting down after fatal error', {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: 'fairness_audit_worker',
        signal,
      },
    });
  } else {
    logger.info('fairness audit worker shutting down', {
      signal,
    });
  }

  stopFairnessAuditDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close fairness audit worker database client', {
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

startFairnessAuditDispatcher();

logger.info('fairness audit worker booted', {
  enabled: config.fairnessAuditWorkerEnabled,
  intervalMs: config.fairnessAuditWorkerIntervalMs,
});
