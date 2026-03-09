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
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './user';

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
    userPoolThreshold: numeric('user_pool_threshold', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    rewardAmount: numeric('reward_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    payoutBudget: numeric('payout_budget', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    payoutSpent: numeric('payout_spent', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    payoutPeriodDays: integer('payout_period_days').notNull().default(1),
    payoutPeriodStartedAt: timestamp('payout_period_started_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
    deletedAtIdx: index('prizes_deleted_at_idx').on(table.deletedAt),
    poolThresholdIdx: index('prizes_pool_threshold_idx').on(table.poolThreshold),
    userPoolThresholdIdx: index('prizes_user_pool_threshold_idx').on(
      table.userPoolThreshold
    ),
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
    statusCreatedIdx: index('draw_records_status_created_idx').on(
      table.status,
      table.createdAt
    ),
  })
);
