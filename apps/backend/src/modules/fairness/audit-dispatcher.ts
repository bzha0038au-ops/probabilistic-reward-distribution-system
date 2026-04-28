import { db } from '../../db';
import { getPoolSystemConfig } from '../system/service';
import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { captureException } from '../../shared/telemetry';
import { auditPendingFairnessEpochs } from './service';

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning('fairness audit cycle skipped because a prior run is still active');
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const poolSystem = await getPoolSystemConfig(db);
      const result = await auditPendingFairnessEpochs(
        db,
        Number(poolSystem.epochSeconds ?? 0)
      );

      logger.info('fairness audit cycle completed', result);
    } catch (error) {
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'fairness_audit_worker',
          fairness_subsystem: 'dispatcher',
        },
      });
      logger.error('fairness audit cycle failed', {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startFairnessAuditDispatcher() {
  const config = getConfig();
  if (!config.fairnessAuditWorkerEnabled) {
    logger.info('fairness audit dispatcher disabled by config');
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.fairnessAuditWorkerIntervalMs);
}

export function stopFairnessAuditDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
