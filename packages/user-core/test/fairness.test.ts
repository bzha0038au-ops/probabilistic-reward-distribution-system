import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  getFairnessRevealDate,
  sha256Hex,
  verifyFairnessReveal,
} from "../src/fairness";

test("sha256Hex matches the platform crypto implementation", () => {
  for (const input of ["abc", "reward-system", "你好, reward"]) {
    assert.equal(
      sha256Hex(input),
      createHash("sha256").update(input).digest("hex"),
    );
  }
});

test("verifyFairnessReveal returns both the computed hash and the match flag", () => {
  const seed = "server-seed-123";
  const commitHash = sha256Hex(seed);

  assert.deepEqual(verifyFairnessReveal({ seed, commitHash }), {
    computedHash: commitHash,
    matches: true,
  });
  assert.equal(
    verifyFairnessReveal({ seed, commitHash: "deadbeef" }).matches,
    false,
  );
});

test("getFairnessRevealDate uses the next epoch boundary", () => {
  assert.equal(getFairnessRevealDate(null), null);
  assert.equal(
    getFairnessRevealDate({ epoch: 4, epochSeconds: 60 })?.toISOString(),
    new Date(5 * 60 * 1_000).toISOString(),
  );
});
