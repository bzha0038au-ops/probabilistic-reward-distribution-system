import {
  communityModerationActions,
  communityPosts,
  communityReports,
  communityThreads,
} from '@reward/database';
import { and, asc, desc, eq, sql } from '@reward/database/orm';
import type {
  CommunityModerationAction,
  CommunityModerationRecord,
  CommunityModerationTargetType,
  CommunityPost,
  CommunityPostStatus,
  CommunityThread,
  CommunityThreadStatus,
} from '@reward/shared-types/community';
import { API_ERROR_CODES } from '@reward/shared-types/api';

import { db, type DbTransaction } from '../../db';
import { conflictError, notFoundError } from '../../shared/errors';
import { readSqlRows } from '../../shared/sql-result';
import type { CommunityAutomatedModerationReport } from './anti-spam-service';

const VISIBLE_THREAD_STATUS = 'visible';
const HIDDEN_THREAD_STATUS = 'hidden';
const VISIBLE_POST_STATUS = 'visible';
const HIDDEN_POST_STATUS = 'hidden';
const DELETED_POST_STATUS = 'deleted';

const toIsoString = (value: Date | string | null) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const toDate = (value: Date | string | null) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

export const serializeCommunityThread = (
  thread: typeof communityThreads.$inferSelect
): CommunityThread => ({
  id: thread.id,
  authorUserId: thread.authorUserId,
  title: thread.title,
  status: thread.status as CommunityThreadStatus,
  isLocked: thread.isLocked,
  postCount: thread.postCount,
  lastPostAt: toIsoString(thread.lastPostAt) ?? new Date().toISOString(),
  lockedAt: toIsoString(thread.lockedAt),
  hiddenAt: toIsoString(thread.hiddenAt),
  createdAt: toIsoString(thread.createdAt) ?? new Date().toISOString(),
  updatedAt: toIsoString(thread.updatedAt) ?? new Date().toISOString(),
});

export const serializeCommunityPost = (
  post: typeof communityPosts.$inferSelect
): CommunityPost => ({
  id: post.id,
  threadId: post.threadId,
  authorUserId: post.authorUserId,
  body: post.body,
  status: post.status as CommunityPostStatus,
  hiddenAt: toIsoString(post.hiddenAt),
  deletedAt: toIsoString(post.deletedAt),
  createdAt: toIsoString(post.createdAt) ?? new Date().toISOString(),
  updatedAt: toIsoString(post.updatedAt) ?? new Date().toISOString(),
});

export const serializeCommunityModerationRecord = (
  record: typeof communityModerationActions.$inferSelect
): CommunityModerationRecord => ({
  id: record.id,
  adminId: record.adminId,
  targetType: record.targetType as CommunityModerationTargetType,
  targetId: record.targetId,
  threadId: record.threadId,
  postId: record.postId,
  action: record.action as CommunityModerationAction,
  reason: record.reason,
  metadata:
    typeof record.metadata === 'object' && record.metadata !== null
      ? Object.fromEntries(Object.entries(record.metadata))
      : null,
  createdAt: toIsoString(record.createdAt) ?? new Date().toISOString(),
});

const syncCommunityThreadStats = async (tx: DbTransaction, threadId: number) => {
  const [thread] = await tx
    .select({ createdAt: communityThreads.createdAt })
    .from(communityThreads)
    .where(eq(communityThreads.id, threadId))
    .limit(1);

  if (!thread) {
    return;
  }

  const result = await tx.execute(sql`
    SELECT COUNT(*)::int AS "postCount",
           MAX(${communityPosts.createdAt}) AS "lastPostAt"
    FROM ${communityPosts}
    WHERE ${communityPosts.threadId} = ${threadId}
      AND ${communityPosts.status} = ${VISIBLE_POST_STATUS}
  `);
  const [aggregate] = readSqlRows<{
    postCount: number | string;
    lastPostAt: Date | string | null;
  }>(result);
  const createdAt = toDate(thread.createdAt) ?? new Date();
  const lastPostAt = toDate(aggregate?.lastPostAt) ?? createdAt;

  await tx
    .update(communityThreads)
    .set({
      postCount: Number(aggregate?.postCount ?? 0),
      lastPostAt,
      updatedAt: new Date(),
    })
    .where(eq(communityThreads.id, threadId));
};

export async function listCommunityThreads(params: {
  limit: number;
  page: number;
}) {
  const offset = (params.page - 1) * params.limit;

  return db
    .select()
    .from(communityThreads)
    .where(eq(communityThreads.status, VISIBLE_THREAD_STATUS))
    .orderBy(desc(communityThreads.lastPostAt), desc(communityThreads.id))
    .limit(params.limit + 1)
    .offset(offset);
}

