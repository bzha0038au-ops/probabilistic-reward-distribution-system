import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import {
  processPendingPaymentWebhookEvents,
  recoverStuckPaymentWebhookEvents,
  registerPaymentWebhookEnqueueHook,
} from './webhook-service';

const config = getConfig();

class PaymentWebhookDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private closed = false;
  private queuedTick = false;

  start() {
    this.schedule(0);
    logger.info('payment webhook dispatcher started', {
      intervalMs: config.paymentWebhookWorkerIntervalMs,
      batchSize: config.paymentWebhookBatchSize,
    });
  }

  stop() {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  kick = () => {
    if (this.closed) {
      return;
    }
    if (this.running) {
      this.queuedTick = true;
      return;
    }
    this.schedule(0, true);
  };

  private schedule(delayMs: number, replace = false) {
    if (this.closed) {
      return;
    }
    if (replace && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
  }

  private async tick() {
    if (this.closed || this.running) {
      return;
    }

    this.running = true;
    this.queuedTick = false;

    try {
      await recoverStuckPaymentWebhookEvents();

      let processed = 0;
      do {
        processed = await processPendingPaymentWebhookEvents();
      } while (!this.closed && processed >= config.paymentWebhookBatchSize);
    } catch (error) {
      logger.error('payment webhook dispatcher tick failed', {
        err: error,
      });
    } finally {
      this.running = false;
      this.schedule(this.queuedTick ? 0 : config.paymentWebhookWorkerIntervalMs, true);
    }
  }
}

let dispatcher: PaymentWebhookDispatcher | null = null;

export const startPaymentWebhookDispatcher = () => {
  if (dispatcher) {
    return dispatcher;
  }

  dispatcher = new PaymentWebhookDispatcher();
  registerPaymentWebhookEnqueueHook(dispatcher.kick);
  dispatcher.start();
  return dispatcher;
};

export const stopPaymentWebhookDispatcher = () => {
  if (!dispatcher) {
    registerPaymentWebhookEnqueueHook(null);
    return;
  }

  dispatcher.stop();
  dispatcher = null;
  registerPaymentWebhookEnqueueHook(null);
};
