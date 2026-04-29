import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

import { client } from '../db';
import { getPendingAmlMetrics } from '../modules/aml/service';
import {
  assertNotificationChannelAvailable,
  getNotificationDeliverySummary,
  getNotificationProviderStatus,
} from '../modules/auth/notification-service';
import {
  assertAutomatedPaymentModeSupported,
  getPaymentCapabilitySummary,
} from '../modules/payment/service';
import {
  refreshSaasDistributionSnapshots,
  saasDistributionMetricBuckets,
} from '../modules/saas/distribution-monitoring';
import { getConfig } from './config';
import { internalInvariantError } from './errors';
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

type ObservabilityState = {
  registry: Registry;
  runtimeMetadata: ReturnType<typeof getRuntimeMetadata>;
  appUp: Gauge;
  buildInfo: Gauge<'release' | 'commit_sha'>;
  httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  httpRequestDurationSeconds: Histogram<'method' | 'route' | 'status_code'>;
  dependencyStatusMetric: Gauge<'dependency' | 'required' | 'status'>;
  notificationDeliveriesGauge: Gauge<'status'>;
  notificationOldestPendingAgeSeconds: Gauge;
  amlReviewHitsGauge: Gauge<'state'>;
  amlReviewOldestPendingAgeSeconds: Gauge;
  drawRequestsTotal: Counter<'outcome'>;
  stuckWithdrawalsGauge: Gauge<'status'>;
  oldestStuckWithdrawalAgeSeconds: Gauge<'status'>;
  paymentWebhookSignatureVerificationsTotal: Counter<
    'provider' | 'status' | 'reason'
  >;
  paymentWebhookEventsGauge: Gauge<
    'provider' | 'processing_status' | 'signature_status'
  >;
  paymentWebhookOldestPendingAgeSeconds: Gauge<'provider'>;
  paymentReconciliationOpenIssuesGauge: Gauge<
    'provider' | 'requires_manual_review'
  >;
  paymentReconciliationOldestOpenIssueAgeSeconds: Gauge<
    'provider' | 'requires_manual_review'
  >;
  paymentOutboundRequestsGauge: Gauge<'send_status' | 'error_code'>;
  paymentOutboundOldestRetryAgeSeconds: Gauge<'error_code'>;
  paymentOutboundIdempotencyConflictsTotal: Counter<
    'provider' | 'action' | 'reason'
  >;
  saasBillingRunsGauge: Gauge<'status'>;
  saasWebhookEventsGauge: Gauge<'status'>;
  saasWebhookOldestReadyAgeSeconds: Gauge;
  saasWebhookRetryExhaustedTotal: Gauge;
  saasDistributionDrawsGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionTrackedDrawsGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionTrackingCoverageRatioGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionActualPayoutSumGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionExpectedPayoutSumGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionPayoutDeviationAmountGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionPayoutDeviationRatioGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionMaxBucketDeviationRatioGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window'
  >;
  saasDistributionActualBucketGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window' | 'bucket'
  >;
  saasDistributionExpectedBucketGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window' | 'bucket'
  >;
  saasDistributionBreachGauge: Gauge<
    'project_id' | 'project_slug' | 'environment' | 'window' | 'reason'
  >;
  stripeApiRequestsTotal: Counter<
    'surface' | 'operation' | 'outcome' | 'status_family'
  >;
  stripeApiFailuresTotal: Counter<'surface' | 'operation' | 'reason'>;
  realtimePublishDurationSeconds: Histogram<'scope' | 'channel' | 'event'>;
  realtimeReceiveLatencySeconds: Histogram<'surface' | 'channel' | 'event'>;
};

let observabilityState: ObservabilityState | null = null;
const dependencyStates: DependencyStatus[] = ['up', 'down', 'disabled'];
const stuckWithdrawalStatuses = [
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing',
] as const;
const saasBillingRunStatuses = [
  'draft',
  'synced',
  'finalized',
  'sent',
  'paid',
  'void',
  'uncollectible',
  'failed',
] as const;
const saasWebhookStatuses = [
  'pending',
  'processing',
  'processed',
  'failed',
] as const;
const paymentWebhookSignatureStatuses = [
  'verified',
  'failed',
  'skipped',
] as const;
const stripeApiStatusFamilies = [
  '2xx',
  '4xx',
  '5xx',
  '429',
  'transport',
  'unknown',
] as const;
const saasDistributionBreachReasons = [
  'ev_deviation',
  'bucket_share_deviation',
] as const;
const noMetricValue = 'none';

