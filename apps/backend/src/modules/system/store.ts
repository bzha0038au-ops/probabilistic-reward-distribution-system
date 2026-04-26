import { sql } from '@reward/database/orm';
import Decimal from 'decimal.js';

import { systemConfig } from '@reward/database';
import type { DbClient, DbTransaction } from '../../db';
import { getConfig } from '../../shared/config';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { getPrizePoolBalance, setPrizePoolBalance } from '../house/service';
import { DEFAULT_DRAW_COST, DEFAULT_DRAW_COST_KEY } from './keys';

export type DbExecutor = DbClient | DbTransaction;

type ConfigRow = {
  config_number: string | number | null;
  config_value: Record<string, unknown> | null;
};

const isStrictSystemConfigMode = () => getConfig().nodeEnv === 'production';

const buildMissingConfigError = (key: string) =>
  new Error(
    `Missing required system_config entry "${key}" in production. Run the latest migrations and seed the key before startup.`
  );

const buildInvalidConfigError = (key: string, expected: string) =>
  new Error(
    `Invalid system_config entry "${key}" in production. Expected ${expected}.`
  );

const fallbackOrThrow = <T>(key: string, fallback: T, expected: string): T => {
  if (isStrictSystemConfigMode()) {
    throw buildInvalidConfigError(key, expected);
  }

  return fallback;
};

const autoCreateOrThrow = async (
  key: string,
  createEntry: () => Promise<unknown>
) => {
  if (isStrictSystemConfigMode()) {
    throw buildMissingConfigError(key);
  }

  await createEntry();
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

const parseConfigNumber = (
  key: string,
  row: ConfigRow | null,
  fallback: Decimal.Value
) => {
  if (row?.config_number !== null && row?.config_number !== undefined) {
    return toDecimal(row.config_number);
  }

  const legacy = row?.config_value;
  if (legacy && (typeof legacy.value === 'string' || typeof legacy.value === 'number')) {
    return toDecimal(legacy.value);
  }

  return fallbackOrThrow(key, toDecimal(fallback), 'a numeric value');
};

const parseConfigBool = (key: string, row: ConfigRow | null, fallback = false) => {
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

  return fallbackOrThrow(key, fallback, 'a boolean value');
};

const parseConfigString = (key: string, row: ConfigRow | null, fallback = '') => {
  const legacy = row?.config_value;
  if (legacy && typeof legacy.value === 'string') {
    return legacy.value;
  }

  return fallbackOrThrow(key, fallback, 'a string value');
};

const parseConfigJson = <T>(key: string, row: ConfigRow | null, fallback: T): T => {
  const legacy = row?.config_value;
  if (legacy && typeof legacy === 'object') {
    return legacy as unknown as T;
  }

  return fallbackOrThrow(key, fallback, 'a JSON object value');
};

export async function getConfigBool(
  db: DbExecutor,
  key: string,
  fallback = false,
  lock = false
) {
  const row = await readConfigRow(db, key, lock);
  if (!row) {
    await autoCreateOrThrow(key, () =>
      setConfigDecimal(db, key, fallback ? 1 : 0, 'Auto-created config entry')
    );
    return fallback;
  }
  return parseConfigBool(key, row, fallback);
}

export async function getConfigString(
  db: DbExecutor,
  key: string,
  fallback = '',
  lock = false
) {
  const row = await readConfigRow(db, key, lock);
  if (!row) {
    await autoCreateOrThrow(key, () =>
      db
        .insert(systemConfig)
        .values({
          configKey: key,
          configNumber: null,
          configValue: { value: fallback },
          description: 'Auto-created config entry',
        })
        .onConflictDoNothing()
    );
    return fallback;
  }
  return parseConfigString(key, row, fallback);
}

export async function getConfigJson<T>(
  db: DbExecutor,
  key: string,
  fallback: T,
  lock = false
) {
  const row = await readConfigRow(db, key, lock);
  if (!row) {
    await autoCreateOrThrow(key, () =>
      db
        .insert(systemConfig)
        .values({
          configKey: key,
          configNumber: null,
          configValue: fallback as unknown as Record<string, unknown>,
          description: 'Auto-created config entry',
        })
        .onConflictDoNothing()
    );
    return fallback;
  }
  return parseConfigJson(key, row, fallback);
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
    await autoCreateOrThrow(key, () =>
      setConfigDecimal(db, key, fallback, 'Auto-created config entry')
    );
    return toDecimal(fallback);
  }

  return parseConfigNumber(key, row, fallback);
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
