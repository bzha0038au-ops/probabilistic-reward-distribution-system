import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

import { client } from '../db';
import {
  assertNotificationChannelAvailable,
  getNotificationDeliverySummary,
  getNotificationProviderStatus,
} from '../modules/auth/notification-service';
import {
  assertAutomatedPaymentModeSupported,
  getPaymentCapabilitySummary,
} from '../modules/payment/service';
import { getConfig } from './config';
import { logger } from './logger';
import { getRedis } from './redis';
import { getRuntimeMetadata } from './runtime-metadata';
import { readSqlRows } from './sql-result';

type DependencyStatus = 'up' | 'down' | 'disabled';
type ReadinessStatus = 'ready' | 'degraded' | 'not_ready';

type DependencyCheck = {
  name: string;
  required: boolean;
  status: DependencyStatus;
  latencyMs: number | null;
  details?: Record<string, unknown>;
  error?: string;
};

type BaseHealthReport = {
  service: string;
  environment: string;
  release: string;
  commitSha: string;
  checkedAt: string;
  uptimeSeconds: number;
};

type LivenessReport = BaseHealthReport & {
  status: 'ok';
};

type ReadinessReport = BaseHealthReport & {
  status: ReadinessStatus;
  checks: DependencyCheck[];
};

const config = getConfig();
const runtimeMetadata = getRuntimeMetadata(config);
const registry = new Registry();
const dependencyStates: DependencyStatus[] = ['up', 'down', 'disabled'];
const stuckWithdrawalStatuses = [
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing',
] as const;

registry.setDefaultLabels({
  environment: runtimeMetadata.environment,
  service: runtimeMetadata.serviceName,
});

collectDefaultMetrics({
  prefix: 'reward_backend_',
  register: registry,
});

const appUp = new Gauge({
  name: 'reward_backend_app_up',
  help: 'Whether the backend process is up.',
  registers: [registry],
});

const buildInfo = new Gauge({
  name: 'reward_backend_build_info',
  help: 'Backend build metadata for release-aware dashboards.',
  labelNames: ['release', 'commit_sha'] as const,
  registers: [registry],
});

