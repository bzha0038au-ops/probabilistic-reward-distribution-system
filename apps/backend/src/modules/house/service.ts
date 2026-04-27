import { eq, sql } from '@reward/database/orm';

import { houseAccount, houseTransactions, ledgerEntries } from '@reward/database';
import type { DbClient, DbTransaction } from '../../db';
import Decimal from 'decimal.js';
import { persistenceError } from '../../shared/errors';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';

type DbExecutor = DbClient | DbTransaction;

const HOUSE_ACCOUNT_ID = 1;

const ensureHouseAccount = async (db: DbExecutor) => {
  await db
    .insert(houseAccount)
    .values({ id: HOUSE_ACCOUNT_ID })
    .onConflictDoNothing();

  const [account] = await db
    .select()
    .from(houseAccount)
    .where(eq(houseAccount.id, HOUSE_ACCOUNT_ID))
    .limit(1);

  if (!account) {
    throw persistenceError('House account not initialized.');
  }

  return account;
};

export async function getHouseAccount(db: DbExecutor, lock = false) {
  if (!lock) {
    return ensureHouseAccount(db);
  }

  await ensureHouseAccount(db);

  const result = await db.execute(sql`
    SELECT id,
           house_bankroll AS "houseBankroll",
           prize_pool_balance AS "prizePoolBalance",
           marketing_budget AS "marketingBudget",
           reserve_balance AS "reserveBalance",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM ${houseAccount}
    WHERE ${houseAccount.id} = ${HOUSE_ACCOUNT_ID}
    FOR UPDATE
  `);

  const account = readSqlRows<typeof houseAccount.$inferSelect>(result)[0];
  if (!account) {
    throw persistenceError('House account not initialized.');
  }

  return account;
}

export async function getPrizePoolBalance(db: DbExecutor, lock = false) {
  const account = await getHouseAccount(db, lock);
  return toDecimal(account.prizePoolBalance ?? 0);
}

export async function applyPrizePoolDelta(
  db: DbExecutor,
  delta: Decimal.Value,
  params?: {
    entryType?: string;
    referenceType?: string;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const account = await getHouseAccount(db, true);
  const before = toDecimal(account.prizePoolBalance ?? 0);
  const change = toDecimal(delta);
  const after = before.plus(change);

  await db
    .update(houseAccount)
    .set({
      prizePoolBalance: toMoneyString(after),
      updatedAt: new Date(),
    })
    .where(eq(houseAccount.id, account.id));

  const entryType = params?.entryType ?? 'prize_pool_change';
  const amount = toMoneyString(change);
  const balanceBefore = toMoneyString(before);
  const balanceAfter = toMoneyString(after);

  await db.insert(houseTransactions).values({
    houseAccountId: account.id,
    type: entryType,
    amount,
    balanceBefore,
    balanceAfter,
    referenceType: params?.referenceType,
    referenceId: params?.referenceId ?? null,
    metadata: params?.metadata ?? null,
  });

  await db.insert(ledgerEntries).values({
    houseAccountId: account.id,
    entryType,
    amount,
    balanceBefore,
    balanceAfter,
    referenceType: params?.referenceType,
    referenceId: params?.referenceId ?? null,
    metadata: params?.metadata ?? null,
  });

  return { before, after };
}

export async function setPrizePoolBalance(
  db: DbExecutor,
  value: Decimal.Value,
  params?: {
    entryType?: string;
    referenceType?: string;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const account = await getHouseAccount(db, true);
  const before = toDecimal(account.prizePoolBalance ?? 0);
  const next = toDecimal(value);
  const delta = next.minus(before);

  if (delta.eq(0)) {
    return { before, after: before };
  }

  return applyPrizePoolDelta(db, delta, {
    entryType: params?.entryType ?? 'prize_pool_set',
    referenceType: params?.referenceType,
    referenceId: params?.referenceId ?? null,
    metadata: params?.metadata,
  });
}
