import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  depositStatusValues,
  paymentAssetTypeValues,
  paymentChannelTypeValues,
  payoutMethodStatusValues,
  payoutMethodTypeValues,
  withdrawalStatusValues,
} from '@reward/shared-types';

import { admins, users } from './user.js';

export const userWallets = pgTable(
  'user_wallets',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    withdrawableBalance: numeric('withdrawable_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    bonusBalance: numeric('bonus_balance', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    lockedBalance: numeric('locked_balance', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    wageredAmount: numeric('wagered_amount', { precision: 14, scale: 2 })
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
    userIdx: index('user_wallets_user_id_idx').on(table.userId),
  })
);

export const houseAccount = pgTable('house_account', {
  id: serial('id').primaryKey(),
  houseBankroll: numeric('house_bankroll', { precision: 14, scale: 2 })
    .notNull()
    .default('0'),
  prizePoolBalance: numeric('prize_pool_balance', { precision: 14, scale: 2 })
    .notNull()
    .default('0'),
  marketingBudget: numeric('marketing_budget', { precision: 14, scale: 2 })
    .notNull()
    .default('0'),
  reserveBalance: numeric('reserve_balance', { precision: 14, scale: 2 })
    .notNull()
    .default('0'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ledgerMutationEvents = pgTable(
  'ledger_mutation_events',
  {
    id: serial('id').primaryKey(),
    businessEventId: varchar('business_event_id', { length: 191 }).notNull(),
    orderType: varchar('order_type', { length: 32 }).notNull(),
    orderId: integer('order_id').notNull(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    providerId: integer('provider_id').references(() => paymentProviders.id, {
      onDelete: 'set null',
    }),
    mutationType: varchar('mutation_type', { length: 64 }).notNull(),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    sourceEventKey: varchar('source_event_key', { length: 191 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 16 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    businessEventUnique: uniqueIndex(
      'ledger_mutation_events_business_event_unique'
    ).on(table.businessEventId),
    orderIdx: index('ledger_mutation_events_order_idx').on(
      table.orderType,
      table.orderId,
      table.createdAt
    ),
    sourceIdx: index('ledger_mutation_events_source_idx').on(
      table.sourceType,
      table.sourceEventKey
    ),
  })
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    houseAccountId: integer('house_account_id').references(
      () => houseAccount.id,
      { onDelete: 'set null' }
    ),
    entryType: varchar('type', { length: 64 }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric('balance_before', { precision: 14, scale: 2 })
      .notNull(),
    balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
    referenceType: varchar('reference_type', { length: 64 }),
    referenceId: integer('reference_id'),
    ledgerMutationEventId: integer('ledger_mutation_event_id').references(
      () => ledgerMutationEvents.id,
      {
        onDelete: 'set null',
      }
    ),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('ledger_entries_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
    houseCreatedIdx: index('ledger_entries_house_created_idx').on(
      table.houseAccountId,
      table.createdAt
    ),
    typeCreatedIdx: index('ledger_entries_type_created_idx').on(
      table.entryType,
      table.createdAt
    ),
    typeUserIdx: index('ledger_entries_type_user_idx').on(
      table.entryType,
      table.userId
    ),
    mutationEventIdx: index('ledger_entries_mutation_event_idx').on(
      table.ledgerMutationEventId
    ),
  })
);

export const houseTransactions = pgTable(
  'house_transactions',
  {
    id: serial('id').primaryKey(),
    houseAccountId: integer('house_account_id')
      .notNull()
      .references(() => houseAccount.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric('balance_before', { precision: 14, scale: 2 })
      .notNull(),
    balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
    referenceType: varchar('reference_type', { length: 64 }),
    referenceId: integer('reference_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    houseCreatedIdx: index('house_transactions_house_created_idx').on(
      table.houseAccountId,
      table.createdAt
    ),
    typeCreatedIdx: index('house_transactions_type_created_idx').on(
      table.type,
      table.createdAt
    ),
  })
);

export const paymentProviders = pgTable(
  'payment_providers',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    providerType: varchar('provider_type', { length: 64 }).notNull(),
    channelType: varchar('channel_type', {
      length: 16,
      enum: paymentChannelTypeValues,
    }),
    assetType: varchar('asset_type', {
      length: 16,
      enum: paymentAssetTypeValues,
    }),
    assetCode: varchar('asset_code', { length: 64 }),
    network: varchar('network', { length: 64 }),
    priority: integer('priority').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    isCircuitBroken: boolean('is_circuit_broken').notNull().default(false),
    circuitBrokenAt: timestamp('circuit_broken_at', { withTimezone: true }),
    circuitBreakReason: varchar('circuit_break_reason', { length: 255 }),
    config: jsonb('config'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameUnique: uniqueIndex('payment_providers_name_unique').on(table.name),
  })
);

export const paymentOutboundRequests = pgTable(
  'payment_outbound_requests',
  {
    id: serial('id').primaryKey(),
    orderType: varchar('order_type', { length: 32 }).notNull(),
    orderId: integer('order_id').notNull(),
    providerId: integer('provider_id')
      .notNull()
      .references(() => paymentProviders.id, {
        onDelete: 'restrict',
      }),
    action: varchar('action', { length: 64 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 191 }).notNull(),
    requestPayload: jsonb('request_payload').notNull(),
    requestPayloadHash: varchar('request_payload_hash', { length: 64 }).notNull(),
    sendStatus: varchar('send_status', { length: 32 })
      .notNull()
      .default('prepared'),
    attemptCount: integer('attempt_count').notNull().default(0),
    firstSentAt: timestamp('first_sent_at', { withTimezone: true }),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    responseHttpStatus: integer('response_http_status'),
    providerOrderId: varchar('provider_order_id', { length: 128 }),
    responsePayload: jsonb('response_payload'),
    lastErrorCode: varchar('last_error_code', { length: 64 }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerIdemUnique: uniqueIndex(
      'payment_outbound_requests_provider_idem_unique'
    ).on(table.providerId, table.action, table.idempotencyKey),
    orderActionUnique: uniqueIndex(
      'payment_outbound_requests_order_action_unique'
    ).on(table.orderType, table.orderId, table.action),
    retryIdx: index('payment_outbound_requests_retry_idx').on(
      table.sendStatus,
      table.nextRetryAt,
      table.createdAt
    ),
  })
);

export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: serial('id').primaryKey(),
    provider: varchar('provider', { length: 120 }).notNull(),
    eventId: varchar('event_id', { length: 191 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 191 }),
    providerTradeId: varchar('provider_trade_id', { length: 128 }),
    providerOrderId: varchar('provider_order_id', { length: 128 }),
    eventType: varchar('event_type', { length: 64 }),
    dedupeKey: varchar('dedupe_key', { length: 191 }).notNull(),
    signature: text('signature'),
    signatureStatus: varchar('signature_status', { length: 32 })
      .notNull()
      .default('skipped'),
    payloadRaw: text('payload_raw').notNull(),
    payloadJson: jsonb('payload_json'),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    orderType: varchar('order_type', { length: 32 }),
    orderId: integer('order_id'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReceivedAt: timestamp('last_received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    receiveCount: integer('receive_count').notNull().default(1),
    processingStatus: varchar('processing_status', { length: 32 })
      .notNull()
      .default('pending'),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    processingResult: jsonb('processing_result'),
    processingError: text('processing_error'),
    processingLockedAt: timestamp('processing_locked_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerDedupeUnique: uniqueIndex(
      'payment_webhook_events_provider_dedupe_unique'
    ).on(
      table.provider,
      table.dedupeKey
    ),
    processingIdx: index('payment_webhook_events_processing_idx').on(
      table.processingStatus,
      table.lastReceivedAt
    ),
    providerReceivedIdx: index('payment_webhook_events_provider_received_idx').on(
      table.provider,
      table.receivedAt
    ),
    providerTradeIdx: index('payment_webhook_events_provider_trade_idx').on(
      table.provider,
      table.providerTradeId,
      table.eventType
    ),
    orderIdx: index('payment_webhook_events_order_idx').on(
      table.orderType,
      table.orderId,
      table.receivedAt
    ),
  })
);

export const payoutMethods = pgTable(
  'payout_methods',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    methodType: varchar('method_type', {
      length: 32,
      enum: payoutMethodTypeValues,
    })
      .notNull()
      .default('bank_account'),
    channelType: varchar('channel_type', {
      length: 16,
      enum: paymentChannelTypeValues,
    })
      .notNull()
      .default('fiat'),
    assetType: varchar('asset_type', {
      length: 16,
      enum: paymentAssetTypeValues,
    })
      .notNull()
      .default('fiat'),
    assetCode: varchar('asset_code', { length: 64 }),
    network: varchar('network', { length: 64 }),
    displayName: varchar('display_name', { length: 160 }),
    isDefault: boolean('is_default').notNull().default(false),
    status: varchar('status', { length: 32, enum: payoutMethodStatusValues })
      .notNull()
      .default('active'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index('payout_methods_user_id_idx').on(table.userId),
    userTypeIdx: index('payout_methods_user_type_idx').on(
      table.userId,
      table.methodType
    ),
  })
);

// Deprecated alias kept while older backend code and tests still refer to
// bank cards directly. The underlying storage is now payout methods.
export const bankCards = payoutMethods;

export const fiatPayoutMethods = pgTable(
  'fiat_payout_methods',
  {
    payoutMethodId: integer('payout_method_id')
      .primaryKey()
      .references(() => payoutMethods.id, { onDelete: 'cascade' }),
    accountName: varchar('account_name', { length: 160 }).notNull(),
    bankName: varchar('bank_name', { length: 160 }),
    accountNoMasked: varchar('account_no_masked', { length: 64 }),
    routingCode: varchar('routing_code', { length: 64 }),
    providerCode: varchar('provider_code', { length: 64 }),
    currency: varchar('currency', { length: 16 }),
    brand: varchar('brand', { length: 60 }),
    accountLast4: varchar('account_last4', { length: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    currencyIdx: index('fiat_payout_methods_currency_idx').on(table.currency),
    providerIdx: index('fiat_payout_methods_provider_code_idx').on(table.providerCode),
  })
);

export const deposits = pgTable(
  'deposits',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    providerId: integer('provider_id').references(
      () => paymentProviders.id,
      { onDelete: 'set null' }
    ),
    channelType: varchar('channel_type', {
      length: 16,
      enum: paymentChannelTypeValues,
    })
      .notNull()
      .default('fiat'),
    assetType: varchar('asset_type', {
      length: 16,
      enum: paymentAssetTypeValues,
    })
      .notNull()
      .default('fiat'),
    assetCode: varchar('asset_code', { length: 64 }),
    network: varchar('network', { length: 64 }),
    status: varchar('status', { length: 32, enum: depositStatusValues })
      .notNull()
      .default('requested'),
    referenceId: varchar('reference_id', { length: 64 }),
    providerOrderId: varchar('provider_order_id', { length: 128 }),
    submittedTxHash: varchar('submitted_tx_hash', { length: 128 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('deposits_user_status_idx').on(
      table.userId,
      table.status
    ),
    providerIdx: index('deposits_provider_idx').on(table.providerId),
    channelStatusIdx: index('deposits_channel_status_idx').on(
      table.channelType,
      table.status
    ),
    submittedTxHashIdx: uniqueIndex('deposits_submitted_tx_hash_unique').on(
      table.submittedTxHash
    ),
  })
);

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: integer('provider_id').references(() => paymentProviders.id, {
      onDelete: 'set null',
    }),
    payoutMethodId: integer('payout_method_id').references(() => payoutMethods.id, {
      onDelete: 'set null',
    }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    channelType: varchar('channel_type', {
      length: 16,
      enum: paymentChannelTypeValues,
    })
      .notNull()
      .default('fiat'),
    assetType: varchar('asset_type', {
      length: 16,
      enum: paymentAssetTypeValues,
    })
      .notNull()
      .default('fiat'),
    assetCode: varchar('asset_code', { length: 64 }),
    network: varchar('network', { length: 64 }),
    status: varchar('status', { length: 32, enum: withdrawalStatusValues })
      .notNull()
      .default('requested'),
    providerOrderId: varchar('provider_order_id', { length: 128 }),
    submittedTxHash: varchar('submitted_tx_hash', { length: 128 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('withdrawals_user_status_idx').on(
      table.userId,
      table.status
    ),
    providerIdx: index('withdrawals_provider_idx').on(table.providerId),
    payoutMethodIdx: index('withdrawals_payout_method_idx').on(table.payoutMethodId),
    channelStatusIdx: index('withdrawals_channel_status_idx').on(
      table.channelType,
      table.status
    ),
    submittedTxHashIdx: uniqueIndex('withdrawals_submitted_tx_hash_unique').on(
      table.submittedTxHash
    ),
  })
);

export const fiatDepositEvents = pgTable(
  'fiat_deposit_events',
  {
    id: serial('id').primaryKey(),
    depositId: integer('deposit_id')
      .notNull()
      .references(() => deposits.id, { onDelete: 'cascade' }),
    providerTradeNo: varchar('provider_trade_no', { length: 128 }),
    clientReference: varchar('client_reference', { length: 128 }),
    webhookId: varchar('webhook_id', { length: 128 }),
    rawPayload: jsonb('raw_payload'),
    signatureVerified: boolean('signature_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    depositIdx: index('fiat_deposit_events_deposit_idx').on(
      table.depositId,
      table.createdAt
    ),
    providerTradeUnique: uniqueIndex('fiat_deposit_events_trade_no_unique').on(
      table.providerTradeNo
    ),
    webhookUnique: uniqueIndex('fiat_deposit_events_webhook_id_unique').on(
      table.webhookId
    ),
  })
);

export const fiatWithdrawEvents = pgTable(
  'fiat_withdraw_events',
  {
    id: serial('id').primaryKey(),
    withdrawalId: integer('withdrawal_id')
      .notNull()
      .references(() => withdrawals.id, { onDelete: 'cascade' }),
    providerPayoutNo: varchar('provider_payout_no', { length: 128 }),
    settlementReference: varchar('settlement_reference', { length: 128 }),
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    withdrawalIdx: index('fiat_withdraw_events_withdrawal_idx').on(
      table.withdrawalId,
      table.createdAt
    ),
    providerPayoutUnique: uniqueIndex('fiat_withdraw_events_payout_no_unique').on(
      table.providerPayoutNo
    ),
  })
);

export const cryptoDepositChannels = pgTable(
  'crypto_deposit_channels',
  {
    id: serial('id').primaryKey(),
    providerId: integer('provider_id').references(() => paymentProviders.id, {
      onDelete: 'set null',
    }),
    chain: varchar('chain', { length: 64 }).notNull(),
    network: varchar('network', { length: 64 }).notNull(),
    token: varchar('token', { length: 64 }).notNull(),
    receiveAddress: varchar('receive_address', { length: 191 }).notNull(),
    qrCodeUrl: text('qr_code_url'),
    memoRequired: boolean('memo_required').notNull().default(false),
    memoValue: varchar('memo_value', { length: 191 }),
    minConfirmations: integer('min_confirmations').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerIdx: index('crypto_deposit_channels_provider_idx').on(table.providerId),
    networkTokenIdx: index('crypto_deposit_channels_network_token_idx').on(
      table.network,
      table.token
    ),
    receiveAddressUnique: uniqueIndex(
      'crypto_deposit_channels_receive_address_unique'
    ).on(table.receiveAddress),
  })
);

