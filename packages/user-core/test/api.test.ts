import assert from "node:assert/strict";
import test from "node:test";

import {
  parseApiResponse,
  requestUserApi,
  resolveLocalApiBaseUrl,
  resolveUserRealtimeUrl,
} from "../src/api";

const makeJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

test("resolveLocalApiBaseUrl and resolveUserRealtimeUrl honor platform defaults and ws conversion", () => {
  assert.equal(resolveLocalApiBaseUrl("web"), "http://localhost:4000");
  assert.equal(resolveLocalApiBaseUrl("android"), "http://10.0.2.2:4000");
  assert.equal(
    resolveUserRealtimeUrl({
      baseUrl: "https://api.example.com/",
      authToken: "token-1",
      query: {
        locale: "zh-CN",
        debug: true,
        empty: "",
      },
    }),
    "wss://api.example.com/realtime?token=token-1&locale=zh-CN&debug=true",
  );
});

test("parseApiResponse preserves request ids and falls back to header trace ids", async () => {
  const result = await parseApiResponse<{ ok: boolean }>(
    makeJsonResponse(
      {
        ok: false,
        error: { message: "denied" },
        requestId: "req-1",
      },
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "x-trace-id": "trace-1",
        },
      },
    ),
  );

  assert.deepEqual(result, {
    ok: false,
    error: { message: "denied" },
    requestId: "req-1",
    traceId: "trace-1",
    status: 403,
  });
});

test("requestUserApi forwards auth and locale headers and normalizes network failures", async () => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();

  const success = await requestUserApi<{ balance: string }>({
    path: "/wallet",
    baseUrl: "https://api.example.com/",
    locale: "zh-CN",
    authToken: "secret-token",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return makeJsonResponse(
        {
          ok: true,
          data: { balance: "12.34" },
        },
        { status: 200 },
      );
    },
  });

  assert.equal(capturedUrl, "https://api.example.com/wallet");
  assert.equal(capturedHeaders.get("Authorization"), "Bearer secret-token");
  assert.equal(capturedHeaders.get("x-locale"), "zh-CN");
  assert.equal(success.ok, true);

  const failure = await requestUserApi({
    path: "/wallet",
    baseUrl: "https://api.example.com/",
    fetchImpl: async () => {
      throw new Error("Network request failed");
    },
  });

  assert.deepEqual(failure, {
    ok: false,
    error: {
      code: "NETWORK_REQUEST_FAILED",
      message:
        "Network request failed. Check that the API server is reachable and try again.",
    },
    status: 0,
  });
});