export const SAAS_WEBHOOK_RETRY_EXHAUSTED_ATTEMPTS_ALERT_THRESHOLD = 8;
export const HOLDEM_REALTIME_RECEIVE_P95_ALERT_THRESHOLD_MS = 200;

const getObservabilityState = () => {
  if (observabilityState) {
    return observabilityState;
  }

  const config = getConfig();
  const runtimeMetadata = getRuntimeMetadata(config);
  const registry = new Registry();

  registry.setDefaultLabels({
    environment: runtimeMetadata.environment,
    service: runtimeMetadata.serviceName,
  });

  collectDefaultMetrics({
    prefix: 'reward_backend_',
    register: registry,
  });

  observabilityState = {
    registry,
    runtimeMetadata,
    appUp: new Gauge({
      name: 'reward_backend_app_up',
      help: 'Whether the backend process is up.',
      registers: [registry],
    }),
    buildInfo: new Gauge({
      name: 'reward_backend_build_info',
      help: 'Backend build metadata for release-aware dashboards.',
      labelNames: ['release', 'commit_sha'] as const,
      registers: [registry],
    }),
    httpRequestsTotal: new Counter({
      name: 'reward_backend_http_requests_total',
      help: 'Total HTTP requests handled by the backend.',
      labelNames: ['method', 'route', 'status_code'] as const,
      registers: [registry],
    }),
    httpRequestDurationSeconds: new Histogram({
      name: 'reward_backend_http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    dependencyStatusMetric: new Gauge({
      name: 'reward_backend_dependency_status',
      help: 'Dependency status by dependency name and status label.',
      labelNames: ['dependency', 'required', 'status'] as const,
      registers: [registry],
    }),
    notificationDeliveriesGauge: new Gauge({
      name: 'reward_backend_auth_notification_deliveries',
      help: 'Auth notification deliveries grouped by status.',
      labelNames: ['status'] as const,
      registers: [registry],
    }),
    notificationOldestPendingAgeSeconds: new Gauge({
      name: 'reward_backend_auth_notification_oldest_pending_age_seconds',
      help: 'Age in seconds of the oldest pending auth notification delivery.',
      registers: [registry],
    }),
    amlReviewHitsGauge: new Gauge({
      name: 'reward_backend_aml_review_hits_total',
      help: 'Count of AML hit cases pending review, grouped by review queue state.',
      labelNames: ['state'] as const,
      registers: [registry],
    }),
    amlReviewOldestPendingAgeSeconds: new Gauge({
      name: 'reward_backend_aml_review_oldest_pending_age_seconds',
      help: 'Age in seconds of the oldest AML hit case still waiting for operator review.',
      registers: [registry],
    }),
    drawRequestsTotal: new Counter({
      name: 'reward_backend_draw_requests_total',
      help: 'Total draw execution attempts grouped by outcome.',
      labelNames: ['outcome'] as const,
      registers: [registry],
    }),
    stuckWithdrawalsGauge: new Gauge({
      name: 'reward_backend_withdrawals_stuck_total',
      help:
        'Count of requested, approved, provider_submitted, or provider_processing withdrawals older than the stuck threshold.',
      labelNames: ['status'] as const,
      registers: [registry],
    }),
    oldestStuckWithdrawalAgeSeconds: new Gauge({
      name: 'reward_backend_withdrawals_oldest_stuck_age_seconds',
      help: 'Age in seconds of the oldest stuck withdrawal grouped by status.',
      labelNames: ['status'] as const,
      registers: [registry],
    }),
    paymentWebhookSignatureVerificationsTotal: new Counter({
      name: 'reward_backend_payment_webhook_signature_verifications_total',
      help: 'Total payment webhook signature verification attempts grouped by provider, status, and reason.',
      labelNames: ['provider', 'status', 'reason'] as const,
      registers: [registry],
    }),
    paymentWebhookEventsGauge: new Gauge({
      name: 'reward_backend_payment_webhook_events_total',
      help: 'Count of queued payment webhook events grouped by provider, processing status, and signature status.',
      labelNames: ['provider', 'processing_status', 'signature_status'] as const,
      registers: [registry],
    }),
    paymentWebhookOldestPendingAgeSeconds: new Gauge({
      name: 'reward_backend_payment_webhook_oldest_pending_age_seconds',
      help: 'Age in seconds of the oldest payment webhook event still waiting to be processed for each provider.',
      labelNames: ['provider'] as const,
      registers: [registry],
    }),
    paymentReconciliationOpenIssuesGauge: new Gauge({
      name: 'reward_backend_payment_reconciliation_open_issues_total',
      help: 'Count of open payment reconciliation issues grouped by provider and whether manual review is required.',
      labelNames: ['provider', 'requires_manual_review'] as const,
      registers: [registry],
    }),
    paymentReconciliationOldestOpenIssueAgeSeconds: new Gauge({
      name: 'reward_backend_payment_reconciliation_oldest_open_issue_age_seconds',
      help: 'Age in seconds of the oldest open payment reconciliation issue grouped by provider and manual review requirement.',
      labelNames: ['provider', 'requires_manual_review'] as const,
      registers: [registry],
    }),
    paymentOutboundRequestsGauge: new Gauge({
      name: 'reward_backend_payment_outbound_requests_total',
      help: 'Count of payment outbound requests grouped by send status and last error code.',
      labelNames: ['send_status', 'error_code'] as const,
      registers: [registry],
    }),
    paymentOutboundOldestRetryAgeSeconds: new Gauge({
      name: 'reward_backend_payment_outbound_oldest_retry_age_seconds',
      help: 'Age in seconds of the oldest payment outbound request still waiting for retry or operator attention, grouped by error code.',
      labelNames: ['error_code'] as const,
      registers: [registry],
    }),
    paymentOutboundIdempotencyConflictsTotal: new Counter({
      name: 'reward_backend_payment_outbound_idempotency_conflicts_total',
      help: 'Total outbound payment idempotency conflicts grouped by provider, action, and conflict reason.',
      labelNames: ['provider', 'action', 'reason'] as const,
      registers: [registry],
    }),
    saasBillingRunsGauge: new Gauge({
      name: 'reward_backend_saas_billing_runs_total',
      help: 'Count of SaaS billing runs grouped by status.',
      labelNames: ['status'] as const,
      registers: [registry],
    }),
    saasWebhookEventsGauge: new Gauge({
      name: 'reward_backend_saas_webhook_events_total',
      help: 'Count of queued SaaS Stripe webhook events grouped by status.',
      labelNames: ['status'] as const,
      registers: [registry],
    }),
    saasWebhookOldestReadyAgeSeconds: new Gauge({
      name: 'reward_backend_saas_webhook_oldest_ready_age_seconds',
      help: 'Age in seconds of the oldest pending or failed SaaS Stripe webhook event ready to retry.',
      registers: [registry],
    }),
    saasWebhookRetryExhaustedTotal: new Gauge({
      name: 'reward_backend_saas_webhook_retry_exhausted_total',
      help: 'Count of failed SaaS Stripe webhook events that have reached the retry exhaustion alert threshold.',
      registers: [registry],
    }),
    saasDistributionDrawsGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_draws_total',
      help: 'Count of draws captured in the current rolling payout-distribution snapshot for each project and window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionTrackedDrawsGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_tracked_draws_total',
      help: 'Count of draws in the snapshot window that include payout-distribution telemetry.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionTrackingCoverageRatioGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_tracking_coverage_ratio',
      help: 'Fraction of draws in the window that include payout-distribution telemetry.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionActualPayoutSumGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_actual_payout_sum',
      help: 'Actual payout sum for tracked draws in the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionExpectedPayoutSumGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_expected_payout_sum',
      help: 'Expected payout sum for tracked draws in the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionPayoutDeviationAmountGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_payout_deviation_amount',
      help: 'Actual minus expected payout amount for the tracked draws in the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionPayoutDeviationRatioGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_payout_deviation_ratio',
      help: 'Relative payout deviation ratio, computed as (actual minus expected) divided by expected, for the tracked draws in the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionMaxBucketDeviationRatioGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_max_bucket_deviation_ratio',
      help: 'Largest absolute deviation between actual and expected payout bucket share for the tracked draws in the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window'] as const,
      registers: [registry],
    }),
    saasDistributionActualBucketGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_actual_bucket_total',
      help: 'Actual tracked draw counts grouped by payout bucket for the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window', 'bucket'] as const,
      registers: [registry],
    }),
    saasDistributionExpectedBucketGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_expected_bucket_total',
      help: 'Expected tracked draw counts grouped by payout bucket for the current rolling snapshot window.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window', 'bucket'] as const,
      registers: [registry],
    }),
    saasDistributionBreachGauge: new Gauge({
      name: 'reward_backend_saas_distribution_snapshot_breach',
      help: 'Binary payout-distribution breach indicator for each project, rolling window, and breach reason.',
      labelNames: ['project_id', 'project_slug', 'environment', 'window', 'reason'] as const,
      registers: [registry],
    }),
    stripeApiRequestsTotal: new Counter({
      name: 'reward_backend_stripe_api_requests_total',
      help: 'Total Stripe API requests grouped by surface, operation, outcome, and status family.',
      labelNames: ['surface', 'operation', 'outcome', 'status_family'] as const,
      registers: [registry],
    }),
    stripeApiFailuresTotal: new Counter({
      name: 'reward_backend_stripe_api_failures_total',
      help: 'Total Stripe API failures grouped by surface, operation, and failure reason.',
      labelNames: ['surface', 'operation', 'reason'] as const,
      registers: [registry],
    }),
    realtimePublishDurationSeconds: new Histogram({
      name: 'reward_backend_realtime_publish_duration_seconds',
      help: 'Realtime publish duration in seconds grouped by scope, channel, and event.',
      labelNames: ['scope', 'channel', 'event'] as const,
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2],
      registers: [registry],
    }),
    realtimeReceiveLatencySeconds: new Histogram({
      name: 'reward_backend_realtime_receive_latency_seconds',
      help: 'Client-observed realtime receive latency in seconds grouped by surface, channel, and event.',
      labelNames: ['surface', 'channel', 'event'] as const,
      buckets: [0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 1, 2],
      registers: [registry],
    }),
  };

  observabilityState.appUp.set(1);
  observabilityState.buildInfo.set(
    {
      release: runtimeMetadata.release,
      commit_sha: runtimeMetadata.commitSha,
    },
    1
  );

  return observabilityState;
};

