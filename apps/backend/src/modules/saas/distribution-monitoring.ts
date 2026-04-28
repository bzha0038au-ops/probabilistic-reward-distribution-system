import Decimal from "decimal.js";
import { saasDistributionSnapshots } from "@reward/database";
import { sql } from "@reward/database/orm";

import { client, db } from "../../db";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";

const DISTRIBUTION_WINDOW_MS = {
  "1m": 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
} as const;

const DISTRIBUTION_BUCKETS = [
  "zero",
  "gt0_to_lte1",
  "gt1_to_lte5",
  "gt5_to_lte10",
  "gt10_to_lte25",
  "gt25_to_lte100",
  "gt100",
] as const;

const DISTRIBUTION_BUCKET_SCHEME = "payout_amount_v1";
const EXPECTED_PROBABILITY_SCALE = 12;
const SNAPSHOT_RATIO_SCALE = 6;
const activeBreachKeys = new Set<string>();

export type DistributionWindowKey = keyof typeof DISTRIBUTION_WINDOW_MS;
export type DistributionBucket = (typeof DISTRIBUTION_BUCKETS)[number];

type DistributionMonitoringConfig = {
  enabled: boolean;
  minDrawCount: Record<DistributionWindowKey, number>;
  trackingCoverageRatioThreshold: number;
  evDeviationRatioThreshold: number;
  bucketDeviationRatioThreshold: number;
};

type DrawDistributionTelemetry = {
  bucketScheme: typeof DISTRIBUTION_BUCKET_SCHEME;
  actualPayoutBucket: DistributionBucket;
  expectedRewardAmount: string;
  expectedPayoutHistogram: Record<string, string>;
  expectedBucketHistogram: Record<DistributionBucket, string>;
};

type DistributionSourceRow = {
  projectId: number;
  projectSlug: string;
  environment: "sandbox" | "live";
  projectMetadata: unknown;
  createdAt: Date | string;
  rewardAmount: string;
  recordMetadata: unknown;
};

type MutableWindowSnapshot = {
  drawCount: number;
  trackedDrawCount: number;
  actualPayoutSum: Decimal;
  expectedPayoutSum: Decimal;
  actualPayoutHistogram: Map<string, number>;
  expectedPayoutHistogram: Map<string, Decimal>;
  actualBucketHistogram: Map<DistributionBucket, number>;
  expectedBucketHistogram: Map<DistributionBucket, Decimal>;
};

type MutableProjectState = {
  projectId: number;
  projectSlug: string;
  environment: "sandbox" | "live";
  monitoringConfig: DistributionMonitoringConfig;
  windows: Record<DistributionWindowKey, MutableWindowSnapshot>;
};

export type SaasDistributionSnapshot = {
  projectId: number;
  projectSlug: string;
  environment: "sandbox" | "live";
  windowKey: DistributionWindowKey;
  capturedAt: Date;
  windowStart: Date;
  windowEnd: Date;
  drawCount: number;
  trackedDrawCount: number;
  trackingCoverageRatio: number;
  actualPayoutSum: string;
  expectedPayoutSum: string;
  payoutDeviationAmount: string;
  payoutDeviationRatio: number;
  maxBucketDeviationRatio: number;
  actualPayoutHistogram: Record<string, number>;
  expectedPayoutHistogram: Record<string, number>;
  actualBucketHistogram: Record<DistributionBucket, number>;
  expectedBucketHistogram: Record<DistributionBucket, number>;
  breachReasons: Array<"ev_deviation" | "bucket_share_deviation">;
  alertEligible: boolean;
  monitoringConfig: DistributionMonitoringConfig;
};

const DEFAULT_MONITORING_CONFIG: DistributionMonitoringConfig = {
  enabled: true,
  minDrawCount: {
    "1m": 10,
    "1h": 25,
    "24h": 100,
  },
  trackingCoverageRatioThreshold: 0.95,
  evDeviationRatioThreshold: 0.2,
  bucketDeviationRatioThreshold: 0.15,
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readNonNegativeInt = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
};

