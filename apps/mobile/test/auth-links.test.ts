import assert from "node:assert/strict";
import test from "node:test";

import { parseAuthLink, resolveAuthTokenInput } from "../src/auth-links";

test("parseAuthLink accepts reset-password links from a custom scheme", () => {
  assert.deepEqual(parseAuthLink("reward://reset-password?token=reset-123"), {
    screen: "resetPassword",
    token: "reset-123",
    rawUrl: "reward://reset-password?token=reset-123",
  });
});

test("parseAuthLink accepts verify-email links from nested web paths", () => {
  assert.deepEqual(
    parseAuthLink("https://app.example.com/auth/verify-email?token=email-456"),
    {
      screen: "verifyEmail",
      token: "email-456",
      rawUrl: "https://app.example.com/auth/verify-email?token=email-456",
    },
  );
});

test("resolveAuthTokenInput extracts tokens from supported links and keeps raw input otherwise", () => {
  assert.equal(
    resolveAuthTokenInput(" https://app.example.com/reset-password?token=abc123 "),
    "abc123",
  );
  assert.equal(resolveAuthTokenInput("  plain-token  "), "plain-token");
  assert.equal(
    resolveAuthTokenInput("https://app.example.com/reset-password"),
    "https://app.example.com/reset-password",
  );
});
