import { randomInt } from "node:crypto";
import {
  experimentAssignments,
  experiments,
} from "@reward/database";
import { and, eq } from "@reward/database/orm";
import {
  ExperimentBindingSchema,
  ExperimentStatusSchema,
  ExperimentVariantDefinitionSchema,
  type ExperimentPayload,
  type ExperimentVariantResponse,
} from "@reward/shared-types/experiments";

import { db, type DbClient, type DbTransaction } from "../../db";
import { logger } from "../../shared/logger";

type DbExecutor = DbClient | DbTransaction;
type ExperimentRow = typeof experiments.$inferSelect;
type ExperimentAssignmentRow = typeof experimentAssignments.$inferSelect;

export type ExperimentSubject = {
  type: string;
  key: string;
};

export const USER_EXPERIMENT_SUBJECT_TYPE = "user";
export const SAAS_PROJECT_PLAYER_EXPERIMENT_SUBJECT_TYPE =
  "saas_project_player";

type NormalizedVariant = {
  key: string;
  weight: number;
  payload: Record<string, unknown>;
};

type NormalizedExperiment = {
  id: number;
  key: string;
  status: "active" | "paused";
  defaultVariantKey: string;
  variants: NormalizedVariant[];
};

type ResolveExperimentConfigParams<TConfig extends Record<string, unknown>> =
  | {
      userId: number;
      config: TConfig;
      executor?: DbExecutor;
    }
  | {
      subject: ExperimentSubject;
      config: TConfig;
      executor?: DbExecutor;
    };

type ResolveExperimentConfigResult<TConfig extends Record<string, unknown>> = {
  config: TConfig;
  variant: ExperimentVariantResponse | null;
};

const FALLBACK_VARIANT_KEY = "control";

export const buildUserExperimentSubject = (
  userId: number,
): ExperimentSubject => ({
  type: USER_EXPERIMENT_SUBJECT_TYPE,
  key: String(userId),
});

export const buildSaasProjectPlayerExperimentSubject = (
  projectId: number,
  externalPlayerId: string,
): ExperimentSubject => ({
  type: SAAS_PROJECT_PLAYER_EXPERIMENT_SUBJECT_TYPE,
  key: `${projectId}:${externalPlayerId}`,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? Object.fromEntries(Object.entries(value)) : {};

const cloneValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
    );
  }

  return value;
};

const deepMergeRecords = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const output = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, cloneValue(value)]),
  );

  for (const [key, value] of Object.entries(patch)) {
    const existing = output[key];
    output[key] =
      isRecord(existing) && isRecord(value)
        ? deepMergeRecords(existing, value)
        : cloneValue(value);
  }

  return output;
};

const coerceStoredVariants = (row: ExperimentRow) => {
  if (typeof row.variants !== "string") {
    return row.variants;
  }

  try {
    const parsed = JSON.parse(row.variants);
    logger.warning("Coercing stringified experiment variants.", {
      experimentKey: row.key,
    });
    return parsed;
  } catch {
    return row.variants;
  }
};

const normalizeExperimentRow = (
  row: ExperimentRow,
): NormalizedExperiment | null => {
  const parsedStatus = ExperimentStatusSchema.safeParse(row.status);
  const parsedVariants = ExperimentVariantDefinitionSchema.array().safeParse(
    coerceStoredVariants(row),
  );

  if (!parsedStatus.success || !parsedVariants.success) {
    logger.warning("Skipping invalid experiment definition.", {
      experimentKey: row.key,
      statusError: parsedStatus.success
        ? null
        : parsedStatus.error.issues.map((issue) => issue.message),
      variantError: parsedVariants.success
        ? null
        : parsedVariants.error.issues.map((issue) => issue.message),
    });
    return null;
  }

  return {
    id: row.id,
    key: row.key,
    status: parsedStatus.data,
    defaultVariantKey: row.defaultVariantKey,
    variants: parsedVariants.data.map((variant) => ({
      key: variant.key,
      weight: variant.weight,
      payload: toRecord(variant.payload),
    })),
  };
};

const findVariantByKey = (
  experiment: NormalizedExperiment,
  variantKey: string,
) => experiment.variants.find((variant) => variant.key === variantKey) ?? null;

const resolveDefaultVariant = (experiment: NormalizedExperiment) =>
  findVariantByKey(experiment, experiment.defaultVariantKey) ??
  experiment.variants[0] ??
  null;

const pickWeightedVariant = (experiment: NormalizedExperiment) => {
  const fallback = resolveDefaultVariant(experiment);
  const totalWeight = experiment.variants.reduce(
    (sum, variant) => sum + variant.weight,
    0,
  );

  if (!fallback || totalWeight <= 0) {
    return fallback;
  }

  let cursor = randomInt(totalWeight);
  for (const variant of experiment.variants) {
    cursor -= variant.weight;
    if (cursor < 0) {
      return variant;
    }
  }

  return fallback;
};

const buildVariantResponse = (params: {
  expKey: string;
  variantKey: string;
  payload?: Record<string, unknown>;
  source: ExperimentVariantResponse["source"];
  assignedAt: Date | null;
}): ExperimentVariantResponse => ({
  expKey: params.expKey,
  variantKey: params.variantKey,
  payload: params.payload ?? {},
  source: params.source,
  assignedAt: params.assignedAt,
});

