import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './user';

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionKind: varchar('session_kind', { length: 16 }).notNull(),
    subjectRole: varchar('subject_role', { length: 20 }).notNull(),
    jti: varchar('jti', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: varchar('revoked_reason', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    jtiUnique: uniqueIndex('auth_sessions_jti_unique').on(table.jti),
    userKindStatusIdx: index('auth_sessions_user_kind_status_idx').on(
      table.userId,
      table.sessionKind,
      table.status
    ),
    expiresIdx: index('auth_sessions_expires_idx').on(table.expiresAt),
    lastSeenIdx: index('auth_sessions_last_seen_idx').on(table.lastSeenAt),
  })
);