export async function getCommunityThreadDetail(params: {
  threadId: number;
  limit: number;
  page: number;
}) {
  const [thread] = await db
    .select()
    .from(communityThreads)
    .where(
      and(
        eq(communityThreads.id, params.threadId),
        eq(communityThreads.status, VISIBLE_THREAD_STATUS)
      )
    )
    .limit(1);

  if (!thread) {
    return null;
  }

  const offset = (params.page - 1) * params.limit;
  const posts = await db
    .select()
    .from(communityPosts)
    .where(
      and(
        eq(communityPosts.threadId, params.threadId),
        eq(communityPosts.status, VISIBLE_POST_STATUS)
      )
    )
    .orderBy(asc(communityPosts.createdAt), asc(communityPosts.id))
    .limit(params.limit + 1)
    .offset(offset);

  return { thread, posts };
}

export async function createCommunityThread(params: {
  userId: number;
  title: string;
  body: string;
  initialThreadStatus?: CommunityThreadStatus;
  initialPostStatus?: CommunityPostStatus;
  queuedReport?: CommunityAutomatedModerationReport | null;
}) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const threadStatus = params.initialThreadStatus ?? VISIBLE_THREAD_STATUS;
    const postStatus = params.initialPostStatus ?? VISIBLE_POST_STATUS;
    const threadHidden = threadStatus === HIDDEN_THREAD_STATUS;
    const postHidden = postStatus === HIDDEN_POST_STATUS;

    const [thread] = await tx
      .insert(communityThreads)
      .values({
        authorUserId: params.userId,
        title: params.title,
        status: threadStatus,
        isLocked: false,
        postCount: postStatus === VISIBLE_POST_STATUS ? 1 : 0,
        lastPostAt: now,
        hiddenAt: threadHidden ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [post] = await tx
      .insert(communityPosts)
      .values({
        threadId: thread.id,
        authorUserId: params.userId,
        body: params.body,
        status: postStatus,
        hiddenAt: postHidden ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (params.queuedReport) {
      await tx.insert(communityReports).values({
        postId: post.id,
        reporterUserId: null,
        reason: params.queuedReport.reason,
        detail: params.queuedReport.detail,
        source: params.queuedReport.source,
        metadata: params.queuedReport.metadata,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (threadHidden) {
      await tx.insert(communityModerationActions).values({
        adminId: null,
        targetType: 'thread',
        targetId: thread.id,
        threadId: thread.id,
        postId: null,
        action: 'hide_thread',
        reason: params.queuedReport?.reason ?? 'automatic_moderation',
        metadata: params.queuedReport?.metadata ?? null,
        createdAt: now,
      });
    }

    if (postHidden) {
      await tx.insert(communityModerationActions).values({
        adminId: null,
        targetType: 'post',
        targetId: post.id,
        threadId: thread.id,
        postId: post.id,
        action: 'hide_post',
        reason: params.queuedReport?.reason ?? 'automatic_moderation',
        metadata: params.queuedReport?.metadata ?? null,
        createdAt: now,
      });
    }

    return { thread, post };
  });
}

export async function createCommunityPost(params: {
  userId: number;
  threadId: number;
  body: string;
  initialPostStatus?: CommunityPostStatus;
  queuedReport?: CommunityAutomatedModerationReport | null;
}) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const postStatus = params.initialPostStatus ?? VISIBLE_POST_STATUS;
    const postHidden = postStatus === HIDDEN_POST_STATUS;
    const [thread] =
      postStatus === VISIBLE_POST_STATUS
        ? await tx
            .update(communityThreads)
            .set({
              postCount: sql`${communityThreads.postCount} + 1`,
              lastPostAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(communityThreads.id, params.threadId),
                eq(communityThreads.status, VISIBLE_THREAD_STATUS),
                eq(communityThreads.isLocked, false)
              )
            )
            .returning()
        : await tx
            .select()
            .from(communityThreads)
            .where(
              and(
                eq(communityThreads.id, params.threadId),
                eq(communityThreads.status, VISIBLE_THREAD_STATUS),
                eq(communityThreads.isLocked, false)
              )
            )
            .limit(1);

    if (!thread) {
      const [existingThread] = await tx
        .select({
          status: communityThreads.status,
          isLocked: communityThreads.isLocked,
        })
        .from(communityThreads)
        .where(eq(communityThreads.id, params.threadId))
        .limit(1);

      if (!existingThread || existingThread.status === HIDDEN_THREAD_STATUS) {
        throw notFoundError('Community thread not found.', {
          code: API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND,
        });
      }

      if (existingThread.isLocked) {
        throw conflictError('Community thread is locked.', {
          code: API_ERROR_CODES.COMMUNITY_THREAD_LOCKED,
        });
      }

      throw notFoundError('Community thread not found.', {
        code: API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND,
      });
    }

    const [post] = await tx
      .insert(communityPosts)
      .values({
        threadId: params.threadId,
        authorUserId: params.userId,
        body: params.body,
        status: postStatus,
        hiddenAt: postHidden ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (params.queuedReport) {
      await tx.insert(communityReports).values({
        postId: post.id,
        reporterUserId: null,
        reason: params.queuedReport.reason,
        detail: params.queuedReport.detail,
        source: params.queuedReport.source,
        metadata: params.queuedReport.metadata,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (postHidden) {
      await tx.insert(communityModerationActions).values({
        adminId: null,
        targetType: 'post',
        targetId: post.id,
        threadId: params.threadId,
        postId: post.id,
        action: 'hide_post',
        reason: params.queuedReport?.reason ?? 'automatic_moderation',
        metadata: params.queuedReport?.metadata ?? null,
        createdAt: now,
      });
    }

    return { thread, post };
  });
}

export async function listCommunityModerationActions(params: {
  limit: number;
  page: number;
}) {
  const offset = (params.page - 1) * params.limit;

  return db
    .select()
    .from(communityModerationActions)
    .orderBy(
      desc(communityModerationActions.createdAt),
      desc(communityModerationActions.id)
    )
    .limit(params.limit + 1)
    .offset(offset);
}

export async function moderateCommunityThread(params: {
  adminId: number | null;
  threadId: number;
  action: 'lock' | 'unlock' | 'hide' | 'restore';
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const [existingThread] = await tx
      .select()
      .from(communityThreads)
      .where(eq(communityThreads.id, params.threadId))
      .limit(1);

    if (!existingThread) {
      return null;
    }

    const now = new Date();
    const updates =
      params.action === 'lock'
        ? {
            isLocked: true,
            lockedAt: now,
            updatedAt: now,
          }
        : params.action === 'unlock'
          ? {
              isLocked: false,
              lockedAt: null,
              updatedAt: now,
            }
          : params.action === 'hide'
            ? {
                status: HIDDEN_THREAD_STATUS,
                hiddenAt: now,
                updatedAt: now,
              }
            : {
                status: VISIBLE_THREAD_STATUS,
                hiddenAt: null,
                updatedAt: now,
              };

    const [thread] = await tx
      .update(communityThreads)
      .set(updates)
      .where(eq(communityThreads.id, params.threadId))
      .returning();

    const [moderation] = await tx
      .insert(communityModerationActions)
      .values({
        adminId: params.adminId,
        targetType: 'thread',
        targetId: params.threadId,
        threadId: params.threadId,
        postId: null,
        action:
          params.action === 'lock'
            ? 'lock_thread'
            : params.action === 'unlock'
              ? 'unlock_thread'
              : params.action === 'hide'
                ? 'hide_thread'
                : 'restore_thread',
        reason: params.reason ?? null,
        metadata: params.metadata ?? null,
        createdAt: now,
      })
      .returning();

    return { thread, moderation };
  });
}

export async function moderateCommunityPost(params: {
  adminId: number | null;
  postId: number;
  action: 'hide' | 'restore' | 'delete';
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const [existingPost] = await tx
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, params.postId))
      .limit(1);

    if (!existingPost) {
      return null;
    }

    const now = new Date();
    const updates =
      params.action === 'hide'
        ? {
            status: HIDDEN_POST_STATUS,
            hiddenAt: now,
            deletedAt: null,
            updatedAt: now,
          }
        : params.action === 'restore'
          ? {
              status: VISIBLE_POST_STATUS,
              hiddenAt: null,
              deletedAt: null,
              updatedAt: now,
            }
          : {
              status: DELETED_POST_STATUS,
              deletedAt: now,
              updatedAt: now,
            };

    const [post] = await tx
      .update(communityPosts)
      .set(updates)
      .where(eq(communityPosts.id, params.postId))
      .returning();

    await syncCommunityThreadStats(tx, existingPost.threadId);

    const [moderation] = await tx
      .insert(communityModerationActions)
      .values({
        adminId: params.adminId,
        targetType: 'post',
        targetId: params.postId,
        threadId: existingPost.threadId,
        postId: params.postId,
        action:
          params.action === 'hide'
            ? 'hide_post'
            : params.action === 'restore'
              ? 'restore_post'
              : 'delete_post',
        reason: params.reason ?? null,
        metadata: params.metadata ?? null,
        createdAt: now,
      })
      .returning();

    return { post, moderation };
  });
}
