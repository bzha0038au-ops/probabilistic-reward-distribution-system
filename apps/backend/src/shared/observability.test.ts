import fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assertNotificationChannelAvailable,
  client,
  config,
  getNotificationDeliverySummary,
  getNotificationProviderStatus,
  getRedis,
  getPaymentCapabilitySummary,
  getRuntimeMetadata,
  redisPing,
  assertAutomatedPaymentModeSupported,
  logger,
} = vi.hoisted(() => ({
  assertNotificationChannelAvailable: vi.fn(),
  assertAutomatedPaymentModeSupported: vi.fn(() => ({
    operatingMode: 'manual_review',
    automatedExecutionRequested: false,
    automatedModeOptIn: false,
    automatedExecutionEnabled: false,
    automatedExecutionReady: true,
    registeredAdapterKeys: ['manual_review', 'stripe'],
    implementedAutomatedAdapters: ['stripe'],
    missingCapabilities: [],
  })),
  client: vi.fn(async (): Promise<unknown[]> => [{ ok: 1 }]),
  config: {
    nodeEnv: 'test' as const,
    logLevel: 'info' as const,
    redisUrl: 'redis://localhost:6379',
    observabilityServiceName: 'backend',
    observabilityEnvironment: 'test',
    observabilityRelease: 'dev',
    observabilityCommitSha: 'unknown',
    paymentOperatingMode: 'manual_review' as 'manual_review' | 'automated',
    paymentAutomatedModeOptIn: false,
    saasBillingWorkerEnabled: true,
    saasBillingWorkerIntervalMs: 5_000,
    saasBillingWebhookBatchSize: 25,
    saasBillingWebhookLockTimeoutMs: 120_000,
    saasBillingAutomationEnabled: true,
    saasBillingAutomationBatchSize: 100,
  },
  getNotificationDeliverySummary: vi.fn(),
  getNotificationProviderStatus: vi.fn(),
  getPaymentCapabilitySummary: vi.fn(() => ({
    operatingMode: 'manual_review',
    automatedExecutionRequested: false,
    automatedModeOptIn: false,
    automatedExecutionEnabled: false,
    automatedExecutionReady: true,
    registeredAdapterKeys: ['manual_review', 'stripe'],
    implementedAutomatedAdapters: ['stripe'],
    missingCapabilities: [],
  })),
  getRedis: vi.fn(),
  getRuntimeMetadata: vi.fn(() => ({
    serviceName: 'backend',
    environment: 'test',
    release: 'dev',
    commitSha: 'unknown',
  })),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
  },
  redisPing: vi.fn(),
}));

vi.mock('../db.ts', () => ({
  client,
}));
vi.mock('../db', () => ({
  client,
}));

vi.mock('../modules/auth/notification-service.ts', () => ({
  assertNotificationChannelAvailable,
  getNotificationDeliverySummary,
  getNotificationProviderStatus,
}));
vi.mock('../modules/auth/notification-service', () => ({
  assertNotificationChannelAvailable,
  getNotificationDeliverySummary,
  getNotificationProviderStatus,
}));

vi.mock('./config.ts', () => ({
  getConfig: () => config,
}));
vi.mock('./config', () => ({
  getConfig: () => config,
}));

vi.mock('./redis.ts', () => ({
  getRedis,
}));
vi.mock('./redis', () => ({
  getRedis,
}));
vi.mock('./logger.ts', () => ({
  logger,
}));
vi.mock('./logger', () => ({
  logger,
}));
vi.mock('./runtime-metadata.ts', () => ({
  getRuntimeMetadata,
}));
vi.mock('./runtime-metadata', () => ({
  getRuntimeMetadata,
}));

vi.mock('../modules/payment/service.ts', () => ({
  assertAutomatedPaymentModeSupported,
  getPaymentCapabilitySummary,
}));
vi.mock('../modules/payment/service', () => ({
  assertAutomatedPaymentModeSupported,
  getPaymentCapabilitySummary,
}));

import {
  buildLivenessReport,
  buildReadinessReport,
  recordPaymentOutboundIdempotencyConflict,
  recordPaymentWebhookSignatureVerification,
  recordStripeApiFailure,
  recordStripeApiRequest,
  refreshOperationalMetrics,
  registerHttpMetricsHooks,
  renderMetrics,
  resetObservabilityMetrics,
} from './observability';

