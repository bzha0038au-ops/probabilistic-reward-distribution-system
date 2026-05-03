import { createHash, randomBytes } from 'node:crypto';
import { fairnessAudits, fairnessSeeds } from '@reward/database';
import { and, desc, eq, lt } from '@reward/database/orm';

import type { DbClient, DbTransaction } from '../../db';
import { getConfig } from '../../shared/config';
import { persistenceError } from '../../shared/errors';

type DbExecutor = DbClient | DbTransaction;

export type FairnessAuditSummary = {
  latestAuditedEpoch: number | null;
  lastAuditPassed: boolean | null;
  lastAuditedAt: Date | null;
  consecutiveVerifiedEpochs: number;
  consecutiveVerifiedDays: number;
};

export type FairnessAuditResult = {
  epoch: number;
  epochSeconds: number;
  commitHash: string | null;
  computedHash: string | null;
  matches: boolean;
  failureCode: string | null;
  revealedAt: Date | null;
  auditedAt: Date;
};

type FairnessStreak = {
  count: number;
  latestEpoch: number | null;
  earliestEpoch: number | null;
};

const DEFAULT_EPOCH_SECONDS = 3600;
const SECONDS_PER_DAY = 24 * 60 * 60;
const FAIRNESS_STREAK_BATCH_SIZE = 256;
const EMPTY_AUDIT_SUMMARY: FairnessAuditSummary = {
  latestAuditedEpoch: null,
  lastAuditPassed: null,
  lastAuditedAt: null,
  consecutiveVerifiedEpochs: 0,
  consecutiveVerifiedDays: 0,
};

const hashSeed = (seed: string) =>
  createHash('sha256').update(seed).digest('hex');

const shouldSkipInitialHistoricalAudit = () => getConfig().nodeEnv === 'development';

const resolveEpochSeconds = (epochSeconds?: number | null) => {
  const parsed = Number(epochSeconds ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EPOCH_SECONDS;
};

const currentEpoch = (epochSeconds: number) =>
  Math.floor(Date.now() / (epochSeconds * 1000));

const toEpochDayBucket = (epoch: number, epochSeconds: number) =>
  Math.floor((epoch * epochSeconds) / SECONDS_PER_DAY);

const buildAuditSummary = (
  latest: {
    epoch: number;
    matches: boolean;
    auditedAt: Date;
  } | null,
  streak: FairnessStreak,
  epochSeconds: number
): FairnessAuditSummary => {
  if (!latest) {
    return { ...EMPTY_AUDIT_SUMMARY };
  }

  const consecutiveVerifiedDays =
    streak.count > 0 && streak.latestEpoch !== null && streak.earliestEpoch !== null
      ? toEpochDayBucket(streak.latestEpoch, epochSeconds) -
          toEpochDayBucket(streak.earliestEpoch, epochSeconds) +
        1
      : 0;

  return {
    latestAuditedEpoch: latest.epoch,
    lastAuditPassed: latest.matches,
    lastAuditedAt: latest.auditedAt,
    consecutiveVerifiedEpochs: streak.count,
    consecutiveVerifiedDays,
  };
};

const verifyFairnessSeed = (seed: string, commitHash: string) => {
  const computedHash = hashSeed(seed);
  return {
    computedHash,
    matches: computedHash === commitHash,
  };
};

async function loadFairnessSeed(
  db: DbExecutor,
  epoch: number,
  epochSeconds: number
) {
  const [existing] = await db
    .select()
    .from(fairnessSeeds)
    .where(
      and(
        eq(fairnessSeeds.epoch, epoch),
        eq(fairnessSeeds.epochSeconds, epochSeconds)
      )
    )
    .limit(1);

  return existing ?? null;
}

async function upsertFairnessAudit(
  db: DbExecutor,
  audit: FairnessAuditResult
) {
  const [saved] = await db
    .insert(fairnessAudits)
    .values({
      epoch: audit.epoch,
      epochSeconds: audit.epochSeconds,
      commitHash: audit.commitHash,
      computedHash: audit.computedHash,
      matches: audit.matches,
      failureCode: audit.failureCode,
      revealedAt: audit.revealedAt,
      auditedAt: audit.auditedAt,
    })
    .onConflictDoUpdate({
      target: [fairnessAudits.epoch, fairnessAudits.epochSeconds],
      set: {
        commitHash: audit.commitHash,
        computedHash: audit.computedHash,
        matches: audit.matches,
        failureCode: audit.failureCode,
        revealedAt: audit.revealedAt,
        auditedAt: audit.auditedAt,
      },
    })
    .returning({
      epoch: fairnessAudits.epoch,
      epochSeconds: fairnessAudits.epochSeconds,
      commitHash: fairnessAudits.commitHash,
      computedHash: fairnessAudits.computedHash,
      matches: fairnessAudits.matches,
      failureCode: fairnessAudits.failureCode,
      revealedAt: fairnessAudits.revealedAt,
      auditedAt: fairnessAudits.auditedAt,
    });

  if (!saved) {
    throw persistenceError('Failed to persist fairness audit.');
  }

  return saved;
}

async function countConsecutiveVerifiedEpochs(
  db: DbExecutor,
  epochSeconds: number
): Promise<FairnessStreak> {
  let cursorEpoch: number | null = null;
  let count = 0;
  let latestEpoch: number | null = null;
  let earliestEpoch: number | null = null;
  let expectedEpoch: number | null = null;

  for (;;) {
    const rows: Array<{ epoch: number; matches: boolean }> =
      cursorEpoch === null
        ? await db
            .select({
              epoch: fairnessAudits.epoch,
              matches: fairnessAudits.matches,
            })
            .from(fairnessAudits)
            .where(eq(fairnessAudits.epochSeconds, epochSeconds))
            .orderBy(desc(fairnessAudits.epoch))
            .limit(FAIRNESS_STREAK_BATCH_SIZE)
        : await db
            .select({
              epoch: fairnessAudits.epoch,
              matches: fairnessAudits.matches,
            })
            .from(fairnessAudits)
            .where(
              and(
                eq(fairnessAudits.epochSeconds, epochSeconds),
                lt(fairnessAudits.epoch, cursorEpoch)
              )
            )
            .orderBy(desc(fairnessAudits.epoch))
            .limit(FAIRNESS_STREAK_BATCH_SIZE);

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      if (!row.matches) {
        return { count, latestEpoch, earliestEpoch };
      }

      const currentExpectedEpoch: number = expectedEpoch ?? row.epoch;
      if (expectedEpoch === null) {
        latestEpoch = row.epoch;
      }

      if (row.epoch !== currentExpectedEpoch) {
        return { count, latestEpoch, earliestEpoch };
      }

      count += 1;
      earliestEpoch = row.epoch;
      expectedEpoch = currentExpectedEpoch - 1;
    }

    cursorEpoch = rows[rows.length - 1]?.epoch ?? null;
  }

  return { count, latestEpoch, earliestEpoch };
}

