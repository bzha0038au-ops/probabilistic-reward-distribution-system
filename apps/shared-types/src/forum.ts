import { z } from "zod";

import { CommunityPostStatusSchema } from "./community";
import { LimitedPageSizeSchema, OptionalPositiveIntSchema } from "./common";
import { UserFreezeReasonSchema } from "./risk";

export const forumReportStatusValues = ["open", "resolved"] as const;
export const ForumReportStatusSchema = z.enum(forumReportStatusValues);

export const ForumModerationQueueItemSchema = z.object({
  postId: z.number().int().positive(),
  threadId: z.number().int().positive(),
  authorUserId: z.number().int().positive(),
  authorEmail: z.string().nullable(),
  threadTitle: z.string(),
  bodyPreview: z.string(),
  postStatus: CommunityPostStatusSchema,
  reportCount: z.number().int().nonnegative(),
  latestReportReason: z.string(),
  latestReportDetail: z.string().nullable(),
  oldestReportedAt: z.union([z.string(), z.date()]),
  latestReportedAt: z.union([z.string(), z.date()]),
});

export const ForumGameplayMuteRecordSchema = z.object({
  freezeRecordId: z.number().int().positive(),
  userId: z.number().int().positive(),
  email: z.string().nullable(),
  reason: UserFreezeReasonSchema,
  createdAt: z.union([z.string(), z.date()]),
});

export const ForumModerationOverviewSchema = z.object({
  queue: z.array(ForumModerationQueueItemSchema),
  activeMutes: z.array(ForumGameplayMuteRecordSchema),
});

export const ForumModerationQuerySchema = z.object({
  limit: LimitedPageSizeSchema.optional(),
  muteLimit: LimitedPageSizeSchema.optional(),
});

export const ForumBulkDeletePostsSchema = z.object({
  postIds: z.array(z.number().int().positive()).min(1).max(100),
  reason: z.string().trim().min(1).max(255),
});

export const ForumMuteUserSchema = z.object({
  userId: z.number().int().positive(),
  reason: UserFreezeReasonSchema.default("forum_moderation"),
});

export const ForumReleaseMuteSchema = z.object({
  freezeRecordId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(255).optional(),
});

export type ForumModerationQueueItem = z.infer<
  typeof ForumModerationQueueItemSchema
>;
export type ForumGameplayMuteRecord = z.infer<
  typeof ForumGameplayMuteRecordSchema
>;
export type ForumModerationOverview = z.infer<
  typeof ForumModerationOverviewSchema
>;
