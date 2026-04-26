import {
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

import { users } from './user.js';

export const withdrawalLimits = pgTable(
  'withdrawal_limits',
  {
    id: serial('id').primaryKey(),
    scope: varchar('scope', { length: 16 }).notNull().default('global'),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    maxWithdrawPerDay: numeric('max_withdraw_per_day', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    minWithdrawAmount: numeric('min_withdraw_amount', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    maxWithdrawAmount: numeric('max_withdraw_amount', {
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
    scopeIdx: index('withdrawal_limits_scope_idx').on(table.scope),
    userIdx: index('withdrawal_limits_user_idx').on(table.userId),
  })
);

export const suspiciousAccounts = pgTable(
  'suspicious_accounts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('suspicious_accounts_user_idx').on(table.userId),
    statusIdx: index('suspicious_accounts_status_idx').on(table.status),
  })
);

export const freezeRecords = pgTable(
  'freeze_records',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('freeze_records_user_idx').on(table.userId),
    statusIdx: index('freeze_records_status_idx').on(table.status),
  })
);
