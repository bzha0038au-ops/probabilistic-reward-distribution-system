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

import { users } from './user';

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
    isActive: boolean('is_active').notNull().default(true),
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
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    referenceId: varchar('reference_id', { length: 64 }),
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
  })
);
