import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    databaseUrl: 'postgres://test',
    drawCost: 10,
    logLevel: 'info',
    nodeEnv: 'test' as 'test' | 'production',
    webBaseUrl: 'http://localhost:3000',
    adminBaseUrl: 'http://localhost:5173',
    port: 4000,
    drawPoolCacheTtlSeconds: 60,
  },
}));

vi.mock('../../shared/config', () => ({
  getConfig: () => mockConfig,
}));

import { getConfigDecimal, getConfigString } from './service';

type MockRow = {
  config_number?: string | number | null;
  config_value?: Record<string, unknown> | null;
};

const makeDb = (row?: MockRow | null) => {
  const onConflictDoNothing = vi.fn(async () => undefined);
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({
    onConflictDoNothing,
    onConflictDoUpdate,
  }));
  const insert = vi.fn(() => ({ values }));

  return {
    db: {
      execute: async () => ({ rows: row ? [row] : [] }),
      insert,
    } as unknown as Parameters<typeof getConfigDecimal>[0],
    insert,
    values,
    onConflictDoNothing,
    onConflictDoUpdate,
  };
};

describe('system config reads', () => {
  beforeEach(() => {
    mockConfig.nodeEnv = 'test';
    vi.clearAllMocks();
  });

  it('reads numeric config values', async () => {
    const { db } = makeDb({ config_number: '12.50', config_value: null });
    const value = await getConfigDecimal(db, 'draw_cost', 0);
    expect(value.toFixed(2)).toBe('12.50');
  });

  it('falls back to legacy json config values', async () => {
    const { db } = makeDb({ config_number: null, config_value: { value: '7.25' } });
    const value = await getConfigDecimal(db, 'draw_cost', 0);
    expect(value.toFixed(2)).toBe('7.25');
  });

  it('auto-creates missing config outside production', async () => {
    const { db, insert, values, onConflictDoUpdate } = makeDb();

    const value = await getConfigDecimal(db, 'draw_cost', 10);

    expect(value.toFixed(2)).toBe('10.00');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      configKey: 'draw_cost',
      configNumber: '10.00',
      configValue: null,
      description: 'Auto-created config entry',
    });
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('fails fast when a config row is missing in production', async () => {
    mockConfig.nodeEnv = 'production';
    const { db, insert } = makeDb();

    await expect(getConfigDecimal(db, 'draw_cost', 10)).rejects.toThrow(
      'Missing required system_config entry "draw_cost" in production.'
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('fails fast when a config row is invalid in production', async () => {
    mockConfig.nodeEnv = 'production';
    const { db } = makeDb({ config_number: 1, config_value: null });

    await expect(
      getConfigString(db, 'system.site_name', 'Prize Pool & Probability Engine System')
    ).rejects.toThrow(
      'Invalid system_config entry "system.site_name" in production.'
    );
  });
});
