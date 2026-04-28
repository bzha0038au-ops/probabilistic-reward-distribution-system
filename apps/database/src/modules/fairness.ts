import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const fairnessSeeds = pgTable(
  'fairness_seeds',
  {
    id: serial('id').primaryKey(),
    epoch: integer('epoch').notNull(),
    epochSeconds: integer('epoch_seconds').notNull(),
    commitHash: varchar('commit_hash', { length: 128 }).notNull(),
    seed: varchar('seed', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revealedAt: timestamp('revealed_at', { withTimezone: true }),
  },
  (table) => ({
    epochUnique: uniqueIndex('fairness_seeds_epoch_unique').on(
      table.epoch,
      table.epochSeconds
    ),
    epochIdx: index('fairness_seeds_epoch_idx').on(table.epoch),
    commitIdx: index('fairness_seeds_commit_idx').on(table.commitHash),
  })
);

export const fairnessAudits = pgTable(
  'fairness_audits',
  {
    id: serial('id').primaryKey(),
    epoch: integer('epoch').notNull(),
    epochSeconds: integer('epoch_seconds').notNull(),
    commitHash: varchar('commit_hash', { length: 128 }),
    computedHash: varchar('computed_hash', { length: 128 }),
    matches: boolean('matches').notNull().default(false),
    failureCode: varchar('failure_code', { length: 64 }),
    revealedAt: timestamp('revealed_at', { withTimezone: true }),
    auditedAt: timestamp('audited_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    epochUnique: uniqueIndex('fairness_audits_epoch_unique').on(
      table.epoch,
      table.epochSeconds
    ),
    epochIdx: index('fairness_audits_epoch_idx').on(
      table.epochSeconds,
      table.epoch
    ),
    matchIdx: index('fairness_audits_match_idx').on(
      table.epochSeconds,
      table.matches,
      table.auditedAt
    ),
  })
);
