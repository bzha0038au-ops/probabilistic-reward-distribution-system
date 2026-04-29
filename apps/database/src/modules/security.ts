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

export const securityEvents = pgTable(
  'security_events',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 64 }).notNull(),
    eventType: varchar('event_type', { length: 96 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('info'),
    sourceTable: varchar('source_table', { length: 64 }),
    sourceRecordId: integer('source_record_id'),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    adminId: integer('admin_id').references(() => admins.id, {
      onDelete: 'set null',
    }),
    email: varchar('email', { length: 255 }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    sessionId: varchar('session_id', { length: 255 }),
    fingerprint: varchar('fingerprint', { length: 160 }),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    categoryOccurredIdx: index('security_events_category_occurred_idx').on(
      table.category,
      table.occurredAt,
    ),
    eventTypeOccurredIdx: index('security_events_type_occurred_idx').on(
      table.eventType,
      table.occurredAt,
    ),
    userOccurredIdx: index('security_events_user_occurred_idx').on(
      table.userId,
      table.occurredAt,
    ),
    adminOccurredIdx: index('security_events_admin_occurred_idx').on(
      table.adminId,
      table.occurredAt,
    ),
    emailOccurredIdx: index('security_events_email_occurred_idx').on(
      table.email,
      table.occurredAt,
    ),
    ipOccurredIdx: index('security_events_ip_occurred_idx').on(
      table.ip,
      table.occurredAt,
    ),
    fingerprintIdx: index('security_events_fingerprint_idx').on(
      table.fingerprint,
    ),
    sourceOccurredIdx: index('security_events_source_occurred_idx').on(
      table.sourceTable,
      table.sourceRecordId,
      table.occurredAt,
    ),
    occurredIdx: index('security_events_occurred_idx').on(table.occurredAt),
  }),
);
