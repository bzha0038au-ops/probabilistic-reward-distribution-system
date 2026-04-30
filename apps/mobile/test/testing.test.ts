import assert from "node:assert/strict";
import test from "node:test";

import { buildTestId } from "../src/testing";

test("buildTestId normalizes casing, spacing, and punctuation", () => {
  assert.equal(
    buildTestId(" Wallet ", null, "Bonus Balance", 42, "Primary CTA"),
    "wallet-bonus-balance-42-primary-cta",
  );
});

test("buildTestId drops empty fragments after normalization", () => {
  assert.equal(buildTestId(undefined, "***", "   ", "User Session"), "user-session");
  assert.equal(buildTestId(null, undefined, ""), "");
});