const readRatio = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
};

const normalizeProbabilityString = (value: Decimal) =>
  value.toFixed(EXPECTED_PROBABILITY_SCALE);

const toSnapshotNumber = (value: Decimal, scale = SNAPSHOT_RATIO_SCALE) =>
  Number(value.toFixed(scale));

const resolveWindowDrawThresholds = (
  value: unknown,
): DistributionMonitoringConfig["minDrawCount"] => {
  const fallback = DEFAULT_MONITORING_CONFIG.minDrawCount;
  if (typeof value === "number" || typeof value === "string") {
    const threshold = readNonNegativeInt(value, fallback["1h"]);
    return {
      "1m": threshold,
      "1h": threshold,
      "24h": threshold,
    };
  }

  const record = asRecord(value);
  if (!record) {
    return fallback;
  }

  return {
    "1m": readNonNegativeInt(record["1m"], fallback["1m"]),
    "1h": readNonNegativeInt(record["1h"], fallback["1h"]),
    "24h": readNonNegativeInt(record["24h"], fallback["24h"]),
  };
};

export const resolveDistributionMonitoringConfig = (
  projectMetadata: unknown,
): DistributionMonitoringConfig => {
  const metadata = asRecord(projectMetadata);
  const configured = asRecord(metadata?.distributionMonitoring);
  if (!configured) {
    return DEFAULT_MONITORING_CONFIG;
  }

  return {
    enabled:
      typeof configured.enabled === "boolean"
        ? configured.enabled
        : DEFAULT_MONITORING_CONFIG.enabled,
    minDrawCount: resolveWindowDrawThresholds(configured.minDrawCount),
    trackingCoverageRatioThreshold: readRatio(
      configured.trackingCoverageRatioThreshold,
      DEFAULT_MONITORING_CONFIG.trackingCoverageRatioThreshold,
    ),
    evDeviationRatioThreshold: readRatio(
      configured.evDeviationRatioThreshold,
      DEFAULT_MONITORING_CONFIG.evDeviationRatioThreshold,
    ),
    bucketDeviationRatioThreshold: readRatio(
      configured.bucketDeviationRatioThreshold,
      DEFAULT_MONITORING_CONFIG.bucketDeviationRatioThreshold,
    ),
  };
};

export const classifyPayoutBucket = (
  payoutAmount: Decimal.Value,
): DistributionBucket => {
  const amount = toDecimal(payoutAmount);
  if (amount.lte(0)) {
    return "zero";
  }
  if (amount.lte(1)) {
    return "gt0_to_lte1";
  }
  if (amount.lte(5)) {
    return "gt1_to_lte5";
  }
  if (amount.lte(10)) {
    return "gt5_to_lte10";
  }
  if (amount.lte(25)) {
    return "gt10_to_lte25";
  }
  if (amount.lte(100)) {
    return "gt25_to_lte100";
  }

  return "gt100";
};

const emptyBucketHistogram = () =>
  Object.fromEntries(
    DISTRIBUTION_BUCKETS.map((bucket) => [bucket, new Decimal(0)]),
  ) as Record<DistributionBucket, Decimal>;

const serializeActualHistogram = (histogram: Map<string, number>) =>
  Object.fromEntries(
    [...histogram.entries()].sort(([left], [right]) =>
      toDecimal(left).cmp(toDecimal(right)),
    ),
  );

const serializeExpectedHistogram = (histogram: Map<string, Decimal>) =>
  Object.fromEntries(
    [...histogram.entries()]
      .sort(([left], [right]) => toDecimal(left).cmp(toDecimal(right)))
      .map(([amount, count]) => [amount, toSnapshotNumber(count)]),
  );

const serializeActualBucketHistogram = (
  histogram: Map<DistributionBucket, number>,
) =>
  Object.fromEntries(
    DISTRIBUTION_BUCKETS.map((bucket) => [bucket, histogram.get(bucket) ?? 0]),
  ) as Record<DistributionBucket, number>;

