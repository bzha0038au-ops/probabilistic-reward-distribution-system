import { afterEach, describe, expect, it, vi } from "vitest";
import { API_ERROR_CODES } from "@reward/shared-types/api";

vi.mock("../../shared/redis", () => ({
  getRedis: () => null,
}));

import {
  enterPrizeEngineExecutionGovernor,
  resetPrizeEngineExecutionGovernorState,
} from "./prize-engine-governor";

const sleep = async (delayMs: number) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const buildAuth = (overrides?: {
  tenantId?: number;
  projectId?: number;
  tenantMetadata?: Record<string, unknown> | null;
  projectMetadata?: Record<string, unknown> | null;
}) => ({
  tenantId: overrides?.tenantId ?? 101,
  projectId: overrides?.projectId ?? 202,
  tenantMetadata: overrides?.tenantMetadata ?? null,
  projectMetadata: overrides?.projectMetadata ?? null,
});

afterEach(() => {
  resetPrizeEngineExecutionGovernorState();
  vi.clearAllMocks();
});

describe("prize engine governor", () => {
  it("allows direct admission and idempotent release", async () => {
    const lease = await enterPrizeEngineExecutionGovernor(buildAuth());

    expect(lease.queuedMs).toBe(0);

    await lease.release();
    await lease.release();
  });

  it("rejects when tenant admission control is saturated", async () => {
    const auth = buildAuth({
      tenantMetadata: {
        prizeEngineAdmission: {
          maxConcurrent: 1,
        },
      },
      projectMetadata: {
        prizeEngineExecution: {
          maxConcurrency: 2,
          queueDepth: 0,
          queueWaitMs: 0,
        },
      },
    });
    const firstLease = await enterPrizeEngineExecutionGovernor(auth);

    await expect(enterPrizeEngineExecutionGovernor(auth)).rejects.toMatchObject({
      code: API_ERROR_CODES.TENANT_ADMISSION_CONTROL_LIMIT_EXCEEDED,
    });

    await firstLease.release();
  });

  it("queues behind the project concurrency cap and admits after release", async () => {
    const auth = buildAuth({
      projectMetadata: {
        prize_engine_execution: {
          max_concurrency: 1,
          queue_depth: 1,
          queue_wait_ms: 100,
          queue_poll_interval_ms: 2,
        },
      },
    });
    const firstLease = await enterPrizeEngineExecutionGovernor(auth);
    const queuedLeasePromise = enterPrizeEngineExecutionGovernor(auth);

    await sleep(20);
    await firstLease.release();

    const queuedLease = await queuedLeasePromise;
    expect(queuedLease.queuedMs).toBeGreaterThan(0);

    await queuedLease.release();
  });

  it("rejects when the project queue depth is exceeded", async () => {
    const auth = buildAuth({
      projectMetadata: {
        prizeEngineExecution: {
          maxConcurrency: 1,
          queueDepth: 1,
          queueWaitMs: 120,
          queuePollIntervalMs: 2,
        },
      },
    });
    const activeLease = await enterPrizeEngineExecutionGovernor(auth);
    const queuedLeasePromise = enterPrizeEngineExecutionGovernor(auth);

    await sleep(20);
    await expect(enterPrizeEngineExecutionGovernor(auth)).rejects.toMatchObject({
      code: API_ERROR_CODES.PROJECT_QUEUE_DEPTH_EXCEEDED,
    });

    await activeLease.release();
    const queuedLease = await queuedLeasePromise;
    await queuedLease.release();
  });

  it("times out when the queued wait budget is exhausted", async () => {
    const auth = buildAuth({
      projectMetadata: {
        prizeEngineExecution: {
          maxConcurrency: 1,
          queueDepth: 1,
          queueWaitMs: 25,
          queuePollIntervalMs: 2,
        },
      },
    });
    const activeLease = await enterPrizeEngineExecutionGovernor(auth);

    await expect(enterPrizeEngineExecutionGovernor(auth)).rejects.toMatchObject({
      code: API_ERROR_CODES.PROJECT_QUEUE_WAIT_TIMEOUT,
    });

    await activeLease.release();
  });
});
