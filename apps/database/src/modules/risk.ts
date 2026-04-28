import {
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
  userFreezeCategoryValues,
  userFreezeReasonValues,
  userFreezeScopeValues,
} from '@reward/shared-types/risk';

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

export const riskTableInteractionEvents = pgTable(
  'risk_table_interaction_events',
  {
    id: serial('id').primaryKey(),
    tableId: varchar('table_id', { length: 128 }).notNull(),
    participantUserIds: jsonb('participant_user_ids').notNull(),
    pairCount: integer('pair_count').notNull().default(0),
    metadata: jsonb('metadata'),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableRecordedIdx: index('risk_table_interaction_events_table_recorded_idx').on(
      table.tableId,
      table.recordedAt
    ),
    recordedAtIdx: index('risk_table_interaction_events_recorded_at_idx').on(
      table.recordedAt
    ),
  })
);

export const riskTableInteractionPairs = pgTable(
  'risk_table_interaction_pairs',
  {
    id: serial('id').primaryKey(),
    tableId: varchar('table_id', { length: 128 }).notNull(),
    userAId: integer('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: integer('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interactionCount: integer('interaction_count').notNull().default(0),
    sharedIpCount: integer('shared_ip_count').notNull().default(0),
    sharedDeviceCount: integer('shared_device_count').notNull().default(0),
    suspicionScore: integer('suspicion_score').notNull().default(0),
    metadata: jsonb('metadata'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableUsersUnique: uniqueIndex('risk_table_interaction_pairs_table_users_unique').on(
      table.tableId,
      table.userAId,
      table.userBId
    ),
    tableSuspicionIdx: index('risk_table_interaction_pairs_table_suspicion_idx').on(
      table.tableId,
      table.suspicionScore
    ),
    interactionCountIdx: index(
      'risk_table_interaction_pairs_interaction_count_idx'
    ).on(table.interactionCount, table.lastSeenAt),
    userALastSeenIdx: index('risk_table_interaction_pairs_user_a_last_seen_idx').on(
      table.userAId,
      table.lastSeenAt
    ),
    userBLastSeenIdx: index('risk_table_interaction_pairs_user_b_last_seen_idx').on(
      table.userBId,
      table.lastSeenAt
    ),
  })
);

export const freezeRecords = pgTable(
  'freeze_records',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', {
      length: 32,
      enum: userFreezeCategoryValues,
    })
      .notNull()
      .default('risk'),
    reason: varchar('reason', {
      length: 64,
      enum: userFreezeReasonValues,
    })
      .notNull()
      .default('manual_admin'),
    scope: varchar('scope', {
      length: 32,
      enum: userFreezeScopeValues,
    })
      .notNull()
      .default('account_lock'),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('freeze_records_user_idx').on(table.userId),
    userScopeStatusIdx: index('freeze_records_user_scope_status_idx').on(
      table.userId,
      table.scope,
      table.status
    ),
    scopeIdx: index('freeze_records_scope_idx').on(table.scope),
    statusIdx: index('freeze_records_status_idx').on(table.status),
  })
);
