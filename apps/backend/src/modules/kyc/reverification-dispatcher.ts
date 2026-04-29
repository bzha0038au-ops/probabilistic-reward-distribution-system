import { getConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { captureException } from "../../shared/telemetry";
import { runKycReverificationSweep } from "./service";

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      "KYC reverification cycle skipped because a prior run is still active",
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const result = await runKycReverificationSweep();
      logger.info("KYC reverification cycle completed", result);
    } catch (error) {
      captureException(error, {
        tags: {
          alert_priority: "high",
          service_role: "kyc_reverification_worker",
          kyc_subsystem: "dispatcher",
        },
      });
      logger.error("KYC reverification cycle failed", {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startKycReverificationDispatcher() {
  const config = getConfig();
  if (!config.kycReverificationWorkerEnabled) {
    logger.info("KYC reverification dispatcher disabled by config");
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.kycReverificationWorkerIntervalMs);
}

export function stopKycReverificationDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
