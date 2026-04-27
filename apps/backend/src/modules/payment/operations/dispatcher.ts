import { getConfig } from '../../../shared/config';
import { logger } from '../../../shared/logger';
import { runPaymentOperationsCycle } from './service';

type PaymentOperationsDispatcherConfig = ReturnType<typeof getConfig> & {
  paymentOperationsEnabled: boolean;
  paymentOperationsIntervalMs: number;
};

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      'payment operations cycle skipped because a prior run is still active'
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      await runPaymentOperationsCycle({
        trigger: 'scheduled',
      });
    } catch (error) {
      logger.error('payment operations cycle failed', {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startPaymentOperationsDispatcher() {
  const config = getConfig() as PaymentOperationsDispatcherConfig;
  if (!config.paymentOperationsEnabled) {
    logger.info('payment operations dispatcher disabled by config');
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.paymentOperationsIntervalMs);
}

export function stopPaymentOperationsDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
