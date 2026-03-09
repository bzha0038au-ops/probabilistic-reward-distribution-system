import { describe, expect, it, vi } from 'vitest';

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(() => ({
    from: () => ({
      where: async () => [
        {
          id: 1,
          weight: 10,
          rewardAmount: '5.00',
          poolThreshold: '0',
          userPoolThreshold: '0',
        },
      ],
    }),
  })),
}));

vi.mock('../../shared/config', () => ({
  getConfig: () => ({ drawPoolCacheTtlSeconds: 60 }),
}));

vi.mock('../../shared/redis', () => ({
  getRedis: () => null,
}));

vi.mock('../../shared/logger', () => ({
  logger: {
    warning: vi.fn(),
  },
}));

vi.mock('../../db', () => ({
  db: {
    select: selectMock,
  },
}));

import { getProbabilityPool, invalidateProbabilityPool } from './pool-cache';

describe('probability pool cache', () => {
  it('caches in memory and invalidates correctly', async () => {
    await invalidateProbabilityPool();
    selectMock.mockClear();

    const first = await getProbabilityPool();
    const second = await getProbabilityPool();

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    await invalidateProbabilityPool();
    await getProbabilityPool();

    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});
