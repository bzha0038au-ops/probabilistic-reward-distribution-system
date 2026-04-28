import { getConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { runHoldemTimeoutCycle } from "./service";

type HoldemTimeoutDispatcherConfig = ReturnType<typeof getConfig> & {
  holdemTimeoutWorkerEnabled: boolean;
  holdemTimeoutWorkerIntervalMs: number;
};

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      "holdem timeout cycle skipped because a prior run is still active",
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const summary = await runHoldemTimeoutCycle();
      if (summary.scanned > 0 || summary.timedOut > 0) {
        logger.info("holdem timeout cycle completed", summary);
      }
    } catch (error) {
      logger.error("holdem timeout cycle failed", {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startHoldemTimeoutDispatcher() {
  const config = getConfig() as HoldemTimeoutDispatcherConfig;
  if (!config.holdemTimeoutWorkerEnabled) {
    logger.info("holdem timeout dispatcher disabled by config");
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.holdemTimeoutWorkerIntervalMs);
}

export function stopHoldemTimeoutDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
