import {
  admins,
  amlChecks,
  deposits,
  freezeRecords,
  users,
} from '@reward/database';
import { and, asc, desc, eq, inArray, sql } from '@reward/database/orm';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import type {
  AmlCheckResult,
  AmlCheckpoint,
  AmlProviderKey,
  AmlReviewStatus,
  AmlRiskLevel,
} from '@reward/shared-types/aml';
import type {
  UserFreezeReason,
  UserFreezeScope,
} from '@reward/shared-types/risk';

import { db } from '../../db';
import { getConfigView } from '../../shared/config';
import {
  domainError,
  internalInvariantError,
  toAppError,
} from '../../shared/errors';
import { logger } from '../../shared/logger';
import { sendAmlHitAdminNotification } from "../notification/service";
import { ensureUserFreeze, isUserFrozen } from '../risk/service';
import {
  emitAmlHitSecurityEvent,
  emitAmlReviewSecurityEvent,
} from '../security-events/service';
import type {
  CheckMetadata,
  ProviderDecision,
  ScreeningSubject,
} from './providers';
import {
  getRegisteredAmlProvider,
  listRegisteredAmlProviderKeys,
} from './providers';

type ScreeningMode = 'always' | 'reuse_latest_clear';
type AmlReviewAction = 'clear' | 'confirm' | 'escalate';

type PendingAmlHitListItem = {
  id: number;
  userId: number;
  checkpoint: AmlCheckpoint;
  providerKey: AmlProviderKey;
  result: AmlCheckResult;
  riskLevel: AmlRiskLevel;
  providerReference: string | null;
  providerPayload: unknown;
  metadata: Record<string, unknown> | null;
  reviewStatus: AmlReviewStatus;
  reviewedByAdminId: number | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  escalatedAt: Date | null;
  slaDueAt: Date | null;
  activeFreezeRecordId: number | null;
  activeFreezeReason: UserFreezeReason | null;
  activeFreezeScope: UserFreezeScope | null;
  createdAt: Date;
};

type ReviewedAmlHitResult = {
  amlCheckId: number;
  userId: number;
  checkpoint: AmlCheckpoint;
  riskLevel: AmlRiskLevel;
  reviewStatus: AmlReviewStatus;
  freezeRecordIds: number[];
  activeFreezeReason: UserFreezeReason | null;
};

const config = getConfigView();
const ACCOUNT_FREEZE_SCOPE: UserFreezeScope = 'account_lock';
const AML_REVIEW_REASON: UserFreezeReason = 'aml_review';
const ACCOUNT_LOCK_REASON: UserFreezeReason = 'account_lock';

const amlReviewRequiredError = () =>
  domainError(423, 'Account is under AML review.', {
    code: API_ERROR_CODES.AML_REVIEW_REQUIRED,
  });

const amlCheckNotFoundError = () =>
  domainError(404, 'AML review case not found.', {
    code: API_ERROR_CODES.AML_CHECK_NOT_FOUND,
  });

const amlCheckNotPendingError = () =>
  domainError(409, 'AML review case is no longer pending.', {
    code: API_ERROR_CODES.AML_CHECK_NOT_PENDING,
  });

const toMetadataRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const isHitResult = (value: unknown) =>
  value === 'hit' || value === 'review_required';

const createCheckMetadata = (input: {
  subject: ScreeningSubject;
  inputMetadata?: CheckMetadata;
  providerMetadata?: CheckMetadata;
  summary?: string | null;
  checkpoint: AmlCheckpoint;
}) => ({
  checkpoint: input.checkpoint,
  subjectEmail: input.subject.email,
  subjectPhone: input.subject.phone,
  summary: input.summary ?? null,
  input: input.inputMetadata ?? null,
  provider: input.providerMetadata ?? null,
});

const buildSlaDueAt = (base = new Date()) =>
  new Date(base.getTime() + config.amlReviewSlaMinutes * 60 * 1000);

