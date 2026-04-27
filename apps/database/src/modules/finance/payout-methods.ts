import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  paymentAssetTypeValues,
  paymentChannelTypeValues,
  payoutMethodStatusValues,
  payoutMethodTypeValues,
} from "@reward/shared-types/finance";

import { users } from "../user.js";

export const payoutMethods = pgTable(
  "payout_methods",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    methodType: varchar("method_type", {
      length: 32,
      enum: payoutMethodTypeValues,
    })
      .notNull()
      .default("bank_account"),
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
    displayName: varchar("display_name", { length: 160 }),
    isDefault: boolean("is_default").notNull().default(false),
    status: varchar("status", { length: 32, enum: payoutMethodStatusValues })
      .notNull()
      .default("active"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("payout_methods_user_id_idx").on(table.userId),
    userTypeIdx: index("payout_methods_user_type_idx").on(
      table.userId,
      table.methodType,
    ),
  }),
);

// Deprecated alias kept while older backend code and tests still refer to
// bank cards directly. The underlying storage is now payout methods.
export const bankCards = payoutMethods;

export const fiatPayoutMethods = pgTable(
  "fiat_payout_methods",
  {
    payoutMethodId: integer("payout_method_id")
      .primaryKey()
      .references(() => payoutMethods.id, { onDelete: "cascade" }),
    accountName: varchar("account_name", { length: 160 }).notNull(),
    bankName: varchar("bank_name", { length: 160 }),
    accountNoMasked: varchar("account_no_masked", { length: 64 }),
    routingCode: varchar("routing_code", { length: 64 }),
    providerCode: varchar("provider_code", { length: 64 }),
    currency: varchar("currency", { length: 16 }),
    brand: varchar("brand", { length: 60 }),
    accountLast4: varchar("account_last4", { length: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    currencyIdx: index("fiat_payout_methods_currency_idx").on(table.currency),
    providerIdx: index("fiat_payout_methods_provider_code_idx").on(
      table.providerCode,
    ),
  }),
);

export const cryptoWithdrawAddresses = pgTable(
  "crypto_withdraw_addresses",
  {
    payoutMethodId: integer("payout_method_id")
      .primaryKey()
      .references(() => payoutMethods.id, { onDelete: "cascade" }),
    chain: varchar("chain", { length: 64 }).notNull(),
    network: varchar("network", { length: 64 }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    address: varchar("address", { length: 191 }).notNull(),
    label: varchar("label", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    addressUnique: uniqueIndex("crypto_withdraw_addresses_address_unique").on(
      table.address,
    ),
    networkTokenIdx: index("crypto_withdraw_addresses_network_token_idx").on(
      table.network,
      table.token,
    ),
  }),
);
