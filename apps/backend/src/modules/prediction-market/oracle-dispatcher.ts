import { getConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { captureException } from "../../shared/telemetry";
import { runPredictionMarketOracleSettlementCycle } from "./service";

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

const runCycle = async () => {
  if (inFlight) {
    logger.warning(
      "prediction market oracle cycle skipped because a prior run is still active",
    );
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const summary = await runPredictionMarketOracleSettlementCycle();
      logger.info("prediction market oracle cycle completed", summary);
    } catch (error) {
      captureException(error, {
        tags: {
          alert_priority: "high",
          service_role: "prediction_market_oracle_worker",
        },
      });
      logger.error("prediction market oracle cycle failed", {
        err: error,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export function startPredictionMarketOracleDispatcher() {
  const config = getConfig();
  if (!config.predictionMarketOracleWorkerEnabled) {
    logger.info("prediction market oracle dispatcher disabled by config");
    return;
  }

  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.predictionMarketOracleWorkerIntervalMs);
}

export function stopPredictionMarketOracleDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
