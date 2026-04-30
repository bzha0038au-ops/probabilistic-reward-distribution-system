import {
  freezeRecords,
  economyLedgerEntries,
  giftEnergyAccounts,
  giftTransfers,
  userAssetBalances,
} from '@reward/database';
import { and, asc, desc, eq, inArray, sql } from '@reward/database/orm';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import {
  assetCodeValues,
  type AssetCode,
  type GiftDirection,
  type GiftEnergyRefillPolicy,
} from '@reward/shared-types/economy';
import Decimal from 'decimal.js';

import { db, type DbClient, type DbTransaction } from '../../db';
import { context } from '../../shared/context';
import {
  conflictError,
  persistenceError,
  unprocessableEntityError,
} from '../../shared/errors';
import { toDecimal, toMoneyString, type MoneyValue } from '../../shared/money';
import {
  recordEconomyLedgerWriteFailed,
  recordGiftEnergyExhausted,
  recordGiftSent,
} from '../../shared/observability';
import { readSqlRows } from '../../shared/sql-result';

type DbExecutor = DbClient | DbTransaction;

type AssetBalanceRow = {
  user_id: number;
  asset_code: AssetCode;
  available_balance: string | number;
  locked_balance: string | number;
  lifetime_earned: string | number;
  lifetime_spent: string | number;
};

type GiftEnergyRow = {
  user_id: number;
  current_energy: number;
  max_energy: number;
  refill_policy: GiftEnergyRefillPolicy;
  last_refill_at: Date | string | null;
};

type IdempotentLedgerRow = {
  amount: string | number;
  balance_before: string | number;
  balance_after: string | number;
  metadata: Record<string, unknown> | null;
};

type EconomyLedgerInsert = typeof economyLedgerEntries.$inferInsert;

