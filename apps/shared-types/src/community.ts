import { z } from 'zod';

import {
  LimitedPageSizeSchema,
  OffsetPageSchema,
  OptionalPositiveIntSchema,
} from './common';

export const communityThreadStatusValues = ['visible', 'hidden'] as const;
export const CommunityThreadStatusSchema = z.enum(communityThreadStatusValues);
export type CommunityThreadStatus = z.infer<typeof CommunityThreadStatusSchema>;

export const communityPostStatusValues = [
  'visible',
  'hidden',
  'deleted',
] as const;
export const CommunityPostStatusSchema = z.enum(communityPostStatusValues);
export type CommunityPostStatus = z.infer<typeof CommunityPostStatusSchema>;

export const communityModerationTargetTypeValues = ['thread', 'post'] as const;
export const CommunityModerationTargetTypeSchema = z.enum(
  communityModerationTargetTypeValues
);
export type CommunityModerationTargetType = z.infer<
  typeof CommunityModerationTargetTypeSchema
>;

export const communityModerationActionValues = [
  'lock_thread',
  'unlock_thread',
  'hide_thread',
  'restore_thread',
  'hide_post',
  'restore_post',
  'delete_post',
] as const;
export const CommunityModerationActionSchema = z.enum(
  communityModerationActionValues
);
export type CommunityModerationAction = z.infer<
  typeof CommunityModerationActionSchema
>;

export const CommunityThreadListQuerySchema = z.object({
  page: OptionalPositiveIntSchema,
  limit: LimitedPageSizeSchema,
});
export type CommunityThreadListQuery = z.infer<
  typeof CommunityThreadListQuerySchema
>;

export const CommunityPostListQuerySchema = z.object({
  page: OptionalPositiveIntSchema,
  limit: LimitedPageSizeSchema,
});
export type CommunityPostListQuery = z.infer<typeof CommunityPostListQuerySchema>;

export const CommunityModerationListQuerySchema = z.object({
  page: OptionalPositiveIntSchema,
  limit: LimitedPageSizeSchema,
});
export type CommunityModerationListQuery = z.infer<
  typeof CommunityModerationListQuerySchema
>;

export const CommunityThreadSchema = z.object({
  id: z.number().int().positive(),
  authorUserId: z.number().int().positive(),
  title: z.string(),
  status: CommunityThreadStatusSchema,
  isLocked: z.boolean(),
  postCount: z.number().int().nonnegative(),
  lastPostAt: z.string().datetime(),
  lockedAt: z.string().datetime().nullable(),
  hiddenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CommunityThread = z.infer<typeof CommunityThreadSchema>;

export const CommunityPostSchema = z.object({
  id: z.number().int().positive(),
  threadId: z.number().int().positive(),
  authorUserId: z.number().int().positive(),
  body: z.string(),
  status: CommunityPostStatusSchema,
  hiddenAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CommunityPost = z.infer<typeof CommunityPostSchema>;

export const CommunityModerationRecordSchema = z.object({
  id: z.number().int().positive(),
  adminId: z.number().int().positive().nullable(),
  targetType: CommunityModerationTargetTypeSchema,
  targetId: z.number().int().positive(),
  threadId: z.number().int().positive().nullable(),
  postId: z.number().int().positive().nullable(),
  action: CommunityModerationActionSchema,
  reason: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});
export type CommunityModerationRecord = z.infer<
  typeof CommunityModerationRecordSchema
>;

export const CommunityThreadListResponseSchema =
  OffsetPageSchema(CommunityThreadSchema);
export type CommunityThreadListResponse = z.infer<
  typeof CommunityThreadListResponseSchema
>;

export const CommunityThreadDetailResponseSchema = z.object({
  thread: CommunityThreadSchema,
  posts: OffsetPageSchema(CommunityPostSchema),
});
export type CommunityThreadDetailResponse = z.infer<
  typeof CommunityThreadDetailResponseSchema
>;

export const CommunityThreadMutationResponseSchema = z.object({
  thread: CommunityThreadSchema,
  post: CommunityPostSchema,
  reviewRequired: z.boolean().optional(),
  autoHidden: z.boolean().optional(),
  moderationReason: z.string().nullable().optional(),
  moderationSource: z.literal('automated_signal').nullable().optional(),
});
export type CommunityThreadMutationResponse = z.infer<
  typeof CommunityThreadMutationResponseSchema
>;

export const CommunityModerationListResponseSchema =
  OffsetPageSchema(CommunityModerationRecordSchema);
export type CommunityModerationListResponse = z.infer<
  typeof CommunityModerationListResponseSchema
>;

export const CommunityThreadModerationResponseSchema = z.object({
  thread: CommunityThreadSchema,
  moderation: CommunityModerationRecordSchema,
});
export type CommunityThreadModerationResponse = z.infer<
  typeof CommunityThreadModerationResponseSchema
>;

export const CommunityPostModerationResponseSchema = z.object({
  post: CommunityPostSchema,
  moderation: CommunityModerationRecordSchema,
});
export type CommunityPostModerationResponse = z.infer<
  typeof CommunityPostModerationResponseSchema
>;

export const CreateCommunityThreadRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  captchaToken: z.string().trim().min(1).max(2048).optional(),
});
export type CreateCommunityThreadRequest = z.infer<
  typeof CreateCommunityThreadRequestSchema
>;

export const CreateCommunityPostRequestSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  captchaToken: z.string().trim().min(1).max(2048).optional(),
});
export type CreateCommunityPostRequest = z.infer<
  typeof CreateCommunityPostRequestSchema
>;

export const ModerateCommunityThreadRequestSchema = z.object({
  action: z.enum(['lock', 'unlock', 'hide', 'restore']),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ModerateCommunityThreadRequest = z.infer<
  typeof ModerateCommunityThreadRequestSchema
>;

export const ModerateCommunityPostRequestSchema = z.object({
  action: z.enum(['hide', 'restore', 'delete']),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ModerateCommunityPostRequest = z.infer<
  typeof ModerateCommunityPostRequestSchema
>;
