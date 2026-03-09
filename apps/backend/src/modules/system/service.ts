import { sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import { systemConfig } from '@reward/database';
import type { DbClient, DbTransaction } from '../../db';
import { getConfig } from '../../shared/config';
import { toDecimal, toMoneyString } from '../../shared/money';

const DEFAULT_POOL_KEY = 'pool_balance';
const DEFAULT_DRAW_COST_KEY = 'draw_cost';
const { drawCost: DEFAULT_DRAW_COST } = getConfig();

type DbExecutor = DbClient | DbTransaction;

type ConfigRow = {
  config_number: string | number | null;
  config_value: { value?: string | number } | null;
};

const readConfigRow = async (
  db: DbExecutor,
  key: string,
  lock: boolean
): Promise<ConfigRow | null> => {
  const lockClause = lock ? sql.raw('FOR UPDATE') : sql.raw('');
  const result = (await db.execute(sql`
    SELECT config_number, config_value
    FROM ${systemConfig}
    WHERE ${systemConfig.configKey} = ${key}
    ${lockClause}
  `)) as unknown as { rows: ConfigRow[] };

  return result.rows?.[0] ?? null;
};

const parseConfigNumber = (row: ConfigRow | null, fallback: Decimal.Value) => {
  if (row?.config_number !== null && row?.config_number !== undefined) {
    return toDecimal(row.config_number);
  }

  const legacy = row?.config_value;
  if (legacy && (typeof legacy.value === 'string' || typeof legacy.value === 'number')) {
    return toDecimal(legacy.value);
  }

  return toDecimal(fallback);
};

export async function setConfigDecimal(
  db: DbExecutor,
  key: string,
  value: Decimal.Value,
  description?: string
) {
  const normalized = toMoneyString(value);
  const updateValues = {
    configNumber: normalized,
    configValue: null,
    updatedAt: new Date(),
    ...(description ? { description } : {}),
  };

  await db
    .insert(systemConfig)
    .values({
      configKey: key,
      configNumber: normalized,
      configValue: null,
      description,
    })
    .onConflictDoUpdate({
      target: systemConfig.configKey,
      set: updateValues,
    });
}

export async function getConfigDecimal(
  db: DbExecutor,
  key: string,
  fallback: Decimal.Value = 0,
  lock = false
) {
  const row = await readConfigRow(db, key, lock);

  if (!row) {
    await setConfigDecimal(db, key, fallback, 'Auto-created config entry');
    return toDecimal(fallback);
  }

  return parseConfigNumber(row, fallback);
}

export async function getPoolBalance(
  db: DbExecutor,
  fallback: Decimal.Value = 0,
  lock = false
) {
  return getConfigDecimal(db, DEFAULT_POOL_KEY, fallback, lock);
}

export async function setPoolBalance(db: DbExecutor, value: Decimal.Value) {
  return setConfigDecimal(
    db,
    DEFAULT_POOL_KEY,
    value,
    'Current system pool balance'
  );
}

export async function getDrawCost(
  db: DbExecutor,
  fallback: Decimal.Value = DEFAULT_DRAW_COST,
  lock = false
) {
  return getConfigDecimal(db, DEFAULT_DRAW_COST_KEY, fallback, lock);
}

export async function setDrawCost(db: DbExecutor, value: Decimal.Value) {
  return setConfigDecimal(db, DEFAULT_DRAW_COST_KEY, value, 'Draw cost');
}