const serializeExpectedBucketHistogram = (
  histogram: Map<DistributionBucket, Decimal>,
) =>
  Object.fromEntries(
    DISTRIBUTION_BUCKETS.map((bucket) => [
      bucket,
      toSnapshotNumber(histogram.get(bucket) ?? new Decimal(0)),
    ]),
  ) as Record<DistributionBucket, number>;

const buildDistributionTelemetryHistograms = (params: {
  availablePrizes: Array<{
    rewardAmount: string;
    weight: number;
  }>;
  missWeight: number;
}) => {
  const weightedPayouts = new Map<string, Decimal>();
  let totalWeight = new Decimal(0);
  let expectedRewardAmount = new Decimal(0);

  for (const prize of params.availablePrizes) {
    const weight = new Decimal(Math.max(0, prize.weight));
    if (weight.lte(0)) {
      continue;
    }

    const rewardAmount = toMoneyString(prize.rewardAmount);
    totalWeight = totalWeight.plus(weight);
    expectedRewardAmount = expectedRewardAmount.plus(
      toDecimal(rewardAmount).mul(weight),
    );
    weightedPayouts.set(
      rewardAmount,
      (weightedPayouts.get(rewardAmount) ?? new Decimal(0)).plus(weight),
    );
  }

  const missWeight = new Decimal(Math.max(0, params.missWeight));
  if (missWeight.gt(0)) {
    totalWeight = totalWeight.plus(missWeight);
    weightedPayouts.set(
      "0.00",
      (weightedPayouts.get("0.00") ?? new Decimal(0)).plus(missWeight),
    );
  }

  if (totalWeight.lte(0)) {
    return {
      expectedRewardAmount: "0.00",
      expectedPayoutHistogram: {
        "0.00": "1.000000000000",
      },
      expectedBucketHistogram: {
        ...Object.fromEntries(
          DISTRIBUTION_BUCKETS.map((bucket) => [bucket, "0.000000000000"]),
        ),
        zero: "1.000000000000",
      } as Record<DistributionBucket, string>,
    };
  }

  const expectedPayoutHistogram: Record<string, string> = {};
  const expectedBucketHistogram = emptyBucketHistogram();

  for (const [rewardAmount, weight] of weightedPayouts.entries()) {
    const probability = weight.div(totalWeight);
    expectedPayoutHistogram[rewardAmount] = normalizeProbabilityString(
      probability,
    );
    const bucket = classifyPayoutBucket(rewardAmount);
    expectedBucketHistogram[bucket] =
      expectedBucketHistogram[bucket].plus(probability);
  }

  return {
    expectedRewardAmount: expectedRewardAmount.div(totalWeight).toFixed(2),
    expectedPayoutHistogram,
    expectedBucketHistogram: Object.fromEntries(
      DISTRIBUTION_BUCKETS.map((bucket) => [
        bucket,
        normalizeProbabilityString(expectedBucketHistogram[bucket]),
      ]),
    ) as Record<DistributionBucket, string>,
  };
};

export const buildDrawDistributionTelemetry = (params: {
  availablePrizes: Array<{
    rewardAmount: string;
    weight: number;
  }>;
  missWeight: number;
  actualRewardAmount: string;
}): DrawDistributionTelemetry => {
  const expected = buildDistributionTelemetryHistograms(params);

  return {
    bucketScheme: DISTRIBUTION_BUCKET_SCHEME,
    actualPayoutBucket: classifyPayoutBucket(params.actualRewardAmount),
    expectedRewardAmount: expected.expectedRewardAmount,
    expectedPayoutHistogram: expected.expectedPayoutHistogram,
    expectedBucketHistogram: expected.expectedBucketHistogram,
  };
};

