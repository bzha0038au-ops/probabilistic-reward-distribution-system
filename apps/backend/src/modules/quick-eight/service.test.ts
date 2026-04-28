import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5433/reward_test';

const { drawQuickEightNumbers, resolveQuickEightMultiplier } = await import('./service');

describe('quick eight service helpers', () => {
  it('draws deterministic unique numbers from the configured board', () => {
    const first = drawQuickEightNumbers({
      seed: 'seed-1',
      userId: 42,
      clientNonce: 'nonce-1',
    });
    const second = drawQuickEightNumbers({
      seed: 'seed-1',
      userId: 42,
      clientNonce: 'nonce-1',
    });

    expect(second).toEqual(first);
    expect(first.drawnNumbers).toHaveLength(20);
    expect(new Set(first.drawnNumbers).size).toBe(20);
    expect(first.drawnNumbers).toEqual([...first.drawnNumbers].sort((a, b) => a - b));
    expect(first.drawnNumbers[0]).toBeGreaterThanOrEqual(1);
    expect(first.drawnNumbers[19]).toBeLessThanOrEqual(80);
    expect(first.rngDigest).toHaveLength(64);
  });

  it('resolves the configured payout multipliers', () => {
    expect(resolveQuickEightMultiplier(3).toFixed(2)).toBe('0.00');
    expect(resolveQuickEightMultiplier(6).toFixed(2)).toBe('95.00');
    expect(resolveQuickEightMultiplier(8).toFixed(2)).toBe('4800.00');
  });
});
