import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { captureException } from '../../shared/telemetry';
import {
  runSaasBillingAutomationCycle,
  runSaasStripeReconciliationCycle,
  runSaasStripeWebhookCompensationCycle,
} from './billing-service';
import { runSaasOutboundWebhookDeliveryCycle } from './outbound-webhook-service';

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning('saas billing cycle skipped because a prior run is still active');
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const [billing, reconciliation, webhooks, outboundWebhooks] = await Promise.all([
        runSaasBillingAutomationCycle(),
        runSaasStripeReconciliationCycle(),
        runSaasStripeWebhookCompensationCycle(),
        runSaasOutboundWebhookDeliveryCycle(),
      ]);

      logger.info('saas billing cycle completed', {
        billing,
        reconciliation,
        webhooks,
        outboundWebhooks,
      });
    } catch (error) {
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'saas_billing_worker',
          payment_subsystem: 'dispatcher',
        },
      });
      logger.error('saas billing cycle failed', {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startSaasBillingDispatcher() {
  const config = getConfig();
  if (!config.saasBillingWorkerEnabled) {
    logger.info('saas billing dispatcher disabled by config');
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.saasBillingWorkerIntervalMs);
}

export function stopSaasBillingDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