const mapLegacyResult = <T extends { result: string }>(row: T) => ({
  ...row,
  result: isHitResult(row.result) ? ('hit' as const) : row.result,
});

const getLatestAmlCheck = async (userId: number, checkpoint: AmlCheckpoint) => {
  const [row] = await db
    .select()
    .from(amlChecks)
    .where(
      and(eq(amlChecks.userId, userId), eq(amlChecks.checkpoint, checkpoint))
    )
    .orderBy(desc(amlChecks.createdAt), desc(amlChecks.id))
    .limit(1);

  return row ? mapLegacyResult(row) : null;
};

const getScreeningSubject = async (userId: number): Promise<ScreeningSubject> => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw domainError(404, 'User not found.', {
      code: API_ERROR_CODES.USER_NOT_FOUND,
    });
  }

  return {
    userId: user.id,
    email: user.email,
    phone: user.phone ?? null,
  };
};

const getConfiguredAmlProvider = (providerKey = config.amlProviderKey) => {
  const provider = getRegisteredAmlProvider(providerKey);
  if (provider) {
    return provider;
  }

  throw internalInvariantError(
    `Configured AML provider "${providerKey}" is not registered. Registered AML providers: ${listRegisteredAmlProviderKeys().join(', ') || '(none)'}.`
  );
};

const persistAmlCheck = async (input: {
  userId: number;
  checkpoint: AmlCheckpoint;
  decision:
    | ProviderDecision
    | {
        providerKey: AmlProviderKey;
        result: 'provider_error';
        riskLevel: AmlRiskLevel;
        providerReference?: string | null;
        metadata?: CheckMetadata;
        providerPayload?: unknown;
        summary?: string | null;
      };
  subject: ScreeningSubject;
  inputMetadata?: CheckMetadata;
}) => {
  const reviewStatus =
    input.decision.result === 'hit' ? ('pending' as const) : null;
  const [created] = await db
    .insert(amlChecks)
    .values({
      userId: input.userId,
      checkpoint: input.checkpoint,
      providerKey: input.decision.providerKey,
      result: input.decision.result,
      riskLevel: input.decision.riskLevel,
      providerReference: input.decision.providerReference ?? null,
      providerPayload:
        input.decision.providerPayload ?? input.decision.metadata ?? null,
      metadata: createCheckMetadata({
        checkpoint: input.checkpoint,
        subject: input.subject,
        inputMetadata: input.inputMetadata,
        providerMetadata: input.decision.metadata ?? null,
        summary: input.decision.summary ?? null,
      }),
      reviewStatus,
      slaDueAt: reviewStatus === 'pending' ? buildSlaDueAt() : null,
    })
    .returning();

  if (!created) {
    throw domainError(500, 'Failed to persist AML check.');
  }

  if (isHitResult(created.result)) {
    const metadata = toMetadataRecord(created.metadata);
    await emitAmlHitSecurityEvent({
      amlCheckId: created.id,
      userId: created.userId,
      checkpoint: created.checkpoint,
      providerKey: created.providerKey,
      riskLevel: created.riskLevel,
      reviewStatus: created.reviewStatus ?? null,
      providerReference: created.providerReference ?? null,
      summary:
        typeof metadata?.summary === 'string' ? metadata.summary : null,
      slaDueAt: created.slaDueAt ?? null,
      occurredAt: created.createdAt,
    });
  }

  return mapLegacyResult(created);
};