const createMutableWindowSnapshot = (): MutableWindowSnapshot => ({
  drawCount: 0,
  trackedDrawCount: 0,
  actualPayoutSum: new Decimal(0),
  expectedPayoutSum: new Decimal(0),
  actualPayoutHistogram: new Map<string, number>(),
  expectedPayoutHistogram: new Map<string, Decimal>(),
  actualBucketHistogram: new Map<DistributionBucket, number>(),
  expectedBucketHistogram: new Map<DistributionBucket, Decimal>(),
});

const parseExpectedHistogram = (
  value: unknown,
): Map<string, Decimal> | null => {
  const histogram = asRecord(value);
  if (!histogram) {
    return null;
  }

  const parsed = new Map<string, Decimal>();
  for (const [amountKey, probabilityValue] of Object.entries(histogram)) {
    const amount = toMoneyString(amountKey);
    const probability =
      typeof probabilityValue === "number" || typeof probabilityValue === "string"
        ? new Decimal(probabilityValue)
        : null;
    if (!probability || !probability.isFinite() || probability.lt(0)) {
      continue;
    }

    parsed.set(amount, probability);
  }

  return parsed;
};

const parseExpectedBucketHistogram = (
  value: unknown,
): Map<DistributionBucket, Decimal> | null => {
  const histogram = asRecord(value);
  if (!histogram) {
    return null;
  }

  const parsed = new Map<DistributionBucket, Decimal>();
  for (const bucket of DISTRIBUTION_BUCKETS) {
    const rawValue = histogram[bucket];
    if (typeof rawValue !== "number" && typeof rawValue !== "string") {
      continue;
    }

    const probability = new Decimal(rawValue);
    if (!probability.isFinite() || probability.lt(0)) {
      continue;
    }

    parsed.set(bucket, probability);
  }

  return parsed;
};

const readTelemetry = (
  value: unknown,
): {
  expectedRewardAmount: Decimal;
  expectedPayoutHistogram: Map<string, Decimal>;
  expectedBucketHistogram: Map<DistributionBucket, Decimal>;
} | null => {
  const metadata = asRecord(value);
  const distribution = asRecord(metadata?.distribution);
  if (
    distribution?.bucketScheme !== DISTRIBUTION_BUCKET_SCHEME ||
    (typeof distribution.expectedRewardAmount !== "string" &&
      typeof distribution.expectedRewardAmount !== "number")
  ) {
    return null;
  }

  const expectedPayoutHistogram = parseExpectedHistogram(
    distribution.expectedPayoutHistogram,
  );
  const expectedBucketHistogram = parseExpectedBucketHistogram(
    distribution.expectedBucketHistogram,
  );
  if (!expectedPayoutHistogram || !expectedBucketHistogram) {
    return null;
  }

  const expectedRewardAmount = new Decimal(distribution.expectedRewardAmount);
  if (!expectedRewardAmount.isFinite() || expectedRewardAmount.lt(0)) {
    return null;
  }

  return {
    expectedRewardAmount,
    expectedPayoutHistogram,
    expectedBucketHistogram,
  };
};

const truncateToMinute = (value: Date) =>
  new Date(Math.floor(value.getTime() / 60_000) * 60_000);

const buildProjectState = (row: DistributionSourceRow): MutableProjectState => ({
  projectId: row.projectId,
  projectSlug: row.projectSlug,
  environment: row.environment,
  monitoringConfig: resolveDistributionMonitoringConfig(row.projectMetadata),
  windows: {
    "1m": createMutableWindowSnapshot(),
    "1h": createMutableWindowSnapshot(),
    "24h": createMutableWindowSnapshot(),
  },
});

