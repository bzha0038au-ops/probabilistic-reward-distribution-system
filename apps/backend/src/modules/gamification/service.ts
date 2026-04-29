import { sql } from "@reward/database/orm";
import type {
  RewardCenterResponse,
  RewardMission,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import {
  deposits,
  drawRecords,
  economyLedgerEntries,
  ledgerEntries,
  referrals,
  userAssetBalances,
  userWallets,
  users,
} from "@reward/database";
import { db, type DbClient, type DbTransaction } from "../../db";
import { creditAsset } from "../economy/service";
import { consumeMarketingBudget } from "../system/service";
import {
  conflictError,
  notFoundError,
  unprocessableEntityError,
} from "../../shared/errors";
import { readSqlRows } from "../../shared/sql-result";
import { jsonbTextPathSql } from "../../shared/jsonb";
import { listMissionDefinitions, resolveMissionDefinitionsForUser } from "./catalog";
import { evaluateRewardCenter } from "./evaluation";

type DbExecutor = DbClient | DbTransaction;

const DAILY_BONUS_ENTRY_TYPE = "daily_bonus";
const GAMIFICATION_REWARD_ENTRY_TYPE = "gamification_reward";
const DAILY_CLAIM_LIMIT = 30;
const EARNED_ASSET_CODE = "B_LUCK";

type RewardCenterActorWalletRow = {
  emailVerifiedAt: Date | string | null;
  phoneVerifiedAt: Date | string | null;
  bonusBalance: string | number | null;
};

type RewardCenterCountsRow = {
  drawCountAll: string | number | null;
  drawCountToday: string | number | null;
  depositCount: string | number | null;
  depositCreditedCount: string | number | null;
};

type RewardCenterLedgerRow = {
  createdAt: Date | string | null;
};

type RewardCenterMissionClaimRow = {
  createdAt: Date | string | null;
  missionId: string | null;
};

type RewardCenterReferralRow = {
  rewardId: string | null;
  qualifiedAt: Date | string | null;
};

const buildRewardGrantIdempotencyKey = (
  userId: number,
  mission: Pick<RewardMission, "id" | "cadence" | "resetsAt">,
  mode: "auto" | "claim",
) => {
  const resetMarker =
    mission.cadence === "daily"
      ? toValidDate(mission.resetsAt)?.toISOString().slice(0, 10) ?? "daily"
      : "lifetime";

  return `reward:${mode}:${userId}:${mission.id}:${resetMarker}`;
};

const startOfDay = (value = new Date()) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const toValidDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
};

const readMissionId = (value: unknown): RewardMissionId | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

