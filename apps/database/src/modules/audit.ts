import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { admins, users } from './user.js';

export const adminActions = pgTable(
  'admin_actions',
  {
    id: serial('id').primaryKey(),
    adminId: integer('admin_id').references(() => admins.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 80 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: integer('target_id'),
    ip: varchar('ip', { length: 64 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    adminIdx: index('admin_actions_admin_idx').on(table.adminId),
    actionIdx: index('admin_actions_action_idx').on(table.action),
  })
);

export const authEvents = pgTable(
  'auth_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    email: varchar('email', { length: 255 }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index('auth_events_user_idx').on(table.userId),
    emailIdx: index('auth_events_email_idx').on(table.email),
    typeIdx: index('auth_events_type_idx').on(table.eventType),
    createdIdx: index('auth_events_created_idx').on(table.createdAt),
  })
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    tokenType: varchar('token_type', { length: 32 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    metadata: jsonb('metadata'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index('auth_tokens_user_idx').on(table.userId),
    emailIdx: index('auth_tokens_email_idx').on(table.email),
    phoneIdx: index('auth_tokens_phone_idx').on(table.phone),
    typeIdx: index('auth_tokens_type_idx').on(table.tokenType),
    expiresIdx: index('auth_tokens_expires_idx').on(table.expiresAt),
    tokenHashIdx: index('auth_tokens_hash_idx').on(table.tokenHash),
  })
);
