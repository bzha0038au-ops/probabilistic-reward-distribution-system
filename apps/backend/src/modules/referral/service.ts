import { createHash } from "node:crypto";

import { authSessions, deviceFingerprints, referrals, users } from "@reward/database";
import { and, eq, inArray } from "@reward/database/orm";
import type { KycTier } from "@reward/shared-types/kyc";

import { db, type DbClient, type DbTransaction } from "../../db";

type DbExecutor = DbClient | DbTransaction;

const KYC_TIER_RANK: Record<KycTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
};

const QUALIFYING_REFERRAL_TIER: KycTier = "tier_1";

export const DEFAULT_REFERRAL_REWARD_ID = "referral_program";

const isKycTierAtLeast = (currentTier: KycTier, minimumTier: KycTier) =>
  KYC_TIER_RANK[currentTier] >= KYC_TIER_RANK[minimumTier];

const normalizeSignalValue = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "" ? null : normalized;
};

const buildServerDerivedDeviceFingerprint = (
  ip: string | null,
  userAgent: string | null,
) =>
  ip && userAgent
    ? createHash("sha256")
        .update(`derived::${ip}::${userAgent}`)
        .digest("hex")
    : null;

const loadUserDeviceFingerprints = async (
  userIds: number[],
  executor: DbExecutor,
) => {
  const normalizedUserIds = [...new Set(userIds)].filter(
    (userId) => Number.isInteger(userId) && userId > 0,
  );
  if (normalizedUserIds.length === 0) {
    return new Map<number, Set<string>>();
  }

  const trackedDeviceRows = await executor
    .select({
      userId: deviceFingerprints.userId,
      fingerprint: deviceFingerprints.fingerprint,
    })
    .from(deviceFingerprints)
    .where(inArray(deviceFingerprints.userId, normalizedUserIds))
    .catch(() => [] as Array<{ userId: number; fingerprint: string }>);
  const sessionRows = await executor
    .select({
      userId: authSessions.userId,
      ip: authSessions.ip,
      userAgent: authSessions.userAgent,
    })
    .from(authSessions)
    .where(
      and(
        inArray(authSessions.userId, normalizedUserIds),
        eq(authSessions.subjectRole, "user"),
      ),
    );

  const fingerprintMap = new Map<number, Set<string>>();

  for (const row of trackedDeviceRows) {
    const userFingerprints =
      fingerprintMap.get(row.userId) ?? new Set<string>();
    userFingerprints.add(row.fingerprint);
    fingerprintMap.set(row.userId, userFingerprints);
  }

  for (const row of sessionRows) {
    const fingerprint = buildServerDerivedDeviceFingerprint(
      normalizeSignalValue(row.ip),
      normalizeSignalValue(row.userAgent),
    );
    if (!fingerprint) {
      continue;
    }

    const userFingerprints =
      fingerprintMap.get(row.userId) ?? new Set<string>();
    userFingerprints.add(fingerprint);
    fingerprintMap.set(row.userId, userFingerprints);
  }

  return fingerprintMap;
};

const hasSharedDeviceFingerprint = async (
  referrerId: number,
  referredId: number,
  executor: DbExecutor,
) => {
  const fingerprintMap = await loadUserDeviceFingerprints(
    [referrerId, referredId],
    executor,
  );
  const referrerFingerprints = fingerprintMap.get(referrerId) ?? new Set();
  const referredFingerprints = fingerprintMap.get(referredId) ?? new Set();

  if (referrerFingerprints.size === 0 || referredFingerprints.size === 0) {
    return false;
  }

  for (const fingerprint of referrerFingerprints) {
    if (referredFingerprints.has(fingerprint)) {
      return true;
    }
  }

  return false;
};

export async function createReferralForRegistration(
  payload: {
    referrerId: number;
    referredId: number;
    rewardId?: string | null;
  },
  executor: DbExecutor = db,
) {
  if (
    !Number.isInteger(payload.referrerId) ||
    payload.referrerId <= 0 ||
    payload.referrerId === payload.referredId
  ) {
    return null;
  }

  const [referrer] = await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, payload.referrerId))
    .limit(1);

  if (!referrer) {
    return null;
  }

  const now = new Date();
  const [created] = await executor
    .insert(referrals)
    .values({
      referrerId: payload.referrerId,
      referredId: payload.referredId,
      status: "pending",
      rewardId: payload.rewardId?.trim() || DEFAULT_REFERRAL_REWARD_ID,
      qualifiedAt: null,
      rejectedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  return created ?? null;
}

export async function settlePendingReferralsForApprovedUser(
  payload: {
    referredUserId: number;
    currentTier: KycTier;
  },
  executor: DbExecutor = db,
) {
  if (!isKycTierAtLeast(payload.currentTier, QUALIFYING_REFERRAL_TIER)) {
    return {
      qualifiedCount: 0,
      rejectedCount: 0,
    };
  }

  const pendingReferrals = await executor
    .select({
      id: referrals.id,
      referrerId: referrals.referrerId,
    })
    .from(referrals)
    .where(
      and(
        eq(referrals.referredId, payload.referredUserId),
        eq(referrals.status, "pending"),
      ),
    );

  let qualifiedCount = 0;
  let rejectedCount = 0;

  for (const referral of pendingReferrals) {
    const now = new Date();
    const sharedDeviceFingerprint = await hasSharedDeviceFingerprint(
      referral.referrerId,
      payload.referredUserId,
      executor,
    );

    const updated = await executor
      .update(referrals)
      .set(
        sharedDeviceFingerprint
          ? {
              status: "rejected",
              rejectedAt: now,
              updatedAt: now,
            }
          : {
              status: "qualified",
              qualifiedAt: now,
              rejectedAt: null,
              updatedAt: now,
            },
      )
      .where(
        and(eq(referrals.id, referral.id), eq(referrals.status, "pending")),
      )
      .returning({ id: referrals.id });

    if (updated.length === 0) {
      continue;
    }

    if (sharedDeviceFingerprint) {
      rejectedCount += 1;
    } else {
      qualifiedCount += 1;
    }
  }

  return {
    qualifiedCount,
    rejectedCount,
  };
}
