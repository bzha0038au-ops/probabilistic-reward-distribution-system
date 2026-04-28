import {
  deposits,
  drawRecords,
  ledgerEntries,
  missions,
  users,
} from "@reward/database";
import { eq, sql } from "@reward/database/orm";
import type {
  RewardMissionAdminMetrics,
  RewardMissionAdminRecord,
  RewardMissionDefinitionType,
  RewardMissionMetricWindow,
} from "@reward/shared-types/gamification";

import { db } from "../../db";
import { conflictError } from "../../shared/errors";
import { jsonbTextPathSql, toJsonbLiteral } from "../../shared/jsonb";
import { toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import {
  ensureSingleDailyCheckInMission,
  listMissionDefinitions,
  parseMissionParams,
  type RewardMissionDefinition,
} from "./catalog";

const DAILY_BONUS_ENTRY_TYPE = "daily_bonus";
const GAMIFICATION_REWARD_ENTRY_TYPE = "gamification_reward";
const MISSIONS_PRIMARY_KEY_CONSTRAINT = "missions_pkey";
const SINGLE_DAILY_CHECK_IN_CONSTRAINT =
  "missions_single_daily_checkin_unique";

type CountRow = {
  total?: string | number | null;
};

type MissionClaimMetricsRow = {
  claimedUsers?: string | number | null;
  grantedAmountTotal?: string | number | null;
};

const readConstraintName = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const constraint =
    Reflect.get(error, "constraint_name") ?? Reflect.get(error, "constraint");
  return typeof constraint === "string" ? constraint : null;
};

const isUniqueConstraintError = (error: unknown, constraintName: string) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    Reflect.get(error, "code") === "23505" &&
    readConstraintName(error) === constraintName
  );
};

const startOfDay = (value = new Date()) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};

const toMetricWindow = (
  definition: RewardMissionDefinition,
): RewardMissionMetricWindow =>
  definition.type === "daily_checkin" || definition.params.cadence === "daily"
    ? "today"
    : "lifetime";

const buildRewardGrantWhere = (definition: RewardMissionDefinition) => {
  const missionIdSql = jsonbTextPathSql(ledgerEntries.metadata, "missionId");

  if (definition.type === "daily_checkin") {
    if (definition.id === "daily_checkin") {
      return sql`
        ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
        AND (
          ${missionIdSql} = ${definition.id}
          OR ${missionIdSql} IS NULL
        )
      `;
    }

    return sql`
      ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
      AND ${missionIdSql} = ${definition.id}
    `;
  }

  return sql`
    ${ledgerEntries.entryType} = ${GAMIFICATION_REWARD_ENTRY_TYPE}
    AND ${missionIdSql} = ${definition.id}
  `;
};

const readFirstSqlRow = <TRow>(result: unknown) => readSqlRows<TRow>(result)[0];

const countCompletedUsers = async (definition: RewardMissionDefinition) => {
  if (definition.type === "daily_checkin") {
    const dayStart = startOfDay();
    const [row] = await db
      .select({
        total: sql<number>`count(distinct ${ledgerEntries.userId})`,
      })
      .from(ledgerEntries)
      .where(sql`
        ${ledgerEntries.entryType} = ${DAILY_BONUS_ENTRY_TYPE}
        AND ${ledgerEntries.createdAt} >= ${dayStart}
      `);

    return Number(row?.total ?? 0);
  }

  if (definition.params.metric === "verified_contacts") {
    const row = readFirstSqlRow<CountRow>(await db.execute(sql`
      SELECT count(*) AS "total"
      FROM ${users}
      WHERE (
        (CASE WHEN ${users.emailVerifiedAt} IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN ${users.phoneVerifiedAt} IS NOT NULL THEN 1 ELSE 0 END)
      ) >= ${definition.params.target}
    `));

    return Number(row?.total ?? 0);
  }

  if (definition.params.metric === "draw_count_all") {
    const row = readFirstSqlRow<CountRow>(await db.execute(sql`
      SELECT count(*) AS "total"
      FROM (
        SELECT ${drawRecords.userId}
        FROM ${drawRecords}
        GROUP BY ${drawRecords.userId}
        HAVING count(*) >= ${definition.params.target}
      ) AS "qualified_users"
    `));

    return Number(row?.total ?? 0);
  }

  if (definition.params.metric === "draw_count_today") {
    const dayStart = startOfDay();
    const row = readFirstSqlRow<CountRow>(await db.execute(sql`
      SELECT count(*) AS "total"
      FROM (
        SELECT ${drawRecords.userId}
        FROM ${drawRecords}
        WHERE ${drawRecords.createdAt} >= ${dayStart}
        GROUP BY ${drawRecords.userId}
        HAVING count(*) >= ${definition.params.target}
      ) AS "qualified_users"
    `));

    return Number(row?.total ?? 0);
  }

  const row = readFirstSqlRow<CountRow>(await db.execute(sql`
    SELECT count(*) AS "total"
    FROM (
      SELECT ${deposits.userId}
      FROM ${deposits}
      GROUP BY ${deposits.userId}
      HAVING count(*) >= ${definition.params.target}
    ) AS "qualified_users"
  `));

  return Number(row?.total ?? 0);
};

