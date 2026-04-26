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
    automatedExecutionEnabled: false,
    automatedExecutionReady: false,
    registeredAdapterKeys: ['manual_review'],
    implementedAutomatedAdapters: [],
    missingCapabilities: [
      'outbound_gateway_execution',
      'payment_webhook_entrypoint',
      'payment_webhook_signature_verification',
      'idempotent_retry_handling',
      'automated_reconciliation',
      'compensation_and_recovery',
    ],
  })),
  client: vi.fn(async () => [{ ok: 1 }]),
  config: {
    nodeEnv: 'test' as const,
    logLevel: 'info' as const,
    redisUrl: 'redis://localhost:6379',
    observabilityServiceName: 'backend',
    observabilityEnvironment: 'test',
    observabilityRelease: 'dev',
    observabilityCommitSha: 'unknown',
    paymentOperatingMode: 'manual_review' as 'manual_review' | 'automated',
  },
  getNotificationDeliverySummary: vi.fn(),
  getNotificationProviderStatus: vi.fn(),
  getPaymentCapabilitySummary: vi.fn(() => ({
    operatingMode: 'manual_review',
    automatedExecutionEnabled: false,
    automatedExecutionReady: false,
    registeredAdapterKeys: ['manual_review'],
    implementedAutomatedAdapters: [],
    missingCapabilities: [
      'outbound_gateway_execution',
      'payment_webhook_entrypoint',
      'payment_webhook_signature_verification',
      'idempotent_retry_handling',
      'automated_reconciliation',
      'compensation_and_recovery',
    ],
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
    getPaymentCapabilitySummary.mockImplementation(() => ({
      operatingMode: config.paymentOperatingMode,
      automatedExecutionEnabled: config.paymentOperatingMode === 'automated',
      automatedExecutionReady: false,
      registeredAdapterKeys: ['manual_review'],
      implementedAutomatedAdapters: [],
      missingCapabilities: [
        'outbound_gateway_execution',
        'payment_webhook_entrypoint',
        'payment_webhook_signature_verification',
        'idempotent_retry_handling',
        'automated_reconciliation',
        'compensation_and_recovery',
      ],
    }));
    assertAutomatedPaymentModeSupported.mockImplementation(() => {
      if (config.paymentOperatingMode === 'automated') {
        throw new Error('PAYMENT_OPERATING_MODE=automated is not supported yet.');
      }

      return getPaymentCapabilitySummary();
    });
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
            automatedExecutionReady: false,
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

  it('marks readiness as not_ready when automated payment mode is requested', async () => {
    config.paymentOperatingMode = 'automated';

    const report = await buildReadinessReport();

    expect(report.status).toBe('not_ready');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'payment_automation',
          status: 'down',
          required: true,
          error: expect.stringContaining(
            'PAYMENT_OPERATING_MODE=automated is not supported yet.'
          ),
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

    await refreshOperationalMetrics();

    const metrics = await renderMetrics();

    expect(metrics).toContain('reward_backend_auth_notification_deliveries');
    expect(metrics).toContain('status="pending"');
    expect(metrics).toContain('status="failed"');
    expect(metrics).toContain('reward_backend_auth_notification_oldest_pending_age_seconds');
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
