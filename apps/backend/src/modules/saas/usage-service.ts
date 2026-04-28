import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { SaasTenantUsageDashboard } from "@reward/shared-types/saas";
import {
  saasDrawRecords,
  saasProjects,
  saasTenants,
  saasUsageEvents,
} from "@reward/database";
import { and, eq, gte, gt, inArray, sql } from "@reward/database/orm";

import { db } from "../../db";
import { notFoundError } from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { getSaasUsageAlertConfig } from "../system/service";
import { type SaasAdminActor, assertTenantCapability } from "./access";
import { toSaasTenant } from "./records";

const REALTIME_WINDOW_MINUTES = 60;
const PAYOUT_HISTOGRAM_WINDOW_HOURS = 24;

const PAYOUT_HISTOGRAM_BINS = [
  { label: "0 - 0.99", min: new Decimal(0), max: new Decimal(1) },
  { label: "1 - 4.99", min: new Decimal(1), max: new Decimal(5) },
  { label: "5 - 9.99", min: new Decimal(5), max: new Decimal(10) },
  { label: "10 - 24.99", min: new Decimal(10), max: new Decimal(25) },
  { label: "25 - 49.99", min: new Decimal(25), max: new Decimal(50) },
  { label: "50 - 99.99", min: new Decimal(50), max: new Decimal(100) },
  { label: "100+", min: new Decimal(100), max: null },
] as const;

type MinuteBucketRow = {
  minuteStart: Date | string;
  requestCount: number | string;
  blockedCount: number | string;
};

type UsageEventRealtimeRow = {
  createdAt: Date | string;
  metadata: Record<string, unknown> | null;
};

