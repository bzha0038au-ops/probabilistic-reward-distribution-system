import { index, integer, numeric, pgTable, timestamp } from 'drizzle-orm/pg-core';

import { users } from '../user.js';

export const userWallets = pgTable(
  'user_wallets',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    withdrawableBalance: numeric('withdrawable_balance', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    bonusBalance: numeric('bonus_balance', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    lockedBalance: numeric('locked_balance', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    wageredAmount: numeric('wagered_amount', { precision: 14, scale: 2 })
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
    userIdx: index('user_wallets_user_id_idx').on(table.userId),
  })
);