const notifyAdminsForReview = async (input: {
  checkpoint: AmlCheckpoint;
  riskLevel: AmlRiskLevel;
  subject: ScreeningSubject;
  providerKey: AmlProviderKey;
  summary?: string | null;
}) => {
  const recipients = await db
    .select({
      userId: admins.userId,
      email: users.email,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(eq(admins.isActive, true));

  if (recipients.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendAmlHitAdminNotification({
        adminUserId: recipient.userId,
        adminEmail: recipient.email,
        subjectUserId: input.subject.userId,
        subjectEmail: input.subject.email,
        subjectPhone: input.subject.phone,
        checkpoint: input.checkpoint,
        riskLevel: input.riskLevel,
        providerKey: input.providerKey,
        summary: input.summary ?? null,
      }),
    )
  );

  const queued = results.filter((result) => result.status === 'fulfilled').length;
  const rejected = results.filter((result) => result.status === 'rejected');

  for (const result of rejected) {
    logger.warning('failed to queue aml review notification', {
      err: result.reason,
      userId: input.subject.userId,
      checkpoint: input.checkpoint,
    });
  }

  return queued;
};

const enforceReviewDecision = async (input: {
  checkpoint: AmlCheckpoint;
  subject: ScreeningSubject;
  providerKey: AmlProviderKey;
  riskLevel: AmlRiskLevel;
  summary?: string | null;
}) => {
  await ensureUserFreeze({
    userId: input.subject.userId,
    reason: AML_REVIEW_REASON,
    scope: ACCOUNT_FREEZE_SCOPE,
    metadata: {
      checkpoint: input.checkpoint,
      providerKey: input.providerKey,
      riskLevel: input.riskLevel,
      summary: input.summary ?? null,
    },
  });

  await notifyAdminsForReview({
    checkpoint: input.checkpoint,
    riskLevel: input.riskLevel,
    subject: input.subject,
    providerKey: input.providerKey,
    summary: input.summary ?? null,
  });

  throw amlReviewRequiredError();
};

const performAmlScreening = async (input: {
  userId: number;
  checkpoint: AmlCheckpoint;
  metadata?: CheckMetadata;
  mode: ScreeningMode;
}) => {
  const latest = await getLatestAmlCheck(input.userId, input.checkpoint);
  if (latest && isHitResult(latest.result)) {
    throw amlReviewRequiredError();
  }

  if (input.mode === 'reuse_latest_clear' && latest?.result === 'clear') {
    return latest;
  }

  const subject = await getScreeningSubject(input.userId);
  const providerKey = config.amlProviderKey;
  try {
    const decision = await getConfiguredAmlProvider(providerKey).screen({
      checkpoint: input.checkpoint,
      subject,
      metadata: input.metadata,
    });
    const created = await persistAmlCheck({
      userId: input.userId,
      checkpoint: input.checkpoint,
      decision,
      subject,
      inputMetadata: input.metadata,
    });

    if (decision.result === 'hit') {
      await enforceReviewDecision({
        checkpoint: input.checkpoint,
        subject,
        providerKey: decision.providerKey,
        riskLevel: decision.riskLevel,
        summary: decision.summary ?? null,
      });
    }

    return created;
  } catch (error) {
    if (toAppError(error).code === API_ERROR_CODES.AML_REVIEW_REQUIRED) {
      throw error;
    }

    const failure = await persistAmlCheck({
      userId: input.userId,
      checkpoint: input.checkpoint,
      decision: {
        providerKey,
        result: 'provider_error',
        riskLevel: 'high',
        summary: 'AML provider execution failed.',
        metadata: {
          message: error instanceof Error ? error.message : String(error),
        },
        providerPayload: {
          provider: providerKey,
          failure: true,
          message: error instanceof Error ? error.message : String(error),
        },
      },
      subject,
      inputMetadata: input.metadata,
    });

    logger.error('aml screening failed', {
      err: error,
      userId: input.userId,
      checkpoint: input.checkpoint,
      amlCheckId: failure.id,
    });

    throw error;
  }
};

const hasAnyDeposit = async (userId: number) => {
  const [existing] = await db
    .select({ id: deposits.id })
    .from(deposits)
    .where(eq(deposits.userId, userId))
    .limit(1);

  return Boolean(existing?.id);
};

const loadActiveAccountFreezes = async (userIds: number[]) => {
  if (userIds.length === 0) {
    return new Map<number, { id: number; reason: UserFreezeReason; scope: UserFreezeScope }>();
  }

  const rows = await db
    .select({
      id: freezeRecords.id,
      userId: freezeRecords.userId,
      reason: freezeRecords.reason,
      scope: freezeRecords.scope,
      createdAt: freezeRecords.createdAt,
    })
    .from(freezeRecords)
    .where(
      and(
        inArray(freezeRecords.userId, userIds),
        eq(freezeRecords.scope, ACCOUNT_FREEZE_SCOPE),
        eq(freezeRecords.status, 'active')
      )
    )
    .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id));

  const map = new Map<
    number,
    { id: number; reason: UserFreezeReason; scope: UserFreezeScope }
  >();

  for (const row of rows) {
    if (!map.has(row.userId)) {
      map.set(row.userId, {
        id: row.id,
        reason: row.reason,
        scope: row.scope,
      });
    }
  }

  return map;
};

