import {
  saasOutboundWebhookDeliveries,
  saasStatusMinutes,
  saasStripeWebhookEvents,
  saasUsageEvents,
} from '@reward/database';
import { asc, gte, sql } from '@reward/database/orm';
import type {
  PrizeEngineApiKeyScope,
  SaaSEnvironment,
} from '@reward/shared-types/saas';
import type {
  SaasPublicStatusPage,
  SaasStatusLevel,
  SaasStatusMinute,
  SaasStatusThresholds,
} from '@reward/shared-types/saas-status';

import { db } from '../../db';
import { getConfig } from '../../shared/config';
import { readSqlRows } from '../../shared/sql-result';
import { getSaasStatusConfig } from '../system/service';
import {
  SAAS_STATUS_CURRENT_WINDOW_MINUTES,
  SAAS_STATUS_RECENT_MINUTES,
  SAAS_STATUS_REQUEST_REFERENCE_TYPE,
  SAAS_STATUS_REQUEST_TELEMETRY_KIND,
  SAAS_STATUS_SUMMARY_WINDOW_MINUTES,
} from './constants';

type StatusThresholdPair = {
  degraded: number;
  outage: number;
};

type StatusConfig = {
  apiErrorRatePct: StatusThresholdPair;
  apiP95Ms: StatusThresholdPair;
  workerLagMs: StatusThresholdPair;
  monthlySlaTargetPct: number;
};

type ReadyQueueStats = {
  readyCount: number;
  lagMs: number;
};

type RequestMinuteStats = {
  totalRequestCount: number | string;
  availabilityEligibleRequestCount: number | string;
  availabilityErrorCount: number | string;
  errorRatePct: number | string;
  apiP95Ms: number | string;
};

type MonthlySlaRow = {
  observedMinutes: number | string;
  operationalMinutes: number | string;
  degradedMinutes: number | string;
  outageMinutes: number | string;
  trackingStartedAt: Date | string | null;
};

const STATUS_RANK: Record<SaasStatusLevel, number> = {
  operational: 0,
  degraded: 1,
  outage: 2,
};

const toNumber = (
  value: number | string | { toString(): string } | null | undefined
) => {
  const normalized =
    typeof value === 'object' && value !== null ? value.toString() : value;
  const parsed = Number(normalized ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMetric = (value: number, digits = 2) =>
  Number(value.toFixed(digits));

const startOfMinute = (value: Date) => {
  const result = new Date(value);
  result.setSeconds(0, 0);
  return result;
};

const startOfMonth = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0)
  );

const addMinutes = (value: Date, minutes: number) =>
  new Date(value.getTime() + minutes * 60_000);

const minuteDiff = (start: Date, end: Date) =>
  Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toTimestampParam = (value: Date) => value.toISOString();

export const worstSaasStatusLevel = (levels: SaasStatusLevel[]) =>
  levels.reduce<SaasStatusLevel>((worst, current) => {
    return STATUS_RANK[current] > STATUS_RANK[worst] ? current : worst;
  }, 'operational');

export const resolveSaasMetricStatus = (
  value: number,
  thresholds: StatusThresholdPair
): SaasStatusLevel => {
  if (value >= thresholds.outage) {
    return 'outage';
  }

  if (value >= thresholds.degraded) {
    return 'degraded';
  }

  return 'operational';
};

export const resolveSaasApiStatus = (
  errorRatePct: number,
  apiP95Ms: number,
  thresholds: Pick<StatusConfig, 'apiErrorRatePct' | 'apiP95Ms'>
) =>
  worstSaasStatusLevel([
    resolveSaasMetricStatus(errorRatePct, thresholds.apiErrorRatePct),
    resolveSaasMetricStatus(apiP95Ms, thresholds.apiP95Ms),
  ]);

export const resolveSaasWorkerStatus = (
  workerLagMs: number,
  thresholds: Pick<StatusConfig, 'workerLagMs'>
) => resolveSaasMetricStatus(workerLagMs, thresholds.workerLagMs);

export const calculateObservedSlaPct = (
  operationalMinutes: number,
  observedMinutes: number
) =>
  observedMinutes > 0
    ? roundMetric((operationalMinutes / observedMinutes) * 100, 3)
    : 100;

const toThresholdResponse = (config: StatusConfig): SaasStatusThresholds => ({
  apiErrorRatePct: config.apiErrorRatePct,
  apiP95Ms: config.apiP95Ms,
  workerLagMs: config.workerLagMs,
  monthlySlaTargetPct: config.monthlySlaTargetPct,
});

