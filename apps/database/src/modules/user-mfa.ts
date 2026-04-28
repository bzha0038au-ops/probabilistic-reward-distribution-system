import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./user.js";

export const userMfaSecrets = pgTable(
  "user_mfa_secrets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secretCiphertext: text("secret_ciphertext").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("user_mfa_secrets_user_id_unique").on(table.userId),
  }),
);