export const buildSaasDistributionSnapshots = (
  rows: DistributionSourceRow[],
  now = new Date(),
): SaasDistributionSnapshot[] => {
  const projectStateById = new Map<number, MutableProjectState>();

  for (const row of rows) {
    const createdAt = new Date(row.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }

    let projectState = projectStateById.get(row.projectId);
    if (!projectState) {
      projectState = buildProjectState(row);
      projectStateById.set(row.projectId, projectState);
    }

    const telemetry = readTelemetry(row.recordMetadata);
    const rewardAmount = toMoneyString(row.rewardAmount);
    const actualBucket = classifyPayoutBucket(rewardAmount);

    for (const windowKey of Object.keys(
      DISTRIBUTION_WINDOW_MS,
    ) as DistributionWindowKey[]) {
      const windowMs = DISTRIBUTION_WINDOW_MS[windowKey];
      if (createdAt.getTime() < now.getTime() - windowMs) {
        continue;
      }

      const window = projectState.windows[windowKey];
      window.drawCount += 1;

      if (!telemetry) {
        continue;
      }

      window.trackedDrawCount += 1;
      window.actualPayoutSum = window.actualPayoutSum.plus(rewardAmount);
      window.expectedPayoutSum = window.expectedPayoutSum.plus(
        telemetry.expectedRewardAmount,
      );
      window.actualPayoutHistogram.set(
        rewardAmount,
        (window.actualPayoutHistogram.get(rewardAmount) ?? 0) + 1,
      );
      window.actualBucketHistogram.set(
        actualBucket,
        (window.actualBucketHistogram.get(actualBucket) ?? 0) + 1,
      );

      for (const [amount, probability] of telemetry.expectedPayoutHistogram) {
        window.expectedPayoutHistogram.set(
          amount,
          (window.expectedPayoutHistogram.get(amount) ?? new Decimal(0)).plus(
            probability,
          ),
        );
      }

      for (const [bucket, probability] of telemetry.expectedBucketHistogram) {
        window.expectedBucketHistogram.set(
          bucket,
          (window.expectedBucketHistogram.get(bucket) ?? new Decimal(0)).plus(
            probability,
          ),
        );
      }
    }
  }

  const capturedAt = truncateToMinute(now);
  const snapshots: SaasDistributionSnapshot[] = [];

  for (const projectState of projectStateById.values()) {
    for (const windowKey of Object.keys(
      DISTRIBUTION_WINDOW_MS,
    ) as DistributionWindowKey[]) {
      const window = projectState.windows[windowKey];
      if (window.drawCount === 0) {
        continue;
      }

      const trackingCoverageRatio =
        window.drawCount > 0 ? window.trackedDrawCount / window.drawCount : 0;
      const payoutDeviationAmount = window.actualPayoutSum.minus(
        window.expectedPayoutSum,
      );
      const payoutDeviationRatio = window.expectedPayoutSum.eq(0)
        ? window.actualPayoutSum.eq(0)
          ? new Decimal(0)
          : new Decimal(1)
        : payoutDeviationAmount.div(window.expectedPayoutSum);

      let maxBucketDeviationRatio = new Decimal(0);
      if (window.trackedDrawCount > 0) {
        const denominator = new Decimal(window.trackedDrawCount);
        for (const bucket of DISTRIBUTION_BUCKETS) {
          const actualShare = new Decimal(
            window.actualBucketHistogram.get(bucket) ?? 0,
          ).div(denominator);
          const expectedShare = (
            window.expectedBucketHistogram.get(bucket) ?? new Decimal(0)
          ).div(denominator);
          const deviation = actualShare.minus(expectedShare).abs();
          if (deviation.gt(maxBucketDeviationRatio)) {
            maxBucketDeviationRatio = deviation;
          }
        }
      }

      const monitoringConfig = projectState.monitoringConfig;
      const alertEligible =
        monitoringConfig.enabled &&
        window.trackedDrawCount >= monitoringConfig.minDrawCount[windowKey] &&
        trackingCoverageRatio >=
          monitoringConfig.trackingCoverageRatioThreshold;
      const breachReasons: SaasDistributionSnapshot["breachReasons"] = [];

      if (
        alertEligible &&
        payoutDeviationRatio.abs().gt(monitoringConfig.evDeviationRatioThreshold)
      ) {
        breachReasons.push("ev_deviation");
      }
      if (
        alertEligible &&
        maxBucketDeviationRatio.gt(
          monitoringConfig.bucketDeviationRatioThreshold,
        )
      ) {
        breachReasons.push("bucket_share_deviation");
      }

      snapshots.push({
        projectId: projectState.projectId,
        projectSlug: projectState.projectSlug,
        environment: projectState.environment,
        windowKey,
        capturedAt,
        windowStart: new Date(now.getTime() - DISTRIBUTION_WINDOW_MS[windowKey]),
        windowEnd: now,
        drawCount: window.drawCount,
        trackedDrawCount: window.trackedDrawCount,
        trackingCoverageRatio: toSnapshotNumber(
          new Decimal(trackingCoverageRatio),
        ),
        actualPayoutSum: window.actualPayoutSum.toFixed(2),
        expectedPayoutSum: window.expectedPayoutSum.toFixed(2),
        payoutDeviationAmount: payoutDeviationAmount.toFixed(2),
        payoutDeviationRatio: toSnapshotNumber(payoutDeviationRatio),
        maxBucketDeviationRatio: toSnapshotNumber(maxBucketDeviationRatio),
        actualPayoutHistogram: serializeActualHistogram(
          window.actualPayoutHistogram,
        ),
        expectedPayoutHistogram: serializeExpectedHistogram(
          window.expectedPayoutHistogram,
        ),
        actualBucketHistogram: serializeActualBucketHistogram(
          window.actualBucketHistogram,
        ),
        expectedBucketHistogram: serializeExpectedBucketHistogram(
          window.expectedBucketHistogram,
        ),
        breachReasons,
        alertEligible,
        monitoringConfig,
      });
    }
  }

  return snapshots.sort((left, right) => {
    if (left.projectId !== right.projectId) {
      return left.projectId - right.projectId;
    }

    return left.windowKey.localeCompare(right.windowKey);
  });
};