const loadStatusConfig = async (): Promise<StatusConfig> => {
  const config = await getSaasStatusConfig(db);
  return {
    apiErrorRatePct: {
      degraded: toNumber(config.apiErrorRatePct.degraded),
      outage: toNumber(config.apiErrorRatePct.outage),
    },
    apiP95Ms: {
      degraded: toNumber(config.apiP95Ms.degraded),
      outage: toNumber(config.apiP95Ms.outage),
    },
    workerLagMs: {
      degraded: toNumber(config.workerLagMs.degraded),
      outage: toNumber(config.workerLagMs.outage),
    },
    monthlySlaTargetPct: toNumber(config.monthlySlaTargetPct),
  };
};

const loadRequestMinuteStats = async (
  minuteStart: Date,
  minuteEnd: Date
): Promise<RequestMinuteStats> => {
  const minuteStartParam = toTimestampParam(minuteStart);
  const minuteEndParam = toTimestampParam(minuteEnd);

  const result = await db.execute(sql`
    with request_rows as (
      select
        coalesce(
          (jsonb_extract_path_text(${saasUsageEvents.metadata}, 'statusCode'))::int,
          0
        ) as status_code,
        greatest(
          0,
          coalesce(
            (jsonb_extract_path_text(${saasUsageEvents.metadata}, 'latencyMs'))::int,
            0
          )
        ) as latency_ms
      from ${saasUsageEvents}
      where ${saasUsageEvents.createdAt} >= ${minuteStartParam}
        and ${saasUsageEvents.createdAt} < ${minuteEndParam}
        and ${saasUsageEvents.referenceType} = ${SAAS_STATUS_REQUEST_REFERENCE_TYPE}
    )
    select
      count(*)::int as "totalRequestCount",
      count(*) filter (
        where status_code < 300 or status_code >= 500
      )::int as "availabilityEligibleRequestCount",
      count(*) filter (where status_code >= 500)::int as "availabilityErrorCount",
      coalesce(
        round(
          (
            count(*) filter (where status_code >= 500)::numeric
            / nullif(
              count(*) filter (
                where status_code < 300 or status_code >= 500
              ),
              0
            )
          ) * 100,
          4
        ),
        0
      ) as "errorRatePct",
      coalesce(
        ceil(percentile_cont(0.95) within group (order by latency_ms))::int,
        0
      ) as "apiP95Ms"
    from request_rows
  `);

  return readSqlRows<RequestMinuteStats>(result)[0] ?? {
    totalRequestCount: 0,
    availabilityEligibleRequestCount: 0,
    availabilityErrorCount: 0,
    errorRatePct: 0,
    apiP95Ms: 0,
  };
};

const loadStripeWebhookQueueStats = async (now: Date): Promise<ReadyQueueStats> => {
  const staleCutoff = new Date(
    now.getTime() - getConfig().saasBillingWebhookLockTimeoutMs
  );
  const nowParam = toTimestampParam(now);
  const staleCutoffParam = toTimestampParam(staleCutoff);

  const result = await db.execute(sql`
    select
      count(*) filter (
        where (
          (
            ${saasStripeWebhookEvents.status} in ('pending', 'failed')
            and ${saasStripeWebhookEvents.nextAttemptAt} <= ${nowParam}
          )
          or (
            ${saasStripeWebhookEvents.status} = 'processing'
            and (
              ${saasStripeWebhookEvents.lockedAt} is null
              or ${saasStripeWebhookEvents.lockedAt} <= ${staleCutoffParam}
            )
          )
        )
      )::int as "readyCount",
      min(
        case
          when (
            ${saasStripeWebhookEvents.status} in ('pending', 'failed')
            and ${saasStripeWebhookEvents.nextAttemptAt} <= ${nowParam}
          )
          then ${saasStripeWebhookEvents.nextAttemptAt}
          when (
            ${saasStripeWebhookEvents.status} = 'processing'
            and (
              ${saasStripeWebhookEvents.lockedAt} is null
              or ${saasStripeWebhookEvents.lockedAt} <= ${staleCutoffParam}
            )
          )
          then ${saasStripeWebhookEvents.nextAttemptAt}
          else null
        end
      ) as "oldestReadyAt"
    from ${saasStripeWebhookEvents}
  `);

  const [row] = readSqlRows<{
    readyCount: number | string;
    oldestReadyAt: Date | string | null;
  }>(result);
  const oldestReadyAt = normalizeDate(row?.oldestReadyAt);

  return {
    readyCount: toNumber(row?.readyCount),
    lagMs: oldestReadyAt ? Math.max(0, now.getTime() - oldestReadyAt.getTime()) : 0,
  };
};

