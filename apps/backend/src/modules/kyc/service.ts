import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SignJWT, jwtVerify } from "jose";

import {
  admins,
  freezeRecords,
  kycDocuments,
  kycProfiles,
  kycReviewEvents,
  users,
} from "@reward/database";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  sql,
} from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  KycAdminReviewQuery,
  KycSubmitRequest,
  KycStatus,
  KycTier,
} from "@reward/shared-types/kyc";
import type { UserFreezeScope } from "@reward/shared-types/risk";

import type { DbClient, DbTransaction } from "../../db";
import { db } from "../../db";
import {
  conflictError,
  forbiddenError,
  notFoundError,
  serviceUnavailableError,
  unprocessableEntityError,
} from "../../shared/errors";
import { getConfigView } from "../../shared/config";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { getSessionSecret } from "../../shared/session-secret";
import {
  sendKycExpiryReminderNotification,
  sendKycReverificationRequiredNotification,
} from "../auth/notification-service";
import { sendKycStatusChangedNotification } from "../notification/service";
import {
  KYC_TIER_1_MAX_STAKE_AMOUNT_KEY,
  KYC_TIER_2_MAX_DAILY_WITHDRAWAL_AMOUNT_KEY,
} from "../system/keys";
import { getConfigDecimal } from "../system/service";
import {
  ensureUserFreeze,
  releaseUserFreeze,
  releaseUserFreezeByFilter,
} from "../risk/service";
import { assertUserJurisdictionFeatureAllowed } from "../risk/jurisdiction-service";
import { settlePendingReferralsForApprovedUser } from "../referral/service";

type DbExecutor = DbClient | DbTransaction;

const KYC_PREVIEW_PURPOSE = "kyc-document-preview";
const KYC_PREVIEW_TTL_SECONDS = 60 * 5;
const KYC_FREEZE_CATEGORY = "compliance" as const;
const KYC_FREEZE_REASON = "pending_kyc" as const;
const DEFAULT_TIER_1_MAX_STAKE_AMOUNT = 100;
const DEFAULT_TIER_2_MAX_DAILY_WITHDRAWAL_AMOUNT = 5000;
const KYC_REVERIFICATION_REQUIRED_FLAG = "reverification_required";
const KYC_DOCUMENT_EXPIRED_FLAG = "document_expired";
const KYC_POLICY_REFRESH_REQUIRED_FLAG = "policy_refresh_required";
const KYC_EXPIRY_NOTICE_SENT_AT_METADATA_KEY = "expiryNoticeSentAt";

const appConfig = getConfigView();

const KYC_TIER_RANK: Record<KycTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
};

const PENDING_KYC_FREEZE_SCOPE_BY_TIER: Record<
  Exclude<KycTier, "tier_0">,
  UserFreezeScope
> = {
  tier_1: "gameplay_lock",
  tier_2: "withdrawal_lock",
};

type ReviewDecision = "approved" | "rejected" | "request_more_info";
type KycReverificationTrigger =
  | "document_expired"
  | "policy_update"
  | "admin_trigger";
type KycCapabilitySet = {
  allowsRealMoneyPlay: boolean;
  allowsWithdrawal: boolean;
  allowsMultiplayer: boolean;
  maxStakeAmount: string | null;
  maxDailyWithdrawalAmount: string | null;
};

const toRecord = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const readRiskFlags = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const mergeRiskFlags = (
  current: unknown,
  ...additions: Array<string | null | undefined>
): string[] =>
  [
    ...new Set([
      ...readRiskFlags(current),
      ...additions.filter((value): value is string => Boolean(value)),
    ]),
  ];

const trimReason = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const formatDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const buildVerificationUrl = () =>
  new URL("/app/verification", appConfig.webBaseUrl).toString();

const resolveActiveSubmissionVersion = (profile: {
  activeSubmissionVersion: number | null;
  currentTier: KycTier;
  status: KycStatus;
  submissionVersion: number;
}) => {
  if (profile.activeSubmissionVersion) {
    return profile.activeSubmissionVersion;
  }

  if (profile.currentTier !== "tier_0" && profile.status === "approved") {
    return profile.submissionVersion;
  }

  return null;
};

const readDocumentMetadata = (value: unknown) => toRecord(value) ?? {};

const markExpiryNoticeMetadata = (value: unknown, noticedAt: Date) => ({
  ...readDocumentMetadata(value),
  [KYC_EXPIRY_NOTICE_SENT_AT_METADATA_KEY]: noticedAt.toISOString(),
});

const hasExpiryNoticeMetadata = (value: unknown) =>
  typeof readDocumentMetadata(value)[KYC_EXPIRY_NOTICE_SENT_AT_METADATA_KEY] ===
  "string";

export const isKycTierAtLeast = (currentTier: KycTier, minimumTier: KycTier) =>
  KYC_TIER_RANK[currentTier] >= KYC_TIER_RANK[minimumTier];

const maxKycTier = (left: KycTier, right: KycTier) =>
  isKycTierAtLeast(left, right) ? left : right;

const resolveSubmittedAt = (submittedAt: Date | null, createdAt: Date) =>
  submittedAt ?? createdAt;

const buildOffsetPage = <T>(items: T[], page: number, limit: number) => ({
  items: items.slice(0, limit),
  page,
  limit,
  hasNext: items.length > limit,
});

const buildPreviewOrigin = (origin: string) =>
  origin.endsWith("/") ? origin.slice(0, -1) : origin;

const normalizeLocalStoragePath = (storagePath: string) => {
  if (storagePath.startsWith("file://")) {
    return fileURLToPath(storagePath);
  }

  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }

  return path.resolve(process.cwd(), storagePath);
};

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^A-Za-z0-9._-]/g, "_");

const decodeDataUrl = (value: string) => {
  const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
  if (!match) {
    return null;
  }

  return {
    contentType: match[1] ?? "application/octet-stream",
    body: Buffer.from(match[2], "base64"),
  };
};

