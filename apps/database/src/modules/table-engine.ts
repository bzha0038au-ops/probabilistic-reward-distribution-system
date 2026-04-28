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
import {
  tableRoundStatusValues,
  tableSeatStatusValues,
  tableSettlementModelValues,
  tableStatusValues,
} from '@reward/shared-types/table-engine';

import { users } from './user.js';

export const tables = pgTable(
  'tables',
  {
    id: serial('id').primaryKey(),
    definitionKey: varchar('definition_key', { length: 64 }).notNull(),
    gameType: varchar('game_type', { length: 64 }).notNull(),
    settlementModel: varchar('settlement_model', {
      length: 32,
      enum: tableSettlementModelValues,
    }).notNull(),
    status: varchar('status', {
      length: 32,
      enum: tableStatusValues,
    })
      .notNull()
      .default('open'),
    minSeats: integer('min_seats').notNull(),
    maxSeats: integer('max_seats').notNull(),
    timeBankMs: integer('time_bank_ms').notNull().default(0),
    currentPhase: varchar('current_phase', { length: 64 }),
    phaseOrder: jsonb('phase_order').notNull(),
    metadata: jsonb('metadata'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusUpdatedIdx: index('tables_status_updated_idx').on(
      table.status,
      table.updatedAt,
    ),
    gameTypeStatusIdx: index('tables_game_type_status_idx').on(
      table.gameType,
      table.status,
    ),
    definitionIdx: index('tables_definition_idx').on(table.definitionKey),
  }),
);

export const seats = pgTable(
  'seats',
  {
    id: serial('id').primaryKey(),
    tableId: integer('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    seatNumber: integer('seat_number').notNull(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', {
      length: 32,
      enum: tableSeatStatusValues,
    })
      .notNull()
      .default('empty'),
    buyInAmount: numeric('buy_in_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    stackAmount: numeric('stack_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    metadata: jsonb('metadata'),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableSeatUnique: uniqueIndex('seats_table_seat_unique').on(
      table.tableId,
      table.seatNumber,
    ),
    tableUserUnique: uniqueIndex('seats_table_user_unique').on(
      table.tableId,
      table.userId,
    ),
    tableStatusIdx: index('seats_table_status_idx').on(
      table.tableId,
      table.status,
      table.seatNumber,
    ),
    userStatusIdx: index('seats_user_status_idx').on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const rounds = pgTable(
  'rounds',
  {
    id: serial('id').primaryKey(),
    tableId: integer('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    status: varchar('status', {
      length: 32,
      enum: tableRoundStatusValues,
    })
      .notNull()
      .default('pending'),
    phase: varchar('phase', { length: 64 }).notNull(),
    metadata: jsonb('metadata'),
    result: jsonb('result'),
    phaseDeadlineAt: timestamp('phase_deadline_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tableRoundUnique: uniqueIndex('rounds_table_round_unique').on(
      table.tableId,
      table.roundNumber,
    ),
    tableStatusCreatedIdx: index('rounds_table_status_created_idx').on(
      table.tableId,
      table.status,
      table.createdAt,
    ),
    statusCreatedIdx: index('rounds_status_created_idx').on(
      table.status,
      table.createdAt,
    ),
  }),
);
