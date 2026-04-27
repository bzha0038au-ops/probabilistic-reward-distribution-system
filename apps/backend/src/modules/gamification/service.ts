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
import {
  consumeMarketingBudget,
  getRewardCenterConfig,
} from "../system/service";
import {
  conflictError,
  notFoundError,
  unprocessableEntityError,
} from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { evaluateRewardCenter } from "./evaluation";

type DbExecutor = DbClient | DbTransaction;

const DAILY_BONUS_ENTRY_TYPE = "daily_bonus";
const GAMIFICATION_REWARD_ENTRY_TYPE = "gamification_reward";
const DAILY_CLAIM_LIMIT = 30;
const MISSION_CLAIM_LIMIT = 50;

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
  entryType: string;
  createdAt: Date | string | null;
  metadata: unknown;
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

const readMissionId = (value: unknown): RewardMissionId | null => {
  if (
    value === "daily_checkin" ||
    value === "profile_security" ||
    value === "first_draw" ||
    value === "draw_streak_daily" ||
    value === "top_up_starter"
  ) {
    return value;
  }

  return null;
};

async function readRewardCenterSnapshot(executor: DbExecutor, userId: number) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const [
    actorWalletResult,
    countsResult,
    rewardCenterConfig,
    ledgerResult,
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
    getRewardCenterConfig(executor),
    executor.execute(sql`
      WITH ranked_entries AS (
        SELECT
          ${ledgerEntries.entryType} AS "entryType",
          ${ledgerEntries.createdAt} AS "createdAt",
          ${ledgerEntries.metadata} AS "metadata",
          row_number() OVER (
            PARTITION BY ${ledgerEntries.entryType}
            ORDER BY ${ledgerEntries.createdAt} DESC
          ) AS "rowNumber"
        FROM ${ledgerEntries}
        WHERE ${ledgerEntries.userId} = ${userId}
          AND ${ledgerEntries.entryType} IN (
            ${DAILY_BONUS_ENTRY_TYPE},
            ${GAMIFICATION_REWARD_ENTRY_TYPE}
          )
      )
      SELECT "entryType", "createdAt", "metadata"
      FROM ranked_entries
      WHERE (
        "entryType" = ${DAILY_BONUS_ENTRY_TYPE}
        AND "rowNumber" <= ${DAILY_CLAIM_LIMIT}
      ) OR (
        "entryType" = ${GAMIFICATION_REWARD_ENTRY_TYPE}
        AND "rowNumber" <= ${MISSION_CLAIM_LIMIT}
      )
      ORDER BY "entryType" ASC, "createdAt" DESC
    `),
  ]);

  const actor = readSqlRows<RewardCenterActorWalletRow>(actorWalletResult)[0];
  if (!actor) {
    throw notFoundError("User not found.");
  }

  const counts = readSqlRows<RewardCenterCountsRow>(countsResult)[0];
  const ledgerRows = readSqlRows<RewardCenterLedgerRow>(ledgerResult);
  const dailyClaimRows = ledgerRows.filter(
    (entry) => entry.entryType === DAILY_BONUS_ENTRY_TYPE,
  );
  const missionClaimRows = ledgerRows.filter(
    (entry) => entry.entryType === GAMIFICATION_REWARD_ENTRY_TYPE,
  );

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
        const metadata =
          entry.metadata &&
          typeof entry.metadata === "object" &&
          !Array.isArray(entry.metadata)
            ? entry.metadata
            : null;
        const createdAt = toValidDate(entry.createdAt);
        if (!createdAt) {
          return null;
        }
        return {
          missionId: readMissionId(
            metadata ? Reflect.get(metadata, "missionId") : null,
          ),
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
    dailyEnabled:
      rewardCenterConfig.dailyEnabled && rewardCenterConfig.dailyAmount.gt(0),
    dailyAmount: toMoneyString(rewardCenterConfig.dailyAmount),
    profileSecurityRewardAmount: toMoneyString(
      rewardCenterConfig.profileSecurityRewardAmount,
    ),
    firstDrawRewardAmount: toMoneyString(
      rewardCenterConfig.firstDrawRewardAmount,
    ),
    drawStreakDailyRewardAmount: toMoneyString(
      rewardCenterConfig.drawStreakDailyRewardAmount,
    ),
    topUpStarterRewardAmount: toMoneyString(
      rewardCenterConfig.topUpStarterRewardAmount,
    ),
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
        entryType: "gamification_reward",
        referenceType: "reward_mission",
        metadata: {
          reason: "reward_mission",
          missionId: mission.id,
          cadence: mission.cadence,
        },
      },
      tx,
    );

    return {
      missionId: mission.id,
      grantedAmount: mission.rewardAmount,
    };
  });
}
