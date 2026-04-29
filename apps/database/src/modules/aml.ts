import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  amlCheckResultValues,
  amlCheckpointValues,
  amlReviewStatusValues,
  amlRiskLevelValues,
} from '@reward/shared-types/aml';

import { admins, users } from './user.js';

export const amlReviewStatusEnum = pgEnum(
  'aml_review_status',
  amlReviewStatusValues
);

export const amlChecks = pgTable(
  'aml_checks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    checkpoint: varchar('checkpoint', {
      length: 32,
      enum: amlCheckpointValues,
    }).notNull(),
    providerKey: varchar('provider_key', { length: 32 })
      .notNull()
      .default('mock'),
    result: varchar('result', {
      length: 32,
      enum: amlCheckResultValues,
    }).notNull(),
    riskLevel: varchar('risk_level', {
      length: 16,
      enum: amlRiskLevelValues,
    })
      .notNull()
      .default('low'),
    providerReference: varchar('provider_reference', { length: 128 }),
    providerPayload: jsonb('provider_payload'),
    metadata: jsonb('metadata'),
    reviewStatus: amlReviewStatusEnum('review_status'),
    reviewedByAdminId: integer('reviewed_by_admin_id').references(
      () => admins.id,
      { onDelete: 'set null' }
    ),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCheckpointCreatedIdx: index('aml_checks_user_checkpoint_created_idx').on(
      table.userId,
      table.checkpoint,
      table.createdAt
    ),
    resultCreatedIdx: index('aml_checks_result_created_idx').on(
      table.result,
      table.createdAt
    ),
    reviewQueueIdx: index('aml_checks_review_queue_idx').on(
      table.reviewStatus,
      table.result,
      table.slaDueAt
    ),
  })
);
