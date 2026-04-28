import { sql } from "@reward/database/orm";
import type {
  RewardCenterResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import {
  deposits,
  drawRecords,
  ledgerEntries,
  userWallets,
  users,
} from "@reward/database";
import { db, type DbClient, type DbTransaction } from "../../db";
import { grantBonus } from "../bonus/service";
import { consumeMarketingBudget } from "../system/service";
import { assertWalletLedgerInvariant } from "../wallet/invariant-service";
import {
  conflictError,
  notFoundError,
  unprocessableEntityError,
} from "../../shared/errors";
import { readSqlRows } from "../../shared/sql-result";
import { jsonbTextPathSql } from "../../shared/jsonb";
import { listMissionDefinitions } from "./catalog";
import { evaluateRewardCenter } from "./evaluation";

type DbExecutor = DbClient | DbTransaction;

const DAILY_BONUS_ENTRY_TYPE = "daily_bonus";
const GAMIFICATION_REWARD_ENTRY_TYPE = "gamification_reward";
const DAILY_CLAIM_LIMIT = 30;

type RewardCenterActorWalletRow = {
  emailVerifiedAt: Date | string | null;
  phoneVerifiedAt: Date | string | null;
  bonusBalance: string | number | null;
};

type RewardCenterCountsRow = {
  drawCountAll: string | number | null;
  drawCountToday: string | number | null;
  depositCount: string | number | null;
};

type RewardCenterLedgerRow = {
  createdAt: Date | string | null;
};

type RewardCenterMissionClaimRow = {
  createdAt: Date | string | null;
  missionId: string | null;
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
  const missionDefinitions = await listMissionDefinitions(executor);
  const claimableMissionIds = missionDefinitions
    .filter((mission) => mission.type === "metric_threshold")
    .map((mission) => mission.id);
  const missionIdSql = jsonbTextPathSql(ledgerEntries.metadata, "missionId");

  const [
    actorWalletResult,
    countsResult,
    dailyLedgerResult,
    missionLedgerResult,
  ] = await Promise.all([
    executor.execute(sql`
      WITH ensured_wallet AS (
        INSERT INTO ${userWallets} ("user_id")
        VALUES (${userId})
        ON CONFLICT ("user_id") DO NOTHING
        RETURNING 1
      )
      SELECT
        ${users.emailVerifiedAt} AS "emailVerifiedAt",
        ${users.phoneVerifiedAt} AS "phoneVerifiedAt",
        ${userWallets.bonusBalance} AS "bonusBalance"
      FROM ${users}
      JOIN ${userWallets} ON ${userWallets.userId} = ${users.id}
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
            AND ${drawRecords.createdAt} >= ${dayStart}
        ) AS "drawCountToday",
        (
          SELECT count(*)
          FROM ${deposits}
          WHERE ${deposits.userId} = ${userId}
        ) AS "depositCount"
    `),
    executor.execute(sql`
      WITH ranked_entries AS (
        SELECT
          ${ledgerEntries.createdAt} AS "createdAt",
          ${ledgerEntries.metadata} AS "metadata",
          row_number() OVER (
            ORDER BY ${ledgerEntries.createdAt} DESC
          ) AS "rowNumber"
        FROM ${ledgerEntries}
        WHERE ${ledgerEntries.userId} = ${userId}
          AND ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
      )
      SELECT "createdAt", "metadata"
      FROM ranked_entries
      WHERE "rowNumber" <= ${DAILY_CLAIM_LIMIT}
      ORDER BY "createdAt" DESC
    `),
    claimableMissionIds.length === 0
      ? Promise.resolve(null)
      : executor.execute(sql`
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
          ORDER BY ${ledgerEntries.createdAt} DESC
        `),
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

  return {
    bonusBalance: actor.bonusBalance ?? "0",
    emailVerifiedAt: toValidDate(actor.emailVerifiedAt),
    phoneVerifiedAt: toValidDate(actor.phoneVerifiedAt),
    drawCountAll: Number(counts?.drawCountAll ?? 0),
    drawCountToday: Number(counts?.drawCountToday ?? 0),
    depositCount: Number(counts?.depositCount ?? 0),
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

    await grantBonus(
      {
        userId,
        amount: mission.rewardAmount,
        entryType: GAMIFICATION_REWARD_ENTRY_TYPE,
        referenceType: "reward_mission",
        metadata: {
          reason: "reward_mission",
          missionId: mission.id,
          cadence: mission.cadence,
        },
      },
      tx,
    );

    const result = {
      missionId: mission.id,
      grantedAmount: mission.rewardAmount,
    };

    await assertWalletLedgerInvariant(tx, userId, {
      service: "gamification",
      operation: "claimRewardMission",
    });

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
    const claimResult = await tx.execute(sql`
      SELECT count(*) AS "total"
      FROM ${ledgerEntries}
      WHERE ${ledgerEntries.userId} = ${userId}
        AND ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
        AND ${ledgerEntries.createdAt} >= ${dayStart}
    `);
    const [{ total = 0 }] = readSqlRows<{ total: string | number }>(claimResult);
    if (Number(total ?? 0) > 0) {
      return null;
    }

    const budget = await consumeMarketingBudget(tx, dailyMission.reward);
    if (!budget.allowed) {
      return null;
    }

    await grantBonus(
      {
        userId,
        amount: dailyMission.reward,
        entryType: DAILY_BONUS_ENTRY_TYPE,
        referenceType: "reward_mission",
        metadata: {
          reason: "daily_bonus",
          missionId: dailyMission.id,
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