export async function getFairnessAuditSummary(
  db: DbExecutor,
  epochSeconds?: number | null
) {
  const seconds = resolveEpochSeconds(epochSeconds);
  const [latest] = await db
    .select({
      epoch: fairnessAudits.epoch,
      matches: fairnessAudits.matches,
      auditedAt: fairnessAudits.auditedAt,
    })
    .from(fairnessAudits)
    .where(eq(fairnessAudits.epochSeconds, seconds))
    .orderBy(desc(fairnessAudits.epoch))
    .limit(1);

  if (!latest) {
    return { ...EMPTY_AUDIT_SUMMARY };
  }

  const streak = latest.matches
    ? await countConsecutiveVerifiedEpochs(db, seconds)
    : { count: 0, latestEpoch: null, earliestEpoch: null };

  return buildAuditSummary(latest, streak, seconds);
}

export async function ensureFairnessSeed(
  db: DbExecutor,
  epochSeconds?: number | null
) {
  const seconds = resolveEpochSeconds(epochSeconds);
  const epoch = currentEpoch(seconds);

  const existing = await loadFairnessSeed(db, epoch, seconds);

  if (existing?.seed && existing.commitHash) {
    return {
      epoch,
      epochSeconds: seconds,
      commitHash: existing.commitHash,
      seed: existing.seed,
    };
  }

  const seed = randomBytes(32).toString('hex');
  const commitHash = hashSeed(seed);

  await db
    .insert(fairnessSeeds)
    .values({
      epoch,
      epochSeconds: seconds,
      commitHash,
      seed,
    })
    .onConflictDoNothing();

  const created = await loadFairnessSeed(db, epoch, seconds);

  if (!created?.seed) {
    throw persistenceError('Failed to create fairness seed.');
  }

  return {
    epoch,
    epochSeconds: seconds,
    commitHash: created.commitHash,
    seed: created.seed,
  };
}

export async function getFairnessCommit(
  db: DbExecutor,
  epochSeconds?: number | null
) {
  const seed = await ensureFairnessSeed(db, epochSeconds);
  const audit = await getFairnessAuditSummary(db, seed.epochSeconds);

  return {
    epoch: seed.epoch,
    epochSeconds: seed.epochSeconds,
    commitHash: seed.commitHash,
    audit,
  };
}

