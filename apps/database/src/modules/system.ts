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

import { admins } from './user.js';

export const systemConfig = pgTable(
  'system_config',
  {
    id: serial('id').primaryKey(),
    configKey: varchar('config_key', { length: 128 }).notNull(),
    configValue: jsonb('config_value'),
    configNumber: numeric('config_number', { precision: 14, scale: 2 }),
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

export const configChangeRequests = pgTable(
  'config_change_requests',
  {
    id: serial('id').primaryKey(),
    changeType: varchar('change_type', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    targetType: varchar('target_type', { length: 64 }).notNull(),
    targetId: integer('target_id'),
    changePayload: jsonb('change_payload').notNull(),
    reason: text('reason'),
    requiresSecondConfirmation: boolean('requires_second_confirmation')
      .notNull()
      .default(false),
    requiresMfa: boolean('requires_mfa').notNull().default(false),
    createdByAdminId: integer('created_by_admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    submittedByAdminId: integer('submitted_by_admin_id').references(
      () => admins.id,
      { onDelete: 'set null' }
    ),
    approvedByAdminId: integer('approved_by_admin_id').references(
      () => admins.id,
      { onDelete: 'set null' }
    ),
    publishedByAdminId: integer('published_by_admin_id').references(
      () => admins.id,
      { onDelete: 'set null' }
    ),
    rejectedByAdminId: integer('rejected_by_admin_id').references(
      () => admins.id,
      { onDelete: 'set null' }
    ),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index('config_change_requests_status_idx').on(table.status),
    targetIdx: index('config_change_requests_target_idx').on(
      table.targetType,
      table.targetId
    ),
    createdByIdx: index('config_change_requests_created_by_idx').on(
      table.createdByAdminId
    ),
    createdAtIdx: index('config_change_requests_created_at_idx').on(table.createdAt),
  })
);
