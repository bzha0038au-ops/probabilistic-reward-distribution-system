import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIZE_ENGINE_AGENT_ID_HEADER,
  parsePrizeEngineResponse,
  requestPrizeEngineApi,
} from "../src/api";

const makeJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

test("requestPrizeEngineApi retries safe GET network failures and merges headers", async () => {
  let attempts = 0;
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  const sleeps: number[] = [];

  const result = await requestPrizeEngineApi<{ healthy: boolean }>(
    {
      baseUrl: "https://engine.example/",
      environment: "sandbox",
      random: () => 0,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      getApiKey: async () => "api-key-1",
      getHeaders: async () => ({ "X-Workspace": "reward" }),
      fetchImpl: async (input, init) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("socket hang up");
        }

        capturedUrl = String(input);
        capturedHeaders = new Headers(init?.headers);
        return makeJsonResponse(
          {
            ok: true,
            data: { healthy: true },
          },
          { status: 200 },
        );
      },
    },
    "/v1/engine/overview",
    { cache: "no-store" },
    {
      headers: { "X-Request-Scope": "unit" },
      agentId: "agent-42",
      retry: {
        baseDelayMs: 10,
        maxDelayMs: 20,
        jitterRatio: 0,
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [10]);
  assert.equal(capturedUrl, "https://engine.example/v1/engine/overview");
  assert.equal(capturedHeaders.get("Authorization"), "Bearer api-key-1");
  assert.equal(capturedHeaders.get("X-Workspace"), "reward");
  assert.equal(capturedHeaders.get("X-Request-Scope"), "unit");
  assert.equal(capturedHeaders.get(PRIZE_ENGINE_AGENT_ID_HEADER), "agent-42");
});

test("parsePrizeEngineResponse falls back cleanly when the upstream body is not json", async () => {
  const result = await parsePrizeEngineResponse<{ id: number }>(
    new Response("upstream exploded", { status: 502 }),
  );

  assert.deepEqual(result, {
    ok: false,
    error: { message: "Request failed." },
    requestId: undefined,
    traceId: undefined,
    status: 502,
  });
});