export type EconomyAuditContext = {
  actorType?: string | null;
  actorId?: number | null;
  sourceApp?: string | null;
  deviceFingerprint?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

type AssetMutationPayload = {
  userId: number;
  assetCode: AssetCode;
  amount: MoneyValue;
  entryType: string;
  referenceType?: string | null;
  referenceId?: number | null;
  audit?: EconomyAuditContext | null;
};

export type AssetMutationResult = {
  userId: number;
  assetCode: AssetCode;
  amount: string;
  availableBefore: string;
  availableAfter: string;
  lockedBefore: string;
  lockedAfter: string;
  replayed: boolean;
};

export type GiftTransferResult = {
  id: number;
  senderUserId: number;
  receiverUserId: number;
  assetCode: AssetCode;
  amount: string;
  energyCost: number;
  status: string;
  idempotencyKey: string;
  sourceApp: string | null;
  deviceFingerprint: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  replayed: boolean;
};

const DEFAULT_ASSET_CODES = [...assetCodeValues];
const DEFAULT_GIFT_ENERGY_MAX = 10;
const DEFAULT_GIFT_ENERGY_POLICY: GiftEnergyRefillPolicy = {
  type: 'daily_reset',
  intervalHours: 24,
  refillAmount: DEFAULT_GIFT_ENERGY_MAX,
};

const withExecutor = async <T>(
  executor: DbExecutor,
  callback: (tx: DbTransaction | DbExecutor) => Promise<T>
) => {
  if (executor === db) {
    return db.transaction(async (tx) => callback(tx));
  }

  return callback(executor);
};

const normalizePositiveAmount = (value: MoneyValue) => {
  const amount = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!amount.isFinite() || amount.lte(0)) {
    throw unprocessableEntityError('Amount must be greater than 0.', {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }
  return amount;
};

const normalizeNonZeroAmount = (value: MoneyValue) => {
  const amount = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!amount.isFinite() || amount.eq(0)) {
    throw unprocessableEntityError('Amount must not be 0.', {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }
  return amount;
};

const normalizeNonNegativeAmount = (value: MoneyValue) => {
  const amount = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!amount.isFinite() || amount.lt(0)) {
    throw unprocessableEntityError('Amount must be 0 or greater.', {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }
  return amount;
};

const resolveAuditContext = (input?: EconomyAuditContext | null) => {
  const store = context().getStore();

  return {
    actorType: input?.actorType ?? store?.role ?? 'system',
    actorId: input?.actorId ?? store?.userId ?? null,
    sourceApp: input?.sourceApp ?? null,
    deviceFingerprint: input?.deviceFingerprint ?? null,
    requestId: input?.requestId ?? store?.requestId ?? null,
    idempotencyKey: input?.idempotencyKey ?? null,
    metadata: input?.metadata ?? null,
  };
};

const toLockedSnapshot = (
  lockedBefore: Decimal,
  lockedAfter: Decimal,
  metadata?: Record<string, unknown> | null
) => ({
  ...(metadata ?? {}),
  lockedBalanceBefore: toMoneyString(lockedBefore),
  lockedBalanceAfter: toMoneyString(lockedAfter),
});

const readLockedSnapshot = (metadata: Record<string, unknown> | null) => {
  const lockedBefore = metadata?.lockedBalanceBefore;
  const lockedAfter = metadata?.lockedBalanceAfter;

  return {
    lockedBefore:
      typeof lockedBefore === 'string' || typeof lockedBefore === 'number'
        ? toMoneyString(lockedBefore)
        : toMoneyString(0),
    lockedAfter:
      typeof lockedAfter === 'string' || typeof lockedAfter === 'number'
        ? toMoneyString(lockedAfter)
        : toMoneyString(0),
  };
};

export async function ensureUserAssetBalances(
  userId: number,
  executor: DbExecutor = db
) {
  await executor
    .insert(userAssetBalances)
    .values(
      DEFAULT_ASSET_CODES.map((assetCode) => ({
        userId,
        assetCode,
      }))
    )
    .onConflictDoNothing();
}

export async function ensureGiftEnergyAccount(
  userId: number,
  executor: DbExecutor = db
) {
  const now = new Date();
  await executor
    .insert(giftEnergyAccounts)
    .values({
      userId,
      currentEnergy: DEFAULT_GIFT_ENERGY_MAX,
      maxEnergy: DEFAULT_GIFT_ENERGY_MAX,
      refillPolicy: DEFAULT_GIFT_ENERGY_POLICY,
      lastRefillAt: now,
    })
    .onConflictDoNothing();
}

const lockUserAssetBalance = async (
  executor: DbExecutor,
  userId: number,
  assetCode: AssetCode
) => {
  await ensureUserAssetBalances(userId, executor);

  const result = await executor.execute(sql`
    SELECT
      user_id,
      asset_code,
      available_balance,
      locked_balance,
      lifetime_earned,
      lifetime_spent
    FROM ${userAssetBalances}
    WHERE ${userAssetBalances.userId} = ${userId}
      AND ${userAssetBalances.assetCode} = ${assetCode}
    FOR UPDATE
  `);
  const [row] = readSqlRows<AssetBalanceRow>(result);

  if (!row) {
    throw persistenceError('Asset balance not found.');
  }

  return row;
};

const resolveValidDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
};

const serializeAssetBalance = (asset: {
  userId: number;
  assetCode: AssetCode | string;
  availableBalance: string | number;
  lockedBalance: string | number;
  lifetimeEarned: string | number;
  lifetimeSpent: string | number;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}) => ({
  userId: asset.userId,
  assetCode: asset.assetCode as AssetCode,
  availableBalance: toMoneyString(asset.availableBalance ?? 0),
  lockedBalance: toMoneyString(asset.lockedBalance ?? 0),
  lifetimeEarned: toMoneyString(asset.lifetimeEarned ?? 0),
  lifetimeSpent: toMoneyString(asset.lifetimeSpent ?? 0),
  createdAt: resolveValidDate(asset.createdAt),
  updatedAt: resolveValidDate(asset.updatedAt),
});

const serializeEconomyLedgerEntry = (entry: {
  id: number;
  userId: number;
  assetCode: AssetCode | string;
  entryType: string;
  amount: string | number;
  balanceBefore: string | number;
  balanceAfter: string | number;
  referenceType: string | null;
  referenceId: number | null;
  actorType: string | null;
  actorId: number | null;
  sourceApp: string | null;
  deviceFingerprint: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  createdAt: Date | string | null;
}) => ({
  id: entry.id,
  userId: entry.userId,
  assetCode: entry.assetCode as AssetCode,
  entryType: entry.entryType,
  amount: toMoneyString(entry.amount ?? 0),
  balanceBefore: toMoneyString(entry.balanceBefore ?? 0),
  balanceAfter: toMoneyString(entry.balanceAfter ?? 0),
  referenceType: entry.referenceType ?? null,
  referenceId: entry.referenceId ?? null,
  actorType: entry.actorType ?? null,
  actorId: entry.actorId ?? null,
  sourceApp: entry.sourceApp ?? null,
  deviceFingerprint: entry.deviceFingerprint ?? null,
  requestId: entry.requestId ?? null,
  idempotencyKey: entry.idempotencyKey ?? null,
  metadata:
    typeof entry.metadata === 'object' && entry.metadata !== null
      ? (entry.metadata as Record<string, unknown>)
      : null,
  createdAt: resolveValidDate(entry.createdAt),
});

const serializeGiftEnergyAccount = (account: {
  userId: number;
  currentEnergy: number;
  maxEnergy: number;
  refillPolicy: GiftEnergyRefillPolicy;
  lastRefillAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}) => ({
  userId: account.userId,
  currentEnergy: Math.max(0, Math.trunc(account.currentEnergy ?? 0)),
  maxEnergy: Math.max(0, Math.trunc(account.maxEnergy ?? 0)),
  refillPolicy: account.refillPolicy,
  lastRefillAt: resolveValidDate(account.lastRefillAt),
  createdAt: resolveValidDate(account.createdAt),
  updatedAt: resolveValidDate(account.updatedAt),
});

const serializeGiftTransfer = (transfer: {
  id: number;
  senderUserId: number;
  receiverUserId: number;
  assetCode: AssetCode | string;
  amount: string | number;
  energyCost: number;
  status: string;
  idempotencyKey: string;
  sourceApp: string | null;
  deviceFingerprint: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}) => ({
  id: transfer.id,
  senderUserId: transfer.senderUserId,
  receiverUserId: transfer.receiverUserId,
  assetCode: transfer.assetCode as AssetCode,
  amount: toMoneyString(transfer.amount ?? 0),
  energyCost: Math.max(0, Math.trunc(transfer.energyCost ?? 0)),
  status: transfer.status,
  idempotencyKey: transfer.idempotencyKey,
  sourceApp: transfer.sourceApp ?? null,
  deviceFingerprint: transfer.deviceFingerprint ?? null,
  requestId: transfer.requestId ?? null,
  metadata:
    typeof transfer.metadata === 'object' && transfer.metadata !== null
      ? (transfer.metadata as Record<string, unknown>)
      : null,
  createdAt: resolveValidDate(transfer.createdAt),
  updatedAt: resolveValidDate(transfer.updatedAt),
});

const applyGiftEnergyRefill = async (
  executor: DbExecutor,
  row: GiftEnergyRow,
  now = new Date()
) => {
  const lastRefillAt = resolveValidDate(row.last_refill_at) ?? now;
  const policy = row.refill_policy ?? DEFAULT_GIFT_ENERGY_POLICY;
  const maxEnergy = Math.max(0, Math.trunc(row.max_energy ?? 0));
  const currentEnergy = Math.max(0, Math.trunc(row.current_energy ?? 0));
  const intervalMs = Math.max(1, policy.intervalHours) * 60 * 60 * 1000;

  if (now.getTime() - lastRefillAt.getTime() < intervalMs) {
    return {
      userId: row.user_id,
      currentEnergy,
      maxEnergy,
      refillPolicy: policy,
      lastRefillAt,
      createdAt: null,
      updatedAt: null,
    };
  }

  await executor
    .update(giftEnergyAccounts)
    .set({
      currentEnergy: maxEnergy,
      lastRefillAt: now,
      updatedAt: now,
    })
    .where(eq(giftEnergyAccounts.userId, row.user_id));

  return {
    userId: row.user_id,
    currentEnergy: maxEnergy,
    maxEnergy,
    refillPolicy: policy,
    lastRefillAt: now,
    createdAt: null,
    updatedAt: now,
  };
};

const lockGiftEnergyAccount = async (executor: DbExecutor, userId: number) => {
  await ensureGiftEnergyAccount(userId, executor);

  const result = await executor.execute(sql`
    SELECT
      user_id,
      current_energy,
      max_energy,
      refill_policy,
      last_refill_at
    FROM ${giftEnergyAccounts}
    WHERE ${giftEnergyAccounts.userId} = ${userId}
    FOR UPDATE
  `);
  const [row] = readSqlRows<GiftEnergyRow>(result);

  if (!row) {
    throw persistenceError('Gift energy account not found.');
  }

  return row;
};

const findIdempotentLedgerEntry = async (
  executor: DbExecutor,
  userId: number,
  assetCode: AssetCode,
  idempotencyKey: string | null
) => {
  if (!idempotencyKey) {
    return null;
  }

  const [entry] = await executor
    .select({
      amount: economyLedgerEntries.amount,
      balanceBefore: economyLedgerEntries.balanceBefore,
      balanceAfter: economyLedgerEntries.balanceAfter,
      metadata: economyLedgerEntries.metadata,
    })
    .from(economyLedgerEntries)
    .where(
      and(
        eq(economyLedgerEntries.userId, userId),
        eq(economyLedgerEntries.assetCode, assetCode),
        eq(economyLedgerEntries.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  return entry
    ? ({
        amount: entry.amount,
        balance_before: entry.balanceBefore,
        balance_after: entry.balanceAfter,
        metadata:
          (entry.metadata as Record<string, unknown> | null | undefined) ?? null,
      } satisfies IdempotentLedgerRow)
    : null;
};

const insertEconomyLedgerEntries = async (
  executor: DbExecutor,
  values: EconomyLedgerInsert | EconomyLedgerInsert[]
) => {
  try {
    if (Array.isArray(values)) {
      await executor.insert(economyLedgerEntries).values(values);
    } else {
      await executor.insert(economyLedgerEntries).values(values);
    }
  } catch (error) {
    const entries = Array.isArray(values) ? values : [values];
    for (const entry of entries) {
      recordEconomyLedgerWriteFailed(entry.entryType);
    }
    throw error;
  }
};

const applyLedgerMutation = async (
  executor: DbExecutor,
  payload: AssetMutationPayload,
  compute: (state: {
    amount: Decimal;
    availableBefore: Decimal;
    lockedBefore: Decimal;
    lifetimeEarnedBefore: Decimal;
    lifetimeSpentBefore: Decimal;
  }) => {
    ledgerAmount: Decimal;
    availableAfter: Decimal;
    lockedAfter: Decimal;
    lifetimeEarnedAfter: Decimal;
    lifetimeSpentAfter: Decimal;
  }
): Promise<AssetMutationResult> => {
  return withExecutor(executor, async (tx) => {
    const audit = resolveAuditContext(payload.audit);
    const existing = await findIdempotentLedgerEntry(
      tx,
      payload.userId,
      payload.assetCode,
      audit.idempotencyKey
    );

    if (existing) {
      const lockedSnapshot = readLockedSnapshot(existing.metadata);
      return {
        userId: payload.userId,
        assetCode: payload.assetCode,
        amount: toMoneyString(payload.amount),
        availableBefore: toMoneyString(existing.balance_before),
        availableAfter: toMoneyString(existing.balance_after),
        lockedBefore: lockedSnapshot.lockedBefore,
        lockedAfter: lockedSnapshot.lockedAfter,
        replayed: true,
      };
    }

    const amount = normalizePositiveAmount(payload.amount);
    const row = await lockUserAssetBalance(tx, payload.userId, payload.assetCode);
    const availableBefore = toDecimal(row.available_balance ?? 0);
    const lockedBefore = toDecimal(row.locked_balance ?? 0);
    const lifetimeEarnedBefore = toDecimal(row.lifetime_earned ?? 0);
    const lifetimeSpentBefore = toDecimal(row.lifetime_spent ?? 0);

    const next = compute({
      amount,
      availableBefore,
      lockedBefore,
      lifetimeEarnedBefore,
      lifetimeSpentBefore,
    });

    await tx
      .update(userAssetBalances)
      .set({
        availableBalance: toMoneyString(next.availableAfter),
        lockedBalance: toMoneyString(next.lockedAfter),
        lifetimeEarned: toMoneyString(next.lifetimeEarnedAfter),
        lifetimeSpent: toMoneyString(next.lifetimeSpentAfter),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userAssetBalances.userId, payload.userId),
          eq(userAssetBalances.assetCode, payload.assetCode)
        )
      );

    await insertEconomyLedgerEntries(tx, {
      userId: payload.userId,
      assetCode: payload.assetCode,
      entryType: payload.entryType,
      amount: toMoneyString(next.ledgerAmount),
      balanceBefore: toMoneyString(availableBefore),
      balanceAfter: toMoneyString(next.availableAfter),
      referenceType: payload.referenceType ?? null,
      referenceId: payload.referenceId ?? null,
      actorType: audit.actorType,
      actorId: audit.actorId,
      sourceApp: audit.sourceApp,
      deviceFingerprint: audit.deviceFingerprint,
      requestId: audit.requestId,
      idempotencyKey: audit.idempotencyKey,
      metadata: toLockedSnapshot(
        lockedBefore,
        next.lockedAfter,
        audit.metadata ?? null
      ),
    });

    return {
      userId: payload.userId,
      assetCode: payload.assetCode,
      amount: toMoneyString(amount),
      availableBefore: toMoneyString(availableBefore),
      availableAfter: toMoneyString(next.availableAfter),
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(next.lockedAfter),
      replayed: false,
    };
  });
};

export async function listUserAssetBalances(
  userId: number,
  executor: DbExecutor = db
) {
  await ensureUserAssetBalances(userId, executor);

  const rows = await executor
    .select()
    .from(userAssetBalances)
    .where(eq(userAssetBalances.userId, userId))
    .orderBy(asc(userAssetBalances.id));

  const byCode = new Map(rows.map((row) => [row.assetCode, row]));

  return DEFAULT_ASSET_CODES.map((assetCode) => {
    const row = byCode.get(assetCode);
    const asset = row ?? {
      id: 0,
      userId,
      assetCode,
      availableBalance: '0',
      lockedBalance: '0',
      lifetimeEarned: '0',
      lifetimeSpent: '0',
      createdAt: null,
      updatedAt: null,
    };

    return serializeAssetBalance(asset);
  });
}

export async function listEconomyLedgerEntries(
  userId: number,
  options: {
    limit?: number;
    assetCode?: AssetCode;
  } = {},
  executor: DbExecutor = db
) {
  const rows = await executor
    .select()
    .from(economyLedgerEntries)
    .where(
      options.assetCode
        ? and(
            eq(economyLedgerEntries.userId, userId),
            eq(economyLedgerEntries.assetCode, options.assetCode)
          )
        : eq(economyLedgerEntries.userId, userId)
    )
    .orderBy(desc(economyLedgerEntries.createdAt), desc(economyLedgerEntries.id))
    .limit(options.limit ?? 50);

  return rows.map(serializeEconomyLedgerEntry);
}

export async function getGiftEnergyAccount(
  userId: number,
  executor: DbExecutor = db
) {
  return withExecutor(executor, async (tx) => {
    const locked = await lockGiftEnergyAccount(tx, userId);
    const resolved = await applyGiftEnergyRefill(tx, locked);
    const [row] = await tx
      .select()
      .from(giftEnergyAccounts)
      .where(eq(giftEnergyAccounts.userId, userId))
      .limit(1);

    return serializeGiftEnergyAccount({
      userId,
      currentEnergy: resolved.currentEnergy,
      maxEnergy: resolved.maxEnergy,
      refillPolicy: resolved.refillPolicy,
      lastRefillAt: resolved.lastRefillAt,
      createdAt: row?.createdAt ?? null,
      updatedAt: resolved.updatedAt ?? row?.updatedAt ?? null,
    });
  });
}

export async function listGiftTransfers(
  userId: number,
  options: {
    direction?: GiftDirection;
    limit?: number;
  } = {},
  executor: DbExecutor = db
) {
  const direction = options.direction ?? 'all';
  const limit = options.limit ?? 50;

  const result = await executor.execute(
    direction === 'sent'
      ? sql`
          SELECT *
          FROM ${giftTransfers}
          WHERE ${giftTransfers.senderUserId} = ${userId}
          ORDER BY ${giftTransfers.createdAt} DESC, ${giftTransfers.id} DESC
          LIMIT ${limit}
        `
      : direction === 'received'
        ? sql`
            SELECT *
            FROM ${giftTransfers}
            WHERE ${giftTransfers.receiverUserId} = ${userId}
            ORDER BY ${giftTransfers.createdAt} DESC, ${giftTransfers.id} DESC
            LIMIT ${limit}
          `
        : sql`
            SELECT *
            FROM ${giftTransfers}
            WHERE ${giftTransfers.senderUserId} = ${userId}
               OR ${giftTransfers.receiverUserId} = ${userId}
            ORDER BY ${giftTransfers.createdAt} DESC, ${giftTransfers.id} DESC
            LIMIT ${limit}
          `
  );

  return readSqlRows<{
    id: number;
    sender_user_id: number;
    receiver_user_id: number;
    asset_code: AssetCode;
    amount: string | number;
    energy_cost: number;
    status: string;
    idempotency_key: string;
    source_app: string | null;
    device_fingerprint: string | null;
    request_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date | string | null;
    updated_at: Date | string | null;
  }>(result).map((row) =>
    serializeGiftTransfer({
      id: row.id,
      senderUserId: row.sender_user_id,
      receiverUserId: row.receiver_user_id,
      assetCode: row.asset_code,
      amount: row.amount,
      energyCost: row.energy_cost,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      sourceApp: row.source_app,
      deviceFingerprint: row.device_fingerprint,
      requestId: row.request_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  );
}

export async function creditAsset(
  payload: AssetMutationPayload,
  executor: DbExecutor = db
) {
  return applyLedgerMutation(executor, payload, ({
    amount,
    availableBefore,
    lockedBefore,
    lifetimeEarnedBefore,
    lifetimeSpentBefore,
  }) => ({
    ledgerAmount: amount,
    availableAfter: availableBefore.plus(amount),
    lockedAfter: lockedBefore,
    lifetimeEarnedAfter: lifetimeEarnedBefore.plus(amount),
    lifetimeSpentAfter: lifetimeSpentBefore,
  }));
}

export async function debitAsset(
  payload: AssetMutationPayload,
  executor: DbExecutor = db
) {
  return applyLedgerMutation(executor, payload, ({
    amount,
    availableBefore,
    lockedBefore,
    lifetimeEarnedBefore,
    lifetimeSpentBefore,
  }) => {
    if (availableBefore.lt(amount)) {
      throw conflictError('Insufficient asset balance.', {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    return {
      ledgerAmount: amount.negated(),
      availableAfter: availableBefore.minus(amount),
      lockedAfter: lockedBefore,
      lifetimeEarnedAfter: lifetimeEarnedBefore,
      lifetimeSpentAfter: lifetimeSpentBefore.plus(amount),
    };
  });
}

export async function lockAsset(
  payload: AssetMutationPayload,
  executor: DbExecutor = db
) {
  return applyLedgerMutation(executor, payload, ({
    amount,
    availableBefore,
    lockedBefore,
    lifetimeEarnedBefore,
    lifetimeSpentBefore,
  }) => {
    if (availableBefore.lt(amount)) {
      throw conflictError('Insufficient asset balance.', {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    return {
      ledgerAmount: amount.negated(),
      availableAfter: availableBefore.minus(amount),
      lockedAfter: lockedBefore.plus(amount),
      lifetimeEarnedAfter: lifetimeEarnedBefore,
      lifetimeSpentAfter: lifetimeSpentBefore,
    };
  });
}

export async function unlockAsset(
  payload: AssetMutationPayload,
  executor: DbExecutor = db
) {
  return applyLedgerMutation(executor, payload, ({
    amount,
    availableBefore,
    lockedBefore,
    lifetimeEarnedBefore,
    lifetimeSpentBefore,
  }) => {
    if (lockedBefore.lt(amount)) {
      throw conflictError('Insufficient locked asset balance.', {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    return {
      ledgerAmount: amount,
      availableAfter: availableBefore.plus(amount),
      lockedAfter: lockedBefore.minus(amount),
      lifetimeEarnedAfter: lifetimeEarnedBefore,
      lifetimeSpentAfter: lifetimeSpentBefore,
    };
  });
}

export async function settleLockedAsset(
  payload: {
    userId: number;
    assetCode: AssetCode;
    lockedAmount: MoneyValue;
    payoutAmount: MoneyValue;
    entryType: string;
    referenceType?: string | null;
    referenceId?: number | null;
    audit?: EconomyAuditContext | null;
  },
  executor: DbExecutor = db
) {
  return withExecutor(executor, async (tx) => {
    const audit = resolveAuditContext(payload.audit);
    const shouldPersistLedgerEntry =
      toDecimal(payload.payoutAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).gt(0);
    const existing =
      shouldPersistLedgerEntry && audit.idempotencyKey
        ? await findIdempotentLedgerEntry(
            tx,
            payload.userId,
            payload.assetCode,
            audit.idempotencyKey
          )
        : null;

    if (existing) {
      const lockedSnapshot = readLockedSnapshot(existing.metadata);
      return {
        userId: payload.userId,
        assetCode: payload.assetCode,
        amount: toMoneyString(existing.amount),
        availableBefore: toMoneyString(existing.balance_before),
        availableAfter: toMoneyString(existing.balance_after),
        lockedBefore: lockedSnapshot.lockedBefore,
        lockedAfter: lockedSnapshot.lockedAfter,
        replayed: true,
      };
    }

    const lockedAmount = normalizePositiveAmount(payload.lockedAmount);
    const payoutAmount = normalizeNonNegativeAmount(payload.payoutAmount);
    const row = await lockUserAssetBalance(tx, payload.userId, payload.assetCode);
    const availableBefore = toDecimal(row.available_balance ?? 0);
    const lockedBefore = toDecimal(row.locked_balance ?? 0);
    const lifetimeEarnedBefore = toDecimal(row.lifetime_earned ?? 0);
    const lifetimeSpentBefore = toDecimal(row.lifetime_spent ?? 0);

    if (lockedBefore.lt(lockedAmount)) {
      throw conflictError('Insufficient locked asset balance.', {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    const availableAfter = availableBefore.plus(payoutAmount);
    const lockedAfter = lockedBefore.minus(lockedAmount);
    const realizedEarned = payoutAmount.gt(lockedAmount)
      ? payoutAmount.minus(lockedAmount)
      : toDecimal(0);
    const realizedSpent = lockedAmount.gt(payoutAmount)
      ? lockedAmount.minus(payoutAmount)
      : toDecimal(0);

    await tx
      .update(userAssetBalances)
      .set({
        availableBalance: toMoneyString(availableAfter),
        lockedBalance: toMoneyString(lockedAfter),
        lifetimeEarned: toMoneyString(lifetimeEarnedBefore.plus(realizedEarned)),
        lifetimeSpent: toMoneyString(lifetimeSpentBefore.plus(realizedSpent)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userAssetBalances.userId, payload.userId),
          eq(userAssetBalances.assetCode, payload.assetCode)
        )
      );

    if (payoutAmount.gt(0)) {
      await insertEconomyLedgerEntries(tx, {
        userId: payload.userId,
        assetCode: payload.assetCode,
        entryType: payload.entryType,
        amount: toMoneyString(payoutAmount),
        balanceBefore: toMoneyString(availableBefore),
        balanceAfter: toMoneyString(availableAfter),
        referenceType: payload.referenceType ?? null,
        referenceId: payload.referenceId ?? null,
        actorType: audit.actorType,
        actorId: audit.actorId,
        sourceApp: audit.sourceApp,
        deviceFingerprint: audit.deviceFingerprint,
        requestId: audit.requestId,
        idempotencyKey: audit.idempotencyKey,
        metadata: toLockedSnapshot(lockedBefore, lockedAfter, {
          ...(audit.metadata ?? {}),
          lockedAmount: toMoneyString(lockedAmount),
          realizedEarned: toMoneyString(realizedEarned),
          realizedSpent: toMoneyString(realizedSpent),
        }),
      });
    }

    return {
      userId: payload.userId,
      assetCode: payload.assetCode,
      amount: toMoneyString(payoutAmount),
      availableBefore: toMoneyString(availableBefore),
      availableAfter: toMoneyString(availableAfter),
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      replayed: false,
    };
  });
}

export async function adjustLockedAsset(
  payload: AssetMutationPayload,
  executor: DbExecutor = db
) {
  return withExecutor(executor, async (tx) => {
    const audit = resolveAuditContext(payload.audit);
    const existing = await findIdempotentLedgerEntry(
      tx,
      payload.userId,
      payload.assetCode,
      audit.idempotencyKey
    );

    if (existing) {
      const lockedSnapshot = readLockedSnapshot(existing.metadata);
      return {
        userId: payload.userId,
        assetCode: payload.assetCode,
        amount: toMoneyString(existing.amount),
        availableBefore: toMoneyString(existing.balance_before),
        availableAfter: toMoneyString(existing.balance_after),
        lockedBefore: lockedSnapshot.lockedBefore,
        lockedAfter: lockedSnapshot.lockedAfter,
        replayed: true,
      };
    }

    const signedDelta = normalizeNonZeroAmount(payload.amount);
    const row = await lockUserAssetBalance(tx, payload.userId, payload.assetCode);
    const availableBefore = toDecimal(row.available_balance ?? 0);
    const lockedBefore = toDecimal(row.locked_balance ?? 0);
    const lifetimeEarnedBefore = toDecimal(row.lifetime_earned ?? 0);
    const lifetimeSpentBefore = toDecimal(row.lifetime_spent ?? 0);
    const lockedAfter = lockedBefore.plus(signedDelta);

    if (lockedAfter.lt(0)) {
      throw conflictError('Insufficient locked asset balance.', {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    await tx
      .update(userAssetBalances)
      .set({
        availableBalance: toMoneyString(availableBefore),
        lockedBalance: toMoneyString(lockedAfter),
        lifetimeEarned: toMoneyString(lifetimeEarnedBefore),
        lifetimeSpent: toMoneyString(lifetimeSpentBefore),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userAssetBalances.userId, payload.userId),
          eq(userAssetBalances.assetCode, payload.assetCode)
        )
      );

    await insertEconomyLedgerEntries(tx, {
      userId: payload.userId,
      assetCode: payload.assetCode,
      entryType: payload.entryType,
      amount: toMoneyString(signedDelta),
      balanceBefore: toMoneyString(availableBefore),
      balanceAfter: toMoneyString(availableBefore),
      referenceType: payload.referenceType ?? null,
      referenceId: payload.referenceId ?? null,
      actorType: audit.actorType,
      actorId: audit.actorId,
      sourceApp: audit.sourceApp,
      deviceFingerprint: audit.deviceFingerprint,
      requestId: audit.requestId,
      idempotencyKey: audit.idempotencyKey,
      metadata: toLockedSnapshot(
        lockedBefore,
        lockedAfter,
        audit.metadata ?? null
      ),
    });

    return {
      userId: payload.userId,
      assetCode: payload.assetCode,
      amount: toMoneyString(signedDelta),
      availableBefore: toMoneyString(availableBefore),
      availableAfter: toMoneyString(availableBefore),
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      replayed: false,
    };
  });
}

export async function transferAssetGift(
  payload: {
    senderUserId: number;
    receiverUserId: number;
    assetCode: AssetCode;
    amount: MoneyValue;
    energyCost: number;
    idempotencyKey: string;
    audit?: Omit<EconomyAuditContext, 'idempotencyKey'> | null;
  },
  executor: DbExecutor = db
): Promise<GiftTransferResult> {
  return withExecutor(executor, async (tx) => {
    const idempotencyKey = payload.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw unprocessableEntityError('Idempotency key is required.', {
        code: API_ERROR_CODES.FIELD_REQUIRED,
      });
    }
    if (payload.senderUserId === payload.receiverUserId) {
      throw conflictError('Cannot send a gift to the same user.');
    }
    if (payload.assetCode !== 'B_LUCK') {
      throw unprocessableEntityError('Only B luck can be sent as a gift.');
    }

    const [existingTransfer] = await tx
      .select()
      .from(giftTransfers)
      .where(eq(giftTransfers.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingTransfer) {
      return {
        ...serializeGiftTransfer(existingTransfer),
        replayed: true,
      };
    }

    const audit = resolveAuditContext({
      ...payload.audit,
      idempotencyKey,
    });
    const amount = normalizePositiveAmount(payload.amount);
    const energyCost = Math.max(0, Math.trunc(payload.energyCost));

    const orderedUserIds = [payload.senderUserId, payload.receiverUserId].sort(
      (left, right) => left - right
    );
    const lockedRows = new Map<number, AssetBalanceRow>();

    for (const userId of orderedUserIds) {
      lockedRows.set(
        userId,
        await lockUserAssetBalance(tx, userId, payload.assetCode)
      );
    }

    const senderRow = lockedRows.get(payload.senderUserId);
    const receiverRow = lockedRows.get(payload.receiverUserId);
    if (!senderRow || !receiverRow) {
      throw persistenceError('Gift transfer balances not found.');
    }

    const blockedUserIds = [payload.senderUserId, payload.receiverUserId];
    const activeGiftRestrictions = await tx
      .select({
        userId: freezeRecords.userId,
        scope: freezeRecords.scope,
      })
      .from(freezeRecords)
      .where(
        and(
          inArray(freezeRecords.userId, blockedUserIds),
          eq(freezeRecords.status, 'active'),
          inArray(freezeRecords.scope, [
            'account_lock',
            'gameplay_lock',
            'gift_lock',
          ])
        )
      );

    if (
      activeGiftRestrictions.some((record) => record.userId === payload.senderUserId)
    ) {
      throw conflictError('Gift ability is currently frozen for this account.');
    }

    if (
      activeGiftRestrictions.some(
        (record) => record.userId === payload.receiverUserId
      )
    ) {
      throw conflictError('Gift recipient is not eligible to receive gifts.');
    }

    const senderAvailableBefore = toDecimal(senderRow.available_balance ?? 0);
    if (senderAvailableBefore.lt(amount)) {
      throw conflictError('Insufficient asset balance.', {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    const senderLockedBefore = toDecimal(senderRow.locked_balance ?? 0);
    const receiverAvailableBefore = toDecimal(receiverRow.available_balance ?? 0);
    const receiverLockedBefore = toDecimal(receiverRow.locked_balance ?? 0);
    const senderSpentBefore = toDecimal(senderRow.lifetime_spent ?? 0);
    const receiverEarnedBefore = toDecimal(receiverRow.lifetime_earned ?? 0);

    let giftEnergyBefore = 0;
    let giftEnergyAfter = 0;

    if (energyCost > 0) {
      const energyAccount = await lockGiftEnergyAccount(tx, payload.senderUserId);
      const resolvedEnergy = await applyGiftEnergyRefill(tx, energyAccount);
      giftEnergyBefore = resolvedEnergy.currentEnergy;
      if (giftEnergyBefore < energyCost) {
        recordGiftEnergyExhausted();
        throw conflictError('Gift energy exhausted.');
      }
      giftEnergyAfter = giftEnergyBefore - energyCost;

      await tx
        .update(giftEnergyAccounts)
        .set({
          currentEnergy: giftEnergyAfter,
          lastRefillAt: resolvedEnergy.lastRefillAt,
          updatedAt: new Date(),
        })
        .where(eq(giftEnergyAccounts.userId, payload.senderUserId));
    }

    const senderAvailableAfter = senderAvailableBefore.minus(amount);
    const receiverAvailableAfter = receiverAvailableBefore.plus(amount);

    const [transfer] = await tx
      .insert(giftTransfers)
      .values({
        senderUserId: payload.senderUserId,
        receiverUserId: payload.receiverUserId,
        assetCode: payload.assetCode,
        amount: toMoneyString(amount),
        energyCost,
        status: 'completed',
        idempotencyKey,
        sourceApp: audit.sourceApp,
        deviceFingerprint: audit.deviceFingerprint,
        requestId: audit.requestId,
        metadata: {
          ...(audit.metadata ?? {}),
          giftEnergyBefore,
          giftEnergyAfter,
        },
      })
      .returning();

    await tx
      .update(userAssetBalances)
      .set({
        availableBalance: toMoneyString(senderAvailableAfter),
        lifetimeSpent: toMoneyString(senderSpentBefore.plus(amount)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userAssetBalances.userId, payload.senderUserId),
          eq(userAssetBalances.assetCode, payload.assetCode)
        )
      );

    await tx
      .update(userAssetBalances)
      .set({
        availableBalance: toMoneyString(receiverAvailableAfter),
        lifetimeEarned: toMoneyString(receiverEarnedBefore.plus(amount)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userAssetBalances.userId, payload.receiverUserId),
          eq(userAssetBalances.assetCode, payload.assetCode)
        )
      );

    await insertEconomyLedgerEntries(tx, [
      {
        userId: payload.senderUserId,
        assetCode: payload.assetCode,
        entryType: 'gift_send',
        amount: toMoneyString(amount.negated()),
        balanceBefore: toMoneyString(senderAvailableBefore),
        balanceAfter: toMoneyString(senderAvailableAfter),
        referenceType: 'gift_transfer',
        referenceId: transfer.id,
        actorType: audit.actorType,
        actorId: audit.actorId,
        sourceApp: audit.sourceApp,
        deviceFingerprint: audit.deviceFingerprint,
        requestId: audit.requestId,
        idempotencyKey,
        metadata: {
          ...(audit.metadata ?? {}),
          counterpartyUserId: payload.receiverUserId,
          energyCost,
          giftEnergyBefore,
          giftEnergyAfter,
          lockedBalanceBefore: toMoneyString(senderLockedBefore),
          lockedBalanceAfter: toMoneyString(senderLockedBefore),
        },
      },
      {
        userId: payload.receiverUserId,
        assetCode: payload.assetCode,
        entryType: 'gift_receive',
        amount: toMoneyString(amount),
        balanceBefore: toMoneyString(receiverAvailableBefore),
        balanceAfter: toMoneyString(receiverAvailableAfter),
        referenceType: 'gift_transfer',
        referenceId: transfer.id,
        actorType: audit.actorType,
        actorId: audit.actorId,
        sourceApp: audit.sourceApp,
        deviceFingerprint: audit.deviceFingerprint,
        requestId: audit.requestId,
        idempotencyKey,
        metadata: {
          ...(audit.metadata ?? {}),
          counterpartyUserId: payload.senderUserId,
          lockedBalanceBefore: toMoneyString(receiverLockedBefore),
          lockedBalanceAfter: toMoneyString(receiverLockedBefore),
        },
      },
    ]);

    const result = {
      ...serializeGiftTransfer(transfer),
      replayed: false,
    };

    recordGiftSent();
    return result;
  });
}
