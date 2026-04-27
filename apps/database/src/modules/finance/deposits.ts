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
} from "drizzle-orm/pg-core";
import {
  depositStatusValues,
  paymentAssetTypeValues,
  paymentChannelTypeValues,
} from "@reward/shared-types/finance";

import { users } from "../user.js";
import { paymentProviders } from "./providers.js";

export const deposits = pgTable(
  "deposits",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    providerId: integer("provider_id").references(() => paymentProviders.id, {
      onDelete: "set null",
    }),
    channelType: varchar("channel_type", {
      length: 16,
      enum: paymentChannelTypeValues,
    })
      .notNull()
      .default("fiat"),
    assetType: varchar("asset_type", {
      length: 16,
      enum: paymentAssetTypeValues,
    })
      .notNull()
      .default("fiat"),
    assetCode: varchar("asset_code", { length: 64 }),
    network: varchar("network", { length: 64 }),
    status: varchar("status", { length: 32, enum: depositStatusValues })
      .notNull()
      .default("requested"),
    referenceId: varchar("reference_id", { length: 64 }),
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    submittedTxHash: varchar("submitted_tx_hash", { length: 128 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStatusIdx: index("deposits_user_status_idx").on(
      table.userId,
      table.status,
    ),
    providerIdx: index("deposits_provider_idx").on(table.providerId),
    channelStatusIdx: index("deposits_channel_status_idx").on(
      table.channelType,
      table.status,
    ),
    submittedTxHashIdx: uniqueIndex("deposits_submitted_tx_hash_unique").on(
      table.submittedTxHash,
    ),
  }),
);

export const fiatDepositEvents = pgTable(
  "fiat_deposit_events",
  {
    id: serial("id").primaryKey(),
    depositId: integer("deposit_id")
      .notNull()
      .references(() => deposits.id, { onDelete: "cascade" }),
    providerTradeNo: varchar("provider_trade_no", { length: 128 }),
    clientReference: varchar("client_reference", { length: 128 }),
    webhookId: varchar("webhook_id", { length: 128 }),
    rawPayload: jsonb("raw_payload"),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    depositIdx: index("fiat_deposit_events_deposit_idx").on(
      table.depositId,
      table.createdAt,
    ),
    providerTradeUnique: uniqueIndex("fiat_deposit_events_trade_no_unique").on(
      table.providerTradeNo,
    ),
    webhookUnique: uniqueIndex("fiat_deposit_events_webhook_id_unique").on(
      table.webhookId,
    ),
  }),
);

export const cryptoDepositChannels = pgTable(
  "crypto_deposit_channels",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id").references(() => paymentProviders.id, {
      onDelete: "set null",
    }),
    chain: varchar("chain", { length: 64 }).notNull(),
    network: varchar("network", { length: 64 }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    receiveAddress: varchar("receive_address", { length: 191 }).notNull(),
    qrCodeUrl: text("qr_code_url"),
    memoRequired: boolean("memo_required").notNull().default(false),
    memoValue: varchar("memo_value", { length: 191 }),
    minConfirmations: integer("min_confirmations").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerIdx: index("crypto_deposit_channels_provider_idx").on(
      table.providerId,
    ),
    networkTokenIdx: index("crypto_deposit_channels_network_token_idx").on(
      table.network,
      table.token,
    ),
    receiveAddressUnique: uniqueIndex(
      "crypto_deposit_channels_receive_address_unique",
    ).on(table.receiveAddress),
  }),
);
