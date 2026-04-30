import assert from "node:assert/strict";
import test from "node:test";

import { parseApiResponse } from "../lib/api/user";

const makeJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

test("parseApiResponse preserves request ids and falls back to trace headers", async () => {
  const result = await parseApiResponse<{ accepted: boolean }>(
    makeJsonResponse(
      {
        ok: true,
        data: { accepted: true },
        requestId: "req-portal-1",
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-trace-id": "trace-portal-1",
        },
      },
    ),
  );

  assert.deepEqual(result, {
    ok: true,
    data: { accepted: true },
    requestId: "req-portal-1",
    traceId: "trace-portal-1",
    status: 200,
  });
});

test("parseApiResponse falls back to the generic error when the upstream body is invalid", async () => {
  const result = await parseApiResponse<{ accepted: boolean }>(
    new Response("upstream failed", { status: 502 }),
  );

  assert.deepEqual(result, {
    ok: false,
    error: { message: "Request failed." },
    requestId: undefined,
    traceId: undefined,
    status: 502,
  });
});
