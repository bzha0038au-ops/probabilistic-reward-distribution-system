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
  paymentAssetTypeValues,
  paymentChannelTypeValues,
} from "@reward/shared-types/finance";

export const paymentProviders = pgTable(
  "payment_providers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    providerType: varchar("provider_type", { length: 64 }).notNull(),
    channelType: varchar("channel_type", {
      length: 16,
      enum: paymentChannelTypeValues,
    }),
    assetType: varchar("asset_type", {
      length: 16,
      enum: paymentAssetTypeValues,
    }),
    assetCode: varchar("asset_code", { length: 64 }),
    network: varchar("network", { length: 64 }),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    isCircuitBroken: boolean("is_circuit_broken").notNull().default(false),
    circuitBrokenAt: timestamp("circuit_broken_at", { withTimezone: true }),
    circuitBreakReason: varchar("circuit_break_reason", { length: 255 }),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameUnique: uniqueIndex("payment_providers_name_unique").on(table.name),
  }),
);

export const paymentOutboundRequests = pgTable(
  "payment_outbound_requests",
  {
    id: serial("id").primaryKey(),
    orderType: varchar("order_type", { length: 32 }).notNull(),
    orderId: integer("order_id").notNull(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => paymentProviders.id, {
        onDelete: "restrict",
      }),
    action: varchar("action", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
    requestPayload: jsonb("request_payload").notNull(),
    requestPayloadHash: varchar("request_payload_hash", {
      length: 64,
    }).notNull(),
    sendStatus: varchar("send_status", { length: 32 })
      .notNull()
      .default("prepared"),
    attemptCount: integer("attempt_count").notNull().default(0),
    firstSentAt: timestamp("first_sent_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    responseHttpStatus: integer("response_http_status"),
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    responsePayload: jsonb("response_payload"),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerIdemUnique: uniqueIndex(
      "payment_outbound_requests_provider_idem_unique",
    ).on(table.providerId, table.action, table.idempotencyKey),
    orderActionUnique: uniqueIndex(
      "payment_outbound_requests_order_action_unique",
    ).on(table.orderType, table.orderId, table.action),
    retryIdx: index("payment_outbound_requests_retry_idx").on(
      table.sendStatus,
      table.nextRetryAt,
      table.createdAt,
    ),
  }),
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 120 }).notNull(),
    eventId: varchar("event_id", { length: 191 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 191 }),
    providerTradeId: varchar("provider_trade_id", { length: 128 }),
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    eventType: varchar("event_type", { length: 64 }),
    dedupeKey: varchar("dedupe_key", { length: 191 }).notNull(),
    signature: text("signature"),
    signatureStatus: varchar("signature_status", { length: 32 })
      .notNull()
      .default("skipped"),
    payloadRaw: text("payload_raw").notNull(),
    payloadJson: jsonb("payload_json"),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    orderType: varchar("order_type", { length: 32 }),
    orderId: integer("order_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReceivedAt: timestamp("last_received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    receiveCount: integer("receive_count").notNull().default(1),
    processingStatus: varchar("processing_status", { length: 32 })
      .notNull()
      .default("pending"),
    processingAttempts: integer("processing_attempts").notNull().default(0),
    processingResult: jsonb("processing_result"),
    processingError: text("processing_error"),
    processingLockedAt: timestamp("processing_locked_at", {
      withTimezone: true,
    }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerDedupeUnique: uniqueIndex(
      "payment_webhook_events_provider_dedupe_unique",
    ).on(table.provider, table.dedupeKey),
    processingIdx: index("payment_webhook_events_processing_idx").on(
      table.processingStatus,
      table.lastReceivedAt,
    ),
    providerReceivedIdx: index(
      "payment_webhook_events_provider_received_idx",
    ).on(table.provider, table.receivedAt),
    providerTradeIdx: index("payment_webhook_events_provider_trade_idx").on(
      table.provider,
      table.providerTradeId,
      table.eventType,
    ),
    orderIdx: index("payment_webhook_events_order_idx").on(
      table.orderType,
      table.orderId,
      table.receivedAt,
    ),
  }),
);
