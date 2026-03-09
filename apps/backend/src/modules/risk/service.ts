import { and, asc, desc, eq } from 'drizzle-orm';

import type { DbClient, DbTransaction } from '../../db';
import { db } from '../../db';
import { freezeRecords, suspiciousAccounts } from '@reward/database';
import { getAntiAbuseConfig } from '../system/service';
import { logger } from '../../shared/logger';

export async function isUserFrozen(userId: number) {
  const [record] = await db
    .select({ id: freezeRecords.id })
    .from(freezeRecords)
    .where(and(eq(freezeRecords.userId, userId), eq(freezeRecords.status, 'active')))
    .limit(1);

  return Boolean(record?.id);
}

export async function ensureUserFreeze(payload: {
  userId: number;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const existing = await db
    .select({ id: freezeRecords.id })
    .from(freezeRecords)
    .where(and(eq(freezeRecords.userId, payload.userId), eq(freezeRecords.status, 'active')))
    .orderBy(desc(freezeRecords.createdAt))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(freezeRecords)
    .values({
      userId: payload.userId,
      reason: payload.reason ?? 'auth_failure_threshold',
      status: 'active',
    })
    .returning();

  return created ?? null;
}

type DbExecutor = DbClient | DbTransaction;

export async function recordSuspiciousActivity(
  payload: {
    userId: number;
    reason: string;
    metadata?: Record<string, unknown> | null;
    score?: number;
  },
  executor: DbExecutor = db
) {
  const score = Number(payload.score ?? 1);
  const run = async (tx: DbExecutor) => {
    const [existing] = await tx
      .select()
      .from(suspiciousAccounts)
      .where(
        and(
          eq(suspiciousAccounts.userId, payload.userId),
          eq(suspiciousAccounts.status, 'open')
        )
      )
      .orderBy(desc(suspiciousAccounts.createdAt))
      .limit(1);

    let nextScore = score;
    if (existing) {
      const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
      const currentScore =
        typeof metadata.score === 'number' ? metadata.score : 0;
      nextScore = currentScore + score;
      await tx
        .update(suspiciousAccounts)
        .set({
          reason: payload.reason,
          metadata: {
            ...metadata,
            score: nextScore,
            lastReason: payload.reason,
            lastSeenAt: new Date().toISOString(),
          },
        })
        .where(eq(suspiciousAccounts.id, existing.id));
    } else {
      await tx.insert(suspiciousAccounts).values({
        userId: payload.userId,
        reason: payload.reason,
        status: 'open',
        metadata: {
          score: nextScore,
          lastReason: payload.reason,
          lastSeenAt: new Date().toISOString(),
          ...(payload.metadata ?? {}),
        },
      });
    }

    return nextScore;
  };

  try {
    const nextScore = await run(executor);
    const config = await getAntiAbuseConfig(executor);
    if (config.autoFreeze && config.suspiciousThreshold.gt(0)) {
      if (nextScore >= Number(config.suspiciousThreshold)) {
        await ensureUserFreeze({
          userId: payload.userId,
          reason: 'suspicious_activity',
          metadata: { score: nextScore, trigger: payload.reason },
        });
      }
    }
    return nextScore;
  } catch (error) {
    logger.warning('failed to record suspicious activity', {
      err: error,
      userId: payload.userId,
      reason: payload.reason,
    });
    return null;
  }
}

export async function listFrozenUsers(
  limit = 50,
  offset = 0,
  order: 'asc' | 'desc' = 'desc'
) {
  const orderBy = order === 'asc' ? asc(freezeRecords.createdAt) : desc(freezeRecords.createdAt);
  return db
    .select()
    .from(freezeRecords)
    .where(eq(freezeRecords.status, 'active'))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);
}

export async function releaseUserFreeze(payload: {
  userId: number;
  reason?: string | null;
}) {
  const [updated] = await db
    .update(freezeRecords)
    .set({
      status: 'released',
      releasedAt: new Date(),
    })
    .where(and(eq(freezeRecords.userId, payload.userId), eq(freezeRecords.status, 'active')))
    .returning();

  return updated ?? null;
}
