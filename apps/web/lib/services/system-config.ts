import { eq, sql } from 'drizzle-orm';

import { systemConfig } from '@/lib/schema';

const DEFAULT_POOL_KEY = 'pool_balance';

export async function getConfigNumber(
  db: any,
  key: string,
  fallback = 0,
  lock = false
) {
  const lockClause = lock ? sql.raw('FOR UPDATE') : sql.raw('');

  const { rows } = await db.execute(sql`
    SELECT config_value
    FROM ${systemConfig}
    WHERE ${systemConfig.configKey} = ${key}
    ${lockClause}
  `);

  if (!rows?.length) {
    await db
      .insert(systemConfig)
      .values({
        configKey: key,
        configValue: { value: fallback },
        description: 'Auto-created config entry',
      })
      .onConflictDoNothing();

    const { rows: retryRows } = await db.execute(sql`
      SELECT config_value
      FROM ${systemConfig}
      WHERE ${systemConfig.configKey} = ${key}
      ${lockClause}
    `);

    if (!retryRows?.length) return fallback;

    const stored = retryRows[0]?.config_value;
    return typeof stored?.value === 'number' ? stored.value : fallback;
  }

  const stored = rows[0]?.config_value;
  return typeof stored?.value === 'number' ? stored.value : fallback;
}

export async function setConfigNumber(
  db: any,
  key: string,
  value: number,
  description?: string
) {
  await db
    .update(systemConfig)
    .set({
      configValue: { value },
      description,
      updatedAt: new Date(),
    })
    .where(eq(systemConfig.configKey, key));
}

export async function getPoolBalance(db: any, fallback = 0, lock = false) {
  return getConfigNumber(db, DEFAULT_POOL_KEY, fallback, lock);
}

export async function setPoolBalance(db: any, value: number) {
  return setConfigNumber(db, DEFAULT_POOL_KEY, value, 'Current system pool balance');
}
