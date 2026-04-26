import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import {
  processPendingPaymentOutboundRequests,
  recoverStuckPaymentOutboundRequests,
  registerPaymentOutboundEnqueueHook,
} from './outbound-service';

const config = getConfig();

class PaymentOutboundDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private closed = false;
  private queuedTick = false;

  start() {
    this.schedule(0);
    logger.info('payment outbound dispatcher started', {
      intervalMs: config.paymentOutboundWorkerIntervalMs,
      batchSize: config.paymentOutboundBatchSize,
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
      await recoverStuckPaymentOutboundRequests();

      let processed = 0;
      do {
        processed = await processPendingPaymentOutboundRequests();
      } while (!this.closed && processed >= config.paymentOutboundBatchSize);
    } catch (error) {
      logger.error('payment outbound dispatcher tick failed', {
        err: error,
      });
    } finally {
      this.running = false;
      this.schedule(this.queuedTick ? 0 : config.paymentOutboundWorkerIntervalMs, true);
    }
  }
}

let dispatcher: PaymentOutboundDispatcher | null = null;

export const startPaymentOutboundDispatcher = () => {
  if (dispatcher) {
    return dispatcher;
  }

  dispatcher = new PaymentOutboundDispatcher();
  registerPaymentOutboundEnqueueHook(dispatcher.kick);
  dispatcher.start();
  return dispatcher;
};

export const stopPaymentOutboundDispatcher = () => {
  if (!dispatcher) {
    registerPaymentOutboundEnqueueHook(null);
    return;
  }

  dispatcher.stop();
  dispatcher = null;
  registerPaymentOutboundEnqueueHook(null);
};
