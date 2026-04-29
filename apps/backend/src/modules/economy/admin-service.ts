import {
  freezeRecords,
  giftEnergyAccounts,
  giftTransfers,
  iapProducts,
  storePurchaseOrders,
  storePurchaseReceipts,
  userAssetBalances,
} from '@reward/database';
import { and, desc, eq, sql } from '@reward/database/orm';

import { db } from '../../db';
import { toMoneyString, type MoneyValue } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { conflictError, notFoundError, unprocessableEntityError } from '../../shared/errors';
import type { AssetCode, StorePurchaseStatus } from '@reward/shared-types/economy';
import { creditAsset, debitAsset } from './service';
import {
  replayStorePurchaseOrderFulfillment,
  reverseStorePurchaseOrderByAdmin,
} from './iap-service';

type AssetTotalsRow = {
  assetCode: AssetCode;
  userCount: number;
  availableBalance: string | number;
  lockedBalance: string | number;
};

type OrderStatusRow = {
  status: StorePurchaseStatus;
  count: number;
};

type GiftRiskSignalRow = {
  senderUserId: number;
  receiverUserId: number;
  transferCount: number;
  totalAmount: string | number;
  sharedDeviceCount: number;
  sharedIpCount: number;
  lastTransferAt: Date | string | null;
};

const resolveValidDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
};

