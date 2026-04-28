import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIZE_ENGINE_API_ROUTES,
  createPrizeEngineIdempotencyKey,
  createPrizeEngineClient,
} from "../src/api";

const makeJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const makeDrawBody = () => ({
  ok: true as const,
  data: {
    agent: {
      id: 5,
      projectId: 7,
      agentId: "agent-alpha",
      groupId: "cohort-a",
      ownerMetadata: null,
      fingerprint: null,
      status: "active",
      createdAt: "2026-04-28T00:00:00.000Z",
    },
    player: {
      id: 11,
      projectId: 7,
      externalPlayerId: "agent-alpha",
      displayName: null,
      balance: "12.00",
      pityStreak: 0,
      metadata: null,
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    result: {
      id: 99,
      playerId: 11,
      prizeId: null,
      drawCost: "1.00",
      rewardAmount: "0.00",
      status: "miss",
      createdAt: "2026-04-28T00:00:00.000Z",
      fairness: null,
      prize: null,
    },
  },
});

const makeRewardBody = () => ({
  ok: true as const,
  data: {
    ...makeDrawBody().data,
    behavior: {
      actionType: "checkout.completed",
      score: 0.82,
      context: { region: "apac" },
    },
    riskEnvelope: {
      dailyBudgetCap: "25.00",
    },
    budget: {
      amount: "3.00",
      currency: "USD",
      window: "day",
    },
    idempotencyKey: "sdk-reward-1",
    replayed: false,
  },
});

test("reward posts directly to the reward route", async () => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> | null = null;

  const client = createPrizeEngineClient({
    baseUrl: "https://engine.example",
    environment: "sandbox",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return makeJsonResponse(makeRewardBody(), { status: 201 });
    },
  });

  const result = await client.reward({
    agent: {
      agentId: "agent-alpha",
      groupId: "cohort-a",
      metadata: { tier: "gold" },
    },
    behavior: {
      actionType: "checkout.completed",
      score: 0.82,
      context: { region: "apac" },
    },
    riskEnvelope: {
      dailyBudgetCap: "25.00",
    },
    budget: {
      amount: "3.00",
      currency: "USD",
      window: "day",
    },
    idempotencyKey: "sdk-reward-1",
  });

  assert.equal(result.ok, true);
  assert.equal(capturedUrl, `https://engine.example${PRIZE_ENGINE_API_ROUTES.rewards}`);
  assert.equal(capturedHeaders.get("Idempotency-Key"), "sdk-reward-1");
  assert.equal(capturedHeaders.get("Content-Type"), "application/json");
  assert.equal(
    capturedHeaders.get("X-Prize-Engine-Request-Signature")?.startsWith("rw-"),
    true,
  );
  assert.equal(
    (capturedBody?.agent as { agentId?: string } | undefined)?.agentId,
    "agent-alpha",
  );
  assert.equal(
    (capturedBody?.agent as { groupId?: string } | undefined)?.groupId,
    "cohort-a",
  );
  assert.equal(
    (capturedBody?.behavior as { actionType?: string })?.actionType,
    "checkout.completed",
  );
  assert.equal(result.data.idempotencyKey, "sdk-reward-1");
  assert.equal(result.data.agent.agentId, "agent-alpha");
  assert.equal(result.data.behavior.actionType, "checkout.completed");
  assert.equal(result.data.budget?.window, "day");
});