describe('observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.nodeEnv = 'test';
    config.logLevel = 'info';
    config.redisUrl = 'redis://localhost:6379';
    config.observabilityServiceName = 'backend';
    config.observabilityEnvironment = 'test';
    config.observabilityRelease = 'dev';
    config.observabilityCommitSha = 'unknown';
    config.paymentOperatingMode = 'manual_review';
    config.paymentAutomatedModeOptIn = false;
    config.saasBillingWorkerEnabled = true;
    config.saasBillingWorkerIntervalMs = 5_000;
    config.saasBillingWebhookBatchSize = 25;
    config.saasBillingWebhookLockTimeoutMs = 120_000;
    config.saasBillingAutomationEnabled = true;
    config.saasBillingAutomationBatchSize = 100;
    getPaymentCapabilitySummary.mockImplementation(() => ({
      operatingMode: config.paymentOperatingMode,
      automatedExecutionRequested: config.paymentOperatingMode === 'automated',
      automatedModeOptIn: config.paymentAutomatedModeOptIn,
      automatedExecutionEnabled:
        config.paymentOperatingMode === 'automated' &&
        config.paymentAutomatedModeOptIn,
      automatedExecutionReady: true,
      registeredAdapterKeys: ['manual_review', 'stripe'],
      implementedAutomatedAdapters: ['stripe'],
      missingCapabilities: [],
    }));
    assertAutomatedPaymentModeSupported.mockImplementation(() =>
      getPaymentCapabilitySummary()
    );
    client.mockResolvedValue([{ ok: 1 }]);
    redisPing.mockResolvedValue('PONG');
    getRedis.mockReturnValue({
      ping: redisPing,
    });
    assertNotificationChannelAvailable.mockImplementation(() => undefined);
    getNotificationDeliverySummary.mockResolvedValue({
      counts: {
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
      },
      oldestPendingAt: null,
      providers: {
        emailProvider: 'mock',
        smsProvider: 'mock',
      },
    });
    getNotificationProviderStatus.mockReturnValue({
      emailProvider: 'mock',
      smsProvider: 'mock',
    });
    resetObservabilityMetrics();
  });

  it('builds a liveness report with uptime metadata', () => {
    const report = buildLivenessReport();

    expect(report.status).toBe('ok');
    expect(report.service).toBe('backend');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(report.checkedAt).toMatch(/T/);
  });

  it('marks readiness as ready when required dependencies are healthy', async () => {
    const report = await buildReadinessReport();

    expect(report.status).toBe('ready');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'postgres', status: 'up', required: true }),
        expect.objectContaining({ name: 'redis', status: 'up', required: false }),
        expect.objectContaining({
          name: 'auth_notification_email',
          status: 'up',
          required: true,
        }),
        expect.objectContaining({
          name: 'payment_automation',
          status: 'disabled',
          required: false,
          details: expect.objectContaining({
            operatingMode: 'manual_review',
            automatedExecutionRequested: false,
            automatedModeOptIn: false,
            automatedExecutionReady: true,
          }),
        }),
      ])
    );
  });

  it('marks readiness as degraded when optional redis is down', async () => {
    redisPing.mockRejectedValueOnce(new Error('redis timeout'));

    const report = await buildReadinessReport();

    expect(report.status).toBe('degraded');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'redis',
          status: 'down',
          required: false,
          error: 'redis timeout',
        }),
      ])
    );
  });

  it('marks readiness as not_ready when email delivery is unavailable', async () => {
    getNotificationProviderStatus.mockReturnValue({
      emailProvider: 'unavailable',
      smsProvider: 'mock',
    });
    assertNotificationChannelAvailable.mockImplementation((channel: string) => {
      if (channel === 'email') {
        throw new Error('Auth email provider is not configured.');
      }
    });

    const report = await buildReadinessReport();

    expect(report.status).toBe('not_ready');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'auth_notification_email',
          status: 'down',
          required: true,
          error: 'Auth email provider is not configured.',
        }),
      ])
    );
  });

  it('marks readiness payment automation as up when automated mode is requested and the backend is ready', async () => {
    config.paymentOperatingMode = 'automated';
    config.paymentAutomatedModeOptIn = true;

    const report = await buildReadinessReport();

    expect(report.status).toBe('ready');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'payment_automation',
          status: 'up',
          required: true,
          details: expect.objectContaining({
            operatingMode: 'automated',
            automatedExecutionRequested: true,
            automatedModeOptIn: true,
            automatedExecutionReady: true,
          }),
        }),
      ])
    );
  });

  it('exports notification backlog metrics for alerting', async () => {
    getNotificationDeliverySummary.mockResolvedValueOnce({
      counts: {
        pending: 3,
        processing: 1,
        sent: 8,
        failed: 2,
      },
      oldestPendingAt: new Date(Date.now() - 30_000),
      providers: {
        emailProvider: 'mock',
        smsProvider: 'mock',
      },
    });
    client
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          provider: 'stripe',
          processingStatus: 'pending',
          signatureStatus: 'verified',
          count: 2,
          oldestPendingAt: new Date(Date.now() - 60_000),
        },
        {
          provider: 'stripe',
          processingStatus: 'failed',
          signatureStatus: 'failed',
          count: 1,
          oldestPendingAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          provider: 'stripe',
          requiresManualReview: true,
          count: 4,
          oldestDetectedAt: new Date(Date.now() - 120_000),
        },
      ])
      .mockResolvedValueOnce([
        {
          sendStatus: 'unknown',
          errorCode: 'stripe_rate_limit',
          count: 2,
          oldestRetryAt: new Date(Date.now() - 90_000),
        },
        {
          sendStatus: 'sent',
          errorCode: 'none',
          count: 8,
          oldestRetryAt: null,
        },
      ])
      .mockResolvedValueOnce([
        { status: 'paid', count: 2 },
        { status: 'failed', count: 1 },
      ])
      .mockResolvedValueOnce([
        {
          status: 'pending',
          count: 3,
          oldestReadyAt: new Date(Date.now() - 45_000),
        },
        {
          status: 'processed',
          count: 10,
          oldestReadyAt: null,
        },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);

    await refreshOperationalMetrics();

    const metrics = await renderMetrics();

    expect(metrics).toContain('reward_backend_auth_notification_deliveries');
    expect(metrics).toContain('status="pending"');
    expect(metrics).toContain('status="failed"');
    expect(metrics).toContain('reward_backend_auth_notification_oldest_pending_age_seconds');
    expect(metrics).toContain('reward_backend_payment_webhook_events_total');
    expect(metrics).toContain('reward_backend_payment_webhook_oldest_pending_age_seconds');
    expect(metrics).toContain('reward_backend_payment_reconciliation_open_issues_total');
    expect(metrics).toContain('reward_backend_payment_reconciliation_oldest_open_issue_age_seconds');
    expect(metrics).toContain('reward_backend_payment_outbound_requests_total');
    expect(metrics).toContain('reward_backend_payment_outbound_oldest_retry_age_seconds');
    expect(metrics).toContain('reward_backend_saas_billing_runs_total');
    expect(metrics).toContain('reward_backend_saas_webhook_events_total');
    expect(metrics).toContain('reward_backend_saas_webhook_oldest_ready_age_seconds');
    expect(metrics).toContain('reward_backend_saas_webhook_retry_exhausted_total');
  });

  it('records payment runtime counters for Prometheus alerts', async () => {
    recordPaymentWebhookSignatureVerification({
      provider: 'stripe',
      status: 'failed',
      reason: 'signature_mismatch',
    });
    recordPaymentOutboundIdempotencyConflict({
      provider: 'stripe',
      action: 'create_deposit_order',
      reason: 'payload_mismatch',
    });
    recordStripeApiRequest({
      surface: 'saas',
      operation: 'invoices.retrieve',
      outcome: 'failure',
      statusFamily: '5xx',
    });
    recordStripeApiFailure({
      surface: 'saas',
      operation: 'invoices.retrieve',
      reason: 'server_error',
    });

    const metrics = await renderMetrics();

    expect(metrics).toContain('reward_backend_payment_webhook_signature_verifications_total');
    expect(metrics).toContain('reason="signature_mismatch"');
    expect(metrics).toContain('reward_backend_payment_outbound_idempotency_conflicts_total');
    expect(metrics).toContain('reward_backend_stripe_api_requests_total');
    expect(metrics).toContain('reward_backend_stripe_api_failures_total');
  });

  it('records per-route HTTP metrics', async () => {
    const app = fastify();
    registerHttpMetricsHooks(app);
    app.get('/ping', async (_request, reply) => reply.code(204).send());

    await app.inject({
      method: 'GET',
      url: '/ping',
    });

    const metrics = await renderMetrics();

    expect(metrics).toContain('reward_backend_http_requests_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/ping"');
    expect(metrics).toContain('status_code="204"');

    await app.close();
  });
});