export async function revealFairnessSeed(
  db: DbExecutor,
  epoch: number,
  epochSeconds?: number | null
) {
  const seconds = resolveEpochSeconds(epochSeconds);
  const current = currentEpoch(seconds);
  if (!Number.isFinite(epoch) || epoch < 0) {
    return null;
  }
  if (epoch >= current) {
    return null;
  }

  const existing = await loadFairnessSeed(db, epoch, seconds);

  if (!existing?.seed || !existing.commitHash) {
    return null;
  }

  const revealedAt = existing.revealedAt ?? new Date();

  if (!existing.revealedAt) {
    await db
      .update(fairnessSeeds)
      .set({ revealedAt })
      .where(eq(fairnessSeeds.id, existing.id));
  }

  return {
    epoch,
    epochSeconds: seconds,
    commitHash: existing.commitHash,
    seed: existing.seed,
    revealedAt,
  };
}

export async function auditFairnessEpoch(
  db: DbExecutor,
  epoch: number,
  epochSeconds?: number | null
) {
  const seconds = resolveEpochSeconds(epochSeconds);
  const current = currentEpoch(seconds);
  const auditedAt = new Date();

  if (!Number.isFinite(epoch) || epoch < 0) {
    return upsertFairnessAudit(db, {
      epoch,
      epochSeconds: seconds,
      commitHash: null,
      computedHash: null,
      matches: false,
      failureCode: 'invalid_epoch',
      revealedAt: null,
      auditedAt,
    });
  }

  if (epoch >= current) {
    return upsertFairnessAudit(db, {
      epoch,
      epochSeconds: seconds,
      commitHash: null,
      computedHash: null,
      matches: false,
      failureCode: 'epoch_not_closed',
      revealedAt: null,
      auditedAt,
    });
  }

  const existing = await loadFairnessSeed(db, epoch, seconds);
  if (!existing?.seed || !existing.commitHash) {
    return upsertFairnessAudit(db, {
      epoch,
      epochSeconds: seconds,
      commitHash: existing?.commitHash ?? null,
      computedHash: null,
      matches: false,
      failureCode: 'seed_missing',
      revealedAt: existing?.revealedAt ?? null,
      auditedAt,
    });
  }

  const reveal = await revealFairnessSeed(db, epoch, seconds);
  if (!reveal) {
    return upsertFairnessAudit(db, {
      epoch,
      epochSeconds: seconds,
      commitHash: existing.commitHash,
      computedHash: null,
      matches: false,
      failureCode: 'reveal_unavailable',
      revealedAt: existing.revealedAt ?? null,
      auditedAt,
    });
  }

  const verification = verifyFairnessSeed(reveal.seed, reveal.commitHash);

  return upsertFairnessAudit(db, {
    epoch,
    epochSeconds: seconds,
    commitHash: reveal.commitHash,
    computedHash: verification.computedHash,
    matches: verification.matches,
    failureCode: verification.matches ? null : 'commit_mismatch',
    revealedAt: reveal.revealedAt instanceof Date
      ? reveal.revealedAt
      : new Date(reveal.revealedAt),
    auditedAt,
  });
}

export async function auditPendingFairnessEpochs(
  db: DbExecutor,
  epochSeconds?: number | null
) {
  const seconds = resolveEpochSeconds(epochSeconds);
  await ensureFairnessSeed(db, seconds);

  const current = currentEpoch(seconds);
  if (current <= 0) {
    return {
      epochSeconds: seconds,
      currentEpoch: current,
      auditedEpochs: 0,
      verifiedEpochs: 0,
      failedEpochs: 0,
    };
  }

  const [latestAudit] = await db
    .select({
      epoch: fairnessAudits.epoch,
    })
    .from(fairnessAudits)
    .where(eq(fairnessAudits.epochSeconds, seconds))
    .orderBy(desc(fairnessAudits.epoch))
    .limit(1);

  const startEpoch = latestAudit
    ? latestAudit.epoch + 1
    : shouldSkipInitialHistoricalAudit()
      ? current
      : Math.max(current - 1, 0);

  let auditedEpochs = 0;
  let verifiedEpochs = 0;
  let failedEpochs = 0;

  for (let epoch = startEpoch; epoch < current; epoch += 1) {
    auditedEpochs += 1;
    const audit = await auditFairnessEpoch(db, epoch, seconds);
    if (audit.matches) {
      verifiedEpochs += 1;
    } else {
      failedEpochs += 1;
    }
  }

  return {
    epochSeconds: seconds,
    currentEpoch: current,
    auditedEpochs,
    verifiedEpochs,
    failedEpochs,
  };
}
