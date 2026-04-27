import { getConfig } from '../../../shared/config';
import { logger } from '../../../shared/logger';
import { captureException } from '../../../shared/telemetry';
import { runPaymentReconciliationCycle } from './run-service';

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning('payment reconciliation cycle skipped because a prior run is still active');
    return inFlight;
  }

  inFlight = (async () => {
    try {
      await runPaymentReconciliationCycle({
        trigger: 'scheduled',
      });
    } catch (error) {
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'payment_reconciliation_worker',
          payment_subsystem: 'dispatcher',
        },
      });
      logger.error('payment reconciliation cycle failed', {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startPaymentReconciliationDispatcher() {
  const config = getConfig();
  if (!config.paymentReconciliationEnabled) {
    logger.info('payment reconciliation dispatcher disabled by config');
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.paymentReconciliationIntervalMs);
}

export function stopPaymentReconciliationDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