export const cryptoWithdrawAddresses = pgTable(
  'crypto_withdraw_addresses',
  {
    payoutMethodId: integer('payout_method_id')
      .primaryKey()
      .references(() => payoutMethods.id, { onDelete: 'cascade' }),
    chain: varchar('chain', { length: 64 }).notNull(),
    network: varchar('network', { length: 64 }).notNull(),
    token: varchar('token', { length: 64 }).notNull(),
    address: varchar('address', { length: 191 }).notNull(),
    label: varchar('label', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    addressUnique: uniqueIndex('crypto_withdraw_addresses_address_unique').on(
      table.address
    ),
    networkTokenIdx: index('crypto_withdraw_addresses_network_token_idx').on(
      table.network,
      table.token
    ),
  })
);

export const cryptoChainTransactions = pgTable(
  'crypto_chain_transactions',
  {
    id: serial('id').primaryKey(),
    txHash: varchar('tx_hash', { length: 191 }).notNull(),
    direction: varchar('direction', { length: 16 }).notNull(),
    chain: varchar('chain', { length: 64 }).notNull(),
    network: varchar('network', { length: 64 }).notNull(),
    token: varchar('token', { length: 64 }).notNull(),
    fromAddress: varchar('from_address', { length: 191 }),
    toAddress: varchar('to_address', { length: 191 }),
    amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
    confirmations: integer('confirmations').notNull().default(0),
    rawPayload: jsonb('raw_payload'),
    consumedByDepositId: integer('consumed_by_deposit_id').references(
      () => deposits.id,
      { onDelete: 'set null' }
    ),
    consumedByWithdrawalId: integer('consumed_by_withdrawal_id').references(
      () => withdrawals.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    txHashUnique: uniqueIndex('crypto_chain_transactions_tx_hash_unique').on(
      table.txHash
    ),
    directionIdx: index('crypto_chain_transactions_direction_idx').on(
      table.direction,
      table.createdAt
    ),
    depositIdx: index('crypto_chain_transactions_deposit_idx').on(
      table.consumedByDepositId
    ),
    withdrawalIdx: index('crypto_chain_transactions_withdrawal_idx').on(
      table.consumedByWithdrawalId
    ),
  })
);

