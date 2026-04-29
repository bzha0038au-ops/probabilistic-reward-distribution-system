import "dotenv/config";

import { client } from "../db";
import {
  startPredictionMarketOracleDispatcher,
  stopPredictionMarketOracleDispatcher,
} from "../modules/prediction-market/oracle-dispatcher";
import { getConfigView } from "../shared/config";
import { logger } from "../shared/logger";
import {
  captureException,
  initializeObservability,
  shutdownObservability,
} from "../shared/telemetry";

initializeObservability();
const config = getConfigView();

type ShutdownSignal =
  | NodeJS.Signals
  | "uncaughtException"
  | "unhandledRejection";

let shuttingDown = false;

const shutdown = async (signal: ShutdownSignal, error?: unknown) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (error) {
    logger.error(
      "prediction market oracle worker shutting down after fatal error",
      {
        signal,
        err: error,
      },
    );
    captureException(error, {
      tags: {
        service_role: "prediction_market_oracle_worker",
        signal,
      },
    });
  } else {
    logger.info("prediction market oracle worker shutting down", {
      signal,
    });
  }

  stopPredictionMarketOracleDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning(
      "failed to close prediction market oracle worker database client",
      {
        err: closeError,
      },
    );
  }

  await shutdownObservability();

  process.exit(error ? 1 : 0);
};

process.on("uncaughtException", (error) => {
  void shutdown("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  void shutdown("unhandledRejection", reason);
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

startPredictionMarketOracleDispatcher();

logger.info("prediction market oracle worker booted", {
  enabled: config.predictionMarketOracleWorkerEnabled,
  intervalMs: config.predictionMarketOracleWorkerIntervalMs,
  batchSize: config.predictionMarketOracleBatchSize,
  requestTimeoutMs: config.predictionMarketOracleRequestTimeoutMs,
});