const buildFallbackVariantResponse = (
  expKey: string,
  source: ExperimentVariantResponse["source"],
): ExperimentVariantResponse =>
  buildVariantResponse({
    expKey,
    variantKey: FALLBACK_VARIANT_KEY,
    source,
    assignedAt: null,
  });

const readExperiment = async (
  executor: DbExecutor,
  expKey: string,
): Promise<NormalizedExperiment | null> => {
  const [row] = await executor
    .select()
    .from(experiments)
    .where(eq(experiments.key, expKey))
    .limit(1);

  return row ? normalizeExperimentRow(row) : null;
};

const readAssignment = async (
  executor: DbExecutor,
  experimentId: number,
  subject: ExperimentSubject,
) =>
  executor
    .select()
    .from(experimentAssignments)
    .where(
      and(
        eq(experimentAssignments.experimentId, experimentId),
        eq(experimentAssignments.subjectType, subject.type),
        eq(experimentAssignments.subjectKey, subject.key),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

const resolveExperimentSubject = <
  TConfig extends Record<string, unknown>,
>(
  params: ResolveExperimentConfigParams<TConfig>,
): ExperimentSubject =>
  "subject" in params
    ? params.subject
    : buildUserExperimentSubject(params.userId);

const resolveAssignedVariant = async (params: {
  executor: DbExecutor;
  experiment: NormalizedExperiment;
  assignment: ExperimentAssignmentRow;
}) => {
  const { executor, experiment, assignment } = params;
  const storedVariant = findVariantByKey(experiment, assignment.variantKey);
  if (storedVariant) {
    return buildVariantResponse({
      expKey: experiment.key,
      variantKey: storedVariant.key,
      payload: storedVariant.payload,
      source: "assignment",
      assignedAt: assignment.assignedAt,
    });
  }

  const fallbackVariant = resolveDefaultVariant(experiment);
  if (!fallbackVariant) {
    return buildFallbackVariantResponse(experiment.key, "assignment");
  }

  await executor
    .update(experimentAssignments)
    .set({
      variantKey: fallbackVariant.key,
      updatedAt: new Date(),
    })
    .where(eq(experimentAssignments.id, assignment.id));

  return buildVariantResponse({
    expKey: experiment.key,
    variantKey: fallbackVariant.key,
    payload: fallbackVariant.payload,
    source: "assignment",
    assignedAt: assignment.assignedAt,
  });
};

export const mergeExperimentPayload = <TConfig extends Record<string, unknown>>(
  base: TConfig,
  payload: ExperimentPayload,
): TConfig => deepMergeRecords(base, payload) as TConfig;

export async function getVariantForSubject(
  subject: ExperimentSubject,
  expKey: string,
  executor: DbExecutor = db,
): Promise<ExperimentVariantResponse> {
  const experiment = await readExperiment(executor, expKey);
  if (!experiment) {
    return buildFallbackVariantResponse(expKey, "missing");
  }

  const defaultVariant = resolveDefaultVariant(experiment);
  if (experiment.status !== "active") {
    return defaultVariant
      ? buildVariantResponse({
          expKey: experiment.key,
          variantKey: defaultVariant.key,
          payload: defaultVariant.payload,
          source: "inactive",
          assignedAt: null,
        })
      : buildFallbackVariantResponse(experiment.key, "inactive");
  }

  const existingAssignment = await readAssignment(
    executor,
    experiment.id,
    subject,
  );
  if (existingAssignment) {
    return resolveAssignedVariant({
      executor,
      experiment,
      assignment: existingAssignment,
    });
  }

  const selectedVariant = pickWeightedVariant(experiment) ?? defaultVariant;
  if (!selectedVariant) {
    return buildFallbackVariantResponse(experiment.key, "default");
  }

  await executor
    .insert(experimentAssignments)
    .values({
      experimentId: experiment.id,
      subjectType: subject.type,
      subjectKey: subject.key,
      variantKey: selectedVariant.key,
    })
    .onConflictDoNothing();

  const storedAssignment = await readAssignment(
    executor,
    experiment.id,
    subject,
  );
  if (storedAssignment) {
    return resolveAssignedVariant({
      executor,
      experiment,
      assignment: storedAssignment,
    });
  }

  return buildVariantResponse({
    expKey: experiment.key,
    variantKey: selectedVariant.key,
    payload: selectedVariant.payload,
    source: "default",
    assignedAt: null,
  });
}

export async function getVariant(
  userId: number,
  expKey: string,
  executor: DbExecutor = db,
): Promise<ExperimentVariantResponse> {
  return getVariantForSubject(
    buildUserExperimentSubject(userId),
    expKey,
    executor,
  );
}

export async function resolveExperimentConfig<
  TConfig extends Record<string, unknown>,
>(
  params: ResolveExperimentConfigParams<TConfig>,
): Promise<ResolveExperimentConfigResult<TConfig>> {
  const normalizedConfig = toRecord(params.config) as TConfig;
  const binding = ExperimentBindingSchema.safeParse(
    Reflect.get(normalizedConfig, "experiment"),
  );

  if (!binding.success) {
    return {
      config: normalizedConfig,
      variant: null,
    };
  }

  const baseConfig = { ...normalizedConfig } as Record<string, unknown>;
  Reflect.deleteProperty(baseConfig, "experiment");
  const variant = await getVariantForSubject(
    resolveExperimentSubject(params),
    binding.data.expKey,
    params.executor ?? db,
  );

  return {
    config: mergeExperimentPayload(baseConfig as TConfig, variant.payload),
    variant,
  };
}
