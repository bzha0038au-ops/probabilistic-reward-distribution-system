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
} from "drizzle-orm/pg-core";
import {
  paymentAssetTypeValues,
  paymentChannelTypeValues,
  withdrawalStatusValues,
} from "@reward/shared-types/finance";

import { users } from "../user.js";
import { payoutMethods } from "./payout-methods.js";
import { paymentProviders } from "./providers.js";

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: integer("provider_id").references(() => paymentProviders.id, {
      onDelete: "set null",
    }),
    payoutMethodId: integer("payout_method_id").references(
      () => payoutMethods.id,
      {
        onDelete: "set null",
      },
    ),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
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
    status: varchar("status", { length: 32, enum: withdrawalStatusValues })
      .notNull()
      .default("requested"),
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
    userStatusIdx: index("withdrawals_user_status_idx").on(
      table.userId,
      table.status,
    ),
    providerIdx: index("withdrawals_provider_idx").on(table.providerId),
    payoutMethodIdx: index("withdrawals_payout_method_idx").on(
      table.payoutMethodId,
    ),
    channelStatusIdx: index("withdrawals_channel_status_idx").on(
      table.channelType,
      table.status,
    ),
    submittedTxHashIdx: uniqueIndex("withdrawals_submitted_tx_hash_unique").on(
      table.submittedTxHash,
    ),
  }),
);

export const fiatWithdrawEvents = pgTable(
  "fiat_withdraw_events",
  {
    id: serial("id").primaryKey(),
    withdrawalId: integer("withdrawal_id")
      .notNull()
      .references(() => withdrawals.id, { onDelete: "cascade" }),
    providerPayoutNo: varchar("provider_payout_no", { length: 128 }),
    settlementReference: varchar("settlement_reference", { length: 128 }),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    withdrawalIdx: index("fiat_withdraw_events_withdrawal_idx").on(
      table.withdrawalId,
      table.createdAt,
    ),
    providerPayoutUnique: uniqueIndex(
      "fiat_withdraw_events_payout_no_unique",
    ).on(table.providerPayoutNo),
  }),
);
