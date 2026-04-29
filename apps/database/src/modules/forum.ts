import {
  boolean,
  index,
  integer,
  jsonb,
  serial,
  text,
  timestamp,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";

import { admins, users } from "./user.js";

export const communityThreads = pgTable(
  "community_threads",
  {
    id: serial("id").primaryKey(),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("visible"),
    isLocked: boolean("is_locked").notNull().default(false),
    postCount: integer("post_count").notNull().default(0),
    lastPostAt: timestamp("last_post_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    authorCreatedIdx: index("community_threads_author_created_idx").on(
      table.authorUserId,
      table.createdAt,
    ),
    statusLastPostIdx: index("community_threads_status_last_post_idx").on(
      table.status,
      table.lastPostAt,
    ),
  }),
);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => communityThreads.id, { onDelete: "cascade" }),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("visible"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    threadCreatedIdx: index("community_posts_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    threadStatusCreatedIdx: index("community_posts_thread_status_created_idx").on(
      table.threadId,
      table.status,
      table.createdAt,
    ),
    authorCreatedIdx: index("community_posts_author_created_idx").on(
      table.authorUserId,
      table.createdAt,
    ),
  }),
);

export const communityReports = pgTable(
  "community_reports",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    reporterUserId: integer("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: varchar("reason", { length: 64 }).notNull(),
    detail: text("detail"),
    source: varchar("source", { length: 24 }).notNull().default("user_report"),
    metadata: jsonb("metadata"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedByAdminId: integer("resolved_by_admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postStatusIdx: index("community_reports_post_status_idx").on(
      table.postId,
      table.status,
    ),
    statusCreatedIdx: index("community_reports_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    reporterIdx: index("community_reports_reporter_idx").on(table.reporterUserId),
  }),
);

export const communityModerationActions = pgTable(
  "community_moderation_actions",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    targetType: varchar("target_type", { length: 16 }).notNull(),
    targetId: integer("target_id").notNull(),
    threadId: integer("thread_id").references(() => communityThreads.id, {
      onDelete: "set null",
    }),
    postId: integer("post_id").references(() => communityPosts.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    targetCreatedIdx: index("community_moderation_target_created_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    threadCreatedIdx: index("community_moderation_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    postCreatedIdx: index("community_moderation_post_created_idx").on(
      table.postId,
      table.createdAt,
    ),
  }),
);
