import { jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const systemConfig = pgTable(
  'system_config',
  {
    id: serial('id').primaryKey(),
    configKey: varchar('config_key', { length: 128 }).notNull(),
    configValue: jsonb('config_value'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    configKeyUnique: uniqueIndex('system_config_key_unique').on(table.configKey),
  })
);