const signPreviewToken = async (documentId: number) => {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    documentId,
    purpose: KYC_PREVIEW_PURPOSE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(documentId))
    .setIssuedAt(now)
    .setExpirationTime(now + KYC_PREVIEW_TTL_SECONDS)
    .sign(getSessionSecret("admin"));
};

const verifyPreviewToken = async (token: string) => {
  const { payload } = await jwtVerify(token, getSessionSecret("admin"));
  if (payload.purpose !== KYC_PREVIEW_PURPOSE) {
    throw notFoundError("KYC document preview not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  const documentId = Number(payload.documentId ?? payload.sub ?? 0);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw notFoundError("KYC document preview not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  return documentId;
};

const buildPreviewUrl = async (origin: string, documentId: number) => {
  const token = await signPreviewToken(documentId);
  return `${buildPreviewOrigin(origin)}/admin/kyc-document-previews?token=${encodeURIComponent(token)}`;
};

const previewDocumentRows = async (
  origin: string,
  rows: Array<{
    id: number;
    profileId: number;
    userId: number;
    submissionVersion: number;
    kind: string;
    label: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes: number | null;
      storagePath: string;
      expiresAt: Date | null;
      createdAt: Date;
      metadata: unknown;
    }>,
) =>
  Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      profileId: row.profileId,
      userId: row.userId,
      submissionVersion: row.submissionVersion,
      kind: row.kind,
      label: row.label,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storagePath: "",
      previewUrl: await buildPreviewUrl(origin, row.id),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      metadata: toRecord(row.metadata),
    })),
  );

const buildQueueWhereClause = (query: KycAdminReviewQuery) => {
  const conditions = [eq(kycProfiles.status, "pending")];

  if (query.tier) {
    conditions.push(eq(kycProfiles.requestedTier, query.tier));
  }

  const submittedAtExpr = sql`coalesce(${kycProfiles.submittedAt}, ${kycProfiles.createdAt})`;
  if (query.from) {
    conditions.push(gte(submittedAtExpr, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(submittedAtExpr, new Date(query.to)));
  }
  if (query.riskFlag?.trim()) {
    const riskFlagPattern = `(^|[^[:alnum:]_])${query.riskFlag
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^[:alnum:]_]|$)`;
    conditions.push(
      sql`coalesce(${kycProfiles.riskFlags}, '[]'::jsonb)::text ~ ${riskFlagPattern}`,
    );
  }

  return and(...conditions);
};

const toQueueTier = (requestedTier: KycTier | null, currentTier: KycTier) =>
  requestedTier ?? currentTier;

export async function listAdminKycQueue(query: KycAdminReviewQuery) {
  const limit = query.limit ?? 50;
  const page = query.page ?? 1;
  const offset = (page - 1) * limit;
  const whereClause = buildQueueWhereClause(query);

  const rows = await db
    .select({
      id: kycProfiles.id,
      userId: kycProfiles.userId,
      userEmail: users.email,
      currentTier: kycProfiles.currentTier,
      requestedTier: kycProfiles.requestedTier,
      status: kycProfiles.status,
      submissionVersion: kycProfiles.submissionVersion,
      legalName: kycProfiles.legalName,
      countryCode: kycProfiles.countryCode,
      riskFlags: kycProfiles.riskFlags,
      submittedAt: kycProfiles.submittedAt,
      createdAt: kycProfiles.createdAt,
      freezeStatus: freezeRecords.status,
    })
    .from(kycProfiles)
    .innerJoin(users, eq(kycProfiles.userId, users.id))
    .leftJoin(freezeRecords, eq(kycProfiles.freezeRecordId, freezeRecords.id))
    .where(whereClause)
    .orderBy(
      asc(sql`coalesce(${kycProfiles.submittedAt}, ${kycProfiles.createdAt})`),
      asc(kycProfiles.id),
    )
    .limit(limit + 1)
    .offset(offset);

  const pageRows = rows.slice(0, limit);
  const profileIds = pageRows.map((row) => row.id);
  const documentCountRows =
    profileIds.length === 0
      ? []
      : await db
          .select({
            profileId: kycDocuments.profileId,
            submissionVersion: kycDocuments.submissionVersion,
            total: sql<number>`count(*)`,
          })
          .from(kycDocuments)
          .where(inArray(kycDocuments.profileId, profileIds))
          .groupBy(kycDocuments.profileId, kycDocuments.submissionVersion);
  const documentCountByProfile = new Map(
    documentCountRows.map((row) => [
      `${row.profileId}:${row.submissionVersion}`,
      Number(row.total),
    ]),
  );

  return buildOffsetPage(
    pageRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userEmail: row.userEmail,
      currentTier: row.currentTier as KycTier,
      requestedTier: row.requestedTier as KycTier | null,
      status: "pending" as const,
      submissionVersion: row.submissionVersion,
      legalName: row.legalName,
      countryCode: row.countryCode,
      riskFlags: readRiskFlags(row.riskFlags),
      submittedAt: resolveSubmittedAt(row.submittedAt, row.createdAt),
      hasActiveFreeze: row.freezeStatus === "active",
      documentCount:
        documentCountByProfile.get(`${row.id}:${row.submissionVersion}`) ?? 0,
      tier: toQueueTier(
        row.requestedTier as KycTier | null,
        row.currentTier as KycTier,
      ),
    })),
    page,
    limit,
  );
}

