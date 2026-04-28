import "dotenv/config";

import { client } from "../db";
import {
  startHoldemTimeoutDispatcher,
  stopHoldemTimeoutDispatcher,
} from "../modules/holdem/dispatcher";
import { getConfigView, type AppConfig } from "../shared/config";
import { logger } from "../shared/logger";
import {
  captureException,
  initializeObservability,
  shutdownObservability,
} from "../shared/telemetry";

type HoldemTimeoutWorkerConfig = AppConfig & {
  holdemTimeoutWorkerEnabled: boolean;
  holdemTimeoutWorkerIntervalMs: number;
  holdemTimeoutWorkerBatchSize: number;
  holdemTurnTimeoutMs: number;
};

initializeObservability();
const config = getConfigView<HoldemTimeoutWorkerConfig>();

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
    logger.error("holdem timeout worker shutting down after fatal error", {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: "holdem_timeout_worker",
        signal,
      },
    });
  } else {
    logger.info("holdem timeout worker shutting down", {
      signal,
    });
  }

  stopHoldemTimeoutDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning("failed to close holdem timeout worker database client", {
      err: closeError,
    });
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

startHoldemTimeoutDispatcher();

logger.info("holdem timeout worker booted", {
  enabled: config.holdemTimeoutWorkerEnabled,
  intervalMs: config.holdemTimeoutWorkerIntervalMs,
  batchSize: config.holdemTimeoutWorkerBatchSize,
  turnTimeoutMs: config.holdemTurnTimeoutMs,
});
