import "dotenv/config";

import { client } from "../db";
import {
  startBlackjackTimeoutDispatcher,
  stopBlackjackTimeoutDispatcher,
} from "../modules/blackjack/dispatcher";
import { getConfigView, type AppConfig } from "../shared/config";
import { logger } from "../shared/logger";
import {
  captureException,
  initializeObservability,
  shutdownObservability,
} from "../shared/telemetry";

type BlackjackTimeoutWorkerConfig = AppConfig & {
  blackjackTimeoutWorkerEnabled: boolean;
  blackjackTimeoutWorkerIntervalMs: number;
  blackjackTimeoutWorkerBatchSize: number;
  blackjackTurnTimeoutMs: number;
};

initializeObservability();
const config = getConfigView<BlackjackTimeoutWorkerConfig>();

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
    logger.error("blackjack timeout worker shutting down after fatal error", {
      signal,
      err: error,
    });
    captureException(error, {
      tags: {
        service_role: "blackjack_timeout_worker",
        signal,
      },
    });
  } else {
    logger.info("blackjack timeout worker shutting down", {
      signal,
    });
  }

  stopBlackjackTimeoutDispatcher();

  try {
    await client.end();
  } catch (closeError) {
    logger.warning("failed to close blackjack timeout worker database client", {
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

startBlackjackTimeoutDispatcher();

logger.info("blackjack timeout worker booted", {
  enabled: config.blackjackTimeoutWorkerEnabled,
  intervalMs: config.blackjackTimeoutWorkerIntervalMs,
  batchSize: config.blackjackTimeoutWorkerBatchSize,
  turnTimeoutMs: config.blackjackTurnTimeoutMs,
});