async function readRewardCenterSnapshot(executor: DbExecutor, userId: number) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayStartIso = dayStart.toISOString();
  const missionDefinitions = await resolveMissionDefinitionsForUser(
    userId,
    executor,
  );
  const hasReferralMission = missionDefinitions.some(
    (mission) =>
      mission.type === "metric_threshold" &&
      mission.params.metric === "referral_success_count",
  );
  const claimableMissionIds = missionDefinitions
    .filter((mission) => mission.type === "metric_threshold")
    .map((mission) => mission.id);
  const missionIdSql = jsonbTextPathSql(ledgerEntries.metadata, "missionId");
  const economyMissionIdSql = jsonbTextPathSql(
    economyLedgerEntries.metadata,
    "missionId",
  );

  const [
    actorWalletResult,
    countsResult,
    dailyLedgerResult,
    missionLedgerResult,
    referralResult,
  ] = await Promise.all([
    executor.execute(sql`
      WITH ensured_assets AS (
        INSERT INTO ${userAssetBalances} ("user_id", "asset_code")
        VALUES (${userId}, ${EARNED_ASSET_CODE})
        ON CONFLICT ("user_id", "asset_code") DO NOTHING
        RETURNING 1
      )
      SELECT
        ${users.emailVerifiedAt} AS "emailVerifiedAt",
        ${users.phoneVerifiedAt} AS "phoneVerifiedAt",
        ${userAssetBalances.availableBalance} AS "bonusBalance"
      FROM ${users}
      LEFT JOIN ${userAssetBalances}
        ON ${userAssetBalances.userId} = ${users.id}
       AND ${userAssetBalances.assetCode} = ${EARNED_ASSET_CODE}
      WHERE ${users.id} = ${userId}
      LIMIT 1
    `),
    executor.execute(sql`
      SELECT
        (
          SELECT count(*)
          FROM ${drawRecords}
          WHERE ${drawRecords.userId} = ${userId}
        ) AS "drawCountAll",
        (
          SELECT count(*)
          FROM ${drawRecords}
          WHERE ${drawRecords.userId} = ${userId}
            AND ${drawRecords.createdAt} >= ${dayStartIso}
        ) AS "drawCountToday",
        (
          SELECT count(*)
          FROM ${deposits}
          WHERE ${deposits.userId} = ${userId}
        ) AS "depositCount"
        ,
        (
          SELECT count(*)
          FROM ${deposits}
          WHERE ${deposits.userId} = ${userId}
            AND ${deposits.status} = 'credited'
        ) AS "depositCreditedCount"
    `),
    executor.execute(sql`
      WITH combined_entries AS (
        SELECT
          ${ledgerEntries.createdAt} AS "createdAt",
          ${ledgerEntries.metadata} AS "metadata"
        FROM ${ledgerEntries}
        WHERE ${ledgerEntries.userId} = ${userId}
          AND ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}

        UNION ALL

        SELECT
          ${economyLedgerEntries.createdAt} AS "createdAt",
          ${economyLedgerEntries.metadata} AS "metadata"
        FROM ${economyLedgerEntries}
        WHERE ${economyLedgerEntries.userId} = ${userId}
          AND ${economyLedgerEntries.assetCode} = ${EARNED_ASSET_CODE}
          AND ${economyLedgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
      ),
      ranked_entries AS (
        SELECT
          "createdAt",
          "metadata",
          row_number() OVER (
            ORDER BY "createdAt" DESC
          ) AS "rowNumber"
        FROM combined_entries
      )
      SELECT "createdAt", "metadata"
      FROM ranked_entries
      WHERE "rowNumber" <= ${DAILY_CLAIM_LIMIT}
      ORDER BY "createdAt" DESC
    `),
    claimableMissionIds.length === 0
      ? Promise.resolve(null)
      : executor.execute(sql`
          SELECT *
          FROM (
            SELECT
              ${ledgerEntries.createdAt} AS "createdAt",
              ${missionIdSql} AS "missionId"
            FROM ${ledgerEntries}
            WHERE ${ledgerEntries.userId} = ${userId}
              AND ${ledgerEntries.entryType} = ${GAMIFICATION_REWARD_ENTRY_TYPE}
              AND (
                ${sql.join(
                  claimableMissionIds.map(
                    (missionId) => sql`${missionIdSql} = ${missionId}`,
                  ),
                  sql` OR `,
                )}
              )

            UNION ALL

            SELECT
              ${economyLedgerEntries.createdAt} AS "createdAt",
              ${economyMissionIdSql} AS "missionId"
            FROM ${economyLedgerEntries}
            WHERE ${economyLedgerEntries.userId} = ${userId}
              AND ${economyLedgerEntries.assetCode} = ${EARNED_ASSET_CODE}
              AND ${economyLedgerEntries.entryType} = ${GAMIFICATION_REWARD_ENTRY_TYPE}
              AND (
                ${sql.join(
                  claimableMissionIds.map(
                    (missionId) => sql`${economyMissionIdSql} = ${missionId}`,
                  ),
                  sql` OR `,
                )}
              )
          ) mission_claims
          ORDER BY "createdAt" DESC
        `),
    hasReferralMission
      ? executor.execute(sql`
          SELECT
            ${referrals.rewardId} AS "rewardId",
            ${referrals.qualifiedAt} AS "qualifiedAt"
          FROM ${referrals}
          WHERE ${referrals.referrerId} = ${userId}
            AND ${referrals.status} = 'qualified'
            AND ${referrals.qualifiedAt} IS NOT NULL
          ORDER BY ${referrals.qualifiedAt} DESC
        `)
      : Promise.resolve(null),
  ]);

  const actor = readSqlRows<RewardCenterActorWalletRow>(actorWalletResult)[0];
  if (!actor) {
    throw notFoundError("User not found.");
  }

  const counts = readSqlRows<RewardCenterCountsRow>(countsResult)[0];
  const dailyClaimRows = readSqlRows<RewardCenterLedgerRow>(dailyLedgerResult);
  const missionClaimRows = missionLedgerResult
    ? readSqlRows<RewardCenterMissionClaimRow>(missionLedgerResult)
    : [];
  const qualifiedReferralRows = referralResult
    ? readSqlRows<RewardCenterReferralRow>(referralResult)
    : [];

  return {
    bonusBalance: actor.bonusBalance ?? "0",
    emailVerifiedAt: toValidDate(actor.emailVerifiedAt),
    phoneVerifiedAt: toValidDate(actor.phoneVerifiedAt),
    drawCountAll: Number(counts?.drawCountAll ?? 0),
    drawCountToday: Number(counts?.drawCountToday ?? 0),
    depositCount: Number(counts?.depositCount ?? 0),
    depositCreditedCount: Number(counts?.depositCreditedCount ?? 0),
    dailyClaims: dailyClaimRows
      .map((entry) => toValidDate(entry.createdAt))
      .filter(
        (entry): entry is Date =>
          entry instanceof Date && !Number.isNaN(entry.getTime()),
      ),
    missionClaims: missionClaimRows
      .map((entry) => {
        const createdAt = toValidDate(entry.createdAt);
        if (!createdAt) {
          return null;
        }
        return {
          missionId: readMissionId(entry.missionId),
          createdAt,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          missionId: RewardMissionId | null;
          createdAt: Date;
        } => entry !== null,
      ),
    qualifiedReferrals: qualifiedReferralRows
      .map((entry) => {
        const qualifiedAt = toValidDate(entry.qualifiedAt);
        const rewardId = readMissionId(entry.rewardId);
        if (!qualifiedAt || !rewardId) {
          return null;
        }

        return {
          rewardId,
          qualifiedAt,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          rewardId: RewardMissionId;
          qualifiedAt: Date;
        } => entry !== null,
      ),
    missions: missionDefinitions,
  };
}

export async function getRewardCenter(
  userId: number,
  executor: DbExecutor = db,
): Promise<RewardCenterResponse> {
  const snapshot = await readRewardCenterSnapshot(executor, userId);
  return evaluateRewardCenter(snapshot);
}

const isReadyAutoRewardMission = (mission: RewardMission) =>
  mission.autoAwarded && mission.status === "ready";

export async function grantEligibleAutoRewardMissions(
  userId: number,
  executor: DbExecutor = db,
  options: {
    trigger: string;
  },
) {
  const run = async (tx: DbExecutor) => {
    const center = await getRewardCenter(userId, tx);
    const eligibleMissions = center.missions.filter(isReadyAutoRewardMission);
    const granted: Array<{
      missionId: RewardMissionId;
      grantedAmount: string;
    }> = [];

    for (const mission of eligibleMissions) {
      const budget = await consumeMarketingBudget(tx, mission.rewardAmount);
      if (!budget.allowed) {
        continue;
      }

      await creditAsset(
        {
          userId,
          assetCode: EARNED_ASSET_CODE,
          amount: mission.rewardAmount,
          entryType: GAMIFICATION_REWARD_ENTRY_TYPE,
          referenceType: "reward_mission",
          audit: {
            sourceApp: "backend.gamification",
            idempotencyKey: buildRewardGrantIdempotencyKey(
              userId,
              mission,
              "auto",
            ),
            metadata: {
              reason: "reward_mission_auto",
              missionId: mission.id,
              cadence: mission.cadence,
              awardMode: "auto_grant",
              bonusUnlockWagerRatio: mission.bonusUnlockWagerRatio,
              trigger: options.trigger,
            },
          },
        },
        tx,
      );

      granted.push({
        missionId: mission.id,
        grantedAmount: mission.rewardAmount,
      });
    }

    return granted;
  };

  if (executor === db) {
    return db.transaction(async (tx) => run(tx));
  }

  return run(executor);
}

export async function claimRewardMission(
  userId: number,
  missionId: RewardMissionId,
) {
  return db.transaction(async (tx) => {
    const walletLock = await tx.execute(sql`
      SELECT user_id
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${userId}
      FOR UPDATE
    `);
    const lockedRows = readSqlRows<{ user_id: number }>(walletLock);
    if (lockedRows.length === 0) {
      await tx.insert(userWallets).values({ userId }).onConflictDoNothing();
      await tx.execute(sql`
        SELECT user_id
        FROM ${userWallets}
        WHERE ${userWallets.userId} = ${userId}
        FOR UPDATE
      `);
    }

    const center = await getRewardCenter(userId, tx);
    const mission = center.missions.find((entry) => entry.id === missionId);
    if (!mission) {
      throw notFoundError("Reward mission not found.");
    }
    if (mission.autoAwarded) {
      throw conflictError("This reward is granted automatically.");
    }
    if (mission.status === "disabled") {
      throw conflictError("This reward is not enabled.");
    }
    if (mission.status === "claimed") {
      throw conflictError("Reward already claimed.");
    }
    if (!mission.claimable) {
      throw unprocessableEntityError("Reward mission is not ready.");
    }

    const budget = await consumeMarketingBudget(tx, mission.rewardAmount);
    if (!budget.allowed) {
      throw conflictError("Reward budget unavailable.");
    }

    await creditAsset(
      {
        userId,
        assetCode: EARNED_ASSET_CODE,
        amount: mission.rewardAmount,
        entryType: GAMIFICATION_REWARD_ENTRY_TYPE,
        referenceType: "reward_mission",
        audit: {
          sourceApp: "backend.gamification",
          idempotencyKey: buildRewardGrantIdempotencyKey(
            userId,
            mission,
            "claim",
          ),
          metadata: {
            reason: "reward_mission",
            missionId: mission.id,
            cadence: mission.cadence,
            bonusUnlockWagerRatio: mission.bonusUnlockWagerRatio,
          },
        },
      },
      tx,
    );

    const result = {
      missionId: mission.id,
      grantedAmount: mission.rewardAmount,
    };

    return result;
  });
}

export async function grantDailyCheckInRewardOnLogin(userId: number) {
  return db.transaction(async (tx) => {
    const dailyMission = (await listMissionDefinitions(tx)).find(
      (mission) =>
        mission.type === "daily_checkin" &&
        mission.isActive &&
        Number(mission.reward) > 0,
    );
    if (!dailyMission) {
      return null;
    }

    const dayStart = startOfDay();
    const dayStartIso = dayStart.toISOString();
    const claimResult = await tx.execute(sql`
      SELECT count(*) AS "total"
      FROM ${ledgerEntries}
      WHERE ${ledgerEntries.userId} = ${userId}
        AND ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
        AND ${ledgerEntries.createdAt} >= ${dayStartIso}
    `);
    const [{ total = 0 }] = readSqlRows<{ total: string | number }>(claimResult);
    if (Number(total ?? 0) > 0) {
      return null;
    }

    const budget = await consumeMarketingBudget(tx, dailyMission.reward);
    if (!budget.allowed) {
      return null;
    }

    await creditAsset(
      {
        userId,
        assetCode: EARNED_ASSET_CODE,
        amount: dailyMission.reward,
        entryType: DAILY_BONUS_ENTRY_TYPE,
        referenceType: "reward_mission",
        audit: {
          sourceApp: "backend.gamification",
          idempotencyKey: `reward:daily:${userId}:${dailyMission.id}:${dayStart
            .toISOString()
            .slice(0, 10)}`,
          metadata: {
            reason: "daily_bonus",
            missionId: dailyMission.id,
          },
        },
      },
      tx,
    );

    return {
      missionId: dailyMission.id,
      grantedAmount: dailyMission.reward,
    };
  });
}
