import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import {
  authNotificationChannelValues,
  authNotificationKindValues,
  notificationDeliveryAttemptStatusValues,
  notificationDeliveryStatusValues,
  notificationProviderValues,
} from "@reward/shared-types/notification";

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", {
      length: 32,
      enum: authNotificationKindValues,
    }).notNull(),
    channel: varchar("channel", {
      length: 16,
      enum: authNotificationChannelValues,
    }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    recipientKey: varchar("recipient_key", { length: 255 }).notNull(),
    provider: varchar("provider", {
      length: 32,
      enum: notificationProviderValues,
    }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", {
      length: 16,
      enum: notificationDeliveryStatusValues,
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusNextAttemptIdx: index(
      "notification_deliveries_status_next_attempt_idx",
    ).on(table.status, table.nextAttemptAt),
    recipientKindCreatedIdx: index(
      "notification_deliveries_recipient_kind_created_idx",
    ).on(table.recipientKey, table.kind, table.createdAt),
    createdIdx: index("notification_deliveries_created_idx").on(
      table.createdAt,
    ),
  }),
);

export const notificationDeliveryAttempts = pgTable(
  "notification_delivery_attempts",
  {
    id: serial("id").primaryKey(),
    deliveryId: integer("delivery_id")
      .notNull()
      .references(() => notificationDeliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: varchar("provider", {
      length: 32,
      enum: notificationProviderValues,
    }).notNull(),
    status: varchar("status", {
      length: 16,
      enum: notificationDeliveryAttemptStatusValues,
    }).notNull(),
    responseCode: integer("response_code"),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    deliveryCreatedIdx: index(
      "notification_delivery_attempts_delivery_created_idx",
    ).on(table.deliveryId, table.createdAt),
    statusCreatedIdx: index(
      "notification_delivery_attempts_status_created_idx",
    ).on(table.status, table.createdAt),
  }),
);
