import { getConfigView } from '../../shared/config';
import { logger } from '../../shared/logger';
import { captureException } from '../../shared/telemetry';
import {
  getNotificationProviderStatus,
  processPendingAuthNotifications,
  recoverStuckAuthNotifications,
  registerAuthNotificationEnqueueHook,
} from './notification-service';

const config = getConfigView();

class AuthNotificationDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private closed = false;
  private queuedTick = false;

  start() {
    this.schedule(0);
    logger.info('auth notification dispatcher started', getNotificationProviderStatus());
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
      await recoverStuckAuthNotifications();

      let processed = 0;
      do {
        processed = await processPendingAuthNotifications();
      } while (
        !this.closed &&
        processed >= config.authNotificationBatchSize
      );
    } catch (error) {
      logger.error('auth notification dispatcher tick failed', {
        err: error,
      });
      captureException(error, {
        tags: {
          operation: 'auth_notification_dispatcher_tick',
        },
      });
    } finally {
      this.running = false;
      this.schedule(
        this.queuedTick ? 0 : config.authNotificationWorkerIntervalMs,
        true
      );
    }
  }

}

let dispatcher: AuthNotificationDispatcher | null = null;

export const startAuthNotificationDispatcher = () => {
  if (dispatcher) {
    return dispatcher;
  }

  dispatcher = new AuthNotificationDispatcher();
  registerAuthNotificationEnqueueHook(dispatcher.kick);
  dispatcher.start();
  return dispatcher;
};

export const stopAuthNotificationDispatcher = () => {
  if (!dispatcher) {
    registerAuthNotificationEnqueueHook(null);
    return;
  }

  dispatcher.stop();
  dispatcher = null;
  registerAuthNotificationEnqueueHook(null);
};
