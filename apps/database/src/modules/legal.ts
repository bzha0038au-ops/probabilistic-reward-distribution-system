import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { configChangeRequests } from "./system.js";
import { admins, users } from "./user.js";

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: serial("id").primaryKey(),
    documentKey: varchar("document_key", { length: 64 }).notNull(),
    locale: varchar("locale", { length: 16 }).notNull().default("zh-CN"),
    title: varchar("title", { length: 160 }).notNull(),
    version: integer("version").notNull(),
    htmlContent: text("html_content").notNull(),
    summary: text("summary"),
    changeNotes: text("change_notes"),
    isRequired: boolean("is_required").notNull().default(true),
    createdByAdminId: integer("created_by_admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    keyLocaleVersionUnique: uniqueIndex("legal_documents_key_locale_version_unique").on(
      table.documentKey,
      table.locale,
      table.version,
    ),
    keyLocaleVersionIdx: index("legal_documents_key_locale_version_idx").on(
      table.documentKey,
      table.locale,
      table.version,
    ),
  }),
);

export const legalDocumentPublications = pgTable(
  "legal_document_publications",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => legalDocuments.id, { onDelete: "cascade" }),
    documentKey: varchar("document_key", { length: 64 }).notNull(),
    locale: varchar("locale", { length: 16 }).notNull(),
    releaseMode: varchar("release_mode", { length: 32 }).notNull(),
    rolloutPercent: integer("rollout_percent").notNull().default(100),
    fallbackPublicationId: integer("fallback_publication_id"),
    rollbackFromPublicationId: integer("rollback_from_publication_id"),
    changeRequestId: integer("change_request_id"),
    publishedByAdminId: integer("published_by_admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededByPublicationId: integer("superseded_by_publication_id"),
  },
  (table) => ({
    changeRequestFk: foreignKey({
      name: "legal_document_publications_change_request_fk",
      columns: [table.changeRequestId],
      foreignColumns: [configChangeRequests.id],
    }).onDelete("set null"),
    activeIdx: index("legal_document_publications_active_idx").on(
      table.documentKey,
      table.locale,
      table.isActive,
      table.activatedAt,
    ),
    documentIdx: index("legal_document_publications_document_idx").on(
      table.documentId,
      table.activatedAt,
    ),
  }),
);

export const legalDocumentAcceptances = pgTable(
  "legal_document_acceptances",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => legalDocuments.id, { onDelete: "cascade" }),
    publicationId: integer("publication_id"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 64 }).notNull().default("user"),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    publicationFk: foreignKey({
      name: "legal_document_acceptances_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [legalDocumentPublications.id],
    }).onDelete("set null"),
    userDocumentUnique: uniqueIndex("legal_document_acceptances_user_document_unique").on(
      table.userId,
      table.documentId,
    ),
    documentIdx: index("legal_document_acceptances_document_idx").on(
      table.documentId,
      table.acceptedAt,
    ),
    userIdx: index("legal_document_acceptances_user_idx").on(
      table.userId,
      table.acceptedAt,
    ),
  }),
);