export async function getAdminEconomyOverview() {
  const [assetTotalsResult, giftSummaryResult, energySummaryResult, orderStatusResult] =
    await Promise.all([
      db.execute(sql`
        SELECT
          asset_code AS "assetCode",
          count(*)::int AS "userCount",
          coalesce(sum(available_balance), 0) AS "availableBalance",
          coalesce(sum(locked_balance), 0) AS "lockedBalance"
        FROM ${userAssetBalances}
        GROUP BY asset_code
        ORDER BY asset_code
      `),
      db.execute(sql`
        SELECT
          count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS "sentTodayCount",
          coalesce(sum(amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS "sentTodayAmount",
          count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS "sentLast24hCount",
          coalesce(sum(amount) FILTER (WHERE created_at >= now() - interval '24 hours'), 0) AS "sentLast24hAmount"
        FROM ${giftTransfers}
        WHERE status = 'completed'
      `),
      db.execute(sql`
        SELECT
          count(*) FILTER (WHERE current_energy = 0)::int AS "exhaustedCount",
          count(*) FILTER (WHERE current_energy < max_energy)::int AS "belowMaxCount",
          count(*)::int AS "accountCount"
        FROM ${giftEnergyAccounts}
      `),
      db.execute(sql`
        SELECT
          status,
          count(*)::int AS count
        FROM ${storePurchaseOrders}
        GROUP BY status
        ORDER BY status
      `),
    ]);

  const [giftSummary] = readSqlRows<{
    sentTodayCount: number;
    sentTodayAmount: string | number;
    sentLast24hCount: number;
    sentLast24hAmount: string | number;
  }>(giftSummaryResult);
  const [energySummary] = readSqlRows<{
    exhaustedCount: number;
    belowMaxCount: number;
    accountCount: number;
  }>(energySummaryResult);

  const [recentGifts, recentOrders, giftLocks, giftRiskSignals] = await Promise.all([
    db
      .select()
      .from(giftTransfers)
      .orderBy(desc(giftTransfers.createdAt), desc(giftTransfers.id))
      .limit(20),
    db
      .select({
        id: storePurchaseOrders.id,
        userId: storePurchaseOrders.userId,
        recipientUserId: storePurchaseOrders.recipientUserId,
        status: storePurchaseOrders.status,
        storeChannel: storePurchaseOrders.storeChannel,
        createdAt: storePurchaseOrders.createdAt,
        updatedAt: storePurchaseOrders.updatedAt,
        sku: iapProducts.sku,
        deliveryType: iapProducts.deliveryType,
      })
      .from(storePurchaseOrders)
      .innerJoin(iapProducts, eq(iapProducts.id, storePurchaseOrders.iapProductId))
      .orderBy(desc(storePurchaseOrders.createdAt), desc(storePurchaseOrders.id))
      .limit(30),
    db
      .select()
      .from(freezeRecords)
      .where(
        and(
          eq(freezeRecords.scope, 'gift_lock'),
          eq(freezeRecords.status, 'active'),
        ),
      )
      .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id))
      .limit(20),
    db.execute(sql`
      SELECT
        sender_user_id AS "senderUserId",
        receiver_user_id AS "receiverUserId",
        count(*)::int AS "transferCount",
        coalesce(sum(amount), 0) AS "totalAmount",
        count(distinct device_fingerprint) FILTER (WHERE device_fingerprint IS NOT NULL) AS "sharedDeviceCount",
        count(distinct metadata->>'requestIp') FILTER (WHERE metadata ? 'requestIp') AS "sharedIpCount",
        max(created_at) AS "lastTransferAt"
      FROM ${giftTransfers}
      WHERE status = 'completed'
        AND created_at >= now() - interval '7 days'
      GROUP BY sender_user_id, receiver_user_id
      HAVING count(*) >= 3 OR coalesce(sum(amount), 0) >= 50
      ORDER BY count(*) DESC, max(created_at) DESC
      LIMIT 20
    `),
  ]);

  return {
    assetTotals: readSqlRows<AssetTotalsRow>(assetTotalsResult).map((row) => ({
      assetCode: row.assetCode,
      userCount: Number(row.userCount ?? 0),
      availableBalance: toMoneyString(row.availableBalance ?? 0),
      lockedBalance: toMoneyString(row.lockedBalance ?? 0),
    })),
    giftSummary: {
      sentTodayCount: Number(giftSummary?.sentTodayCount ?? 0),
      sentTodayAmount: toMoneyString(giftSummary?.sentTodayAmount ?? 0),
      sentLast24hCount: Number(giftSummary?.sentLast24hCount ?? 0),
      sentLast24hAmount: toMoneyString(giftSummary?.sentLast24hAmount ?? 0),
    },
    energySummary: {
      exhaustedCount: Number(energySummary?.exhaustedCount ?? 0),
      belowMaxCount: Number(energySummary?.belowMaxCount ?? 0),
      accountCount: Number(energySummary?.accountCount ?? 0),
    },
    orderSummary: readSqlRows<OrderStatusRow>(orderStatusResult).map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
    })),
    recentGifts: recentGifts.map((gift) => ({
      id: gift.id,
      senderUserId: gift.senderUserId,
      receiverUserId: gift.receiverUserId,
      assetCode: gift.assetCode,
      amount: toMoneyString(gift.amount ?? 0),
      energyCost: gift.energyCost,
      status: gift.status,
      sourceApp: gift.sourceApp ?? null,
      deviceFingerprint: gift.deviceFingerprint ?? null,
      requestId: gift.requestId ?? null,
      metadata:
        gift.metadata && typeof gift.metadata === 'object'
          ? (gift.metadata as Record<string, unknown>)
          : null,
      createdAt: resolveValidDate(gift.createdAt),
      updatedAt: resolveValidDate(gift.updatedAt),
    })),
    recentOrders: recentOrders.map((order) => ({
      ...order,
      createdAt: resolveValidDate(order.createdAt),
      updatedAt: resolveValidDate(order.updatedAt),
    })),
    activeGiftLocks: giftLocks.map((record) => ({
      id: record.id,
      userId: record.userId,
      reason: record.reason,
      scope: record.scope,
      status: record.status,
      metadata:
        record.metadata && typeof record.metadata === 'object'
          ? (record.metadata as Record<string, unknown>)
          : null,
      createdAt: resolveValidDate(record.createdAt),
      updatedAt: resolveValidDate(record.releasedAt),
    })),
    riskSignals: readSqlRows<GiftRiskSignalRow>(giftRiskSignals).map((row) => ({
      senderUserId: row.senderUserId,
      receiverUserId: row.receiverUserId,
      transferCount: Number(row.transferCount ?? 0),
      totalAmount: toMoneyString(row.totalAmount ?? 0),
      sharedDeviceCount: Number(row.sharedDeviceCount ?? 0),
      sharedIpCount: Number(row.sharedIpCount ?? 0),
      lastTransferAt: resolveValidDate(row.lastTransferAt),
    })),
  };
}