type LastRequestRow = {
  lastRequestAt: Date | string | null;
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMetric = (value: number) => Number(value.toFixed(2));

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const truncateToMinute = (value: Date) => {
  const result = new Date(value);
  result.setSeconds(0, 0);
  return result;
};

export async function getSaasTenantUsageDashboard(
  tenantSlug: string,
  actor?: SaasAdminActor,
): Promise<SaasTenantUsageDashboard> {
  const normalizedSlug = tenantSlug.trim().toLowerCase();
  if (!normalizedSlug) {
    throw notFoundError("Tenant not found.", {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  const [tenant] = await db
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.slug, normalizedSlug))
    .limit(1);

  if (!tenant) {
    throw notFoundError("Tenant not found.", {
      code: API_ERROR_CODES.TENANT_NOT_FOUND,
    });
  }

  await assertTenantCapability(actor ?? null, tenant.id, "tenant:read");

  const realtimeSince = new Date(
    Date.now() - REALTIME_WINDOW_MINUTES * 60 * 1000,
  );
  const payoutSince = new Date(
    Date.now() - PAYOUT_HISTOGRAM_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const [projects, thresholds, realtimeUsageEvents, lastRequestResult] =
    await Promise.all([
      db
        .select({
          id: saasProjects.id,
          slug: saasProjects.slug,
          name: saasProjects.name,
          environment: saasProjects.environment,
          status: saasProjects.status,
        })
        .from(saasProjects)
        .where(eq(saasProjects.tenantId, tenant.id)),
      getSaasUsageAlertConfig(db),
      db
        .select({
          createdAt: saasUsageEvents.createdAt,
          metadata: saasUsageEvents.metadata,
        })
        .from(saasUsageEvents)
        .where(
          and(
            eq(saasUsageEvents.tenantId, tenant.id),
            gte(saasUsageEvents.createdAt, realtimeSince),
          ),
        ),
      db.execute(sql`
        SELECT max(${saasUsageEvents.createdAt}) AS "lastRequestAt"
        FROM ${saasUsageEvents}
        WHERE ${saasUsageEvents.tenantId} = ${tenant.id}
      `),
    ]);

  const projectIds = projects.map((project) => project.id);
  const payoutRows =
    projectIds.length > 0
      ? await db
          .select({
            rewardAmount: saasDrawRecords.rewardAmount,
          })
          .from(saasDrawRecords)
          .where(
            and(
              inArray(saasDrawRecords.projectId, projectIds),
              gt(saasDrawRecords.rewardAmount, "0"),
              gte(saasDrawRecords.createdAt, payoutSince),
            ),
          )
      : [];

  const lastRequestRow = readSqlRows<LastRequestRow>(lastRequestResult)[0];
  const minuteBucketMap = new Map<string, MinuteBucketRow>();
  const realtimeWindowEnd = truncateToMinute(new Date());
  const realtimeWindowStart = new Date(
    realtimeWindowEnd.getTime() - (REALTIME_WINDOW_MINUTES - 1) * 60_000,
  );

  for (let offset = 0; offset < REALTIME_WINDOW_MINUTES; offset += 1) {
    const minuteStart = new Date(realtimeWindowStart.getTime() + offset * 60_000);
    minuteBucketMap.set(minuteStart.toISOString(), {
      minuteStart,
      requestCount: 0,
      blockedCount: 0,
    });
  }

  for (const row of realtimeUsageEvents as UsageEventRealtimeRow[]) {
    const createdAt = normalizeDate(row.createdAt);
    if (!createdAt) {
      continue;
    }

    const minuteStart = truncateToMinute(createdAt);
    const existing = minuteBucketMap.get(minuteStart.toISOString());
    if (!existing) {
      continue;
    }

    existing.requestCount = toNumber(existing.requestCount) + 1;
    existing.blockedCount =
      toNumber(existing.blockedCount) +
      (Reflect.get(row.metadata ?? {}, "antiExploitBlocked") === true ? 1 : 0);
  }

  const minuteRows = [...minuteBucketMap.values()];

  const minuteQps = minuteRows.map((row) => {
    const requestCount = toNumber(row.requestCount);
    const antiExploitBlockedCount = toNumber(row.blockedCount);
    const successCount = Math.max(requestCount - antiExploitBlockedCount, 0);
    const qps = roundMetric(requestCount / 60);
    const antiExploitRatePct =
      requestCount > 0
        ? roundMetric((antiExploitBlockedCount / requestCount) * 100)
        : 0;

    return {
      minuteStart: normalizeDate(row.minuteStart) ?? new Date(),
      requestCount,
      successCount,
      antiExploitBlockedCount,
      qps,
      antiExploitRatePct,
    };
  });

  const totalRequests = minuteQps.reduce(
    (sum, bucket) => sum + bucket.requestCount,
    0,
  );
  const antiExploitBlockedRequests = minuteQps.reduce(
    (sum, bucket) => sum + bucket.antiExploitBlockedCount,
    0,
  );
  const successfulRequests = Math.max(
    totalRequests - antiExploitBlockedRequests,
    0,
  );
  const antiExploitRatePct =
    totalRequests > 0
      ? roundMetric((antiExploitBlockedRequests / totalRequests) * 100)
      : 0;
  const maxMinuteQps = minuteQps.reduce(
    (max, bucket) => Math.max(max, bucket.qps),
    0,
  );

  const totalPayoutAmount = payoutRows.reduce(
    (sum, row) => sum.plus(row.rewardAmount ?? 0),
    new Decimal(0),
  );
  const maxSinglePayoutAmount = payoutRows.reduce(
    (max, row) => Decimal.max(max, new Decimal(row.rewardAmount ?? 0)),
    new Decimal(0),
  );

  const payoutHistogram = PAYOUT_HISTOGRAM_BINS.map((bucket) => {
    const count = payoutRows.reduce((sum, row) => {
      const amount = new Decimal(row.rewardAmount ?? 0);
      const inBucket =
        bucket.max === null
          ? amount.gte(bucket.min)
          : amount.gte(bucket.min) && amount.lt(bucket.max);
      return inBucket ? sum + 1 : sum;
    }, 0);

    return {
      label: bucket.label,
      minAmount: bucket.min.toFixed(2),
      maxAmount: bucket.max ? bucket.max.minus(0.01).toFixed(2) : null,
      count,
    };
  });

  const qpsThreshold = roundMetric(thresholds.maxMinuteQps.toNumber());
  const antiExploitThreshold = roundMetric(
    thresholds.maxAntiExploitRatePct.toNumber(),
  );
  const payoutThreshold = toMoneyString(thresholds.maxSinglePayoutAmount);

  return {
    tenant: toSaasTenant(tenant),
    projects,
    windows: {
      realtimeMinutes: REALTIME_WINDOW_MINUTES,
      payoutHistogramHours: PAYOUT_HISTOGRAM_WINDOW_HOURS,
    },
    summary: {
      totalRequests,
      successfulRequests,
      antiExploitBlockedRequests,
      antiExploitRatePct,
      totalPayoutAmount: totalPayoutAmount.toFixed(2),
      payoutCount: payoutRows.length,
      maxMinuteQps: roundMetric(maxMinuteQps),
      maxSinglePayoutAmount: maxSinglePayoutAmount.toFixed(2),
      lastRequestAt: normalizeDate(lastRequestRow?.lastRequestAt),
    },
    thresholds: {
      maxMinuteQps: qpsThreshold,
      maxSinglePayoutAmount: payoutThreshold,
      maxAntiExploitRatePct: antiExploitThreshold,
    },
    alerts: {
      qps: {
        active: qpsThreshold > 0 && maxMinuteQps >= qpsThreshold,
        threshold: qpsThreshold,
        current: roundMetric(maxMinuteQps),
      },
      payout: {
        active:
          thresholds.maxSinglePayoutAmount.gt(0) &&
          maxSinglePayoutAmount.gte(thresholds.maxSinglePayoutAmount),
        threshold: payoutThreshold,
        current: maxSinglePayoutAmount.toFixed(2),
      },
      antiExploit: {
        active:
          antiExploitThreshold > 0 &&
          antiExploitRatePct >= antiExploitThreshold,
        threshold: antiExploitThreshold,
        current: antiExploitRatePct,
      },
    },
    minuteQps,
    payoutHistogram,
  };
}