const loadOutboundWebhookQueueStats = async (
  now: Date
): Promise<ReadyQueueStats> => {
  const staleCutoff = new Date(
    now.getTime() - getConfig().saasOutboundWebhookLockTimeoutMs
  );
  const nowParam = toTimestampParam(now);
  const staleCutoffParam = toTimestampParam(staleCutoff);

  const result = await db.execute(sql`
    select
      count(*) filter (
        where (
          (
            ${saasOutboundWebhookDeliveries.status} in ('pending', 'failed')
            and ${saasOutboundWebhookDeliveries.nextAttemptAt} <= ${nowParam}
          )
          or (
            ${saasOutboundWebhookDeliveries.status} = 'sending'
            and (
              ${saasOutboundWebhookDeliveries.lockedAt} is null
              or ${saasOutboundWebhookDeliveries.lockedAt} <= ${staleCutoffParam}
            )
          )
        )
      )::int as "readyCount",
      min(
        case
          when (
            ${saasOutboundWebhookDeliveries.status} in ('pending', 'failed')
            and ${saasOutboundWebhookDeliveries.nextAttemptAt} <= ${nowParam}
          )
          then ${saasOutboundWebhookDeliveries.nextAttemptAt}
          when (
            ${saasOutboundWebhookDeliveries.status} = 'sending'
            and (
              ${saasOutboundWebhookDeliveries.lockedAt} is null
              or ${saasOutboundWebhookDeliveries.lockedAt} <= ${staleCutoffParam}
            )
          )
          then ${saasOutboundWebhookDeliveries.nextAttemptAt}
          else null
        end
      ) as "oldestReadyAt"
    from ${saasOutboundWebhookDeliveries}
  `);

  const [row] = readSqlRows<{
    readyCount: number | string;
    oldestReadyAt: Date | string | null;
  }>(result);
  const oldestReadyAt = normalizeDate(row?.oldestReadyAt);

  return {
    readyCount: toNumber(row?.readyCount),
    lagMs: oldestReadyAt ? Math.max(0, now.getTime() - oldestReadyAt.getTime()) : 0,
  };
};

const toStatusMinute = (
  row: typeof saasStatusMinutes.$inferSelect
): SaasStatusMinute => ({
  minuteStart: row.minuteStart,
  totalRequestCount: Number(row.totalRequestCount ?? 0),
  availabilityEligibleRequestCount: Number(
    row.availabilityEligibleRequestCount ?? 0
  ),
  availabilityErrorCount: Number(row.availabilityErrorCount ?? 0),
  errorRatePct: roundMetric(toNumber(row.errorRatePct), 4),
  apiP95Ms: Number(row.apiP95Ms ?? 0),
  workerLagMs: Number(row.workerLagMs ?? 0),
  stripeWebhookReadyCount: Number(row.stripeWebhookReadyCount ?? 0),
  stripeWebhookLagMs: Number(row.stripeWebhookLagMs ?? 0),
  outboundWebhookReadyCount: Number(row.outboundWebhookReadyCount ?? 0),
  outboundWebhookLagMs: Number(row.outboundWebhookLagMs ?? 0),
  apiStatus: row.apiStatus,
  workerStatus: row.workerStatus,
  overallStatus: row.overallStatus,
  computedAt: row.computedAt,
});

export async function recordSaasStatusApiRequest(payload: {
  tenantId: number;
  projectId: number;
  apiKeyId: number;
  environment: SaaSEnvironment;
  eventType: PrizeEngineApiKeyScope;
  route: string;
  method: string;
  statusCode: number;
  latencyMs: number;
}) {
  await db.insert(saasUsageEvents).values({
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    apiKeyId: payload.apiKeyId,
    environment: payload.environment,
    eventType: payload.eventType,
    amount: '0',
    currency: 'USD',
    referenceType: SAAS_STATUS_REQUEST_REFERENCE_TYPE,
    referenceId: null,
    metadata: {
      telemetryKind: SAAS_STATUS_REQUEST_TELEMETRY_KIND,
      route: payload.route,
      method: payload.method.toUpperCase(),
      statusCode: payload.statusCode,
      latencyMs: Math.max(0, Math.round(payload.latencyMs)),
      availabilityEligible:
        payload.statusCode < 300 || payload.statusCode >= 500,
      availabilityError: payload.statusCode >= 500,
    },
  });
}

