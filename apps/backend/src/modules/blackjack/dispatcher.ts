import { getConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { runBlackjackTimeoutCycle } from "./service";

type BlackjackTimeoutDispatcherConfig = ReturnType<typeof getConfig> & {
  blackjackTimeoutWorkerEnabled: boolean;
  blackjackTimeoutWorkerIntervalMs: number;
};

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      "blackjack timeout cycle skipped because a prior run is still active",
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const summary = await runBlackjackTimeoutCycle();
      if (summary.scanned > 0 || summary.timedOut > 0) {
        logger.info("blackjack timeout cycle completed", summary);
      }
    } catch (error) {
      logger.error("blackjack timeout cycle failed", {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startBlackjackTimeoutDispatcher() {
  const config = getConfig() as BlackjackTimeoutDispatcherConfig;
  if (!config.blackjackTimeoutWorkerEnabled) {
    logger.info("blackjack timeout dispatcher disabled by config");
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.blackjackTimeoutWorkerIntervalMs);
}

export function stopBlackjackTimeoutDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
