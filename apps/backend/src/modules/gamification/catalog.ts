import { missions } from "@reward/database";
import { and, asc, eq, ne } from "@reward/database/orm";
import type {
  RewardMissionDailyCheckInParams,
  RewardMissionDefinitionType,
  RewardMissionMetricThresholdParams,
} from "@reward/shared-types/gamification";
import {
  RewardMissionDailyCheckInParamsSchema,
  RewardMissionMetricThresholdParamsSchema,
} from "@reward/shared-types/gamification";

import { db, type DbClient, type DbTransaction } from "../../db";
import { resolveExperimentConfig } from "../experiments/service";
import { badRequestError, conflictError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { toMoneyString } from "../../shared/money";

type DbExecutor = DbClient | DbTransaction;
type MissionRow = typeof missions.$inferSelect;

type MissionBase<TType extends RewardMissionDefinitionType, TParams> = {
  id: string;
  type: TType;
  params: TParams;
  reward: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sortOrder: number;
};

export type DailyCheckInMissionDefinition = MissionBase<
  "daily_checkin",
  RewardMissionDailyCheckInParams
>;

export type MetricThresholdMissionDefinition = MissionBase<
  "metric_threshold",
  RewardMissionMetricThresholdParams
>;

export type RewardMissionDefinition =
  | DailyCheckInMissionDefinition
  | MetricThresholdMissionDefinition;

const DEFAULT_SORT_ORDER = 100;

const missionSortOrder = (
  params:
    | RewardMissionDailyCheckInParams
    | RewardMissionMetricThresholdParams,
) => params.sortOrder ?? DEFAULT_SORT_ORDER;

const coerceStoredMissionParams = (row: MissionRow) => {
  if (typeof row.params !== "string") {
    return row.params;
  }

  try {
    const parsed = JSON.parse(row.params);
    logger.warning("Coercing stringified reward mission params.", {
      missionId: row.id,
      type: row.type,
    });
    return parsed;
  } catch {
    return row.params;
  }
};

export function parseMissionParams(
  type: "daily_checkin",
  params: unknown,
): RewardMissionDailyCheckInParams;
export function parseMissionParams(
  type: "metric_threshold",
  params: unknown,
): RewardMissionMetricThresholdParams;
export function parseMissionParams(
  type: RewardMissionDefinitionType,
  params: unknown,
) {
  if (type === "daily_checkin") {
    const parsed = RewardMissionDailyCheckInParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw badRequestError("Invalid mission params.", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }
    return parsed.data;
  }

  if (type === "metric_threshold") {
    const parsed = RewardMissionMetricThresholdParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw badRequestError("Invalid mission params.", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }
    return parsed.data;
  }

  throw badRequestError("Unsupported mission type.");
};

const toMissionDefinition = (row: MissionRow): RewardMissionDefinition | null => {
  try {
    const normalizedParams = coerceStoredMissionParams(row);

    if (row.type === "daily_checkin") {
      const params =
        RewardMissionDailyCheckInParamsSchema.parse(normalizedParams);
      return {
        id: row.id,
        type: "daily_checkin",
        params,
        reward: toMoneyString(row.reward ?? 0),
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sortOrder: missionSortOrder(params),
      };
    }

    if (row.type === "metric_threshold") {
      const params =
        RewardMissionMetricThresholdParamsSchema.parse(normalizedParams);
      return {
        id: row.id,
        type: "metric_threshold",
        params,
        reward: toMoneyString(row.reward ?? 0),
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sortOrder: missionSortOrder(params),
      };
    }

    logger.warning("Skipping reward mission with unsupported type.", {
      missionId: row.id,
      type: row.type,
    });
    return null;
  } catch (error) {
    logger.warning("Skipping invalid reward mission definition.", {
      missionId: row.id,
      type: row.type,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
};

export async function listMissionDefinitions(
  executor: DbExecutor = db,
): Promise<RewardMissionDefinition[]> {
  const rows = await executor
    .select()
    .from(missions)
    .orderBy(asc(missions.createdAt), asc(missions.id));

  return rows
    .map((row) => toMissionDefinition(row))
    .filter((row): row is RewardMissionDefinition => row !== null)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.id.localeCompare(right.id);
    });
}

export async function resolveMissionDefinitionsForUser(
  userId: number,
  executor: DbExecutor = db,
): Promise<RewardMissionDefinition[]> {
  const definitions = await listMissionDefinitions(executor);

  const resolvedDefinitions = await Promise.all(
    definitions.map(async (definition) => {
      if (definition.type === "daily_checkin") {
        const { config } = await resolveExperimentConfig({
          userId,
          config: definition.params,
          executor,
        });
        const params = parseMissionParams("daily_checkin", config);
        return {
          ...definition,
          params,
          sortOrder: missionSortOrder(params),
        } satisfies DailyCheckInMissionDefinition;
      }

      const { config } = await resolveExperimentConfig({
        userId,
        config: definition.params,
        executor,
      });
      const params = parseMissionParams("metric_threshold", config);
      return {
        ...definition,
        params,
        sortOrder: missionSortOrder(params),
      } satisfies MetricThresholdMissionDefinition;
    }),
  );

  return resolvedDefinitions.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

export async function ensureSingleDailyCheckInMission(
  executor: DbExecutor,
  missionIdToExclude?: string,
) {
  const rows = await executor
    .select({ id: missions.id })
    .from(missions)
    .where(
      missionIdToExclude
        ? and(
            eq(missions.type, "daily_checkin"),
            ne(missions.id, missionIdToExclude),
          )
        : eq(missions.type, "daily_checkin"),
    );

  const hasConflictingDailyMission = rows.length > 0;

  if (hasConflictingDailyMission) {
    throw conflictError("Only one daily check-in mission can be configured.");
  }
}