const buildMissionMetrics = async (
  definition: RewardMissionDefinition,
  totalUsers: number,
): Promise<RewardMissionAdminMetrics> => {
  const window = toMetricWindow(definition);
  const completedUsers = await countCompletedUsers(definition);
  const rewardGrantWhere = buildRewardGrantWhere(definition);
  const claimWindowCondition =
    window === "today"
      ? sql`AND ${ledgerEntries.createdAt} >= ${startOfDay()}`
      : sql``;

  const claimRow = readFirstSqlRow<MissionClaimMetricsRow>(await db.execute(sql`
    SELECT
      count(distinct ${ledgerEntries.userId}) AS "claimedUsers",
      coalesce(sum(${ledgerEntries.amount}), 0) AS "grantedAmountTotal"
    FROM ${ledgerEntries}
    WHERE ${rewardGrantWhere}
      ${claimWindowCondition}
  `));

  const claimedUsers = Number(claimRow?.claimedUsers ?? 0);
  const grantedAmountTotal = toMoneyString(
    claimRow?.grantedAmountTotal ?? 0,
  );

  return {
    window,
    totalUsers,
    completedUsers,
    claimedUsers,
    completionRate: totalUsers > 0 ? completedUsers / totalUsers : 0,
    claimRate: completedUsers > 0 ? claimedUsers / completedUsers : 0,
    grantedAmountTotal,
  };
};

const toAdminRecord = async (
  definition: RewardMissionDefinition,
  totalUsers: number,
): Promise<RewardMissionAdminRecord> => ({
  id: definition.id,
  type: definition.type,
  params: toRecord(definition.params),
  reward: definition.reward,
  isActive: definition.isActive,
  createdAt: definition.createdAt,
  updatedAt: definition.updatedAt,
  metrics: await buildMissionMetrics(definition, totalUsers),
});

export async function listMissionsForAdmin() {
  const [totalUserRows, definitions] = await Promise.all([
    db
      .select({ totalUsers: sql<number>`count(*)` })
      .from(users)
      .limit(1),
    listMissionDefinitions(db),
  ]);
  const totalUsers = Number(totalUserRows[0]?.totalUsers ?? 0);

  return Promise.all(
    definitions.map((definition) =>
      toAdminRecord(definition, totalUsers),
    ),
  );
}

export async function createMission(payload: {
  id: string;
  type: RewardMissionDefinitionType;
  params: unknown;
  reward: string;
  isActive: boolean;
}) {
  const params = parseMissionParams(payload.type, payload.params);
  if (payload.type === "daily_checkin") {
    await ensureSingleDailyCheckInMission(db);
  }

  const existing = await db
    .select({ id: missions.id })
    .from(missions)
    .where(eq(missions.id, payload.id))
    .limit(1);
  if (existing[0]) {
    throw conflictError("Reward mission id already exists.");
  }

  let created;
  try {
    [created] = await db
      .insert(missions)
      .values({
        id: payload.id,
        type: payload.type,
        params: toJsonbLiteral(params),
        reward: payload.reward,
        isActive: payload.isActive,
      })
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error, MISSIONS_PRIMARY_KEY_CONSTRAINT)) {
      throw conflictError("Reward mission id already exists.");
    }
    if (isUniqueConstraintError(error, SINGLE_DAILY_CHECK_IN_CONSTRAINT)) {
      throw conflictError("Only one daily check-in mission can be configured.");
    }
    throw error;
  }

  return {
    id: created.id,
    type: created.type,
    params: toRecord(created.params),
    reward: toMoneyString(created.reward ?? 0),
    isActive: created.isActive,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function updateMission(
  missionId: string,
  payload: Partial<{
    type: RewardMissionDefinitionType;
    params: unknown;
    reward: string;
    isActive: boolean;
  }>,
) {
  const [current] = await db
    .select()
    .from(missions)
    .where(eq(missions.id, missionId))
    .limit(1);
  if (!current) {
    return null;
  }

  const nextType = (payload.type ?? current.type) as RewardMissionDefinitionType;
  const nextParams = parseMissionParams(
    nextType,
    payload.params ?? current.params,
  );
  if (nextType === "daily_checkin") {
    await ensureSingleDailyCheckInMission(db, missionId);
  }

  let updated;
  try {
    [updated] = await db
      .update(missions)
      .set({
        type: nextType,
        params: toJsonbLiteral(nextParams),
        reward: payload.reward ?? current.reward,
        isActive: payload.isActive ?? current.isActive,
        updatedAt: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error, SINGLE_DAILY_CHECK_IN_CONSTRAINT)) {
      throw conflictError("Only one daily check-in mission can be configured.");
    }
    throw error;
  }

  return {
    id: updated.id,
    type: updated.type,
    params: toRecord(updated.params),
    reward: toMoneyString(updated.reward ?? 0),
    isActive: updated.isActive,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function deleteMission(missionId: string) {
  const [deleted] = await db
    .delete(missions)
    .where(eq(missions.id, missionId))
    .returning();

  if (!deleted) {
    return null;
  }

  return {
    id: deleted.id,
    type: deleted.type,
    params: toRecord(deleted.params),
    reward: toMoneyString(deleted.reward ?? 0),
    isActive: deleted.isActive,
    createdAt: deleted.createdAt,
    updatedAt: deleted.updatedAt,
  };
}
