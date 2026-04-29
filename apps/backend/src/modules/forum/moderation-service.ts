import {
  communityPosts,
  communityReports,
  communityThreads,
  freezeRecords,
  users,
} from "@reward/database";
import {
  aliasedTable as alias,
  and,
  desc,
  eq,
  inArray,
} from "@reward/database/orm";
import type {
  ForumGameplayMuteRecord,
  ForumModerationOverview,
  ForumModerationQueueItem,
} from "@reward/shared-types/forum";
import type { UserFreezeReason } from "@reward/shared-types/risk";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { db } from "../../db";
import { notFoundError } from "../../shared/errors";
import { moderateCommunityPost } from "../community/service";
import { ensureUserFreeze, releaseUserFreeze } from "../risk/service";

const authorUsers = alias(users, "forum_post_authors");

const buildBodyPreview = (body: string) => {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177)}...`;
};

const toComparableTimestamp = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : value;

const readReportMetadata = (value: unknown) =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const readSignalProviders = (value: Record<string, unknown> | null) => {
  if (!value) {
    return [];
  }

  const signalProviders = value.signalProviders;
  if (!Array.isArray(signalProviders)) {
    return [];
  }

  return signalProviders.filter(
    (provider): provider is string => typeof provider === "string" && provider !== "",
  );
};

const readModerationScore = (value: Record<string, unknown> | null) => {
  const score = value?.moderationScore;
  return typeof score === "number" ? score : null;
};

const readAutoHidden = (value: Record<string, unknown> | null) =>
  value?.autoHidden === true;

const toQueueItems = (
  rows: Array<{
    postId: number;
    threadId: number;
    authorUserId: number;
    authorEmail: string | null;
    threadTitle: string;
    postBody: string;
    postStatus: string;
    reportReason: string;
    reportDetail: string | null;
    reportSource: string;
    reportMetadata: unknown;
    reportCreatedAt: Date;
  }>,
  limit: number,
): ForumModerationQueueItem[] => {
  const queue = new Map<number, ForumModerationQueueItem>();

  for (const row of rows) {
    const reportCreatedAt = row.reportCreatedAt.toISOString();
    const existing = queue.get(row.postId);
    const reportMetadata = readReportMetadata(row.reportMetadata);
    const signalProviders = readSignalProviders(reportMetadata);
    const moderationScore = readModerationScore(reportMetadata);
    const source =
      row.reportSource === "automated_signal" ? "automated_signal" : "user_report";

    if (!existing) {
      queue.set(row.postId, {
        postId: row.postId,
        threadId: row.threadId,
        authorUserId: row.authorUserId,
        authorEmail: row.authorEmail,
        threadTitle: row.threadTitle,
        bodyPreview: buildBodyPreview(row.postBody),
        postStatus: row.postStatus as ForumModerationQueueItem["postStatus"],
        reportCount: 1,
        latestReportReason: row.reportReason,
        latestReportDetail: row.reportDetail,
        oldestReportedAt: reportCreatedAt,
        latestReportedAt: reportCreatedAt,
        source,
        signalProviders,
        autoHidden: readAutoHidden(reportMetadata),
        moderationScore,
      });
      continue;
    }

    existing.reportCount += 1;
    existing.source =
      existing.source === source ? existing.source : "mixed";
    existing.signalProviders = [
      ...new Set([...existing.signalProviders, ...signalProviders]),
    ];
    existing.autoHidden = existing.autoHidden || readAutoHidden(reportMetadata);
    existing.moderationScore =
      moderationScore === null
        ? existing.moderationScore
        : existing.moderationScore === null
          ? moderationScore
          : Math.max(existing.moderationScore, moderationScore);
    if (reportCreatedAt > existing.latestReportedAt) {
      existing.latestReportedAt = reportCreatedAt;
      existing.latestReportReason = row.reportReason;
      existing.latestReportDetail = row.reportDetail;
    }
    if (reportCreatedAt < existing.oldestReportedAt) {
      existing.oldestReportedAt = reportCreatedAt;
    }
  }

  return [...queue.values()]
    .sort((left, right) =>
      toComparableTimestamp(right.latestReportedAt).localeCompare(
        toComparableTimestamp(left.latestReportedAt),
      ),
    )
    .slice(0, limit);
};

const toGameplayMuteRecord = (row: {
  freezeRecordId: number;
  userId: number;
  email: string | null;
  reason: string;
  createdAt: Date;
}): ForumGameplayMuteRecord => ({
  freezeRecordId: row.freezeRecordId,
  userId: row.userId,
  email: row.email,
  reason: row.reason as UserFreezeReason,
  createdAt: row.createdAt.toISOString(),
});

export async function getForumModerationOverview(options: {
  limit?: number;
  muteLimit?: number;
} = {}): Promise<ForumModerationOverview> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const muteLimit = Math.min(Math.max(options.muteLimit ?? 50, 1), 100);

  const [reportRows, activeMuteRows] = await Promise.all([
    db
      .select({
        postId: communityPosts.id,
        threadId: communityPosts.threadId,
        authorUserId: communityPosts.authorUserId,
        authorEmail: authorUsers.email,
        threadTitle: communityThreads.title,
        postBody: communityPosts.body,
        postStatus: communityPosts.status,
        reportReason: communityReports.reason,
        reportDetail: communityReports.detail,
        reportSource: communityReports.source,
        reportMetadata: communityReports.metadata,
        reportCreatedAt: communityReports.createdAt,
      })
      .from(communityReports)
      .innerJoin(communityPosts, eq(communityPosts.id, communityReports.postId))
      .innerJoin(communityThreads, eq(communityThreads.id, communityPosts.threadId))
      .leftJoin(authorUsers, eq(authorUsers.id, communityPosts.authorUserId))
      .where(eq(communityReports.status, "open"))
      .orderBy(desc(communityReports.createdAt), desc(communityReports.id)),
    db
      .select({
        freezeRecordId: freezeRecords.id,
        userId: freezeRecords.userId,
        email: users.email,
        reason: freezeRecords.reason,
        createdAt: freezeRecords.createdAt,
      })
      .from(freezeRecords)
      .leftJoin(users, eq(users.id, freezeRecords.userId))
      .where(
        and(
          eq(freezeRecords.status, "active"),
          eq(freezeRecords.category, "community"),
          eq(freezeRecords.scope, "gameplay_lock"),
        ),
      )
      .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id))
      .limit(muteLimit),
  ]);

  return {
    queue: toQueueItems(reportRows, limit),
    activeMutes: activeMuteRows.map(toGameplayMuteRecord),
  };
}

export async function bulkDeleteReportedPosts(params: {
  adminId: number | null;
  postIds: number[];
  reason: string;
}) {
  const postIds = [...new Set(params.postIds.filter((postId) => postId > 0))];
  if (postIds.length === 0) {
    return { deletedPostIds: [], resolvedReportCount: 0 };
  }

  const existingPosts = await db
    .select({ id: communityPosts.id })
    .from(communityPosts)
    .where(inArray(communityPosts.id, postIds));

  if (existingPosts.length !== postIds.length) {
    throw notFoundError("Community post not found.", {
      code: API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
    });
  }

  let resolvedReportCount = 0;

  for (const postId of postIds) {
    const moderation = await moderateCommunityPost({
      adminId: params.adminId,
      postId,
      action: "delete",
      reason: params.reason,
      metadata: {
        moderationSurface: "forum_moderation",
        mode: "bulk_delete",
      },
    });

    if (!moderation) {
      throw notFoundError("Community post not found.", {
        code: API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      });
    }

    const resolvedReports = await db
      .update(communityReports)
      .set({
        status: "resolved",
        resolutionNote: params.reason,
        resolvedByAdminId: params.adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityReports.postId, postId),
          eq(communityReports.status, "open"),
        ),
      )
      .returning({ id: communityReports.id });

    resolvedReportCount += resolvedReports.length;
  }

  return {
    deletedPostIds: postIds,
    resolvedReportCount,
  };
}

export async function muteForumUser(params: {
  userId: number;
  reason: UserFreezeReason;
}) {
  return ensureUserFreeze({
    userId: params.userId,
    category: "community",
    reason: params.reason,
    scope: "gameplay_lock",
    metadata: {
      moderationSurface: "forum_moderation",
    },
  });
}

export async function releaseForumMute(params: { freezeRecordId: number }) {
  const [existing] = await db
    .select({ id: freezeRecords.id })
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.id, params.freezeRecordId),
        eq(freezeRecords.status, "active"),
        eq(freezeRecords.category, "community"),
        eq(freezeRecords.scope, "gameplay_lock"),
      ),
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  return releaseUserFreeze({ freezeRecordId: params.freezeRecordId });
}