const loadDistributionSourceRows = async (now: Date) => {
  const windowStart = new Date(now.getTime() - DISTRIBUTION_WINDOW_MS["24h"]);
  const result = await client`
    SELECT
      p.id AS "projectId",
      p.slug AS "projectSlug",
      p.environment,
      p.metadata AS "projectMetadata",
      r.created_at AS "createdAt",
      r.reward_amount AS "rewardAmount",
      r.metadata AS "recordMetadata"
    FROM saas_draw_records AS r
    INNER JOIN saas_projects AS p
      ON p.id = r.project_id
    WHERE r.created_at >= ${windowStart}
  `;

  return readSqlRows<DistributionSourceRow>(result);
};

const syncDistributionBreachLogs = (snapshots: SaasDistributionSnapshot[]) => {
  const nextKeys = new Set<string>();

  for (const snapshot of snapshots) {
    for (const breachReason of snapshot.breachReasons) {
      const key = [
        snapshot.projectId,
        snapshot.windowKey,
        breachReason,
      ].join(":");
      nextKeys.add(key);

      if (activeBreachKeys.has(key)) {
        continue;
      }

      logger.warning("saas payout distribution drift detected", {
        projectId: snapshot.projectId,
        projectSlug: snapshot.projectSlug,
        environment: snapshot.environment,
        windowKey: snapshot.windowKey,
        breachReason,
        drawCount: snapshot.drawCount,
        trackedDrawCount: snapshot.trackedDrawCount,
        trackingCoverageRatio: snapshot.trackingCoverageRatio,
        payoutDeviationRatio: snapshot.payoutDeviationRatio,
        maxBucketDeviationRatio: snapshot.maxBucketDeviationRatio,
      });
    }
  }

  for (const key of activeBreachKeys) {
    if (nextKeys.has(key)) {
      continue;
    }

    const [projectId, windowKey, breachReason] = key.split(":");
    logger.info("saas payout distribution drift resolved", {
      projectId: Number(projectId),
      windowKey,
      breachReason,
    });
  }

  activeBreachKeys.clear();
  for (const key of nextKeys) {
    activeBreachKeys.add(key);
  }
};

