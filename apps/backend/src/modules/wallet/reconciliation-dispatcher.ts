import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { runWalletReconciliation } from './reconciliation-service';

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      'wallet reconciliation cycle skipped because a prior run is still active'
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      await runWalletReconciliation('scheduled');
    } catch (error) {
      logger.error('wallet reconciliation cycle failed', {
        err: error,
        service_role: 'wallet_reconciliation_worker',
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startWalletReconciliationDispatcher() {
  const config = getConfig();
  if (!config.walletReconciliationEnabled) {
    logger.info('wallet reconciliation dispatcher disabled by config');
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.walletReconciliationIntervalMs);
}

export function stopWalletReconciliationDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
