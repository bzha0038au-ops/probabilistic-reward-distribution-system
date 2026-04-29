import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/config', () => ({
  getConfig: () => ({
    databaseUrl: 'postgres://test',
    drawCost: 10,
    logLevel: 'info',
    nodeEnv: 'test',
    webBaseUrl: 'http://localhost:3000',
    adminBaseUrl: 'http://localhost:5173',
    port: 4000,
    drawPoolCacheTtlSeconds: 60,
  }),
  getConfigView: () => ({
    databaseUrl: 'postgres://test',
    drawCost: 10,
    logLevel: 'info',
    nodeEnv: 'test',
    webBaseUrl: 'http://localhost:3000',
    adminBaseUrl: 'http://localhost:5173',
    port: 4000,
    drawPoolCacheTtlSeconds: 60,
  }),
}));

vi.mock('../../db', () => ({
  db: {
    transaction: async (
      fn: (tx: {
        select: () => {
          from: () => {
            where: () => {
              limit: () => Promise<unknown[]>;
            };
          };
        };
        execute: () => Promise<{ rows: unknown[] }>;
      }) => unknown
    ) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
        execute: async () => ({ rows: [] }),
      }),
  },
}));

import { executeDraw, pickByWeight } from './service';

describe('pickByWeight', () => {
  it('returns null when there is no weight to pick', () => {
    const items = [{ id: 1, weight: 0 }, { id: 2, weight: 0 }];
    expect(pickByWeight(items)).toBeNull();
  });

  it('selects the expected item with a deterministic rng', () => {
    const items = [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 2 },
      { id: 'c', weight: 3 },
    ];

    const selection = pickByWeight(items, () => 2);
    expect(selection?.item.id).toBe('b');
    expect(selection?.randomPick).toBe(2);
    expect(selection?.totalWeight).toBe(6);
  });
});

describe('executeDraw', () => {
  it('throws when the user is missing', async () => {
    await expect(executeDraw(123)).rejects.toThrow('User not found.');
  });
});
