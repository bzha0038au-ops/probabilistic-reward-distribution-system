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

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  })
);

export const wallets = pgTable(
  'wallets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: numeric('balance', { precision: 14, scale: 2 })
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
    userUnique: uniqueIndex('wallets_user_id_unique').on(table.userId),
    balanceIdx: index('wallets_balance_idx').on(table.balance),
  })
);

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: integer('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 32 }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric('balance_before', { precision: 14, scale: 2 })
      .notNull(),
    balanceAfter: numeric('balance_after', { precision: 14, scale: 2 })
      .notNull(),
    referenceType: varchar('reference_type', { length: 64 }),
    referenceId: integer('reference_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('transactions_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
    typeCreatedIdx: index('transactions_type_created_idx').on(
      table.type,
      table.createdAt
    ),
    referenceIdx: index('transactions_reference_idx').on(
      table.referenceType,
      table.referenceId
    ),
  })
);

export const prizes = pgTable(
  'prizes',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    stock: integer('stock').notNull().default(0),
    weight: integer('weight').notNull().default(1),
    poolThreshold: numeric('pool_threshold', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    rewardAmount: numeric('reward_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    activeStockIdx: index('prizes_active_stock_idx').on(
      table.isActive,
      table.stock
    ),
    poolThresholdIdx: index('prizes_pool_threshold_idx').on(table.poolThreshold),
  })
);

export const drawRecords = pgTable(
  'draw_records',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    prizeId: integer('prize_id').references(() => prizes.id, {
      onDelete: 'set null',
    }),
    drawCost: numeric('draw_cost', { precision: 14, scale: 2 }).notNull(),
    rewardAmount: numeric('reward_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    status: varchar('status', { length: 32 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('draw_records_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
    prizeStatusIdx: index('draw_records_prize_status_idx').on(
      table.prizeId,
      table.status
    ),
    statusIdx: index('draw_records_status_idx').on(table.status),
  })
);

export const systemConfig = pgTable(
  'system_config',
  {
    id: serial('id').primaryKey(),
    configKey: varchar('config_key', { length: 128 }).notNull(),
    configValue: jsonb('config_value'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    configKeyUnique: uniqueIndex('system_config_key_unique').on(table.configKey),
  })
);
