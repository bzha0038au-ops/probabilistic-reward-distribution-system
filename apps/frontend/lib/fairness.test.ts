import { describe, expect, it } from 'vitest';

import { sha256Hex, verifyFairnessReveal } from '@reward/user-core';

describe('fairness helpers', () => {
  it('hashes revealed seeds with sha256', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('verifies commit-reveal pairs locally', () => {
    const commitHash = sha256Hex('integration-seed');

    expect(
      verifyFairnessReveal({
        seed: 'integration-seed',
        commitHash,
      })
    ).toEqual({
      computedHash: commitHash,
      matches: true,
    });
  });
});
