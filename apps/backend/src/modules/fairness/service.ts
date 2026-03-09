import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';

import type { DbClient, DbTransaction } from '../../db';
import { fairnessSeeds } from '@reward/database';

type DbExecutor = DbClient | DbTransaction;

const DEFAULT_EPOCH_SECONDS = 3600;

const hashSeed = (seed: string) =>
  createHash('sha256').update(seed).digest('hex');

const resolveEpochSeconds = (epochSeconds?: number | null) => {
  const parsed = Number(epochSeconds ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EPOCH_SECONDS;
};

const currentEpoch = (epochSeconds: number) =>
  Math.floor(Date.now() / (epochSeconds * 1000));

export async function ensureFairnessSeed(
  db: DbExecutor,
  epochSeconds?: number | null
) {
  const seconds = resolveEpochSeconds(epochSeconds);
  const epoch = currentEpoch(seconds);

  const [existing] = await db
    .select()
    .from(fairnessSeeds)
    .where(and(eq(fairnessSeeds.epoch, epoch), eq(fairnessSeeds.epochSeconds, seconds)))
    .limit(1);

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

  const [created] = await db
    .select()
    .from(fairnessSeeds)
    .where(and(eq(fairnessSeeds.epoch, epoch), eq(fairnessSeeds.epochSeconds, seconds)))
    .limit(1);

  if (!created?.seed) {
    throw new Error('Failed to create fairness seed.');
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
  return {
    epoch: seed.epoch,
    epochSeconds: seed.epochSeconds,
    commitHash: seed.commitHash,
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

  const [existing] = await db
    .select()
    .from(fairnessSeeds)
    .where(and(eq(fairnessSeeds.epoch, epoch), eq(fairnessSeeds.epochSeconds, seconds)))
    .limit(1);

  if (!existing?.seed) {
    return null;
  }

  if (!existing.revealedAt) {
    await db
      .update(fairnessSeeds)
      .set({ revealedAt: new Date() })
      .where(eq(fairnessSeeds.id, existing.id));
  }

  return {
    epoch,
    epochSeconds: seconds,
    commitHash: existing.commitHash,
    seed: existing.seed,
    revealedAt: existing.revealedAt ?? new Date(),
  };
}
