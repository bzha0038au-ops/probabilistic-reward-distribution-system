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
  dataDeletionRequestSourceValues,
  dataDeletionRequestStatusValues,
  dataDeletionReviewDecisionValues,
  dataRightsAuditActionValues,
} from "@reward/shared-types/data-rights";

import { admins, users } from "./user.js";

export const dataDeletionRequests = pgTable(
  "data_deletion_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", {
      length: 32,
      enum: dataDeletionRequestStatusValues,
    })
      .notNull()
      .default("pending_review"),
    source: varchar("source", {
      length: 32,
      enum: dataDeletionRequestSourceValues,
    })
      .notNull()
      .default("user_self_service"),
    requestedByUserId: integer("requested_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    requestReason: text("request_reason"),
    subjectEmailHint: varchar("subject_email_hint", { length: 255 }),
    subjectPhoneHint: varchar("subject_phone_hint", { length: 64 }),
    subjectEmailHash: varchar("subject_email_hash", { length: 64 }),
    subjectPhoneHash: varchar("subject_phone_hash", { length: 64 }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    reviewedByAdminId: integer("reviewed_by_admin_id").references(
      () => admins.id,
      { onDelete: "set null" },
    ),
    reviewDecision: varchar("review_decision", {
      length: 16,
      enum: dataDeletionReviewDecisionValues,
    }),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    completedByAdminId: integer("completed_by_admin_id").references(
      () => admins.id,
      { onDelete: "set null" },
    ),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    resultSummary: jsonb("result_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("data_deletion_requests_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    statusDueIdx: index("data_deletion_requests_status_due_idx").on(
      table.status,
      table.dueAt,
    ),
    reviewedIdx: index("data_deletion_requests_reviewed_idx").on(
      table.reviewedByAdminId,
      table.reviewedAt,
    ),
    completedIdx: index("data_deletion_requests_completed_idx").on(
      table.completedByAdminId,
      table.completedAt,
    ),
  }),
);

export const dataRightsAudits = pgTable(
  "data_rights_audits",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => dataDeletionRequests.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", {
      length: 32,
      enum: dataRightsAuditActionValues,
    }).notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorAdminId: integer("actor_admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    requestCreatedIdx: index("data_rights_audits_request_created_idx").on(
      table.requestId,
      table.createdAt,
    ),
    userCreatedIdx: index("data_rights_audits_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    actionCreatedIdx: index("data_rights_audits_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
  }),
);
