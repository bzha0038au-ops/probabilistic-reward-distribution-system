import assert from "node:assert/strict";
import test from "node:test";

import {
  BFF_BASE_PATH,
  normalizeBackendPath,
  resolveBackendProxyRoute,
} from "../lib/api/proxy";

test("normalizeBackendPath trims whitespace and collapses duplicate slashes", () => {
  assert.equal(BFF_BASE_PATH, "/api/backend");
  assert.equal(normalizeBackendPath(" portal/saas/overview "), "/portal/saas/overview");
  assert.equal(
    normalizeBackendPath("//portal//saas//projects//42//keys"),
    "/portal/saas/projects/42/keys",
  );
  assert.equal(normalizeBackendPath(""), "/");
});

test("resolveBackendProxyRoute reports both method mismatches and unknown paths", () => {
  assert.deepEqual(
    resolveBackendProxyRoute("POST", "/portal/saas/overview"),
    {
      matched: true,
      normalizedPath: "/portal/saas/overview",
      requiresAuth: true,
      methods: ["GET"],
      methodAllowed: false,
    },
  );

  assert.deepEqual(
    resolveBackendProxyRoute("DELETE", "/portal/saas/projects/42/prizes/5"),
    {
      matched: true,
      normalizedPath: "/portal/saas/projects/42/prizes/5",
      requiresAuth: true,
      methods: ["PATCH", "DELETE"],
      methodAllowed: true,
    },
  );

  assert.deepEqual(resolveBackendProxyRoute("GET", "/portal/saas/secrets"), {
    matched: false,
    normalizedPath: "/portal/saas/secrets",
  });
});
