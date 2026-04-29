import { saasProjects } from "@reward/database";
import { and, eq } from "@reward/database/orm";
import type {
  SaaSEnvironment,
  SaasProjectStrategy,
} from "@reward/shared-types/saas";

import { db, type DbClient, type DbTransaction } from "../../db";
import {
  deleteCacheKeys,
  readJsonCache,
  writeJsonCache,
} from "../../shared/cache";

export type SaasProjectConfigRow = {
  id: number;
  slug: string;
  name: string;
  environment: SaaSEnvironment;
  currency: string;
  drawCost: string;
  strategy: SaasProjectStrategy;
  strategyParams: Record<string, unknown>;
  fairnessEpochSeconds: number;
  maxDrawCount: number;
  missWeight: number;
  apiRateLimitBurst: number;
  apiRateLimitHourly: number;
  apiRateLimitDaily: number;
  metadata: Record<string, unknown> | null;
};

type ProjectConfigExecutor = DbClient | DbTransaction;

const SAAS_PROJECT_CONFIG_CACHE_TTL_SECONDS = 300;

const PROJECT_ENVIRONMENTS = new Set<SaaSEnvironment>(["sandbox", "live"]);

const buildProjectConfigCacheKey = (
  projectId: number,
  environment: SaaSEnvironment,
) => `saas:project-config:${environment}:${projectId}`;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseCachedProjectConfig = (
  value: unknown,
): SaasProjectConfigRow | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = Reflect.get(value, "id");
  const slug = Reflect.get(value, "slug");
  const name = Reflect.get(value, "name");
  const environment = Reflect.get(value, "environment");
  const currency = Reflect.get(value, "currency");
  const drawCost = Reflect.get(value, "drawCost");
  const strategy = Reflect.get(value, "strategy");
  const strategyParams = Reflect.get(value, "strategyParams");
  const fairnessEpochSeconds = Reflect.get(value, "fairnessEpochSeconds");
  const maxDrawCount = Reflect.get(value, "maxDrawCount");
  const missWeight = Reflect.get(value, "missWeight");
  const apiRateLimitBurst = Reflect.get(value, "apiRateLimitBurst");
  const apiRateLimitHourly = Reflect.get(value, "apiRateLimitHourly");
  const apiRateLimitDaily = Reflect.get(value, "apiRateLimitDaily");
  const metadata = Reflect.get(value, "metadata");

  if (
    typeof id !== "number" ||
    typeof slug !== "string" ||
    typeof name !== "string" ||
    typeof environment !== "string" ||
    !PROJECT_ENVIRONMENTS.has(environment as SaaSEnvironment) ||
    typeof currency !== "string" ||
    typeof drawCost !== "string" ||
    typeof strategy !== "string" ||
    !isObjectRecord(strategyParams) ||
    typeof fairnessEpochSeconds !== "number" ||
    typeof maxDrawCount !== "number" ||
    typeof missWeight !== "number" ||
    typeof apiRateLimitBurst !== "number" ||
    typeof apiRateLimitHourly !== "number" ||
    typeof apiRateLimitDaily !== "number" ||
    (metadata !== null && metadata !== undefined && !isObjectRecord(metadata))
  ) {
    return null;
  }

  return {
    id,
    slug,
    name,
    environment: environment as SaaSEnvironment,
    currency,
    drawCost,
    strategy: strategy as SaasProjectStrategy,
    strategyParams,
    fairnessEpochSeconds,
    maxDrawCount,
    missWeight,
    apiRateLimitBurst,
    apiRateLimitHourly,
    apiRateLimitDaily,
    metadata: (metadata as Record<string, unknown> | null | undefined) ?? null,
  };
};

export const loadSaasProjectConfigFromDb = async (
  executor: ProjectConfigExecutor,
  projectId: number,
  environment: SaaSEnvironment,
) => {
  const rows = await executor
    .select({
      id: saasProjects.id,
      slug: saasProjects.slug,
      name: saasProjects.name,
      environment: saasProjects.environment,
      currency: saasProjects.currency,
      drawCost: saasProjects.drawCost,
      strategy: saasProjects.strategy,
      strategyParams: saasProjects.strategyParams,
      fairnessEpochSeconds: saasProjects.fairnessEpochSeconds,
      maxDrawCount: saasProjects.maxDrawCount,
      missWeight: saasProjects.missWeight,
      apiRateLimitBurst: saasProjects.apiRateLimitBurst,
      apiRateLimitHourly: saasProjects.apiRateLimitHourly,
      apiRateLimitDaily: saasProjects.apiRateLimitDaily,
      metadata: saasProjects.metadata,
    })
    .from(saasProjects)
    .where(
      and(
        eq(saasProjects.id, projectId),
        eq(saasProjects.environment, environment),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    environment: row.environment,
    currency: row.currency,
    drawCost: String(row.drawCost),
    strategy: row.strategy,
    strategyParams: isObjectRecord(row.strategyParams)
      ? row.strategyParams
      : {},
    fairnessEpochSeconds: Number(row.fairnessEpochSeconds ?? 0),
    maxDrawCount: Number(row.maxDrawCount ?? 0),
    missWeight: Number(row.missWeight ?? 0),
    apiRateLimitBurst: Number(row.apiRateLimitBurst ?? 0),
    apiRateLimitHourly: Number(row.apiRateLimitHourly ?? 0),
    apiRateLimitDaily: Number(row.apiRateLimitDaily ?? 0),
    metadata: isObjectRecord(row.metadata) ? row.metadata : null,
  } satisfies SaasProjectConfigRow;
};

export const getCachedSaasProjectConfig = async (
  projectId: number,
  environment: SaaSEnvironment,
) => {
  const cacheKey = buildProjectConfigCacheKey(projectId, environment);
  const cached = await readJsonCache(cacheKey, parseCachedProjectConfig);
  if (cached) {
    return cached;
  }

  const row = await loadSaasProjectConfigFromDb(db, projectId, environment);
  if (row) {
    await writeJsonCache(
      cacheKey,
      row,
      SAAS_PROJECT_CONFIG_CACHE_TTL_SECONDS,
    );
  }

  return row;
};

export const invalidateSaasProjectConfigCache = async (params: {
  projectId: number;
  environment: SaaSEnvironment;
}) => {
  await deleteCacheKeys([
    buildProjectConfigCacheKey(params.projectId, params.environment),
  ]);
};