const httpRequestsTotal = new Counter({
  name: 'reward_backend_http_requests_total',
  help: 'Total HTTP requests handled by the backend.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'reward_backend_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const dependencyStatusMetric = new Gauge({
  name: 'reward_backend_dependency_status',
  help: 'Dependency status by dependency name and status label.',
  labelNames: ['dependency', 'required', 'status'] as const,
  registers: [registry],
});

const notificationDeliveriesGauge = new Gauge({
  name: 'reward_backend_auth_notification_deliveries',
  help: 'Auth notification deliveries grouped by status.',
  labelNames: ['status'] as const,
  registers: [registry],
});

const notificationOldestPendingAgeSeconds = new Gauge({
  name: 'reward_backend_auth_notification_oldest_pending_age_seconds',
  help: 'Age in seconds of the oldest pending auth notification delivery.',
  registers: [registry],
});

const drawRequestsTotal = new Counter({
  name: 'reward_backend_draw_requests_total',
  help: 'Total draw execution attempts grouped by outcome.',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

const stuckWithdrawalsGauge = new Gauge({
  name: 'reward_backend_withdrawals_stuck_total',
  help:
    'Count of requested, approved, provider_submitted, or provider_processing withdrawals older than the stuck threshold.',
  labelNames: ['status'] as const,
  registers: [registry],
});

const oldestStuckWithdrawalAgeSeconds = new Gauge({
  name: 'reward_backend_withdrawals_oldest_stuck_age_seconds',
  help: 'Age in seconds of the oldest stuck withdrawal grouped by status.',
  labelNames: ['status'] as const,
  registers: [registry],
});

appUp.set(1);
buildInfo.set(
  {
    release: runtimeMetadata.release,
    commit_sha: runtimeMetadata.commitSha,
  },
  1
);

const nowIso = () => new Date().toISOString();

const getUptimeSeconds = () => Number(process.uptime().toFixed(3));

const getRouteLabel = (request: FastifyRequest) =>
  request.routeOptions?.url ?? 'unmatched';

const setDependencyStatus = (
  dependency: string,
  required: boolean,
  status: DependencyStatus
) => {
  for (const current of dependencyStates) {
    dependencyStatusMetric.set(
      {
        dependency,
        required: required ? 'true' : 'false',
        status: current,
      },
      current === status ? 1 : 0
    );
  }
};

const runDependencyCheck = async (params: {
  name: string;
  required: boolean;
  disabled?: boolean;
  details?: Record<string, unknown>;
  probe?: () => Promise<Record<string, unknown> | void>;
}): Promise<DependencyCheck> => {
  if (params.disabled) {
    const result: DependencyCheck = {
      name: params.name,
      required: params.required,
      status: 'disabled',
      latencyMs: null,
      details: params.details,
    };
    setDependencyStatus(params.name, params.required, result.status);
    return result;
  }

  const startedAt = Date.now();

  try {
    const extraDetails = params.probe ? await params.probe() : undefined;
    const result: DependencyCheck = {
      name: params.name,
      required: params.required,
      status: 'up',
      latencyMs: Date.now() - startedAt,
      details: { ...params.details, ...extraDetails },
    };
    setDependencyStatus(params.name, params.required, result.status);
    return result;
  } catch (error) {
    const result: DependencyCheck = {
      name: params.name,
      required: params.required,
      status: 'down',
      latencyMs: Date.now() - startedAt,
      details: params.details,
      error: error instanceof Error ? error.message : 'Unknown dependency error.',
    };
    setDependencyStatus(params.name, params.required, result.status);
    return result;
  }
};

const buildBaseReport = () => ({
  service: runtimeMetadata.serviceName,
  environment: runtimeMetadata.environment,
  release: runtimeMetadata.release,
  commitSha: runtimeMetadata.commitSha,
  checkedAt: nowIso(),
  uptimeSeconds: getUptimeSeconds(),
});

const refreshWithdrawalStuckMetrics = async () => {
  const cutoff = new Date(
    Date.now() -
      config.observabilityWithdrawStuckThresholdMinutes * 60 * 1000
  );
  const result = await client`
    SELECT
      status,
      count(*)::int AS count,
      min(updated_at) AS "oldestUpdatedAt"
    FROM withdrawals
    WHERE status IN (${client(stuckWithdrawalStatuses)})
      AND updated_at <= ${cutoff}
    GROUP BY status
  `;
  const rows = readSqlRows<{
    status: string;
    count: number;
    oldestUpdatedAt: Date | string | null;
  }>(result);

  for (const status of stuckWithdrawalStatuses) {
    const row = rows.find((item) => item.status === status);
    const count = Number(row?.count ?? 0);
    stuckWithdrawalsGauge.set({ status }, count);

    if (!row?.oldestUpdatedAt) {
      oldestStuckWithdrawalAgeSeconds.set({ status }, 0);
      continue;
    }

    const oldestUpdatedAt = new Date(row.oldestUpdatedAt);
    const ageSeconds = Math.max(
      0,
      (Date.now() - oldestUpdatedAt.getTime()) / 1000
    );
    oldestStuckWithdrawalAgeSeconds.set({ status }, ageSeconds);
  }
};

const checkDatabase = () =>
  runDependencyCheck({
    name: 'postgres',
    required: true,
    probe: async () => {
      await client`select 1`;
    },
  });

const checkRedis = () => {
  if (!config.redisUrl) {
    return runDependencyCheck({
      name: 'redis',
      required: false,
      disabled: true,
      details: {
        configured: false,
      },
    });
  }

  return runDependencyCheck({
    name: 'redis',
    required: false,
    details: {
      configured: true,
    },
    probe: async () => {
      const redis = getRedis();
      if (!redis) {
        throw new Error('Redis client unavailable.');
      }
      const response = await redis.ping();
      return { response };
    },
  });
};

const checkNotificationEmailProvider = async () => {
  const { emailProvider } = getNotificationProviderStatus();

  return runDependencyCheck({
    name: 'auth_notification_email',
    required: true,
    details: {
      provider: emailProvider,
      probeType: 'configuration',
    },
    probe: async () => {
      assertNotificationChannelAvailable('email');
    },
  });
};

const checkNotificationSmsProvider = async () => {
  const { smsProvider } = getNotificationProviderStatus();
  const disabled = smsProvider === 'unavailable';

  return runDependencyCheck({
    name: 'auth_notification_sms',
    required: false,
    disabled,
    details: {
      provider: smsProvider,
      probeType: 'configuration',
    },
    probe: disabled
      ? undefined
      : async () => {
          assertNotificationChannelAvailable('sms');
        },
  });
};

const checkPaymentAutomation = async () => {
  const summary = getPaymentCapabilitySummary();

  return runDependencyCheck({
    name: 'payment_automation',
    required: summary.automatedExecutionEnabled,
    disabled: !summary.automatedExecutionEnabled,
    details: {
      operatingMode: summary.operatingMode,
      automatedExecutionReady: summary.automatedExecutionReady,
      implementedAutomatedAdapters: summary.implementedAutomatedAdapters,
      missingCapabilities: summary.missingCapabilities,
    },
    probe: summary.automatedExecutionEnabled
      ? async () => {
          assertAutomatedPaymentModeSupported();
        }
      : undefined,
  });
};

export const buildLivenessReport = (): LivenessReport => ({
  status: 'ok',
  ...buildBaseReport(),
});

export const buildReadinessReport = async (): Promise<ReadinessReport> => {
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkNotificationEmailProvider(),
    checkNotificationSmsProvider(),
    checkPaymentAutomation(),
  ]);

  const hasRequiredFailure = checks.some(
    (check) => check.required && check.status !== 'up'
  );
  const hasOptionalFailure = checks.some(
    (check) => !check.required && check.status === 'down'
  );

  return {
    status: hasRequiredFailure
      ? 'not_ready'
      : hasOptionalFailure
        ? 'degraded'
        : 'ready',
    ...buildBaseReport(),
    checks,
  };
};

export const refreshOperationalMetrics = async () => {
  try {
    const summary = (await getNotificationDeliverySummary()) as {
      counts: {
        pending: number;
        processing: number;
        sent: number;
        failed: number;
      };
      oldestPendingAt: Date | string | null;
    };

    notificationDeliveriesGauge.set(
      { status: 'pending' },
      summary.counts.pending
    );
    notificationDeliveriesGauge.set(
      { status: 'processing' },
      summary.counts.processing
    );
    notificationDeliveriesGauge.set({ status: 'sent' }, summary.counts.sent);
    notificationDeliveriesGauge.set(
      { status: 'failed' },
      summary.counts.failed
    );

    if (summary.oldestPendingAt) {
      const oldestPendingAt = new Date(summary.oldestPendingAt);
      const ageSeconds = Math.max(
        0,
        (Date.now() - oldestPendingAt.getTime()) / 1000
      );
      notificationOldestPendingAgeSeconds.set(ageSeconds);
    } else {
      notificationOldestPendingAgeSeconds.set(0);
    }

    await refreshWithdrawalStuckMetrics();
  } catch (error) {
    logger.warning('failed to refresh observability operational metrics', {
      err: error,
    });
  }
};

export const registerHttpMetricsHooks = (app: FastifyInstance) => {
  app.addHook(
    'onResponse',
    (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
      const labels = {
        method: request.method.toUpperCase(),
        route: getRouteLabel(request),
        status_code: String(reply.statusCode),
      };

      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
      done();
    }
  );
};

export const getMetricsContentType = () => registry.contentType;

export const renderMetrics = () => registry.metrics();

export const recordDrawRequestOutcome = (outcome: 'success' | 'error') => {
  drawRequestsTotal.inc({ outcome });
};

export const resetObservabilityMetrics = () => {
  registry.resetMetrics();
  appUp.set(1);
  buildInfo.set(
    {
      release: runtimeMetadata.release,
      commit_sha: runtimeMetadata.commitSha,
    },
    1
  );
};
