import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  assetCodeValues,
  giftTransferStatusValues,
  iapDeliveryTypeValues,
  storeChannelValues,
  storePurchaseStatusValues,
} from '@reward/shared-types/economy';

import { users } from './user.js';

export const userAssetBalances = pgTable(
  'user_asset_balances',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetCode: varchar('asset_code', {
      length: 32,
      enum: assetCodeValues,
    }).notNull(),
    availableBalance: numeric('available_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    lockedBalance: numeric('locked_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    lifetimeEarned: numeric('lifetime_earned', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    lifetimeSpent: numeric('lifetime_spent', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userAssetUnique: uniqueIndex('user_asset_balances_user_asset_unique').on(
      table.userId,
      table.assetCode
    ),
    userAssetCreatedIdx: index('user_asset_balances_user_asset_created_idx').on(
      table.userId,
      table.assetCode,
      table.createdAt
    ),
    assetUpdatedIdx: index('user_asset_balances_asset_updated_idx').on(
      table.assetCode,
      table.updatedAt
    ),
  })
);

export const economyLedgerEntries = pgTable(
  'economy_ledger_entries',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetCode: varchar('asset_code', {
      length: 32,
      enum: assetCodeValues,
    }).notNull(),
    entryType: varchar('entry_type', { length: 64 }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric('balance_before', { precision: 14, scale: 2 })
      .notNull(),
    balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
    referenceType: varchar('reference_type', { length: 64 }),
    referenceId: integer('reference_id'),
    actorType: varchar('actor_type', { length: 32 }),
    actorId: integer('actor_id'),
    sourceApp: varchar('source_app', { length: 64 }),
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
    requestId: varchar('request_id', { length: 191 }),
    idempotencyKey: varchar('idempotency_key', { length: 191 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('economy_ledger_entries_user_created_idx').on(
      table.userId,
      table.createdAt,
      table.id
    ),
    assetCreatedIdx: index('economy_ledger_entries_asset_created_idx').on(
      table.assetCode,
      table.createdAt,
      table.id
    ),
    referenceIdx: index('economy_ledger_entries_reference_idx').on(
      table.referenceType,
      table.referenceId,
      table.createdAt
    ),
    requestIdx: index('economy_ledger_entries_request_idx').on(
      table.requestId,
      table.createdAt
    ),
    idempotencyUnique: uniqueIndex(
      'economy_ledger_entries_user_asset_idempotency_unique'
    ).on(table.userId, table.assetCode, table.idempotencyKey),
  })
);

export const giftEnergyAccounts = pgTable(
  'gift_energy_accounts',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    currentEnergy: integer('current_energy').notNull().default(10),
    maxEnergy: integer('max_energy').notNull().default(10),
    refillPolicy: jsonb('refill_policy').notNull(),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    updatedIdx: index('gift_energy_accounts_updated_idx').on(
      table.updatedAt,
      table.userId
    ),
  })
);

export const giftTransfers = pgTable(
  'gift_transfers',
  {
    id: serial('id').primaryKey(),
    senderUserId: integer('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receiverUserId: integer('receiver_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetCode: varchar('asset_code', {
      length: 32,
      enum: assetCodeValues,
    }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    energyCost: integer('energy_cost').notNull().default(0),
    status: varchar('status', {
      length: 32,
      enum: giftTransferStatusValues,
    })
      .notNull()
      .default('pending'),
    idempotencyKey: varchar('idempotency_key', { length: 191 }).notNull(),
    sourceApp: varchar('source_app', { length: 64 }),
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
    requestId: varchar('request_id', { length: 191 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('gift_transfers_idempotency_unique').on(
      table.idempotencyKey
    ),
    senderCreatedIdx: index('gift_transfers_sender_created_idx').on(
      table.senderUserId,
      table.createdAt
    ),
    receiverCreatedIdx: index('gift_transfers_receiver_created_idx').on(
      table.receiverUserId,
      table.createdAt
    ),
    statusCreatedIdx: index('gift_transfers_status_created_idx').on(
      table.status,
      table.createdAt
    ),
  })
);

export const iapProducts = pgTable(
  'iap_products',
  {
    id: serial('id').primaryKey(),
    sku: varchar('sku', { length: 128 }).notNull(),
    storeChannel: varchar('store_channel', {
      length: 16,
      enum: storeChannelValues,
    }).notNull(),
    deliveryType: varchar('delivery_type', {
      length: 32,
      enum: iapDeliveryTypeValues,
    }).notNull(),
    assetCode: varchar('asset_code', {
      length: 32,
      enum: assetCodeValues,
    }),
    assetAmount: numeric('asset_amount', { precision: 14, scale: 2 }),
    deliveryContent: jsonb('delivery_content'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    skuChannelUnique: uniqueIndex('iap_products_sku_channel_unique').on(
      table.sku,
      table.storeChannel
    ),
    deliveryTypeIdx: index('iap_products_delivery_type_idx').on(
      table.deliveryType,
      table.storeChannel
    ),
  })
);

export const giftPackCatalog = pgTable(
  'gift_pack_catalog',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 128 }).notNull(),
    iapProductId: integer('iap_product_id')
      .notNull()
      .references(() => iapProducts.id, { onDelete: 'cascade' }),
    rewardAssetCode: varchar('reward_asset_code', {
      length: 32,
      enum: assetCodeValues,
    }).notNull(),
    rewardAmount: numeric('reward_amount', { precision: 14, scale: 2 }).notNull(),
    deliveryContent: jsonb('delivery_content'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('gift_pack_catalog_code_unique').on(table.code),
    iapProductUnique: uniqueIndex('gift_pack_catalog_iap_product_unique').on(
      table.iapProductId
    ),
  })
);

export const storePurchaseOrders = pgTable(
  'store_purchase_orders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientUserId: integer('recipient_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    iapProductId: integer('iap_product_id')
      .notNull()
      .references(() => iapProducts.id, { onDelete: 'restrict' }),
    storeChannel: varchar('store_channel', {
      length: 16,
      enum: storeChannelValues,
    }).notNull(),
    status: varchar('status', {
      length: 32,
      enum: storePurchaseStatusValues,
    })
      .notNull()
      .default('created'),
    idempotencyKey: varchar('idempotency_key', { length: 191 }).notNull(),
    externalOrderId: varchar('external_order_id', { length: 191 }),
    sourceApp: varchar('source_app', { length: 64 }),
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
    requestId: varchar('request_id', { length: 191 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(
      'store_purchase_orders_idempotency_unique'
    ).on(table.idempotencyKey),
    userCreatedIdx: index('store_purchase_orders_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
    statusCreatedIdx: index('store_purchase_orders_status_created_idx').on(
      table.status,
      table.createdAt
    ),
  })
);

export const storePurchaseReceipts = pgTable(
  'store_purchase_receipts',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => storePurchaseOrders.id, { onDelete: 'cascade' }),
    storeChannel: varchar('store_channel', {
      length: 16,
      enum: storeChannelValues,
    }).notNull(),
    externalTransactionId: varchar('external_transaction_id', { length: 191 }),
    purchaseToken: varchar('purchase_token', { length: 255 }),
    rawPayload: jsonb('raw_payload'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderCreatedIdx: index('store_purchase_receipts_order_created_idx').on(
      table.orderId,
      table.createdAt
    ),
    transactionUnique: uniqueIndex(
      'store_purchase_receipts_transaction_unique'
    ).on(table.storeChannel, table.externalTransactionId),
    purchaseTokenUnique: uniqueIndex(
      'store_purchase_receipts_purchase_token_unique'
    ).on(table.storeChannel, table.purchaseToken),
  })
);
