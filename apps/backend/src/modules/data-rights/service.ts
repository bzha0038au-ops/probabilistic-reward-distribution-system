import { createHash, randomUUID } from "node:crypto";

import {
  adminActions,
  authEvents,
  authSessions,
  authTokens,
  cryptoWithdrawAddresses,
  dataDeletionRequests,
  dataRightsAudits,
  fiatPayoutMethods,
  kycDocuments,
  kycProfiles,
  kycReviewEvents,
  legalDocumentAcceptances,
  notificationDeliveries,
  payoutMethods,
  userMfaSecrets,
  users,
} from "@reward/database";
import {
  and,
  desc,
  eq,
  inArray,
  sql,
} from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  AdminDataDeletionQueueSchema,
  type AdminDataDeletionQueue,
  type AdminDataDeletionQueueItem,
  CreateDataDeletionRequestSchema,
  type DataDeletionRequestRecord,
  DataDeletionRequestRecordSchema,
  DataDeletionResultSummarySchema,
  type DataDeletionResultSummary,
  ReviewDataDeletionRequestSchema,
} from "@reward/shared-types/data-rights";

import { db, type DbClient, type DbTransaction } from "../../db";
import {
  conflictError,
  notFoundError,
  unprocessableEntityError,
} from "../../shared/errors";
import { hashPassword } from "../auth/password";
import { normalizeEmail, normalizePhone } from "../auth/notification-service";

type DbExecutor = DbClient | DbTransaction;

const DATA_DELETION_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;
const REDACTED_NOTIFICATION_SUBJECT = "Redacted notification";
const REDACTED_STORAGE_PREFIX = "redacted://data-rights";

const normalizeOptionalText = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const hashIdentity = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return createHash("sha256").update(normalized, "utf8").digest("hex");
};

const maskEmail = (email: string | null | undefined) => {
  const normalized = email?.trim();
  if (!normalized) {
    return null;
  }

  const [name = "", domain = ""] = normalized.split("@");
  if (!domain) {
    return "***";
  }

  const visibleName = name.slice(0, 2);
  const maskedName = `${visibleName}${name.length > 2 ? "***" : ""}`;
  return `${maskedName}@${domain}`;
};

const maskPhone = (phone: string | null | undefined) => {
  const normalized = phone?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.length <= 4
    ? "****"
    : `${"*".repeat(Math.max(normalized.length - 4, 1))}${normalized.slice(-4)}`;
};

const isUserPseudonymized = (email: string) => email.endsWith("@privacy.invalid");

const buildDeletedEmail = (params: { userId: number; requestId: number }) =>
  `deleted-user-${params.userId}-request-${params.requestId}@privacy.invalid`;

const buildNotificationPlaceholder = (requestId: number) =>
  `redacted-request-${requestId}@privacy.invalid`;

