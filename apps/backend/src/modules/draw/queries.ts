import { sql } from '@reward/database/orm';
import { z } from 'zod';

import { prizes, userWallets, users } from '@reward/database';
import type { DbTransaction } from '../../db';
import { parseSchema } from '../../shared/validation';
import { readSqlRows } from '../../shared/sql-result';
import {
  DrawUserRowSchema,
  LockedPrizeRowSchema,
  type DrawUserRow,
  type LockedPrizeRow,
} from './types';

const DrawUserRowsSchema = z.array(DrawUserRowSchema);
const LockedPrizeRowsSchema = z.array(LockedPrizeRowSchema);

const parseSqlRows = <T>(
  schema: z.ZodType<T[]>,
  result: unknown,
  errorMessage: string
) => {
  const parsed = parseSchema(schema, readSqlRows<T>(result));
  if (!parsed.isValid) {
    throw new Error(errorMessage);
  }
  return parsed.data;
};

export async function loadLockedDrawUser(
  tx: DbTransaction,
  userId: number
): Promise<DrawUserRow | null> {
  const result = await tx.execute(sql`
    SELECT u.id,
           u.user_pool_balance,
           u.pity_streak,
           u.last_draw_at,
           u.last_win_at,
           w.withdrawable_balance,
           w.bonus_balance,
           w.wagered_amount
    FROM ${users} u
    JOIN ${userWallets} w ON w.user_id = u.id
    WHERE u.id = ${userId}
    FOR UPDATE
  `);

  const rows = parseSqlRows(
    DrawUserRowsSchema,
    result,
    'Invalid draw user snapshot.'
  );
  return rows[0] ?? null;
}

export async function loadLockedPrize(
  tx: DbTransaction,
  prizeId: number
): Promise<LockedPrizeRow | null> {
  const result = await tx.execute(sql`
    SELECT id,
           stock,
           reward_amount,
           is_active,
           pool_threshold,
           user_pool_threshold,
           payout_budget,
           payout_spent,
           payout_period_days,
           payout_period_started_at
    FROM ${prizes}
    WHERE ${prizes.id} = ${prizeId}
      AND ${prizes.deletedAt} IS NULL
    FOR UPDATE
  `);

  const rows = parseSqlRows(
    LockedPrizeRowsSchema,
    result,
    'Invalid locked prize snapshot.'
  );
  return rows[0] ?? null;
}