export async function getAdminKycDetail(profileId: number, origin: string) {
  const [profile] = await db
    .select({
      id: kycProfiles.id,
      userId: kycProfiles.userId,
      userEmail: users.email,
      currentTier: kycProfiles.currentTier,
      requestedTier: kycProfiles.requestedTier,
      status: kycProfiles.status,
      submissionVersion: kycProfiles.submissionVersion,
      legalName: kycProfiles.legalName,
      documentType: kycProfiles.documentType,
      documentNumberLast4: kycProfiles.documentNumberLast4,
      countryCode: kycProfiles.countryCode,
      notes: kycProfiles.notes,
      rejectionReason: kycProfiles.rejectionReason,
      submittedData: kycProfiles.submittedData,
      riskFlags: kycProfiles.riskFlags,
      freezeRecordId: kycProfiles.freezeRecordId,
      reviewedByAdminId: kycProfiles.reviewedByAdminId,
      submittedAt: kycProfiles.submittedAt,
      reviewedAt: kycProfiles.reviewedAt,
      createdAt: kycProfiles.createdAt,
      updatedAt: kycProfiles.updatedAt,
      freezeStatus: freezeRecords.status,
    })
    .from(kycProfiles)
    .innerJoin(users, eq(kycProfiles.userId, users.id))
    .leftJoin(freezeRecords, eq(kycProfiles.freezeRecordId, freezeRecords.id))
    .where(eq(kycProfiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw notFoundError("KYC profile not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  const [documentRows, eventRows] = await Promise.all([
    db
      .select()
      .from(kycDocuments)
      .where(
        and(
          eq(kycDocuments.profileId, profileId),
          eq(kycDocuments.submissionVersion, profile.submissionVersion),
        ),
      )
      .orderBy(asc(kycDocuments.createdAt), asc(kycDocuments.id)),
    db
      .select({
        id: kycReviewEvents.id,
        profileId: kycReviewEvents.profileId,
        userId: kycReviewEvents.userId,
        submissionVersion: kycReviewEvents.submissionVersion,
        action: kycReviewEvents.action,
        fromStatus: kycReviewEvents.fromStatus,
        toStatus: kycReviewEvents.toStatus,
        targetTier: kycReviewEvents.targetTier,
        actorAdminId: kycReviewEvents.actorAdminId,
        actorAdminEmail: users.email,
        reason: kycReviewEvents.reason,
        metadata: kycReviewEvents.metadata,
        createdAt: kycReviewEvents.createdAt,
      })
      .from(kycReviewEvents)
      .leftJoin(admins, eq(kycReviewEvents.actorAdminId, admins.id))
      .leftJoin(users, eq(admins.userId, users.id))
      .where(eq(kycReviewEvents.profileId, profileId))
      .orderBy(desc(kycReviewEvents.createdAt), desc(kycReviewEvents.id)),
  ]);

  const documents = await previewDocumentRows(origin, documentRows);

  return {
    id: profile.id,
    userId: profile.userId,
    userEmail: profile.userEmail,
    currentTier: profile.currentTier as KycTier,
    requestedTier: profile.requestedTier as KycTier | null,
    status: profile.status as KycStatus,
    submissionVersion: profile.submissionVersion,
    legalName: profile.legalName,
    documentType: profile.documentType,
    documentNumberLast4: profile.documentNumberLast4,
    countryCode: profile.countryCode,
    notes: profile.notes,
    rejectionReason: profile.rejectionReason,
    submittedData: toRecord(profile.submittedData),
    riskFlags: readRiskFlags(profile.riskFlags),
    freezeRecordId: profile.freezeRecordId,
    reviewedByAdminId: profile.reviewedByAdminId,
    submittedAt: profile.submittedAt,
    reviewedAt: profile.reviewedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    hasActiveFreeze: profile.freezeStatus === "active",
    documents,
    reviewEvents: eventRows.map((row) => ({
      ...row,
      targetTier: row.targetTier as KycTier | null,
      action: row.action as
        | "submitted"
        | "approved"
        | "rejected"
        | "request_more_info"
        | "reverification_requested",
      fromStatus: row.fromStatus as KycStatus,
      toStatus: row.toStatus as KycStatus,
      metadata: toRecord(row.metadata),
    })),
  };
}

const validateReviewReason = (
  decision: ReviewDecision,
  reason: string | null,
) => {
  if (decision === "rejected" && !reason) {
    throw unprocessableEntityError("Reject reason is required.", {
      code: API_ERROR_CODES.FIELD_REQUIRED,
    });
  }
};

const queueExpiryReminderNotification = async (params: {
  email: string;
  currentTier: KycTier;
  expiresAt: Date;
  executor: DbExecutor;
}) => {
  try {
    await sendKycExpiryReminderNotification(
      {
        email: params.email,
        verificationUrl: buildVerificationUrl(),
        currentTier: params.currentTier,
        expiresAt: params.expiresAt,
      },
      params.executor,
    );
    return true;
  } catch (error) {
    logger.warning("failed to queue KYC expiry reminder notification", {
      err: error,
      recipient: params.email,
      currentTier: params.currentTier,
      expiresAt: params.expiresAt.toISOString(),
    });
    return false;
  }
};

const queueReverificationRequiredNotification = async (params: {
  email: string;
  targetTier: KycTier;
  trigger: KycReverificationTrigger;
  occurredAt: Date;
  operatorReason: string | null;
  expiresAt?: Date | null;
  executor: DbExecutor;
}) => {
  try {
    await sendKycReverificationRequiredNotification(
      {
        email: params.email,
        verificationUrl: buildVerificationUrl(),
        targetTier: params.targetTier,
        reverificationType: params.trigger,
        occurredAt: params.occurredAt,
        operatorReason: params.operatorReason,
        expiresAt: params.expiresAt ?? null,
      },
      params.executor,
    );
    return true;
  } catch (error) {
    logger.warning("failed to queue KYC reverification notification", {
      err: error,
      recipient: params.email,
      targetTier: params.targetTier,
      trigger: params.trigger,
    });
    return false;
  }
};

export async function reviewKycProfile(payload: {
  profileId: number;
  adminId: number;
  decision: ReviewDecision;
  reason?: string | null;
}) {
  const reviewReason = trimReason(payload.reason);
  validateReviewReason(payload.decision, reviewReason);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: kycProfiles.id,
        userId: kycProfiles.userId,
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
        status: kycProfiles.status,
        submissionVersion: kycProfiles.submissionVersion,
        activeSubmissionVersion: kycProfiles.activeSubmissionVersion,
        freezeRecordId: kycProfiles.freezeRecordId,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.id, payload.profileId))
      .limit(1);

    if (!existing) {
      throw notFoundError("KYC profile not found.", {
        code: API_ERROR_CODES.NOT_FOUND,
      });
    }

    if (existing.status !== "pending") {
      throw conflictError("Only pending KYC profiles can be reviewed.", {
        code: API_ERROR_CODES.ONLY_PENDING_REQUESTS_APPROVABLE,
      });
    }

    const nextStatus: KycStatus =
      payload.decision === "request_more_info"
        ? "more_info_required"
        : payload.decision;
    const now = new Date();
    const nextCurrentTier =
      payload.decision === "approved"
        ? maxKycTier(
            existing.currentTier as KycTier,
            (existing.requestedTier ?? existing.currentTier) as KycTier,
          )
        : (existing.currentTier as KycTier);
    const freezeScope = PENDING_KYC_FREEZE_SCOPE_BY_TIER[
      ((existing.requestedTier ?? existing.currentTier) as Exclude<
        KycTier,
        "tier_0"
      >)
    ];
    let freezeRecordId = existing.freezeRecordId ?? null;
    let releasedFreeze = null;

    if (payload.decision === "request_more_info") {
      const activeFreeze = await ensureUserFreeze(
        {
          userId: existing.userId,
          category: KYC_FREEZE_CATEGORY,
          reason: KYC_FREEZE_REASON,
          scope: freezeScope,
          metadata: {
            kycProfileId: existing.id,
            submissionVersion: existing.submissionVersion,
            requestedTier: existing.requestedTier ?? existing.currentTier,
            reviewAction: payload.decision,
          },
        },
        { executor: tx },
      );
      freezeRecordId = activeFreeze?.id ?? freezeRecordId;
    } else {
      releasedFreeze =
        existing.freezeRecordId
          ? await releaseUserFreeze(
              { freezeRecordId: existing.freezeRecordId },
              tx,
            )
          : await releaseUserFreezeByFilter(
              {
                userId: existing.userId,
                reason: KYC_FREEZE_REASON,
              },
              tx,
            );
    }

    const [updated] = await tx
      .update(kycProfiles)
      .set({
        currentTier: nextCurrentTier,
        requestedTier:
          payload.decision === "approved" ? null : existing.requestedTier,
        activeSubmissionVersion:
          payload.decision === "approved"
            ? existing.submissionVersion
            : existing.activeSubmissionVersion,
        status: nextStatus,
        rejectionReason:
          payload.decision === "rejected" ? reviewReason : null,
        reviewedByAdminId: payload.adminId,
        reviewedAt: now,
        updatedAt: now,
        freezeRecordId,
      })
      .where(and(eq(kycProfiles.id, payload.profileId), eq(kycProfiles.status, "pending")))
      .returning({
        id: kycProfiles.id,
        status: kycProfiles.status,
        freezeRecordId: kycProfiles.freezeRecordId,
      });

    if (!updated) {
      throw conflictError("Only pending KYC profiles can be reviewed.", {
        code: API_ERROR_CODES.ONLY_PENDING_REQUESTS_APPROVABLE,
      });
    }

    await tx.insert(kycReviewEvents).values({
      profileId: existing.id,
      userId: existing.userId,
      submissionVersion: existing.submissionVersion,
      action: payload.decision,
      fromStatus: existing.status,
      toStatus: nextStatus,
      targetTier: existing.requestedTier ?? existing.currentTier,
      actorAdminId: payload.adminId,
      reason: reviewReason,
      metadata: {
        freezeRecordId: freezeRecordId ?? releasedFreeze?.id ?? null,
      },
    });

    if (payload.decision === "approved") {
      await settlePendingReferralsForApprovedUser(
        {
          referredUserId: existing.userId,
          currentTier: nextCurrentTier,
        },
        tx,
      );
    }

    return {
      updated,
      notify: {
        userId: existing.userId,
        targetTier: existing.requestedTier ?? existing.currentTier,
        rejectionReason: reviewReason,
      },
    };
  });

  try {
    await sendKycStatusChangedNotification({
      userId: result.notify.userId,
      status: result.updated.status as KycStatus,
      targetTier: result.notify.targetTier,
      rejectionReason: result.notify.rejectionReason,
    });
  } catch (error) {
    logger.warning("failed to dispatch KYC status notification", {
      err: error,
      profileId: payload.profileId,
      userId: result.notify.userId,
      decision: payload.decision,
    });
  }

  return result.updated;
}

