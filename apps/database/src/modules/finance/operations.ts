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

import { admins, users } from '../user.js';
import { deposits } from './deposits.js';
import { paymentProviders } from './providers.js';
import { withdrawals } from './withdrawals.js';

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