export async function createAdminEconomyAdjustment(payload: {
  userId: number;
  assetCode: AssetCode;
  amount: MoneyValue;
  direction: 'credit' | 'debit';
  reason: string;
  adminId: number | null;
}) {
  const trimmedReason = payload.reason.trim();
  if (!trimmedReason) {
    throw unprocessableEntityError('Adjustment reason is required.');
  }

  return payload.direction === 'credit'
    ? creditAsset({
        userId: payload.userId,
        assetCode: payload.assetCode,
        amount: payload.amount,
        entryType: 'admin_manual_adjustment_credit',
        referenceType: 'admin_manual_adjustment',
        referenceId: payload.userId,
        audit: {
          actorType: 'admin',
          actorId: payload.adminId,
          metadata: {
            reason: trimmedReason,
          },
        },
      })
    : debitAsset({
        userId: payload.userId,
        assetCode: payload.assetCode,
        amount: payload.amount,
        entryType: 'admin_manual_adjustment_debit',
        referenceType: 'admin_manual_adjustment',
        referenceId: payload.userId,
        audit: {
          actorType: 'admin',
          actorId: payload.adminId,
          metadata: {
            reason: trimmedReason,
          },
        },
      });
}

export async function getAdminEconomyOrderDetail(orderId: number) {
  const [order] = await db
    .select({
      id: storePurchaseOrders.id,
      userId: storePurchaseOrders.userId,
      recipientUserId: storePurchaseOrders.recipientUserId,
      status: storePurchaseOrders.status,
      storeChannel: storePurchaseOrders.storeChannel,
      externalOrderId: storePurchaseOrders.externalOrderId,
      sourceApp: storePurchaseOrders.sourceApp,
      deviceFingerprint: storePurchaseOrders.deviceFingerprint,
      requestId: storePurchaseOrders.requestId,
      metadata: storePurchaseOrders.metadata,
      createdAt: storePurchaseOrders.createdAt,
      updatedAt: storePurchaseOrders.updatedAt,
      sku: iapProducts.sku,
      deliveryType: iapProducts.deliveryType,
    })
    .from(storePurchaseOrders)
    .innerJoin(iapProducts, eq(iapProducts.id, storePurchaseOrders.iapProductId))
    .where(eq(storePurchaseOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw notFoundError('Store purchase order not found.');
  }

  const [receipt] = await db
    .select()
    .from(storePurchaseReceipts)
    .where(eq(storePurchaseReceipts.orderId, orderId))
    .orderBy(desc(storePurchaseReceipts.createdAt), desc(storePurchaseReceipts.id))
    .limit(1);

  return {
    order: {
      ...order,
      createdAt: resolveValidDate(order.createdAt),
      updatedAt: resolveValidDate(order.updatedAt),
    },
    receipt: receipt
      ? {
          id: receipt.id,
          externalTransactionId: receipt.externalTransactionId ?? null,
          purchaseToken: receipt.purchaseToken ?? null,
          metadata:
            receipt.metadata && typeof receipt.metadata === 'object'
              ? (receipt.metadata as Record<string, unknown>)
              : null,
          createdAt: resolveValidDate(receipt.createdAt),
          updatedAt: resolveValidDate(receipt.updatedAt),
        }
      : null,
  };
}

export async function replayAdminEconomyOrder(payload: {
  orderId: number;
  adminId: number | null;
}) {
  return replayStorePurchaseOrderFulfillment({
    orderId: payload.orderId,
    audit: {
      actorType: 'admin',
      actorId: payload.adminId,
      metadata: {
        operatorAction: 'replay_fulfillment',
      },
    },
  });
}

export async function reverseAdminEconomyOrder(payload: {
  orderId: number;
  targetStatus: Extract<StorePurchaseStatus, 'refunded' | 'revoked'>;
  reason: string;
  adminId: number | null;
}) {
  const trimmedReason = payload.reason.trim();
  if (!trimmedReason) {
    throw conflictError('Reverse reason is required.');
  }

  return reverseStorePurchaseOrderByAdmin({
    orderId: payload.orderId,
    targetStatus: payload.targetStatus,
    reason: trimmedReason,
    audit: {
      actorType: 'admin',
      actorId: payload.adminId,
      metadata: {
        operatorAction: 'manual_reverse',
      },
    },
  });
}