const parseResultSummary = (value: unknown): DataDeletionResultSummary | null => {
  const parsed = DataDeletionResultSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const toRequestRecord = (
  row: typeof dataDeletionRequests.$inferSelect,
): DataDeletionRequestRecord =>
  DataDeletionRequestRecordSchema.parse({
    id: row.id,
    userId: row.userId,
    status: row.status,
    source: row.source,
    requestedByUserId: row.requestedByUserId ?? null,
    requestReason: row.requestReason ?? null,
    subjectEmailHint: row.subjectEmailHint ?? null,
    subjectPhoneHint: row.subjectPhoneHint ?? null,
    subjectEmailHash: row.subjectEmailHash ?? null,
    subjectPhoneHash: row.subjectPhoneHash ?? null,
    dueAt: row.dueAt,
    reviewedByAdminId: row.reviewedByAdminId ?? null,
    reviewDecision: row.reviewDecision ?? null,
    reviewNotes: row.reviewNotes ?? null,
    reviewedAt: row.reviewedAt ?? null,
    completedByAdminId: row.completedByAdminId ?? null,
    completedAt: row.completedAt ?? null,
    failureReason: row.failureReason ?? null,
    resultSummary: parseResultSummary(row.resultSummary),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toQueueItem = (row: {
  request: typeof dataDeletionRequests.$inferSelect;
  currentUserEmail: string | null;
  currentUserPhone: string | null;
  currentUserRole: string | null;
}): AdminDataDeletionQueueItem => {
  const request = toRequestRecord(row.request);
  const isOverdue =
    request.status === "pending_review" && new Date(request.dueAt) < new Date();

  return {
    ...request,
    currentUserEmail: row.currentUserEmail ?? null,
    currentUserPhone: row.currentUserPhone ?? null,
    currentUserRole: row.currentUserRole ?? null,
    isOverdue,
  };
};

const insertAuditRow = async (
  executor: DbExecutor,
  payload: {
    requestId: number;
    userId: number;
    action: "requested" | "approved" | "rejected" | "completed" | "failed";
    actorUserId?: number | null;
    actorAdminId?: number | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) => {
  await executor.insert(dataRightsAudits).values({
    requestId: payload.requestId,
    userId: payload.userId,
    action: payload.action,
    actorUserId: payload.actorUserId ?? null,
    actorAdminId: payload.actorAdminId ?? null,
    notes: normalizeOptionalText(payload.notes),
    metadata: payload.metadata ?? null,
  });
};

const loadLatestUserDeletionRequest = async (
  executor: DbExecutor,
  userId: number,
) => {
  const [row] = await executor
    .select()
    .from(dataDeletionRequests)
    .where(eq(dataDeletionRequests.userId, userId))
    .orderBy(desc(dataDeletionRequests.createdAt), desc(dataDeletionRequests.id))
    .limit(1);

  return row ?? null;
};

const eraseUserDataInTransaction = async (tx: DbTransaction, params: {
  requestId: number;
  user: typeof users.$inferSelect;
}) => {
  const now = new Date();
  const requestId = params.requestId;
  const user = params.user;
  const deletedEmail = buildDeletedEmail({
    userId: user.id,
    requestId,
  });

  const normalizedEmail = normalizeEmail(user.email);
  const normalizedPhone = user.phone ? normalizePhone(user.phone) : null;
  const notificationKeys = [normalizedEmail, normalizedPhone].filter(
    (value): value is string => Boolean(value),
  );

  const payoutMethodIds = await tx
    .select({ id: payoutMethods.id })
    .from(payoutMethods)
    .where(eq(payoutMethods.userId, user.id));

  const updatedUserRows = await tx
    .update(users)
    .set({
      email: deletedEmail,
      phone: null,
      passwordHash: hashPassword(randomUUID()),
      birthDate: null,
      registrationCountryCode: null,
      countryTier: "unknown",
      countryResolvedAt: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, user.id))
    .returning({ id: users.id });

  const revokedSessions = await tx
    .update(authSessions)
    .set({
      status: "revoked",
      revokedAt: now,
      revokedReason: "data_deletion_request",
      updatedAt: now,
    })
    .where(
      and(
        eq(authSessions.userId, user.id),
        eq(authSessions.status, "active"),
      ),
    )
    .returning({ id: authSessions.id });

  await tx
    .update(authSessions)
    .set({
      ip: null,
      userAgent: null,
      updatedAt: now,
    })
    .where(eq(authSessions.userId, user.id))
    .returning({ id: authSessions.id });

  const updatedAuthTokens = await tx
    .update(authTokens)
    .set({
      email: null,
      phone: null,
      metadata: null,
      consumedAt: now,
    })
    .where(eq(authTokens.userId, user.id))
    .returning({ id: authTokens.id });

  const updatedAuthEvents = await tx
    .update(authEvents)
    .set({
      email: null,
      ip: null,
      userAgent: null,
      metadata: null,
    })
    .where(eq(authEvents.userId, user.id))
    .returning({ id: authEvents.id });

  const updatedAcceptances = await tx
    .update(legalDocumentAcceptances)
    .set({
      ip: null,
      userAgent: null,
    })
    .where(eq(legalDocumentAcceptances.userId, user.id))
    .returning({ id: legalDocumentAcceptances.id });

  const updatedKycProfiles = await tx
    .update(kycProfiles)
    .set({
      legalName: null,
      documentType: null,
      documentNumberLast4: null,
      countryCode: null,
      notes: null,
      rejectionReason: null,
      submittedData: null,
      updatedAt: now,
    })
    .where(eq(kycProfiles.userId, user.id))
    .returning({ id: kycProfiles.id });

  const updatedKycDocuments = await tx
    .update(kycDocuments)
    .set({
      fileName: "redacted-document",
      storagePath: sql`${REDACTED_STORAGE_PREFIX} || '/request-' || ${requestId} || '/document-' || ${kycDocuments.id}`,
      metadata: null,
    })
    .where(eq(kycDocuments.userId, user.id))
    .returning({ id: kycDocuments.id });

  const updatedKycReviewEvents = await tx
    .update(kycReviewEvents)
    .set({
      metadata: null,
    })
    .where(eq(kycReviewEvents.userId, user.id))
    .returning({ id: kycReviewEvents.id });

  const updatedPayoutMethods = await tx
    .update(payoutMethods)
    .set({
      displayName: "Deleted payout method",
      metadata: null,
      isDefault: false,
      status: "inactive",
      updatedAt: now,
    })
    .where(eq(payoutMethods.userId, user.id))
    .returning({ id: payoutMethods.id });

  const updatedAdminActions = await tx
    .update(adminActions)
    .set({
      metadata: null,
    })
    .where(
      and(
        eq(adminActions.targetType, "user"),
        eq(adminActions.targetId, user.id),
      ),
    )
    .returning({ id: adminActions.id });

  const deletedUserMfaSecrets = await tx
    .delete(userMfaSecrets)
    .where(eq(userMfaSecrets.userId, user.id))
    .returning({ id: userMfaSecrets.id });

  const payoutMethodIdValues = payoutMethodIds.map((row) => row.id);

  const updatedFiatPayoutMethods =
    payoutMethodIdValues.length > 0
      ? await tx
          .update(fiatPayoutMethods)
          .set({
            accountName: "Deleted user",
            bankName: null,
            accountNoMasked: null,
            routingCode: null,
            brand: null,
            accountLast4: null,
            updatedAt: now,
          })
          .where(inArray(fiatPayoutMethods.payoutMethodId, payoutMethodIdValues))
          .returning({ payoutMethodId: fiatPayoutMethods.payoutMethodId })
      : [];

  const updatedCryptoAddresses =
    payoutMethodIdValues.length > 0
      ? await tx
          .update(cryptoWithdrawAddresses)
          .set({
            address: sql`'redacted-address-' || ${requestId} || '-' || ${cryptoWithdrawAddresses.payoutMethodId}`,
            label: null,
            updatedAt: now,
          })
          .where(
            inArray(
              cryptoWithdrawAddresses.payoutMethodId,
              payoutMethodIdValues,
            ),
          )
          .returning({ payoutMethodId: cryptoWithdrawAddresses.payoutMethodId })
      : [];

  const updatedNotifications =
    notificationKeys.length > 0
      ? await tx
          .update(notificationDeliveries)
          .set({
            recipient: buildNotificationPlaceholder(requestId),
            recipientKey: buildNotificationPlaceholder(requestId),
            subject: REDACTED_NOTIFICATION_SUBJECT,
            payload: { redacted: true, requestId },
            providerMessageId: null,
            lastError: null,
            updatedAt: now,
          })
          .where(inArray(notificationDeliveries.recipientKey, notificationKeys))
          .returning({ id: notificationDeliveries.id })
      : [];

  if (updatedUserRows.length !== 1) {
    throw notFoundError("User not found.", {
      code: API_ERROR_CODES.USER_NOT_FOUND,
    });
  }

  return DataDeletionResultSummarySchema.parse({
    usersUpdated: updatedUserRows.length,
    authSessionsRevoked: revokedSessions.length,
    authTokensRedacted: updatedAuthTokens.length,
    authEventsRedacted: updatedAuthEvents.length,
    legalAcceptancesRedacted: updatedAcceptances.length,
    kycProfilesRedacted: updatedKycProfiles.length,
    kycDocumentsRedacted: updatedKycDocuments.length,
    kycReviewEventsRedacted: updatedKycReviewEvents.length,
    payoutMethodsRedacted: updatedPayoutMethods.length,
    fiatPayoutMethodsRedacted: updatedFiatPayoutMethods.length,
    cryptoAddressesRedacted: updatedCryptoAddresses.length,
    notificationsRedacted: updatedNotifications.length,
    adminActionsRedacted: updatedAdminActions.length,
    userMfaSecretsDeleted: deletedUserMfaSecrets.length,
  });
};

export async function createDataDeletionRequest(payload: {
  userId: number;
  requestedByUserId?: number | null;
  reason?: string | null;
  source?: "user_self_service" | "admin_support";
}) {
  const parsed = CreateDataDeletionRequestSchema.parse({
    reason: normalizeOptionalText(payload.reason),
  });

  return db.transaction(async (tx) => {
    const [user, latestRequest] = await Promise.all([
      tx
        .select()
        .from(users)
        .where(and(eq(users.id, payload.userId), eq(users.role, "user")))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      loadLatestUserDeletionRequest(tx, payload.userId),
    ]);

    if (!user) {
      throw notFoundError("User not found.", {
        code: API_ERROR_CODES.USER_NOT_FOUND,
      });
    }

    if (isUserPseudonymized(user.email)) {
      throw conflictError("User data has already been erased.", {
        code: API_ERROR_CODES.USER_DATA_ALREADY_ERASED,
      });
    }

    if (latestRequest?.status === "pending_review") {
      throw conflictError("A data deletion request is already pending review.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_ALREADY_PENDING,
      });
    }

    if (latestRequest?.status === "completed") {
      throw conflictError("User data has already been erased.", {
        code: API_ERROR_CODES.USER_DATA_ALREADY_ERASED,
      });
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + DATA_DELETION_DEADLINE_MS);
    const [request] = await tx
      .insert(dataDeletionRequests)
      .values({
        userId: user.id,
        status: "pending_review",
        source: payload.source ?? "user_self_service",
        requestedByUserId: payload.requestedByUserId ?? null,
        requestReason: parsed.reason ?? null,
        subjectEmailHint: maskEmail(user.email),
        subjectPhoneHint: maskPhone(user.phone),
        subjectEmailHash: hashIdentity(normalizeEmail(user.email)),
        subjectPhoneHash: hashIdentity(
          user.phone ? normalizePhone(user.phone) : null,
        ),
        dueAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!request) {
      throw conflictError("Failed to create data deletion request.");
    }

    await insertAuditRow(tx, {
      requestId: request.id,
      userId: user.id,
      action: "requested",
      actorUserId: payload.requestedByUserId ?? user.id,
      notes: parsed.reason ?? null,
      metadata: {
        source: payload.source ?? "user_self_service",
        dueAt: dueAt.toISOString(),
      },
    });

    return toRequestRecord(request);
  });
}

export async function listDataDeletionRequestsForAdmin(): Promise<AdminDataDeletionQueue> {
  const rows = await db
    .select({
      request: dataDeletionRequests,
      currentUserEmail: users.email,
      currentUserPhone: users.phone,
      currentUserRole: users.role,
    })
    .from(dataDeletionRequests)
    .leftJoin(users, eq(dataDeletionRequests.userId, users.id))
    .orderBy(desc(dataDeletionRequests.createdAt), desc(dataDeletionRequests.id));

  const items = rows
    .map((row) => toQueueItem(row))
    .sort((left, right) => {
      if (left.status === "pending_review" && right.status !== "pending_review") {
        return -1;
      }
      if (left.status !== "pending_review" && right.status === "pending_review") {
        return 1;
      }
      if (left.status === "processing" && right.status !== "processing") {
        return -1;
      }
      if (left.status !== "processing" && right.status === "processing") {
        return 1;
      }
      if (left.status === "pending_review" && right.status === "pending_review") {
        return (
          new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
        );
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

  const payload = {
    pendingCount: items.filter((item) => item.status === "pending_review").length,
    overdueCount: items.filter((item) => item.isOverdue).length,
    completedCount: items.filter((item) => item.status === "completed").length,
    items,
  };

  return AdminDataDeletionQueueSchema.parse(payload);
}

export async function rejectDataDeletionRequest(payload: {
  requestId: number;
  adminId: number;
  reviewNotes: string;
}) {
  const parsed = ReviewDataDeletionRequestSchema.parse({
    reviewNotes: normalizeOptionalText(payload.reviewNotes),
  });
  if (!parsed.reviewNotes) {
    throw unprocessableEntityError(
      "Review notes are required when rejecting a data deletion request.",
      {
        code: API_ERROR_CODES.REVIEW_NOTES_REQUIRED,
      },
    );
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, payload.requestId))
      .limit(1);

    if (!existing) {
      throw notFoundError("Data deletion request not found.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_NOT_FOUND,
      });
    }

    if (existing.status !== "pending_review") {
      throw conflictError("Only pending requests can be reviewed.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_NOT_PENDING,
      });
    }

    const now = new Date();
    const [updated] = await tx
      .update(dataDeletionRequests)
      .set({
        status: "rejected",
        reviewedByAdminId: payload.adminId,
        reviewDecision: "rejected",
        reviewNotes: parsed.reviewNotes,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(dataDeletionRequests.id, payload.requestId),
          eq(dataDeletionRequests.status, "pending_review"),
        ),
      )
      .returning();

    if (!updated) {
      throw conflictError("Only pending requests can be reviewed.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_NOT_PENDING,
      });
    }

    await insertAuditRow(tx, {
      requestId: updated.id,
      userId: updated.userId,
      action: "rejected",
      actorAdminId: payload.adminId,
      notes: parsed.reviewNotes,
    });

    return toRequestRecord(updated);
  });
}

export async function approveAndCompleteDataDeletionRequest(payload: {
  requestId: number;
  adminId: number;
  reviewNotes?: string | null;
}) {
  const parsed = ReviewDataDeletionRequestSchema.parse({
    reviewNotes: normalizeOptionalText(payload.reviewNotes),
  });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, payload.requestId))
      .limit(1);

    if (!existing) {
      throw notFoundError("Data deletion request not found.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_NOT_FOUND,
      });
    }

    if (existing.status !== "pending_review") {
      throw conflictError("Only pending requests can be reviewed.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_NOT_PENDING,
      });
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, existing.userId), eq(users.role, "user")))
      .limit(1);

    if (!user) {
      throw notFoundError("User not found.", {
        code: API_ERROR_CODES.USER_NOT_FOUND,
      });
    }

    if (isUserPseudonymized(user.email)) {
      throw conflictError("User data has already been erased.", {
        code: API_ERROR_CODES.USER_DATA_ALREADY_ERASED,
      });
    }

    const reviewTime = new Date();
    const [reviewedRequest] = await tx
      .update(dataDeletionRequests)
      .set({
        status: "processing",
        reviewedByAdminId: payload.adminId,
        reviewDecision: "approved",
        reviewNotes: parsed.reviewNotes ?? null,
        reviewedAt: reviewTime,
        updatedAt: reviewTime,
      })
      .where(
        and(
          eq(dataDeletionRequests.id, payload.requestId),
          eq(dataDeletionRequests.status, "pending_review"),
        ),
      )
      .returning();

    if (!reviewedRequest) {
      throw conflictError("Only pending requests can be reviewed.", {
        code: API_ERROR_CODES.DATA_DELETION_REQUEST_NOT_PENDING,
      });
    }

    await insertAuditRow(tx, {
      requestId: reviewedRequest.id,
      userId: reviewedRequest.userId,
      action: "approved",
      actorAdminId: payload.adminId,
      notes: parsed.reviewNotes ?? null,
    });

    const resultSummary = await eraseUserDataInTransaction(tx, {
      requestId: reviewedRequest.id,
      user,
    });

    const completedAt = new Date();
    const [completedRequest] = await tx
      .update(dataDeletionRequests)
      .set({
        status: "completed",
        completedByAdminId: payload.adminId,
        completedAt,
        resultSummary,
        updatedAt: completedAt,
      })
      .where(eq(dataDeletionRequests.id, reviewedRequest.id))
      .returning();

    if (!completedRequest) {
      throw conflictError("Failed to complete the data deletion request.");
    }

    await insertAuditRow(tx, {
      requestId: completedRequest.id,
      userId: completedRequest.userId,
      action: "completed",
      actorAdminId: payload.adminId,
      notes: parsed.reviewNotes ?? null,
      metadata: resultSummary,
    });

    return toRequestRecord(completedRequest);
  });
}