const upsertSaasDistributionSnapshots = async (
  snapshots: SaasDistributionSnapshot[],
) => {
  if (snapshots.length === 0) {
    return;
  }

  await db
    .insert(saasDistributionSnapshots)
    .values(
      snapshots.map((snapshot) => ({
        projectId: snapshot.projectId,
        windowKey: snapshot.windowKey,
        capturedAt: snapshot.capturedAt,
        windowStart: snapshot.windowStart,
        windowEnd: snapshot.windowEnd,
        drawCount: snapshot.drawCount,
        trackedDrawCount: snapshot.trackedDrawCount,
        trackingCoverageRatio: snapshot.trackingCoverageRatio.toFixed(6),
        actualPayoutSum: snapshot.actualPayoutSum,
        expectedPayoutSum: snapshot.expectedPayoutSum,
        payoutDeviationAmount: snapshot.payoutDeviationAmount,
        payoutDeviationRatio: snapshot.payoutDeviationRatio.toFixed(6),
        maxBucketDeviationRatio:
          snapshot.maxBucketDeviationRatio.toFixed(6),
        actualPayoutHistogram: snapshot.actualPayoutHistogram,
        expectedPayoutHistogram: snapshot.expectedPayoutHistogram,
        actualBucketHistogram: snapshot.actualBucketHistogram,
        expectedBucketHistogram: snapshot.expectedBucketHistogram,
        breachReasons: snapshot.breachReasons,
        metadata: {
          alertEligible: snapshot.alertEligible,
          bucketScheme: DISTRIBUTION_BUCKET_SCHEME,
          monitoringConfig: {
            enabled: snapshot.monitoringConfig.enabled,
            minDrawCount:
              snapshot.monitoringConfig.minDrawCount[snapshot.windowKey],
            trackingCoverageRatioThreshold:
              snapshot.monitoringConfig.trackingCoverageRatioThreshold,
            evDeviationRatioThreshold:
              snapshot.monitoringConfig.evDeviationRatioThreshold,
            bucketDeviationRatioThreshold:
              snapshot.monitoringConfig.bucketDeviationRatioThreshold,
          },
        },
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [
        saasDistributionSnapshots.projectId,
        saasDistributionSnapshots.windowKey,
        saasDistributionSnapshots.capturedAt,
      ],
      set: {
        windowStart: sql`excluded.window_start`,
        windowEnd: sql`excluded.window_end`,
        drawCount: sql`excluded.draw_count`,
        trackedDrawCount: sql`excluded.tracked_draw_count`,
        trackingCoverageRatio: sql`excluded.tracking_coverage_ratio`,
        actualPayoutSum: sql`excluded.actual_payout_sum`,
        expectedPayoutSum: sql`excluded.expected_payout_sum`,
        payoutDeviationAmount: sql`excluded.payout_deviation_amount`,
        payoutDeviationRatio: sql`excluded.payout_deviation_ratio`,
        maxBucketDeviationRatio: sql`excluded.max_bucket_deviation_ratio`,
        actualPayoutHistogram: sql`excluded.actual_payout_histogram`,
        expectedPayoutHistogram: sql`excluded.expected_payout_histogram`,
        actualBucketHistogram: sql`excluded.actual_bucket_histogram`,
        expectedBucketHistogram: sql`excluded.expected_bucket_histogram`,
        breachReasons: sql`excluded.breach_reasons`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
};

export const refreshSaasDistributionSnapshots = async (now = new Date()) => {
  const rows = await loadDistributionSourceRows(now);
  const snapshots = buildSaasDistributionSnapshots(rows, now);
  await upsertSaasDistributionSnapshots(snapshots);
  syncDistributionBreachLogs(snapshots);
  return snapshots;
};

export const saasDistributionMetricBuckets = [...DISTRIBUTION_BUCKETS];
