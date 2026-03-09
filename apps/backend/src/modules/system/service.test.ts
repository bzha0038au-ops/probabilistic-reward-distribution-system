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
  }),
}));

import { getConfigDecimal } from './service';

const makeDb = (row: { config_number?: string | number | null; config_value?: { value?: string | number } | null }) =>
  ({
    execute: async () => ({ rows: [row] }),
  }) as unknown as Parameters<typeof getConfigDecimal>[0];

describe('getConfigDecimal', () => {
  it('reads numeric config values', async () => {
    const db = makeDb({ config_number: '12.50', config_value: null });
    const value = await getConfigDecimal(db, 'pool_balance', 0);
    expect(value.toFixed(2)).toBe('12.50');
  });

  it('falls back to legacy json config values', async () => {
    const db = makeDb({ config_number: null, config_value: { value: '7.25' } });
    const value = await getConfigDecimal(db, 'draw_cost', 0);
    expect(value.toFixed(2)).toBe('7.25');
  });
});
