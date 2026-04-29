import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  handHistoryEventActorValues,
  handHistoryRoundTypeValues,
} from '@reward/shared-types/hand-history';

import { rounds, seats, tables } from './table-engine.js';
import { users } from './user.js';

const roundEventRoundTypeValues = [
  ...handHistoryRoundTypeValues,
  'table_round',
] as const;

export const roundEvents = pgTable(
  'round_events',
  {
    id: serial('id').notNull(),
    roundType: varchar('round_type', {
      length: 32,
      enum: roundEventRoundTypeValues,
    }).notNull(),
    roundEntityId: integer('round_entity_id').notNull(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    tableId: integer('table_id').references(() => tables.id, {
      onDelete: 'set null',
    }),
    seatId: integer('seat_id').references(() => seats.id, {
      onDelete: 'set null',
    }),
    tableRoundId: integer('table_round_id').references(() => rounds.id, {
      onDelete: 'cascade',
    }),
    phase: varchar('phase', { length: 64 }),
    eventIndex: integer('event_index').notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actor: varchar('actor', {
      length: 16,
      enum: handHistoryEventActorValues,
    }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idIdx: index('round_events_id_idx').on(table.id),
    roundLookupIdx: index('round_events_round_lookup_idx').on(
      table.roundType,
      table.roundEntityId,
      table.eventIndex,
    ),
    userCreatedIdx: index('round_events_user_created_idx').on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    tableRoundLookupIdx: index('round_events_table_round_lookup_idx').on(
      table.tableRoundId,
      table.eventIndex,
    ),
    tablePhaseCreatedIdx: index('round_events_table_phase_created_idx').on(
      table.tableId,
      table.phase,
      table.createdAt,
    ),
  }),
);