export async function materializeCurrentSaasStatusMinute(now = new Date()) {
  const minuteStart = startOfMinute(now);
  const minuteEnd = addMinutes(minuteStart, 1);

  const [config, requestStats, stripeStats, outboundStats] = await Promise.all([
    loadStatusConfig(),
    loadRequestMinuteStats(minuteStart, minuteEnd),
    loadStripeWebhookQueueStats(now),
    loadOutboundWebhookQueueStats(now),
  ]);

  const workerLagMs = Math.max(stripeStats.lagMs, outboundStats.lagMs);
  const apiStatus = resolveSaasApiStatus(
    roundMetric(toNumber(requestStats.errorRatePct), 4),
    toNumber(requestStats.apiP95Ms),
    config
  );
  const workerStatus = resolveSaasWorkerStatus(workerLagMs, config);
  const overallStatus = worstSaasStatusLevel([apiStatus, workerStatus]);
  const computedAt = new Date();

  const [row] = await db
    .insert(saasStatusMinutes)
    .values({
      minuteStart,
      totalRequestCount: toNumber(requestStats.totalRequestCount),
      availabilityEligibleRequestCount: toNumber(
        requestStats.availabilityEligibleRequestCount
      ),
      availabilityErrorCount: toNumber(requestStats.availabilityErrorCount),
      errorRatePct: roundMetric(toNumber(requestStats.errorRatePct), 4).toFixed(4),
      apiP95Ms: toNumber(requestStats.apiP95Ms),
      workerLagMs,
      stripeWebhookReadyCount: stripeStats.readyCount,
      stripeWebhookLagMs: stripeStats.lagMs,
      outboundWebhookReadyCount: outboundStats.readyCount,
      outboundWebhookLagMs: outboundStats.lagMs,
      apiStatus,
      workerStatus,
      overallStatus,
      computedAt,
      updatedAt: computedAt,
    })
    .onConflictDoUpdate({
      target: saasStatusMinutes.minuteStart,
      set: {
        totalRequestCount: toNumber(requestStats.totalRequestCount),
        availabilityEligibleRequestCount: toNumber(
          requestStats.availabilityEligibleRequestCount
        ),
        availabilityErrorCount: toNumber(requestStats.availabilityErrorCount),
        errorRatePct: roundMetric(toNumber(requestStats.errorRatePct), 4).toFixed(
          4
        ),
        apiP95Ms: toNumber(requestStats.apiP95Ms),
        workerLagMs,
        stripeWebhookReadyCount: stripeStats.readyCount,
        stripeWebhookLagMs: stripeStats.lagMs,
        outboundWebhookReadyCount: outboundStats.readyCount,
        outboundWebhookLagMs: outboundStats.lagMs,
        apiStatus,
        workerStatus,
        overallStatus,
        computedAt,
        updatedAt: computedAt,
      },
    })
    .returning();

  return {
    minute: toStatusMinute(row),
    thresholds: toThresholdResponse(config),
  };
}