const nowIso = () => new Date().toISOString();

const getUptimeSeconds = () => Number(process.uptime().toFixed(3));

const readMetricValue = (value: unknown, fallback = noMetricValue) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;

const getRouteLabel = (request: FastifyRequest) =>
  request.routeOptions?.url ?? 'unmatched';

const setDependencyStatus = (
  dependency: string,
  required: boolean,
  status: DependencyStatus
) => {
  const { dependencyStatusMetric } = getObservabilityState();
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

const buildBaseReport = () => {
  const { runtimeMetadata } = getObservabilityState();

  return {
    service: runtimeMetadata.serviceName,
    environment: runtimeMetadata.environment,
    release: runtimeMetadata.release,
    commitSha: runtimeMetadata.commitSha,
    checkedAt: nowIso(),
    uptimeSeconds: getUptimeSeconds(),
  };
};

const refreshWithdrawalStuckMetrics = async () => {
  const { stuckWithdrawalsGauge, oldestStuckWithdrawalAgeSeconds } =
    getObservabilityState();
  const config = getConfig();
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

const refreshAmlReviewMetrics = async () => {
  const { amlReviewHitsGauge, amlReviewOldestPendingAgeSeconds } =
    getObservabilityState();
  const summary = await getPendingAmlMetrics();
  amlReviewHitsGauge.set({ state: 'pending' }, summary.pendingCount);
  amlReviewHitsGauge.set({ state: 'overdue' }, summary.overdueCount);

  if (!summary.oldestPendingAt) {
    amlReviewOldestPendingAgeSeconds.set(0);
    return;
  }

  amlReviewOldestPendingAgeSeconds.set(
    Math.max(0, (Date.now() - summary.oldestPendingAt.getTime()) / 1000)
  );
};

const refreshPaymentWebhookMetrics = async () => {
  const { paymentWebhookEventsGauge, paymentWebhookOldestPendingAgeSeconds } =
    getObservabilityState();
  paymentWebhookEventsGauge.reset();
  paymentWebhookOldestPendingAgeSeconds.reset();

  const result = await client`
    SELECT
      provider,
      processing_status AS "processingStatus",
      signature_status AS "signatureStatus",
      count(*)::int AS count,
      min(
        CASE
          WHEN processing_status = 'pending' THEN last_received_at
          WHEN processing_status = 'processing' THEN processing_locked_at
          ELSE NULL
        END
      ) AS "oldestPendingAt"
    FROM payment_webhook_events
    GROUP BY provider, processing_status, signature_status
  `;
  const rows = readSqlRows<{
    provider: string;
    processingStatus: string;
    signatureStatus: string;
    count: number;
    oldestPendingAt: Date | string | null;
  }>(result);

  const oldestPendingByProvider = new Map<string, Date>();
  for (const row of rows) {
    const provider = readMetricValue(row.provider, 'unknown');
    const processingStatus = readMetricValue(row.processingStatus, 'unknown');
    const signatureStatus = readMetricValue(row.signatureStatus, 'unknown');
    paymentWebhookEventsGauge.set(
      {
        provider,
        processing_status: processingStatus,
        signature_status: signatureStatus,
      },
      Number(row.count ?? 0)
    );

    if (!row.oldestPendingAt) {
      continue;
    }

    const parsed = new Date(row.oldestPendingAt);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    const existing = oldestPendingByProvider.get(provider);
    if (!existing || parsed < existing) {
      oldestPendingByProvider.set(provider, parsed);
    }
  }

  for (const [provider, oldestPendingAt] of oldestPendingByProvider.entries()) {
    paymentWebhookOldestPendingAgeSeconds.set(
      { provider },
      Math.max(0, (Date.now() - oldestPendingAt.getTime()) / 1000)
    );
  }
};

const refreshPaymentReconciliationMetrics = async () => {
  const {
    paymentReconciliationOpenIssuesGauge,
    paymentReconciliationOldestOpenIssueAgeSeconds,
  } = getObservabilityState();
  paymentReconciliationOpenIssuesGauge.reset();
  paymentReconciliationOldestOpenIssueAgeSeconds.reset();

  const result = await client`
    SELECT
      coalesce(p.name, 'unassigned') AS provider,
      i.requires_manual_review AS "requiresManualReview",
      count(*)::int AS count,
      min(i.first_detected_at) AS "oldestDetectedAt"
    FROM payment_reconciliation_issues AS i
    LEFT JOIN payment_providers AS p
      ON p.id = i.provider_id
    WHERE i.status = 'open'
    GROUP BY coalesce(p.name, 'unassigned'), i.requires_manual_review
  `;
  const rows = readSqlRows<{
    provider: string;
    requiresManualReview: boolean;
    count: number;
    oldestDetectedAt: Date | string | null;
  }>(result);

  for (const row of rows) {
    const provider = readMetricValue(row.provider, 'unassigned');
    const requiresManualReview = row.requiresManualReview ? 'true' : 'false';
    paymentReconciliationOpenIssuesGauge.set(
      {
        provider,
        requires_manual_review: requiresManualReview,
      },
      Number(row.count ?? 0)
    );

    if (!row.oldestDetectedAt) {
      continue;
    }

    const oldestDetectedAt = new Date(row.oldestDetectedAt);
    if (Number.isNaN(oldestDetectedAt.getTime())) {
      continue;
    }

    paymentReconciliationOldestOpenIssueAgeSeconds.set(
      {
        provider,
        requires_manual_review: requiresManualReview,
      },
      Math.max(0, (Date.now() - oldestDetectedAt.getTime()) / 1000)
    );
  }
};

const refreshPaymentOutboundMetrics = async () => {
  const {
    paymentOutboundRequestsGauge,
    paymentOutboundOldestRetryAgeSeconds,
  } = getObservabilityState();
  paymentOutboundRequestsGauge.reset();
  paymentOutboundOldestRetryAgeSeconds.reset();

  const result = await client`
    SELECT
      send_status AS "sendStatus",
      coalesce(last_error_code, ${noMetricValue}) AS "errorCode",
      count(*)::int AS count,
      min(
        CASE
          WHEN send_status IN ('unknown', 'failed') THEN coalesce(last_sent_at, created_at)
          ELSE NULL
        END
      ) AS "oldestRetryAt"
    FROM payment_outbound_requests
    GROUP BY send_status, coalesce(last_error_code, ${noMetricValue})
  `;
  const rows = readSqlRows<{
    sendStatus: string;
    errorCode: string;
    count: number;
    oldestRetryAt: Date | string | null;
  }>(result);

  const oldestRetryByErrorCode = new Map<string, Date>();
  for (const row of rows) {
    const sendStatus = readMetricValue(row.sendStatus, 'unknown');
    const errorCode = readMetricValue(row.errorCode, noMetricValue);
    paymentOutboundRequestsGauge.set(
      {
        send_status: sendStatus,
        error_code: errorCode,
      },
      Number(row.count ?? 0)
    );

    if (!row.oldestRetryAt) {
      continue;
    }

    const oldestRetryAt = new Date(row.oldestRetryAt);
    if (Number.isNaN(oldestRetryAt.getTime())) {
      continue;
    }

    const existing = oldestRetryByErrorCode.get(errorCode);
    if (!existing || oldestRetryAt < existing) {
      oldestRetryByErrorCode.set(errorCode, oldestRetryAt);
    }
  }

  for (const [errorCode, oldestRetryAt] of oldestRetryByErrorCode.entries()) {
    paymentOutboundOldestRetryAgeSeconds.set(
      {
        error_code: errorCode,
      },
      Math.max(0, (Date.now() - oldestRetryAt.getTime()) / 1000)
    );
  }
};

const refreshSaasBillingMetrics = async () => {
  const {
    saasBillingRunsGauge,
    saasWebhookEventsGauge,
    saasWebhookOldestReadyAgeSeconds,
    saasWebhookRetryExhaustedTotal,
  } = getObservabilityState();
  const billingRunResult = await client`
    SELECT
      status,
      count(*)::int AS count
    FROM saas_billing_runs
    GROUP BY status
  `;
  const billingRunRows = readSqlRows<{
    status: string;
    count: number;
  }>(billingRunResult);

  for (const status of saasBillingRunStatuses) {
    const row = billingRunRows.find((item) => item.status === status);
    saasBillingRunsGauge.set({ status }, Number(row?.count ?? 0));
  }

  const webhookResult = await client`
    SELECT
      status,
      count(*)::int AS count,
      min(
        CASE
          WHEN status IN ('pending', 'failed') THEN next_attempt_at
          ELSE NULL
        END
      ) AS "oldestReadyAt"
    FROM saas_stripe_webhook_events
    GROUP BY status
  `;
  const webhookRows = readSqlRows<{
    status: string;
    count: number;
    oldestReadyAt: Date | string | null;
  }>(webhookResult);

  let oldestReadyAt: Date | null = null;
  for (const status of saasWebhookStatuses) {
    const row = webhookRows.find((item) => item.status === status);
    saasWebhookEventsGauge.set({ status }, Number(row?.count ?? 0));
    if (row?.oldestReadyAt) {
      const parsed = new Date(row.oldestReadyAt);
      if (!Number.isNaN(parsed.getTime()) && (!oldestReadyAt || parsed < oldestReadyAt)) {
        oldestReadyAt = parsed;
      }
    }
  }

  if (oldestReadyAt) {
    saasWebhookOldestReadyAgeSeconds.set(
      Math.max(0, (Date.now() - oldestReadyAt.getTime()) / 1000)
    );
  } else {
    saasWebhookOldestReadyAgeSeconds.set(0);
  }

  const retryExhaustedResult = await client`
    SELECT
      count(*)::int AS count
    FROM saas_stripe_webhook_events
    WHERE status = 'failed'
      AND attempts >= ${SAAS_WEBHOOK_RETRY_EXHAUSTED_ATTEMPTS_ALERT_THRESHOLD}
  `;
  const [retryExhaustedRow] = readSqlRows<{
    count: number;
  }>(retryExhaustedResult);
  saasWebhookRetryExhaustedTotal.set(Number(retryExhaustedRow?.count ?? 0));
};

const refreshSaasDistributionMetrics = async () => {
  const {
    saasDistributionDrawsGauge,
    saasDistributionTrackedDrawsGauge,
    saasDistributionTrackingCoverageRatioGauge,
    saasDistributionActualPayoutSumGauge,
    saasDistributionExpectedPayoutSumGauge,
    saasDistributionPayoutDeviationAmountGauge,
    saasDistributionPayoutDeviationRatioGauge,
    saasDistributionMaxBucketDeviationRatioGauge,
    saasDistributionActualBucketGauge,
    saasDistributionExpectedBucketGauge,
    saasDistributionBreachGauge,
  } = getObservabilityState();

  saasDistributionDrawsGauge.reset();
  saasDistributionTrackedDrawsGauge.reset();
  saasDistributionTrackingCoverageRatioGauge.reset();
  saasDistributionActualPayoutSumGauge.reset();
  saasDistributionExpectedPayoutSumGauge.reset();
  saasDistributionPayoutDeviationAmountGauge.reset();
  saasDistributionPayoutDeviationRatioGauge.reset();
  saasDistributionMaxBucketDeviationRatioGauge.reset();
  saasDistributionActualBucketGauge.reset();
  saasDistributionExpectedBucketGauge.reset();
  saasDistributionBreachGauge.reset();

  const snapshots = await refreshSaasDistributionSnapshots();
  for (const snapshot of snapshots) {
    const labels = {
      project_id: String(snapshot.projectId),
      project_slug: readMetricValue(snapshot.projectSlug, 'unknown'),
      environment: readMetricValue(snapshot.environment, 'unknown'),
      window: snapshot.windowKey,
    };

    saasDistributionDrawsGauge.set(labels, snapshot.drawCount);
    saasDistributionTrackedDrawsGauge.set(labels, snapshot.trackedDrawCount);
    saasDistributionTrackingCoverageRatioGauge.set(
      labels,
      snapshot.trackingCoverageRatio
    );
    saasDistributionActualPayoutSumGauge.set(
      labels,
      Number(snapshot.actualPayoutSum)
    );
    saasDistributionExpectedPayoutSumGauge.set(
      labels,
      Number(snapshot.expectedPayoutSum)
    );
    saasDistributionPayoutDeviationAmountGauge.set(
      labels,
      Number(snapshot.payoutDeviationAmount)
    );
    saasDistributionPayoutDeviationRatioGauge.set(
      labels,
      snapshot.payoutDeviationRatio
    );
    saasDistributionMaxBucketDeviationRatioGauge.set(
      labels,
      snapshot.maxBucketDeviationRatio
    );

    for (const bucket of saasDistributionMetricBuckets) {
      saasDistributionActualBucketGauge.set(
        {
          ...labels,
          bucket,
        },
        snapshot.actualBucketHistogram[bucket] ?? 0
      );
      saasDistributionExpectedBucketGauge.set(
        {
          ...labels,
          bucket,
        },
        snapshot.expectedBucketHistogram[bucket] ?? 0
      );
    }

    for (const reason of saasDistributionBreachReasons) {
      saasDistributionBreachGauge.set(
        {
          ...labels,
          reason,
        },
        snapshot.breachReasons.includes(reason) ? 1 : 0
      );
    }
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
  const config = getConfig();
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
        throw internalInvariantError('Redis client unavailable.');
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

const checkNotificationPushProvider = async () => {
  const { pushProvider } = getNotificationProviderStatus();
  const disabled = pushProvider === 'unavailable';

  return runDependencyCheck({
    name: 'auth_notification_push',
    required: false,
    disabled,
    details: {
      provider: pushProvider,
      probeType: 'configuration',
    },
    probe: disabled
      ? undefined
      : async () => {
          assertNotificationChannelAvailable('push');
        },
  });
};

const checkPaymentAutomation = async () => {
  const summary = getPaymentCapabilitySummary();

  return runDependencyCheck({
    name: 'payment_automation',
    required: summary.automatedExecutionRequested,
    disabled: !summary.automatedExecutionRequested,
    details: {
      operatingMode: summary.operatingMode,
      automatedExecutionRequested: summary.automatedExecutionRequested,
      automatedModeOptIn: summary.automatedModeOptIn,
      automatedExecutionEnabled: summary.automatedExecutionEnabled,
      automatedExecutionReady: summary.automatedExecutionReady,
      implementedAutomatedAdapters: summary.implementedAutomatedAdapters,
      missingCapabilities: summary.missingCapabilities,
    },
    probe: summary.automatedExecutionRequested
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
    checkNotificationPushProvider(),
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
    const {
      notificationDeliveriesGauge,
      notificationOldestPendingAgeSeconds,
    } = getObservabilityState();
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

    await refreshAmlReviewMetrics();
    await refreshWithdrawalStuckMetrics();
    await refreshPaymentWebhookMetrics();
    await refreshPaymentReconciliationMetrics();
    await refreshPaymentOutboundMetrics();
    await refreshSaasBillingMetrics();
    await refreshSaasDistributionMetrics();
  } catch (error) {
    logger.warning('failed to refresh observability operational metrics', {
      err: error,
    });
  }
};

export const registerHttpMetricsHooks = (app: FastifyInstance) => {
  const { httpRequestsTotal, httpRequestDurationSeconds } =
    getObservabilityState();
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

export const getMetricsContentType = () => getObservabilityState().registry.contentType;

export const renderMetrics = () => getObservabilityState().registry.metrics();

export const recordDrawRequestOutcome = (outcome: 'success' | 'error') => {
  getObservabilityState().drawRequestsTotal.inc({ outcome });
};

export const recordPaymentWebhookSignatureVerification = (payload: {
  provider: string;
  status: (typeof paymentWebhookSignatureStatuses)[number];
  reason?: string | null;
}) => {
  getObservabilityState().paymentWebhookSignatureVerificationsTotal.inc({
    provider: readMetricValue(payload.provider, 'unknown'),
    status: payload.status,
    reason: readMetricValue(payload.reason, noMetricValue),
  });
};

export const recordPaymentOutboundIdempotencyConflict = (payload: {
  provider: string;
  action: string;
  reason: string;
}) => {
  getObservabilityState().paymentOutboundIdempotencyConflictsTotal.inc({
    provider: readMetricValue(payload.provider, 'unknown'),
    action: readMetricValue(payload.action, 'unknown'),
    reason: readMetricValue(payload.reason, 'unknown'),
  });
};

export const recordStripeApiRequest = (payload: {
  surface: 'payment' | 'saas';
  operation: string;
  outcome: 'success' | 'failure';
  statusFamily: (typeof stripeApiStatusFamilies)[number];
}) => {
  getObservabilityState().stripeApiRequestsTotal.inc({
    surface: payload.surface,
    operation: readMetricValue(payload.operation, 'unknown'),
    outcome: payload.outcome,
    status_family: payload.statusFamily,
  });
};

export const recordStripeApiFailure = (payload: {
  surface: 'payment' | 'saas';
  operation: string;
  reason:
    | 'rate_limit'
    | 'server_error'
    | 'client_error'
    | 'transport_error'
    | 'unknown';
}) => {
  getObservabilityState().stripeApiFailuresTotal.inc({
    surface: payload.surface,
    operation: readMetricValue(payload.operation, 'unknown'),
    reason: payload.reason,
  });
};

export const recordRealtimePublishDuration = (payload: {
  scope: 'topic' | 'user' | 'session';
  channel: string;
  event: string;
  durationMs: number;
}) => {
  getObservabilityState().realtimePublishDurationSeconds.observe(
    {
      scope: payload.scope,
      channel: readMetricValue(payload.channel, 'unknown'),
      event: readMetricValue(payload.event, 'unknown'),
    },
    Math.max(0, payload.durationMs) / 1000
  );
};

export const recordRealtimeReceiveLatency = (payload: {
  surface: 'web' | 'ios' | 'android';
  channel: string;
  event: string;
  latencyMs: number;
}) => {
  getObservabilityState().realtimeReceiveLatencySeconds.observe(
    {
      surface: payload.surface,
      channel: readMetricValue(payload.channel, 'unknown'),
      event: readMetricValue(payload.event, 'unknown'),
    },
    Math.max(0, payload.latencyMs) / 1000
  );
};

export const resetObservabilityMetrics = () => {
  const { registry, appUp, buildInfo, runtimeMetadata } =
    getObservabilityState();
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
