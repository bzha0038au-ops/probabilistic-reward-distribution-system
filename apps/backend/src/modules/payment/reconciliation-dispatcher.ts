import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { runPaymentReconciliationCycle } from './reconciliation-service';

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