export async function getPublicSaasStatusPage(): Promise<SaasPublicStatusPage> {
  const now = new Date();
  const currentMinute = startOfMinute(now);
  const recentStart = addMinutes(currentMinute, -(SAAS_STATUS_RECENT_MINUTES - 1));
  const summaryStart = addMinutes(
    currentMinute,
    -(SAAS_STATUS_SUMMARY_WINDOW_MINUTES - 1)
  );
  const currentWindowStart = addMinutes(
    currentMinute,
    -(SAAS_STATUS_CURRENT_WINDOW_MINUTES - 1)
  );
  const monthStart = startOfMonth(now);
  const monthStartParam = toTimestampParam(monthStart);
  const currentMinuteParam = toTimestampParam(currentMinute);

  const { thresholds } = await materializeCurrentSaasStatusMinute(now);

  const [recentRows, monthlySlaResult] = await Promise.all([
    db
      .select()
      .from(saasStatusMinutes)
      .where(gte(saasStatusMinutes.minuteStart, recentStart))
      .orderBy(asc(saasStatusMinutes.minuteStart)),
    db.execute(sql`
      select
        count(*)::int as "observedMinutes",
        coalesce(
          sum(
            case when ${saasStatusMinutes.overallStatus} = 'operational' then 1 else 0 end
          )::int,
          0
        ) as "operationalMinutes",
        coalesce(
          sum(
            case when ${saasStatusMinutes.overallStatus} = 'degraded' then 1 else 0 end
          )::int,
          0
        ) as "degradedMinutes",
        coalesce(
          sum(
            case when ${saasStatusMinutes.overallStatus} = 'outage' then 1 else 0 end
          )::int,
          0
        ) as "outageMinutes",
        min(${saasStatusMinutes.minuteStart}) as "trackingStartedAt"
      from ${saasStatusMinutes}
      where ${saasStatusMinutes.minuteStart} >= ${monthStartParam}
        and ${saasStatusMinutes.minuteStart} <= ${currentMinuteParam}
    `),
  ]);

  const recentMinutes = recentRows.map(toStatusMinute);
  const latestMinute = recentMinutes[recentMinutes.length - 1] ?? null;
  const currentWindowMinutes = recentMinutes.filter((row) => {
    const minuteStart = normalizeDate(row.minuteStart);
    return minuteStart ? minuteStart >= currentWindowStart : false;
  });
  const summaryWindowMinutes = recentMinutes.filter((row) => {
    const minuteStart = normalizeDate(row.minuteStart);
    return minuteStart ? minuteStart >= summaryStart : false;
  });
  const currentStatus = currentWindowMinutes.length
    ? worstSaasStatusLevel(currentWindowMinutes.map((row) => row.overallStatus))
    : (latestMinute?.overallStatus ?? 'operational');

  const totalRequestsLastHour = summaryWindowMinutes.reduce(
    (sum, row) => sum + row.totalRequestCount,
    0
  );
  const availabilityEligibleRequestsLastHour = summaryWindowMinutes.reduce(
    (sum, row) => sum + row.availabilityEligibleRequestCount,
    0
  );
  const availabilityErrorCountLastHour = summaryWindowMinutes.reduce(
    (sum, row) => sum + row.availabilityErrorCount,
    0
  );
  const availabilityErrorRatePctLastHour =
    availabilityEligibleRequestsLastHour > 0
      ? roundMetric(
          (availabilityErrorCountLastHour /
            availabilityEligibleRequestsLastHour) *
            100,
          4
        )
      : 0;
  const peakApiP95MsLastHour = summaryWindowMinutes.reduce(
    (max, row) => Math.max(max, row.apiP95Ms),
    0
  );

  const monthlySlaRow = readSqlRows<MonthlySlaRow>(monthlySlaResult)[0];
  const observedMinutes = toNumber(monthlySlaRow?.observedMinutes);
  const operationalMinutes = toNumber(monthlySlaRow?.operationalMinutes);
  const degradedMinutes = toNumber(monthlySlaRow?.degradedMinutes);
  const outageMinutes = toNumber(monthlySlaRow?.outageMinutes);
  const elapsedMinutes = minuteDiff(monthStart, currentMinute) + 1;
  const actualPct = calculateObservedSlaPct(operationalMinutes, observedMinutes);
  const coveragePct =
    elapsedMinutes > 0
      ? Math.min(
          100,
          roundMetric((observedMinutes / elapsedMinutes) * 100, 3)
        )
      : 100;

  return {
    summary: {
      generatedAt: now,
      latestMinuteStart: latestMinute?.minuteStart ?? null,
      currentStatus,
      currentWindowMinutes: SAAS_STATUS_CURRENT_WINDOW_MINUTES,
      totalRequestsLastHour,
      availabilityEligibleRequestsLastHour,
      availabilityErrorRatePctLastHour,
      peakApiP95MsLastHour,
      workerLagMsCurrent: latestMinute?.workerLagMs ?? 0,
    },
    monthlySla: {
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      targetPct: thresholds.monthlySlaTargetPct,
      actualPct,
      metTarget: actualPct >= thresholds.monthlySlaTargetPct,
      observedMinutes,
      elapsedMinutes,
      coveragePct,
      operationalMinutes,
      degradedMinutes,
      outageMinutes,
      trackingStartedAt: normalizeDate(monthlySlaRow?.trackingStartedAt),
    },
    thresholds,
    recentMinutes,
  };
}
