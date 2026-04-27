import 'dotenv/config';

import { client } from '../db';
import {
  startAuthNotificationDispatcher,
  stopAuthNotificationDispatcher,
} from '../modules/auth/notification-dispatcher';
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
    logger.error('auth notification worker shutting down after fatal error', {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: 'auth_notification_worker',
        signal,
      },
    });
  } else {
    logger.info('auth notification worker shutting down', {
      signal,
    });
  }

  stopAuthNotificationDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close auth notification worker database client', {
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

startAuthNotificationDispatcher();

logger.info('auth notification worker booted', {
  intervalMs: config.authNotificationWorkerIntervalMs,
  batchSize: config.authNotificationBatchSize,
  lockTimeoutMs: config.authNotificationLockTimeoutMs,
});