export async function listPendingAmlHits(options: {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
} = {}) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const createdOrder =
    options.order === 'asc' ? asc(amlChecks.createdAt) : desc(amlChecks.createdAt);
  const idOrder =
    options.order === 'asc' ? asc(amlChecks.id) : desc(amlChecks.id);
  const items = await db
    .select({
      id: amlChecks.id,
      userId: amlChecks.userId,
      checkpoint: amlChecks.checkpoint,
      providerKey: amlChecks.providerKey,
      result: amlChecks.result,
      riskLevel: amlChecks.riskLevel,
      providerReference: amlChecks.providerReference,
      providerPayload: amlChecks.providerPayload,
      metadata: amlChecks.metadata,
      reviewStatus: amlChecks.reviewStatus,
      reviewedByAdminId: amlChecks.reviewedByAdminId,
      reviewedAt: amlChecks.reviewedAt,
      reviewNotes: amlChecks.reviewNotes,
      escalatedAt: amlChecks.escalatedAt,
      slaDueAt: amlChecks.slaDueAt,
      createdAt: amlChecks.createdAt,
    })
    .from(amlChecks)
    .where(
      and(
        eq(amlChecks.reviewStatus, 'pending'),
        eq(amlChecks.result, 'hit')
      )
    )
    .orderBy(createdOrder, idOrder)
    .limit(limit)
    .offset(offset);
  const freezeByUser = await loadActiveAccountFreezes(
    items.map((item) => item.userId)
  );

  return items.map<PendingAmlHitListItem>((item) => {
    const activeFreeze = freezeByUser.get(item.userId);

    return {
      ...item,
      result: isHitResult(item.result) ? 'hit' : (item.result as AmlCheckResult),
      providerPayload:
        item.providerPayload ?? toMetadataRecord(item.metadata)?.provider ?? null,
      metadata: toMetadataRecord(item.metadata),
      reviewStatus: item.reviewStatus ?? 'pending',
      activeFreezeRecordId: activeFreeze?.id ?? null,
      activeFreezeReason: activeFreeze?.reason ?? null,
      activeFreezeScope: activeFreeze?.scope ?? null,
    };
  });
}

export async function getPendingAmlHitSummary() {
  const [row] = await db
    .select({
      pendingCount: sql<number>`count(*)`,
      overdueCount: sql<number>`count(*) filter (where ${amlChecks.slaDueAt} is not null and ${amlChecks.slaDueAt} < now())`,
      oldestPendingAt: sql<Date | null>`min(${amlChecks.createdAt})`,
    })
    .from(amlChecks)
    .where(
      and(
        eq(amlChecks.reviewStatus, 'pending'),
        eq(amlChecks.result, 'hit')
      )
    );
  const normalized = row as
    | {
      pendingCount: number;
      overdueCount: number;
      oldestPendingAt: Date | null;
    }
    | undefined;

  return {
    pendingCount: Number(normalized?.pendingCount ?? 0),
    overdueCount: Number(normalized?.overdueCount ?? 0),
    oldestPendingAt: normalized?.oldestPendingAt ?? null,
    slaMinutes: config.amlReviewSlaMinutes,
  };
}