export const cryptoReviewEvents = pgTable(
  'crypto_review_events',
  {
    id: serial('id').primaryKey(),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetId: integer('target_id').notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    reviewerAdminId: integer('reviewer_admin_id').references(() => admins.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    targetIdx: index('crypto_review_events_target_idx').on(
      table.targetType,
      table.targetId,
      table.createdAt
    ),
    reviewerIdx: index('crypto_review_events_reviewer_idx').on(
      table.reviewerAdminId,
      table.createdAt
    ),
  })
);

export const financeReviews = pgTable(
  'finance_reviews',
  {
    id: serial('id').primaryKey(),
    orderType: varchar('order_type', { length: 32 }).notNull(),
    orderId: integer('order_id').notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    reviewStage: varchar('review_stage', { length: 16 }).notNull(),
    adminId: integer('admin_id').references(() => admins.id, {
      onDelete: 'set null',
    }),
    operatorNote: varchar('operator_note', { length: 500 }).notNull(),
    settlementReference: varchar('settlement_reference', { length: 128 }),
    processingChannel: varchar('processing_channel', { length: 64 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdx: index('finance_reviews_order_idx').on(
      table.orderType,
      table.orderId,
      table.createdAt
    ),
    adminIdx: index('finance_reviews_admin_idx').on(table.adminId, table.createdAt),
  })
);

export const paymentProviderEvents = pgTable(
  'payment_provider_events',
  {
    id: serial('id').primaryKey(),
    orderType: varchar('order_type', { length: 32 }).notNull(),
    orderId: integer('order_id').notNull(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    providerId: integer('provider_id').references(() => paymentProviders.id, {
      onDelete: 'set null',
    }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    providerStatus: varchar('provider_status', { length: 32 }).notNull(),
    externalReference: varchar('external_reference', { length: 128 }),
    processingChannel: varchar('processing_channel', { length: 64 }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdx: index('payment_provider_events_order_idx').on(
      table.orderType,
      table.orderId,
      table.createdAt
    ),
    providerIdx: index('payment_provider_events_provider_idx').on(
      table.providerId,
      table.createdAt
    ),
  })
);

export const paymentSettlementEvents = pgTable(
  'payment_settlement_events',
  {
    id: serial('id').primaryKey(),
    orderType: varchar('order_type', { length: 32 }).notNull(),
    orderId: integer('order_id').notNull(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    settlementStatus: varchar('settlement_status', { length: 32 }).notNull(),
    settlementReference: varchar('settlement_reference', { length: 128 }),
    failureReason: varchar('failure_reason', { length: 255 }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdx: index('payment_settlement_events_order_idx').on(
      table.orderType,
      table.orderId,
      table.createdAt
    ),
    settlementReferenceIdx: uniqueIndex(
      'payment_settlement_events_reference_unique'
    ).on(table.settlementReference),
  })
);

export const paymentReconciliationRuns = pgTable(
  'payment_reconciliation_runs',
  {
    id: serial('id').primaryKey(),
    providerId: integer('provider_id').references(() => paymentProviders.id, {
      onDelete: 'set null',
    }),
    trigger: varchar('trigger', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('running'),
    adapter: varchar('adapter', { length: 64 }),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }),
    windowEndedAt: timestamp('window_ended_at', { withTimezone: true }),
    summary: jsonb('summary'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerCreatedIdx: index('payment_reconciliation_runs_provider_created_idx').on(
      table.providerId,
      table.createdAt
    ),
    statusCreatedIdx: index('payment_reconciliation_runs_status_created_idx').on(
      table.status,
      table.createdAt
    ),
  })
);

export const paymentReconciliationIssues = pgTable(
  'payment_reconciliation_issues',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id').references(() => paymentReconciliationRuns.id, {
      onDelete: 'set null',
    }),
    providerId: integer('provider_id').references(() => paymentProviders.id, {
      onDelete: 'set null',
    }),
    fingerprint: varchar('fingerprint', { length: 96 }).notNull(),
    flow: varchar('flow', { length: 32 }).notNull(),
    orderType: varchar('order_type', { length: 32 }),
    orderId: integer('order_id'),
    localStatus: varchar('local_status', { length: 32 }),
    remoteStatus: varchar('remote_status', { length: 32 }),
    ledgerStatus: varchar('ledger_status', { length: 64 }),
    localReference: varchar('local_reference', { length: 128 }),
    remoteReference: varchar('remote_reference', { length: 128 }),
    issueType: varchar('issue_type', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('error'),
    requiresManualReview: boolean('requires_manual_review')
      .notNull()
      .default(true),
    autoRecheckEligible: boolean('auto_recheck_eligible')
      .notNull()
      .default(false),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    metadata: jsonb('metadata'),
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDetectedAt: timestamp('last_detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    fingerprintUnique: uniqueIndex(
      'payment_reconciliation_issues_fingerprint_unique'
    ).on(table.fingerprint),
    providerStatusIdx: index(
      'payment_reconciliation_issues_provider_status_idx'
    ).on(table.providerId, table.status, table.lastDetectedAt),
    manualQueueIdx: index('payment_reconciliation_issues_manual_queue_idx').on(
      table.requiresManualReview,
      table.status,
      table.lastDetectedAt
    ),
    orderIdx: index('payment_reconciliation_issues_order_idx').on(
      table.orderType,
      table.orderId,
      table.lastDetectedAt
    ),
  })
);
