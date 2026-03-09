import { sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import { systemConfig } from '@reward/database';
import type { DbClient, DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { getPrizePoolBalance, setPrizePoolBalance } from '../house/service';
import { DEFAULT_DRAW_COST, DEFAULT_DRAW_COST_KEY } from './keys';

export type DbExecutor = DbClient | DbTransaction;

type ConfigRow = {
  config_number: string | number | null;
  config_value: Record<string, unknown> | null;
};

const readConfigRow = async (
  db: DbExecutor,
  key: string,
  lock: boolean
): Promise<ConfigRow | null> => {
  const lockClause = lock ? sql.raw('FOR UPDATE') : sql.raw('');
  const result = await db.execute(sql`
    SELECT config_number, config_value
    FROM ${systemConfig}
    WHERE ${systemConfig.configKey} = ${key}
    ${lockClause}
  `);

  return readSqlRows<ConfigRow>(result)[0] ?? null;
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

const parseConfigBool = (row: ConfigRow | null, fallback = false) => {
  if (row?.config_number !== null && row?.config_number !== undefined) {
    return toDecimal(row.config_number).gt(0);
  }

  const legacy = row?.config_value;
  if (legacy && typeof legacy.value === 'boolean') {
    return legacy.value;
  }
  if (legacy && typeof legacy.value === 'number') {
    return legacy.value > 0;
  }
  if (legacy && typeof legacy.value === 'string') {
    const normalized = legacy.value.toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  return fallback;
};

const parseConfigString = (row: ConfigRow | null, fallback = '') => {
  const legacy = row?.config_value;
  if (legacy && typeof legacy.value === 'string') {
    return legacy.value;
  }
  return fallback;
};

const parseConfigJson = <T>(row: ConfigRow | null, fallback: T): T => {
  const legacy = row?.config_value;
  if (legacy && typeof legacy === 'object') {
    return legacy as unknown as T;
  }
  return fallback;
};

export async function getConfigBool(
  db: DbExecutor,
  key: string,
  fallback = false,
  lock = false
) {
  const row = await readConfigRow(db, key, lock);
  if (!row) {
    await setConfigDecimal(db, key, fallback ? 1 : 0, 'Auto-created config entry');
    return fallback;
  }
  return parseConfigBool(row, fallback);
}

export async function getConfigString(
  db: DbExecutor,
  key: string,
  fallback = '',
  lock = false
) {
  const row = await readConfigRow(db, key, lock);
  if (!row) {
    await db
      .insert(systemConfig)
      .values({
        configKey: key,
        configNumber: null,
        configValue: { value: fallback },
        description: 'Auto-created config entry',
      })
      .onConflictDoNothing();
    return fallback;
  }
  return parseConfigString(row, fallback);
}

export async function getConfigJson<T>(
  db: DbExecutor,
  key: string,
  fallback: T,
  lock = false
) {
  const row = await readConfigRow(db, key, lock);
  if (!row) {
    await db
      .insert(systemConfig)
      .values({
        configKey: key,
        configNumber: null,
        configValue: fallback as unknown as Record<string, unknown>,
        description: 'Auto-created config entry',
      })
      .onConflictDoNothing();
    return fallback;
  }
  return parseConfigJson(row, fallback);
}

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
  lock = false
) {
  return getPrizePoolBalance(db, lock);
}

export async function setPoolBalance(db: DbExecutor, value: Decimal.Value) {
  await setPrizePoolBalance(db, value, {
    entryType: 'prize_pool_admin_set',
    referenceType: 'system_config',
  });
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
