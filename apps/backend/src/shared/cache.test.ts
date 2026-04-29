import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  delMock,
  execMock,
  getMock,
  getRedisMock,
  mgetMock,
  pipelineSetMock,
  setMock,
} = vi.hoisted(() => {
  const pipelineSetMock = vi.fn();
  const execMock = vi.fn(async () => []);
  const getMock = vi.fn();
  const mgetMock = vi.fn();
  const setMock = vi.fn(async () => 'OK');
  const delMock = vi.fn(async () => 1);
  const getRedisMock = vi.fn(() => ({
    get: getMock,
    mget: mgetMock,
    set: setMock,
    del: delMock,
    pipeline: () => ({
      set: pipelineSetMock,
      exec: execMock,
    }),
  }));

  return {
    delMock,
    execMock,
    getMock,
    getRedisMock,
    mgetMock,
    pipelineSetMock,
    setMock,
  };
});

vi.mock('./redis', () => ({
  getRedis: getRedisMock,
}));

vi.mock('./logger', () => ({
  logger: {
    warning: vi.fn(),
  },
}));

import {
  deleteCacheKeys,
  readJsonCache,
  readJsonCacheMany,
  writeJsonCache,
  writeJsonCacheMany,
} from './cache';

describe('shared cache helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a cached json value', async () => {
    getMock.mockResolvedValueOnce(JSON.stringify({ value: 7 }));

    const cached = await readJsonCache('system-config:draw_cost', (value) =>
      typeof value === 'object' && value !== null && 'value' in value
        ? (value as { value: number })
        : null
    );

    expect(cached).toEqual({ value: 7 });
    expect(getMock).toHaveBeenCalledWith('system-config:draw_cost');
  });

  it('reads many cached json values and skips malformed ones', async () => {
    mgetMock.mockResolvedValueOnce([
      JSON.stringify({ value: 1 }),
      'not-json',
      null,
    ]);

    const cached = await readJsonCacheMany(
      ['key:a', 'key:b', 'key:c'],
      (value) =>
        typeof value === 'object' && value !== null && 'value' in value
          ? (value as { value: number })
          : null
    );

    expect(cached).toEqual(new Map([['key:a', { value: 1 }]]));
  });

  it('writes strict ttl cache entries', async () => {
    await writeJsonCache('key:a', { value: 1 }, 60);
    await writeJsonCache('key:b', { value: 2 }, 0);

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith('key:a', JSON.stringify({ value: 1 }), 'EX', 60);
  });

  it('writes many strict ttl cache entries through a pipeline', async () => {
    await writeJsonCacheMany([
      { key: 'key:a', value: { value: 1 }, ttlSeconds: 60 },
      { key: 'key:b', value: { value: 2 }, ttlSeconds: 0 },
      { key: 'key:c', value: { value: 3 }, ttlSeconds: 15 },
    ]);

    expect(pipelineSetMock).toHaveBeenCalledTimes(2);
    expect(pipelineSetMock).toHaveBeenNthCalledWith(
      1,
      'key:a',
      JSON.stringify({ value: 1 }),
      'EX',
      60
    );
    expect(pipelineSetMock).toHaveBeenNthCalledWith(
      2,
      'key:c',
      JSON.stringify({ value: 3 }),
      'EX',
      15
    );
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('deletes cache keys in one call', async () => {
    await deleteCacheKeys(['key:a', 'key:b']);

    expect(delMock).toHaveBeenCalledWith('key:a', 'key:b');
  });
});
