import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { captureException } from '../../shared/telemetry';
import { runDbPartitionMaintenanceCycle } from './service';

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      'db partition maintenance cycle skipped because a prior run is still active'
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const result = await runDbPartitionMaintenanceCycle();
      const metadata = {
        ensuredCount: result.ensured.count,
        ensuredPartitions: result.ensured.partitions,
        archivedCount: result.archived.count,
        archivedPartitions: result.archived.partitions,
      };

      if (result.ensured.count > 0 || result.archived.count > 0) {
        logger.info('db partition maintenance cycle completed', metadata);
      } else {
        logger.debug('db partition maintenance cycle completed with no changes', metadata);
      }
    } catch (error) {
      captureException(error, {
        tags: {
          alert_priority: 'medium',
          service_role: 'db_partition_maintenance_worker',
          db_subsystem: 'partition_maintenance',
        },
      });
      logger.error('db partition maintenance cycle failed', {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startDbPartitionMaintenanceDispatcher() {
  const config = getConfig();
  if (!config.dbPartitionMaintenanceEnabled) {
    logger.info('db partition maintenance dispatcher disabled by config');
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.dbPartitionMaintenanceIntervalMs);
}

export function stopDbPartitionMaintenanceDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
