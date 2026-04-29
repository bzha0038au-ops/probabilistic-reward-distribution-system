import {
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { saasStatusLevelValues } from '@reward/shared-types/saas-status';

export const saasStatusMinutes = pgTable(
  'saas_status_minutes',
  {
    id: serial('id').primaryKey(),
    minuteStart: timestamp('minute_start', { withTimezone: true }).notNull(),
    totalRequestCount: integer('total_request_count').notNull().default(0),
    availabilityEligibleRequestCount: integer(
      'availability_eligible_request_count'
    )
      .notNull()
      .default(0),
    availabilityErrorCount: integer('availability_error_count')
      .notNull()
      .default(0),
    errorRatePct: numeric('error_rate_pct', { precision: 8, scale: 4 })
      .notNull()
      .default('0'),
    apiP95Ms: integer('api_p95_ms').notNull().default(0),
    workerLagMs: integer('worker_lag_ms').notNull().default(0),
    stripeWebhookReadyCount: integer('stripe_webhook_ready_count')
      .notNull()
      .default(0),
    stripeWebhookLagMs: integer('stripe_webhook_lag_ms')
      .notNull()
      .default(0),
    outboundWebhookReadyCount: integer('outbound_webhook_ready_count')
      .notNull()
      .default(0),
    outboundWebhookLagMs: integer('outbound_webhook_lag_ms')
      .notNull()
      .default(0),
    apiStatus: varchar('api_status', {
      length: 16,
      enum: saasStatusLevelValues,
    })
      .notNull()
      .default('operational'),
    workerStatus: varchar('worker_status', {
      length: 16,
      enum: saasStatusLevelValues,
    })
      .notNull()
      .default('operational'),
    overallStatus: varchar('overall_status', {
      length: 16,
      enum: saasStatusLevelValues,
    })
      .notNull()
      .default('operational'),
    computedAt: timestamp('computed_at', { withTimezone: true })
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
    minuteStartUnique: uniqueIndex('saas_status_minutes_minute_start_unique').on(
      table.minuteStart
    ),
    minuteStartIdx: index('saas_status_minutes_minute_start_idx').on(
      table.minuteStart
    ),
    overallStatusMinuteIdx: index(
      'saas_status_minutes_overall_status_minute_idx'
    ).on(table.overallStatus, table.minuteStart),
  })
);
