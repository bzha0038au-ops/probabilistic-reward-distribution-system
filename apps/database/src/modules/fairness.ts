import { index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

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
