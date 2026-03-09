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

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('user'),
    userPoolBalance: numeric('user_pool_balance', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    pityStreak: integer('pity_streak').notNull().default(0),
    lastDrawAt: timestamp('last_draw_at', { withTimezone: true }),
    lastWinAt: timestamp('last_win_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
    userPoolBalanceIdx: index('users_user_pool_balance_idx').on(
      table.userPoolBalance
    ),
  })
);

export const admins = pgTable(
  'admins',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 160 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex('admins_user_id_unique').on(table.userId),
  })
);

export const adminPermissions = pgTable(
  'admin_permissions',
  {
    id: serial('id').primaryKey(),
    adminId: integer('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    adminPermissionUnique: uniqueIndex('admin_permissions_unique').on(
      table.adminId,
      table.permissionKey
    ),
  })
);

export const bankCards = pgTable(
  'bank_cards',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardholderName: varchar('cardholder_name', { length: 160 }).notNull(),
    bankName: varchar('bank_name', { length: 160 }),
    brand: varchar('brand', { length: 60 }),
    last4: varchar('last4', { length: 4 }),
    isDefault: boolean('is_default').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index('bank_cards_user_id_idx').on(table.userId),
  })
);

export const topUps = pgTable(
  'top_ups',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    referenceId: varchar('reference_id', { length: 64 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('top_ups_user_status_idx').on(
      table.userId,
      table.status
    ),
  })
);

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bankCardId: integer('bank_card_id').references(() => bankCards.id, {
      onDelete: 'set null',
    }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('withdrawals_user_status_idx').on(
      table.userId,
      table.status
    ),
  })
);
