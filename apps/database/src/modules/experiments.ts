import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const experiments = pgTable(
  "experiments",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 128 }).notNull(),
    description: varchar("description", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    defaultVariantKey: varchar("default_variant_key", { length: 64 })
      .notNull()
      .default("control"),
    variants: jsonb("variants").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    keyUnique: uniqueIndex("experiments_key_unique").on(table.key),
    statusIdx: index("experiments_status_idx").on(table.status),
  }),
);

export const experimentAssignments = pgTable(
  "experiment_assignments",
  {
    id: serial("id").primaryKey(),
    experimentId: integer("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectKey: varchar("subject_key", { length: 191 }).notNull(),
    variantKey: varchar("variant_key", { length: 64 }).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    experimentSubjectUnique: uniqueIndex(
      "experiment_assignments_experiment_subject_unique",
    ).on(table.experimentId, table.subjectType, table.subjectKey),
    subjectLookupIdx: index("experiment_assignments_subject_lookup_idx").on(
      table.subjectType,
      table.subjectKey,
    ),
    experimentVariantIdx: index("experiment_assignments_experiment_variant_idx").on(
      table.experimentId,
      table.variantKey,
    ),
  }),
);
