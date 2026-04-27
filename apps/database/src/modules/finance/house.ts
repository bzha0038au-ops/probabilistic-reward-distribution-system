import {
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

import { users } from '../user.js';
import { paymentProviders } from './providers.js';

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
