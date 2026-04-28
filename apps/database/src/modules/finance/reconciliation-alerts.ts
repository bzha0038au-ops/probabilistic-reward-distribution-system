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
import { walletReconciliationRuns } from './operations.js';

export const reconciliationAlerts = pgTable(
  'reconciliation_alerts',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id').references(() => walletReconciliationRuns.id, {
      onDelete: 'set null',
    }),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    fingerprint: varchar('fingerprint', { length: 96 }).notNull(),
    alertType: varchar('alert_type', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('error'),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    expectedWithdrawableBalance: numeric('expected_withdrawable_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    actualWithdrawableBalance: numeric('actual_withdrawable_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    expectedBonusBalance: numeric('expected_bonus_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    actualBonusBalance: numeric('actual_bonus_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    expectedLockedBalance: numeric('expected_locked_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    actualLockedBalance: numeric('actual_locked_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    expectedWageredAmount: numeric('expected_wagered_amount', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    actualWageredAmount: numeric('actual_wagered_amount', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    expectedTotal: numeric('expected_total', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    actualTotal: numeric('actual_total', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    metadata: jsonb('metadata'),
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDetectedAt: timestamp('last_detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    fingerprintUnique: uniqueIndex('reconciliation_alerts_fingerprint_unique').on(
      table.fingerprint
    ),
    typeStatusDetectedIdx: index('reconciliation_alerts_type_status_idx').on(
      table.alertType,
      table.status,
      table.lastDetectedAt
    ),
    userStatusDetectedIdx: index('reconciliation_alerts_user_status_idx').on(
      table.userId,
      table.status,
      table.lastDetectedAt
    ),
  })
);
