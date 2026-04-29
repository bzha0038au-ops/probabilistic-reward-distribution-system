import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  notificationChannelValues,
  notificationKindValues,
  notificationDeliveryAttemptStatusValues,
  notificationDeliveryStatusValues,
  notificationPushPlatformValues,
  notificationProviderValues,
} from "@reward/shared-types/notification";

import { users } from "./user.js";

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notificationRecordId: integer("notification_record_id").references(
      () => notificationRecords.id,
      {
        onDelete: "set null",
      },
    ),
    kind: varchar("kind", {
      length: 64,
      enum: notificationKindValues,
    }).notNull(),
    channel: varchar("channel", {
      length: 16,
      enum: notificationChannelValues,
    }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    recipientKey: varchar("recipient_key", { length: 255 }).notNull(),
    provider: varchar("provider", {
      length: 32,
      enum: notificationProviderValues,
    }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    body: text("body"),
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

export const notificationRecords = pgTable(
  "notification_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", {
      length: 64,
      enum: notificationKindValues,
    }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    data: jsonb("data"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("notification_records_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    userReadCreatedIdx: index("notification_records_user_read_created_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
  }),
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", {
      length: 64,
      enum: notificationKindValues,
    }).notNull(),
    channel: varchar("channel", {
      length: 16,
      enum: notificationChannelValues,
    }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userKindChannelIdx: index("notification_preferences_user_kind_channel_idx").on(
      table.userId,
      table.kind,
      table.channel,
    ),
    userKindChannelUnique: uniqueIndex(
      "notification_preferences_user_kind_channel_unique",
    ).on(table.userId, table.kind, table.channel),
  }),
);

export const notificationPushDevices = pgTable(
  "notification_push_devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    platform: varchar("platform", {
      length: 16,
      enum: notificationPushPlatformValues,
    }).notNull(),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
    active: boolean("active").notNull().default(true),
    lastRegisteredAt: timestamp("last_registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userActiveIdx: index("notification_push_devices_user_active_idx").on(
      table.userId,
      table.active,
      table.updatedAt,
    ),
    tokenUnique: uniqueIndex("notification_push_devices_token_unique").on(
      table.token,
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