test("reward retries 429 responses with the same idempotency key", async () => {
  const seenKeys: string[] = [];
  const sleeps: number[] = [];
  let attempts = 0;

  const client = createPrizeEngineClient({
    baseUrl: "https://engine.example",
    environment: "sandbox",
    random: () => 0,
    sleep: async (delayMs) => {
      sleeps.push(delayMs);
    },
    fetchImpl: async (_input, init) => {
      attempts += 1;
      const headers = new Headers(init?.headers);
      seenKeys.push(headers.get("Idempotency-Key") ?? "");
      if (attempts === 1) {
        return makeJsonResponse(
          {
            ok: false,
            error: { message: "rate limited" },
          },
          {
            status: 429,
            headers: { "Retry-After": "0" },
          },
        );
      }

      return makeJsonResponse(makeRewardBody(), { status: 200 });
    },
  });

  const result = await client.reward({
    agent: {
      agentId: "agent-alpha",
    },
    behavior: {
      actionType: "checkout.completed",
      score: 0.75,
    },
    idempotencyKey: "fixed-key",
  });

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
  assert.deepEqual(seenKeys, ["fixed-key", "fixed-key"]);
  assert.deepEqual(sleeps, [0]);
});

test("reward forwards an explicit idempotency key in both body and headers", async () => {
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> | null = null;

  const client = createPrizeEngineClient({
    baseUrl: "https://engine.example",
    environment: "sandbox",
    fetchImpl: async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return makeJsonResponse(
        {
          ok: true,
          data: {
            ...makeRewardBody().data,
            idempotencyKey: capturedBody.idempotencyKey,
          },
        },
        { status: 201 },
      );
    },
  });

  const generatedKey = createPrizeEngineIdempotencyKey();
  const result = await client.reward({
    agent: {
      agentId: "agent-auto-idem",
    },
    behavior: {
      actionType: "agent.completed",
      score: 0.55,
    },
    idempotencyKey: generatedKey,
  });

  assert.equal(result.ok, true);
  assert.equal(capturedHeaders.get("Idempotency-Key"), generatedKey);
  assert.equal(capturedBody?.idempotencyKey, generatedKey);
  assert.equal(result.data.idempotencyKey, generatedKey);
});

test("legacy draw does not retry 5xx responses without an idempotency key", async () => {
  let attempts = 0;

  const client = createPrizeEngineClient({
    baseUrl: "https://engine.example",
    environment: "sandbox",
    sleep: async () => {
      throw new Error("sleep should not be called");
    },
    fetchImpl: async () => {
      attempts += 1;
      return makeJsonResponse(
        {
          ok: false,
          error: { message: "server exploded" },
        },
        { status: 500 },
      );
    },
  });

  const result = await client.draw({
    player: {
      playerId: "player-1",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(attempts, 1);
});

test("observability distribution uses the nested namespace and environment fallback", async () => {
  let capturedUrl = "";

  const client = createPrizeEngineClient({
    baseUrl: "https://engine.example",
    environment: "live",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return makeJsonResponse(
        {
          ok: true,
          data: {
            project: {
              id: 7,
              tenantId: 2,
              slug: "alpha",
              name: "Alpha",
              environment: "live",
              status: "active",
              currency: "USD",
              drawCost: "1.00",
              prizePoolBalance: "100.00",
              fairnessEpochSeconds: 3600,
              maxDrawCount: 1,
              missWeight: 5,
            },
            window: {
              days: 7,
              startedAt: "2026-04-21T00:00:00.000Z",
              endedAt: "2026-04-28T00:00:00.000Z",
              baseline: "current_catalog",
            },
            summary: {
              totalDrawCount: 10,
              uniquePlayerCount: 1,
              winCount: 4,
              missCount: 6,
              hitRate: 0.4,
              expectedHitRate: 0.35,
              hitRateDrift: 0.05,
              actualDrawCostAmount: "10.00",
              actualRewardAmount: "6.00",
              expectedRewardAmount: "5.50",
              actualPayoutRate: 0.6,
              expectedPayoutRate: 0.55,
              payoutRateDrift: 0.05,
            },
            distribution: [],
          },
        },
        { status: 200 },
      );
    },
  });

  const result = await client.observability.distribution({ days: 7 });

  assert.equal(result.ok, true);
  assert.equal(
    capturedUrl,
    `https://engine.example${PRIZE_ENGINE_API_ROUTES.observabilityDistribution}?environment=live&days=7`,
  );
});