export async function reviewPendingAmlHit(payload: {
  amlCheckId: number;
  adminId: number;
  action: AmlReviewAction;
  note?: string | null;
}): Promise<ReviewedAmlHitResult> {
  const reviewed = await db.transaction(async (tx) => {
    const now = new Date();
    const nextStatus: AmlReviewStatus =
      payload.action === 'clear'
        ? 'cleared'
        : payload.action === 'confirm'
          ? 'confirmed'
          : 'escalated';

    const [claimed] = await tx
      .update(amlChecks)
      .set({
        reviewStatus: nextStatus,
        reviewedByAdminId: payload.adminId,
        reviewedAt: now,
        reviewNotes: payload.note?.trim() || null,
        escalatedAt: payload.action === 'escalate' ? now : null,
      })
      .where(
        and(
          eq(amlChecks.id, payload.amlCheckId),
          eq(amlChecks.reviewStatus, 'pending'),
          eq(amlChecks.result, 'hit')
        )
      )
      .returning({
        id: amlChecks.id,
        userId: amlChecks.userId,
        checkpoint: amlChecks.checkpoint,
        riskLevel: amlChecks.riskLevel,
      });

    if (!claimed) {
      const [existing] = await tx
        .select({
          id: amlChecks.id,
          reviewStatus: amlChecks.reviewStatus,
        })
        .from(amlChecks)
        .where(eq(amlChecks.id, payload.amlCheckId))
        .limit(1);

      if (!existing) {
        throw amlCheckNotFoundError();
      }

      throw amlCheckNotPendingError();
    }

    let freezeRecordIds: number[] = [];
    let activeFreezeReason: UserFreezeReason | null = null;

    if (payload.action === 'clear') {
      const released = await tx
        .update(freezeRecords)
        .set({
          status: 'released',
          releasedAt: now,
        })
        .where(
          and(
            eq(freezeRecords.userId, claimed.userId),
            eq(freezeRecords.scope, ACCOUNT_FREEZE_SCOPE),
            eq(freezeRecords.reason, AML_REVIEW_REASON),
            eq(freezeRecords.status, 'active')
          )
        )
        .returning({
          id: freezeRecords.id,
        });

      freezeRecordIds = released.map((row) => row.id);
    }

    if (payload.action === 'confirm') {
      const promoted = await tx
        .update(freezeRecords)
        .set({
          reason: ACCOUNT_LOCK_REASON,
        })
        .where(
          and(
            eq(freezeRecords.userId, claimed.userId),
            eq(freezeRecords.scope, ACCOUNT_FREEZE_SCOPE),
            eq(freezeRecords.reason, AML_REVIEW_REASON),
            eq(freezeRecords.status, 'active')
          )
        )
        .returning({
          id: freezeRecords.id,
        });

      freezeRecordIds = promoted.map((row) => row.id);

      const [activeAccountLock] = await tx
        .select({
          id: freezeRecords.id,
          reason: freezeRecords.reason,
        })
        .from(freezeRecords)
        .where(
          and(
            eq(freezeRecords.userId, claimed.userId),
            eq(freezeRecords.scope, ACCOUNT_FREEZE_SCOPE),
            eq(freezeRecords.reason, ACCOUNT_LOCK_REASON),
            eq(freezeRecords.status, 'active')
          )
        )
        .limit(1);

      if (!activeAccountLock) {
        const [createdLock] = await tx
          .insert(freezeRecords)
          .values({
            userId: claimed.userId,
            reason: ACCOUNT_LOCK_REASON,
            scope: ACCOUNT_FREEZE_SCOPE,
            status: 'active',
          })
          .returning({
            id: freezeRecords.id,
          });

        if (createdLock) {
          freezeRecordIds.push(createdLock.id);
        }
      }

      activeFreezeReason = ACCOUNT_LOCK_REASON;
    }

    if (payload.action === 'escalate') {
      const [activeFreeze] = await tx
        .select({
          id: freezeRecords.id,
        })
        .from(freezeRecords)
        .where(
          and(
            eq(freezeRecords.userId, claimed.userId),
            eq(freezeRecords.scope, ACCOUNT_FREEZE_SCOPE),
            eq(freezeRecords.status, 'active')
          )
        )
        .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id))
        .limit(1);

      if (!activeFreeze) {
        const [createdFreeze] = await tx
          .insert(freezeRecords)
          .values({
            userId: claimed.userId,
            reason: AML_REVIEW_REASON,
            scope: ACCOUNT_FREEZE_SCOPE,
            status: 'active',
          })
          .returning({
            id: freezeRecords.id,
          });

        if (createdFreeze) {
          freezeRecordIds.push(createdFreeze.id);
        }
      } else {
        freezeRecordIds.push(activeFreeze.id);
      }

      activeFreezeReason = AML_REVIEW_REASON;
    }

    if (payload.action !== 'clear' && activeFreezeReason === null) {
      const [activeFreeze] = await tx
        .select({
          reason: freezeRecords.reason,
        })
        .from(freezeRecords)
        .where(
          and(
            eq(freezeRecords.userId, claimed.userId),
            eq(freezeRecords.scope, ACCOUNT_FREEZE_SCOPE),
            eq(freezeRecords.status, 'active')
          )
        )
        .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id))
        .limit(1);

      activeFreezeReason = activeFreeze?.reason ?? null;
    }

    return {
      amlCheckId: claimed.id,
      userId: claimed.userId,
      checkpoint: claimed.checkpoint,
      riskLevel: claimed.riskLevel,
      reviewStatus: nextStatus,
      freezeRecordIds,
      activeFreezeReason,
    };
  });

  await emitAmlReviewSecurityEvent({
    ...reviewed,
    adminId: payload.adminId,
    note: payload.note ?? null,
  });

  return reviewed;
}

