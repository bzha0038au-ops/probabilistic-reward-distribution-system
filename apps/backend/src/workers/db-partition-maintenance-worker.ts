import 'dotenv/config';

import { client } from '../db';
import {
  startDbPartitionMaintenanceDispatcher,
  stopDbPartitionMaintenanceDispatcher,
} from '../modules/db-partition-maintenance/dispatcher';
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
    logger.error('db partition maintenance worker shutting down after fatal error', {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: 'db_partition_maintenance_worker',
        signal,
      },
    });
  } else {
    logger.info('db partition maintenance worker shutting down', {
      signal,
    });
  }

  stopDbPartitionMaintenanceDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning('failed to close db partition maintenance worker database client', {
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

startDbPartitionMaintenanceDispatcher();

logger.info('db partition maintenance worker booted', {
  enabled: config.dbPartitionMaintenanceEnabled,
  intervalMs: config.dbPartitionMaintenanceIntervalMs,
  futureMonths: config.dbPartitionMaintenanceFutureMonths,
  archiveAfterMonths: config.dbPartitionMaintenanceArchiveAfterMonths,
  archiveSchema: config.dbPartitionMaintenanceArchiveSchema,
});
