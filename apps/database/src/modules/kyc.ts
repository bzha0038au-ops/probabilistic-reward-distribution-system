import { sql } from "drizzle-orm";
import {
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
  kycStatusValues,
  kycTierValues,
} from "@reward/shared-types/kyc";

import { freezeRecords } from "./risk.js";
import { admins, users } from "./user.js";

export const kycProfiles = pgTable(
  "kyc_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    currentTier: varchar("current_tier", {
      length: 16,
      enum: kycTierValues,
    })
      .notNull()
      .default("tier_0"),
    requestedTier: varchar("requested_tier", {
      length: 16,
      enum: kycTierValues,
    }),
    status: varchar("status", {
      length: 32,
      enum: kycStatusValues,
    })
      .notNull()
      .default("not_started"),
    submissionVersion: integer("submission_version").notNull().default(0),
    legalName: varchar("legal_name", { length: 160 }),
    documentType: varchar("document_type", { length: 32 }),
    documentNumberLast4: varchar("document_number_last4", { length: 8 }),
    countryCode: varchar("country_code", { length: 2 }),
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),
    submittedData: jsonb("submitted_data"),
    riskFlags: jsonb("risk_flags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    freezeRecordId: integer("freeze_record_id").references(
      () => freezeRecords.id,
      { onDelete: "set null" },
    ),
    reviewedByAdminId: integer("reviewed_by_admin_id").references(
      () => admins.id,
      {
        onDelete: "set null",
      },
    ),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("kyc_profiles_user_id_unique").on(table.userId),
    statusSubmittedIdx: index("kyc_profiles_status_submitted_idx").on(
      table.status,
      table.submittedAt,
    ),
    requestedTierSubmittedIdx: index("kyc_profiles_requested_tier_submitted_idx").on(
      table.requestedTier,
      table.submittedAt,
    ),
  }),
);

export const kycDocuments = pgTable(
  "kyc_documents",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => kycProfiles.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submissionVersion: integer("submission_version").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    label: varchar("label", { length: 160 }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes"),
    storagePath: text("storage_path").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    profileSubmissionIdx: index("kyc_documents_profile_submission_idx").on(
      table.profileId,
      table.submissionVersion,
    ),
    userIdx: index("kyc_documents_user_idx").on(table.userId),
  }),
);

export const kycReviewEvents = pgTable(
  "kyc_review_events",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => kycProfiles.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submissionVersion: integer("submission_version").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    fromStatus: varchar("from_status", {
      length: 32,
      enum: kycStatusValues,
    }).notNull(),
    toStatus: varchar("to_status", {
      length: 32,
      enum: kycStatusValues,
    }).notNull(),
    targetTier: varchar("target_tier", {
      length: 16,
      enum: kycTierValues,
    }),
    actorAdminId: integer("actor_admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    profileCreatedIdx: index("kyc_review_events_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    userCreatedIdx: index("kyc_review_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    actionCreatedIdx: index("kyc_review_events_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
  }),
);