export async function getPendingAmlMetrics() {
  const [row] = await db
    .select({
      pendingCount: sql<number>`count(*)`,
      overdueCount: sql<number>`count(*) filter (where ${amlChecks.slaDueAt} is not null and ${amlChecks.slaDueAt} < now())`,
      oldestPendingAt: sql<Date | null>`min(${amlChecks.createdAt})`,
      oldestOverdueAt: sql<Date | null>`min(${amlChecks.slaDueAt}) filter (where ${amlChecks.slaDueAt} is not null and ${amlChecks.slaDueAt} < now())`,
    })
    .from(amlChecks)
    .where(
      and(
        eq(amlChecks.reviewStatus, 'pending'),
        eq(amlChecks.result, 'hit')
      )
    );
  const normalized = row as
    | {
      pendingCount: number;
      overdueCount: number;
      oldestPendingAt: Date | null;
      oldestOverdueAt: Date | null;
    }
    | undefined;

  return {
    pendingCount: Number(normalized?.pendingCount ?? 0),
    overdueCount: Number(normalized?.overdueCount ?? 0),
    oldestPendingAt: normalized?.oldestPendingAt ?? null,
    oldestOverdueAt: normalized?.oldestOverdueAt ?? null,
  };
}

export async function screenUserRegistration(userId: number) {
  if (await isUserFrozen(userId, { scope: ACCOUNT_FREEZE_SCOPE })) {
    throw amlReviewRequiredError();
  }

  return performAmlScreening({
    userId,
    checkpoint: 'registration',
    mode: 'reuse_latest_clear',
  });
}

export async function screenUserFirstDeposit(
  userId: number,
  metadata?: CheckMetadata
) {
  if (await hasAnyDeposit(userId)) {
    return null;
  }

  return performAmlScreening({
    userId,
    checkpoint: 'first_deposit',
    metadata,
    mode: 'reuse_latest_clear',
  });
}

export async function screenUserWithdrawal(
  userId: number,
  metadata?: CheckMetadata
) {
  return performAmlScreening({
    userId,
    checkpoint: 'withdrawal_request',
    metadata,
    mode: 'always',
  });
}

export { getConfiguredAmlProvider };