export async function loadKycDocumentPreview(token: string) {
  let documentId: number;
  try {
    documentId = await verifyPreviewToken(token);
  } catch {
    throw notFoundError("KYC document preview not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  const [document] = await db
    .select({
      id: kycDocuments.id,
      fileName: kycDocuments.fileName,
      mimeType: kycDocuments.mimeType,
      storagePath: kycDocuments.storagePath,
    })
    .from(kycDocuments)
    .where(eq(kycDocuments.id, documentId))
    .limit(1);

  if (!document) {
    throw notFoundError("KYC document preview not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  if (/^https?:\/\//i.test(document.storagePath)) {
    const response = await fetch(document.storagePath);
    if (!response.ok) {
      throw serviceUnavailableError("KYC document source is unavailable.", {
        code: API_ERROR_CODES.BACKEND_REQUEST_FAILED,
      });
    }

    const contentType =
      response.headers.get("content-type") ?? document.mimeType;
    return {
      fileName: sanitizeFileName(document.fileName),
      contentType,
      body: Buffer.from(await response.arrayBuffer()),
    };
  }

  if (document.storagePath.startsWith("data:")) {
    const decoded = decodeDataUrl(document.storagePath);
    if (!decoded) {
      throw serviceUnavailableError("KYC document source is unavailable.", {
        code: API_ERROR_CODES.BACKEND_REQUEST_FAILED,
      });
    }

    return {
      fileName: sanitizeFileName(document.fileName),
      contentType: decoded.contentType,
      body: decoded.body,
    };
  }

  const filePath = normalizeLocalStoragePath(document.storagePath);
  return {
    fileName: sanitizeFileName(document.fileName),
    contentType: document.mimeType,
    body: await readFile(filePath),
  };
}

const deriveContactVerifiedTier = (user: {
  emailVerifiedAt: Date | string | null;
  phoneVerifiedAt: Date | string | null;
}): KycTier => {
  if (user.phoneVerifiedAt) {
    return "tier_2";
  }

  if (user.emailVerifiedAt) {
    return "tier_1";
  }

  return "tier_0";
};

const resolveStoredCurrentTier = (
  storedTier: KycTier | null | undefined,
): KycTier => storedTier ?? "tier_0";

const resolveEffectiveCurrentTier = (
  storedTier: KycTier | null | undefined,
  user: {
    emailVerifiedAt: Date | string | null;
    phoneVerifiedAt: Date | string | null;
  },
) => {
  const derivedTier = deriveContactVerifiedTier(user);
  return storedTier ? maxKycTier(storedTier, derivedTier) : derivedTier;
};

const getTier1MaxStakeAmount = async (executor: DbExecutor) =>
  getConfigDecimal(
    executor,
    KYC_TIER_1_MAX_STAKE_AMOUNT_KEY,
    DEFAULT_TIER_1_MAX_STAKE_AMOUNT,
  );

const getTier2MaxDailyWithdrawalAmount = async (executor: DbExecutor) =>
  getConfigDecimal(
    executor,
    KYC_TIER_2_MAX_DAILY_WITHDRAWAL_AMOUNT_KEY,
    DEFAULT_TIER_2_MAX_DAILY_WITHDRAWAL_AMOUNT,
  );

const getKycCapabilities = async (
  tier: KycTier,
  executor: DbExecutor,
): Promise<KycCapabilitySet> => {
  const [tier1MaxStakeAmount, tier2MaxDailyWithdrawalAmount] =
    await Promise.all([
      getTier1MaxStakeAmount(executor),
      getTier2MaxDailyWithdrawalAmount(executor),
    ]);

  if (tier === "tier_2") {
    return {
      allowsRealMoneyPlay: true,
      allowsWithdrawal: true,
      allowsMultiplayer: true,
      maxStakeAmount: null,
      maxDailyWithdrawalAmount: toMoneyString(
        tier2MaxDailyWithdrawalAmount,
      ),
    };
  }

  if (tier === "tier_1") {
    return {
      allowsRealMoneyPlay: true,
      allowsWithdrawal: false,
      allowsMultiplayer: false,
      maxStakeAmount: toMoneyString(tier1MaxStakeAmount),
      maxDailyWithdrawalAmount: null,
    };
  }

  return {
    allowsRealMoneyPlay: false,
    allowsWithdrawal: false,
    allowsMultiplayer: false,
    maxStakeAmount: null,
    maxDailyWithdrawalAmount: null,
  };
};

export async function getEffectiveUserKycTier(
  userId: number,
  executor: DbExecutor = db,
): Promise<KycTier> {
  const [userRows, profileRows] = await Promise.all([
    executor
      .select({
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    executor
      .select({
        currentTier: kycProfiles.currentTier,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, userId))
      .limit(1),
  ]);

  const user = userRows[0] ?? null;
  if (!user) {
    throw notFoundError("User not found.", {
      code: API_ERROR_CODES.USER_NOT_FOUND,
    });
  }

  const profile = profileRows[0] ?? null;
  return resolveEffectiveCurrentTier(
    profile?.currentTier as KycTier | null | undefined,
    user,
  );
}

const deriveSubmissionRiskFlags = (params: {
  targetTier: KycTier;
  currentTier: KycTier;
  user: {
    emailVerifiedAt: Date | string | null;
    phoneVerifiedAt: Date | string | null;
  };
}) => {
  const flags = new Set<string>();

  if (params.targetTier === "tier_2") {
    flags.add("enhanced_tier_review");
  }
  if (!params.user.emailVerifiedAt) {
    flags.add("email_unverified");
  }
  if (!params.user.phoneVerifiedAt) {
    flags.add("phone_unverified");
  }
  if (params.targetTier === params.currentTier) {
    flags.add("same_tier_resubmission");
  }

  return [...flags];
};

const loadCurrentProfileRow = async (userId: number, executor: DbExecutor = db) => {
  const [userRows, profileRows] = await Promise.all([
    executor
      .select({
        id: users.id,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    executor
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, userId))
      .limit(1),
  ]);

  const user = userRows[0] ?? null;
  if (!user) {
    throw notFoundError("User not found.", {
      code: API_ERROR_CODES.USER_NOT_FOUND,
    });
  }

  return { user, profile: profileRows[0] ?? null };
};

const getEnforcedUserKycTier = async (
  userId: number,
  executor: DbExecutor = db,
) => {
  const { profile } = await loadCurrentProfileRow(userId, executor);
  if (!profile) {
    return null;
  }

  return resolveStoredCurrentTier(
    profile.currentTier as KycTier | null | undefined,
  );
};

export async function getUserKycProfile(userId: number) {
  const { profile } = await loadCurrentProfileRow(userId);
  const currentTier = resolveStoredCurrentTier(
    profile?.currentTier as KycTier | null | undefined,
  );

  if (!profile) {
    return {
      id: 0,
      userId,
      currentTier,
      requestedTier: null,
      status: "not_started" as const,
      submissionVersion: 0,
      legalName: null,
      documentType: null,
      documentNumberLast4: null,
      countryCode: null,
      notes: null,
      rejectionReason: null,
      submittedData: null,
      riskFlags: [],
      freezeRecordId: null,
      reviewedByAdminId: null,
      submittedAt: null,
      reviewedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      documents: [],
      reviewEvents: [],
    };
  }

  const [documents, reviewEvents] = await Promise.all([
    db
      .select()
      .from(kycDocuments)
      .where(
        and(
          eq(kycDocuments.profileId, profile.id),
          eq(kycDocuments.submissionVersion, profile.submissionVersion),
        ),
      )
      .orderBy(asc(kycDocuments.createdAt), asc(kycDocuments.id)),
    db
      .select()
      .from(kycReviewEvents)
      .where(eq(kycReviewEvents.profileId, profile.id))
      .orderBy(desc(kycReviewEvents.createdAt), desc(kycReviewEvents.id)),
  ]);

  return {
    id: profile.id,
    userId: profile.userId,
    currentTier,
    requestedTier: profile.requestedTier as KycTier | null,
    status: profile.status as KycStatus,
    submissionVersion: profile.submissionVersion,
    legalName: profile.legalName,
    documentType: profile.documentType,
    documentNumberLast4: profile.documentNumberLast4,
    countryCode: profile.countryCode,
    notes: profile.notes,
    rejectionReason: profile.rejectionReason,
    submittedData: toRecord(profile.submittedData),
    riskFlags: readRiskFlags(profile.riskFlags),
    freezeRecordId: profile.freezeRecordId,
    reviewedByAdminId: profile.reviewedByAdminId,
    submittedAt: profile.submittedAt,
    reviewedAt: profile.reviewedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    documents: documents.map((document) => ({
      id: document.id,
      profileId: document.profileId,
      userId: document.userId,
      submissionVersion: document.submissionVersion,
      kind: document.kind,
      label: document.label,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      storagePath: document.storagePath,
      createdAt: document.createdAt,
      expiresAt: document.expiresAt,
      metadata: toRecord(document.metadata),
    })),
    reviewEvents: reviewEvents.map((event) => ({
      ...event,
      targetTier: event.targetTier as KycTier | null,
      fromStatus: event.fromStatus as KycStatus,
      toStatus: event.toStatus as KycStatus,
      metadata: toRecord(event.metadata),
    })),
  };
}

export async function triggerKycReverification(payload: {
  profileId: number;
  adminId?: number | null;
  reason?: string | null;
  trigger?: KycReverificationTrigger;
  expiresAt?: Date | null;
}) {
  const reviewReason = trimReason(payload.reason);
  const trigger = payload.trigger ?? "policy_update";

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: kycProfiles.id,
        userId: kycProfiles.userId,
        userEmail: users.email,
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
        status: kycProfiles.status,
        submissionVersion: kycProfiles.submissionVersion,
        activeSubmissionVersion: kycProfiles.activeSubmissionVersion,
        riskFlags: kycProfiles.riskFlags,
        freezeRecordId: kycProfiles.freezeRecordId,
      })
      .from(kycProfiles)
      .innerJoin(users, eq(kycProfiles.userId, users.id))
      .where(eq(kycProfiles.id, payload.profileId))
      .limit(1);

    if (!existing) {
      throw notFoundError("KYC profile not found.", {
        code: API_ERROR_CODES.KYC_PROFILE_NOT_FOUND,
      });
    }

    const currentTier = existing.currentTier as KycTier;
    const currentStatus = existing.status as KycStatus;
    const currentRiskFlags = readRiskFlags(existing.riskFlags);
    const alreadyRequiresReverification =
      currentTier === "tier_0" &&
      currentStatus === "more_info_required" &&
      currentRiskFlags.includes(KYC_REVERIFICATION_REQUIRED_FLAG);

    if (alreadyRequiresReverification) {
      return {
        id: existing.id,
        status: currentStatus,
        freezeRecordId: existing.freezeRecordId ?? null,
        currentTier,
        requestedTier: existing.requestedTier as KycTier | null,
        changed: false,
      };
    }

    if (currentTier === "tier_0") {
      throw conflictError(
        "Only active KYC tiers can be forced into reverification.",
        {
          code: API_ERROR_CODES.INVALID_REQUEST,
        },
      );
    }

    const now = new Date();
    const targetTier = currentTier as Exclude<KycTier, "tier_0">;
    const nextRiskFlags = mergeRiskFlags(
      existing.riskFlags,
      KYC_REVERIFICATION_REQUIRED_FLAG,
      trigger === "document_expired"
        ? KYC_DOCUMENT_EXPIRED_FLAG
        : KYC_POLICY_REFRESH_REQUIRED_FLAG,
    );

    await releaseUserFreezeByFilter(
      {
        userId: existing.userId,
        reason: KYC_FREEZE_REASON,
      },
      tx,
    );

    const activeSubmissionVersion = resolveActiveSubmissionVersion({
      activeSubmissionVersion: existing.activeSubmissionVersion,
      currentTier,
      status: currentStatus,
      submissionVersion: existing.submissionVersion,
    });

    const pendingFreeze = await ensureUserFreeze(
      {
        userId: existing.userId,
        category: KYC_FREEZE_CATEGORY,
        reason: KYC_FREEZE_REASON,
        scope: PENDING_KYC_FREEZE_SCOPE_BY_TIER[targetTier],
        metadata: {
          kycProfileId: existing.id,
          requestedTier: targetTier,
          trigger,
          activeSubmissionVersion,
          previousStatus: currentStatus,
        },
      },
      { executor: tx },
    );

    const [updated] = await tx
      .update(kycProfiles)
      .set({
        currentTier: "tier_0",
        requestedTier: targetTier,
        activeSubmissionVersion: null,
        status: "more_info_required",
        rejectionReason: null,
        riskFlags: nextRiskFlags,
        freezeRecordId: pendingFreeze?.id ?? existing.freezeRecordId ?? null,
        reviewedByAdminId: payload.adminId ?? null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(kycProfiles.id, payload.profileId))
      .returning({
        id: kycProfiles.id,
        status: kycProfiles.status,
        freezeRecordId: kycProfiles.freezeRecordId,
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
      });

    await tx.insert(kycReviewEvents).values({
      profileId: existing.id,
      userId: existing.userId,
      submissionVersion: existing.submissionVersion,
      action: "reverification_requested",
      fromStatus: currentStatus,
      toStatus: "more_info_required",
      targetTier,
      actorAdminId: payload.adminId ?? null,
      reason: reviewReason,
      metadata: {
        trigger,
        previousTier: currentTier,
        previousStatus: currentStatus,
        supersededRequestedTier: existing.requestedTier ?? null,
        activeSubmissionVersion,
        freezeRecordId: pendingFreeze?.id ?? null,
        expiresAt: payload.expiresAt?.toISOString() ?? null,
      },
    });

    await queueReverificationRequiredNotification({
      email: existing.userEmail,
      targetTier,
      trigger,
      occurredAt: now,
      operatorReason: reviewReason,
      expiresAt: payload.expiresAt ?? null,
      executor: tx,
    });

    return {
      id: updated.id,
      status: updated.status as KycStatus,
      freezeRecordId: updated.freezeRecordId ?? null,
      currentTier: updated.currentTier as KycTier,
      requestedTier: updated.requestedTier as KycTier | null,
      changed: true,
    };
  });
}

export async function runKycReverificationSweep(now = new Date()) {
  const noticeCutoff = new Date(
    now.getTime() + appConfig.kycReverificationNoticeDays * 24 * 60 * 60 * 1000,
  );

  const candidateRows = await db
    .select({
      profileId: kycProfiles.id,
      userId: kycProfiles.userId,
      userEmail: users.email,
      currentTier: kycProfiles.currentTier,
      status: kycProfiles.status,
      submissionVersion: kycProfiles.submissionVersion,
      activeSubmissionVersion: kycProfiles.activeSubmissionVersion,
      documentId: kycDocuments.id,
      documentSubmissionVersion: kycDocuments.submissionVersion,
      expiresAt: kycDocuments.expiresAt,
      metadata: kycDocuments.metadata,
    })
    .from(kycProfiles)
    .innerJoin(users, eq(kycProfiles.userId, users.id))
    .innerJoin(kycDocuments, eq(kycDocuments.profileId, kycProfiles.id))
    .where(
      and(
        ne(kycProfiles.currentTier, "tier_0"),
        lte(kycDocuments.expiresAt, noticeCutoff),
      ),
    )
    .orderBy(asc(kycProfiles.id), asc(kycDocuments.expiresAt), asc(kycDocuments.id));

  type KycExpiryCandidateRow = (typeof candidateRows)[number];
  const rowsByProfileId = new Map<number, KycExpiryCandidateRow[]>();
  for (const row of candidateRows) {
    const current = rowsByProfileId.get(row.profileId) ?? [];
    current.push(row);
    rowsByProfileId.set(row.profileId, current);
  }

  let expiryRemindersQueued = 0;
  let reverificationRequested = 0;
  let skippedProfiles = 0;

  for (const rows of rowsByProfileId.values()) {
    const profile = rows[0];
    if (!profile) {
      continue;
    }

    const activeSubmissionVersion = resolveActiveSubmissionVersion({
      activeSubmissionVersion: profile.activeSubmissionVersion,
      currentTier: profile.currentTier as KycTier,
      status: profile.status as KycStatus,
      submissionVersion: profile.submissionVersion,
    });

    if (!activeSubmissionVersion) {
      skippedProfiles += 1;
      continue;
    }

    const activeRows = rows.filter(
      (row) =>
        row.documentSubmissionVersion === activeSubmissionVersion &&
        row.expiresAt !== null,
    );

    if (activeRows.length === 0) {
      skippedProfiles += 1;
      continue;
    }

    const soonestExpiry = activeRows[0]?.expiresAt;
    if (!soonestExpiry) {
      skippedProfiles += 1;
      continue;
    }

    if (soonestExpiry.getTime() <= now.getTime()) {
      const result = await triggerKycReverification({
        profileId: profile.profileId,
        trigger: "document_expired",
        reason: `Active KYC document expired on ${formatDateOnly(soonestExpiry)}.`,
        expiresAt: soonestExpiry,
      });

      if (result.changed) {
        reverificationRequested += 1;
      } else {
        skippedProfiles += 1;
      }
      continue;
    }

    if (activeRows.some((row) => hasExpiryNoticeMetadata(row.metadata))) {
      skippedProfiles += 1;
      continue;
    }

    let queuedReminder = false;
    await db.transaction(async (tx) => {
      queuedReminder = await queueExpiryReminderNotification({
        email: profile.userEmail,
        currentTier: profile.currentTier as KycTier,
        expiresAt: soonestExpiry,
        executor: tx,
      });

      if (!queuedReminder) {
        return;
      }

      for (const row of activeRows) {
        await tx
          .update(kycDocuments)
          .set({
            metadata: markExpiryNoticeMetadata(row.metadata, now),
          })
          .where(eq(kycDocuments.id, row.documentId));
      }

      expiryRemindersQueued += 1;
    });

    if (!queuedReminder) {
      skippedProfiles += 1;
    }
  }

  return {
    scannedProfiles: rowsByProfileId.size,
    expiryRemindersQueued,
    reverificationRequested,
    skippedProfiles,
  };
}

export async function submitKycProfile(
  userId: number,
  payload: KycSubmitRequest,
) {
  await db.transaction(async (tx) => {
    const { user, profile } = await loadCurrentProfileRow(userId, tx);
    if (profile?.status === "pending") {
      throw conflictError("Another KYC review is already pending.", {
        code: API_ERROR_CODES.ANOTHER_REVIEW_PENDING,
      });
    }

    const currentTier = resolveStoredCurrentTier(
      profile?.currentTier as KycTier | null | undefined,
    );
    if (KYC_TIER_RANK[payload.targetTier] < KYC_TIER_RANK[currentTier]) {
      throw conflictError(
        "Requested KYC tier must not be lower than current tier.",
        {
          code: API_ERROR_CODES.INVALID_REQUEST,
        },
      );
    }
    const nextSubmissionVersion = (profile?.submissionVersion ?? 0) + 1;
    const now = new Date();
    const riskFlags = deriveSubmissionRiskFlags({
      targetTier: payload.targetTier,
      currentTier,
      user,
    });
    const submittedData = {
      legalName: payload.legalName,
      documentType: payload.documentType,
      documentNumberLast4: payload.documentNumberLast4,
      countryCode: payload.countryCode ?? null,
      documentExpiresAt: payload.documentExpiresAt ?? null,
      notes: payload.notes ?? null,
    };
    const documentExpiresAt = payload.documentExpiresAt
      ? new Date(payload.documentExpiresAt)
      : null;
    const freezeScope = PENDING_KYC_FREEZE_SCOPE_BY_TIER[payload.targetTier];

    await releaseUserFreezeByFilter(
      {
        userId,
        reason: KYC_FREEZE_REASON,
      },
      tx,
    );

    const pendingFreeze = await ensureUserFreeze(
      {
        userId,
        category: KYC_FREEZE_CATEGORY,
        reason: KYC_FREEZE_REASON,
        scope: freezeScope,
        metadata: {
          requestedTier: payload.targetTier,
          submissionVersion: nextSubmissionVersion,
        },
      },
      { executor: tx },
    );

    const savedProfileRows = profile
      ? await tx
          .update(kycProfiles)
          .set({
            currentTier,
            requestedTier: payload.targetTier,
            activeSubmissionVersion: profile.activeSubmissionVersion,
            status: "pending",
            submissionVersion: nextSubmissionVersion,
            legalName: payload.legalName,
            documentType: payload.documentType,
            documentNumberLast4: payload.documentNumberLast4,
            countryCode: payload.countryCode ?? null,
            notes: payload.notes ?? null,
            rejectionReason: null,
            submittedData,
            riskFlags,
            freezeRecordId: pendingFreeze?.id ?? null,
            reviewedByAdminId: null,
            submittedAt: now,
            reviewedAt: null,
            updatedAt: now,
          })
          .where(eq(kycProfiles.id, profile.id))
          .returning()
      : await tx
          .insert(kycProfiles)
          .values({
            userId,
            currentTier,
            requestedTier: payload.targetTier,
            activeSubmissionVersion: null,
            status: "pending",
            submissionVersion: nextSubmissionVersion,
            legalName: payload.legalName,
            documentType: payload.documentType,
            documentNumberLast4: payload.documentNumberLast4,
            countryCode: payload.countryCode ?? null,
            notes: payload.notes ?? null,
            submittedData,
            riskFlags,
            freezeRecordId: pendingFreeze?.id ?? null,
            submittedAt: now,
            updatedAt: now,
          })
          .returning();
    const savedProfile = savedProfileRows[0];

    await tx.insert(kycDocuments).values(
      payload.documents.map((document) => ({
        profileId: savedProfile.id,
        userId,
        submissionVersion: nextSubmissionVersion,
        kind: document.kind,
        label: null,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        storagePath: `data:${document.mimeType};base64,${document.contentBase64}`,
        expiresAt: document.kind === "selfie" ? null : documentExpiresAt,
        metadata: null,
      })),
    );

    await tx.insert(kycReviewEvents).values({
      profileId: savedProfile.id,
      userId,
      submissionVersion: nextSubmissionVersion,
      action: "submitted",
      fromStatus: (profile?.status as KycStatus | null) ?? "not_started",
      toStatus: "pending",
      targetTier: payload.targetTier,
      actorAdminId: null,
      reason: payload.notes ?? null,
      metadata: {
        documentCount: payload.documents.length,
        freezeRecordId: pendingFreeze?.id ?? null,
      },
    });
  });

  return getUserKycProfile(userId);
}

export async function assertKycStakeAllowed(
  userId: number,
  amount: string,
  executor: DbExecutor = db,
) {
  await assertUserJurisdictionFeatureAllowed(
    userId,
    "real_money_gameplay",
    executor,
  );
  const currentTier = await getEnforcedUserKycTier(userId, executor);
  if (!currentTier) {
    throw forbiddenError("Tier 1 verification required for real-money play.", {
      code: API_ERROR_CODES.KYC_TIER_REQUIRED,
    });
  }
  const capabilities = await getKycCapabilities(currentTier, executor);

  if (!capabilities.allowsRealMoneyPlay) {
    throw forbiddenError("Tier 1 verification required for real-money play.", {
      code: API_ERROR_CODES.KYC_TIER_REQUIRED,
    });
  }

  if (!capabilities.maxStakeAmount) {
    return;
  }

  if (toDecimal(amount).gt(toDecimal(capabilities.maxStakeAmount))) {
    throw conflictError(
      `Tier 1 users can stake at most ${capabilities.maxStakeAmount} per game.`,
      {
        code: API_ERROR_CODES.KYC_STAKE_LIMIT_EXCEEDED,
      },
    );
  }
}

export async function assertKycWithdrawalAllowed(
  userId: number,
  amount: string,
  totalToday: string,
  executor: DbExecutor = db,
) {
  await assertUserJurisdictionFeatureAllowed(
    userId,
    "withdrawal",
    executor,
  );
  const currentTier = await getEnforcedUserKycTier(userId, executor);
  if (!currentTier) {
    throw forbiddenError("Tier 2 verification required for withdrawals.", {
      code: API_ERROR_CODES.KYC_TIER_REQUIRED,
    });
  }
  const capabilities = await getKycCapabilities(currentTier, executor);

  if (!capabilities.allowsWithdrawal) {
    throw forbiddenError("Tier 2 verification required for withdrawals.", {
      code: API_ERROR_CODES.KYC_TIER_REQUIRED,
    });
  }

  if (!capabilities.maxDailyWithdrawalAmount) {
    return;
  }

  const nextDailyTotal = toDecimal(totalToday).plus(amount);
  if (nextDailyTotal.gt(toDecimal(capabilities.maxDailyWithdrawalAmount))) {
    throw conflictError(
      `Tier 2 users can withdraw at most ${capabilities.maxDailyWithdrawalAmount} per day.`,
      {
        code: API_ERROR_CODES.KYC_WITHDRAWAL_LIMIT_EXCEEDED,
      },
    );
  }
}

export async function assertKycTierAtLeast(
  userId: number,
  minimumTier: KycTier,
  executor: DbExecutor = db,
) {
  const currentTier = await getEnforcedUserKycTier(userId, executor);
  if (!currentTier) {
    throw forbiddenError(
      `KYC ${minimumTier.replace("_", " ").toUpperCase()} verification required.`,
      {
        code: API_ERROR_CODES.KYC_TIER_REQUIRED,
      },
    );
  }
  if (isKycTierAtLeast(currentTier, minimumTier)) {
    return currentTier;
  }

  throw forbiddenError(
    `KYC ${minimumTier.replace("_", " ").toUpperCase()} verification required.`,
    {
      code: API_ERROR_CODES.KYC_TIER_REQUIRED,
    },
  );
}
