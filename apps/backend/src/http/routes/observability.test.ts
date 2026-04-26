import fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildLivenessReport,
  buildReadinessReport,
  getMetricsContentType,
  refreshOperationalMetrics,
  renderMetrics,
} = vi.hoisted(() => ({
  buildLivenessReport: vi.fn(),
  buildReadinessReport: vi.fn(),
  getMetricsContentType: vi.fn(),
  refreshOperationalMetrics: vi.fn(),
  renderMetrics: vi.fn(),
}));

vi.mock('../../shared/observability', () => ({
  buildLivenessReport,
  buildReadinessReport,
  getMetricsContentType,
  refreshOperationalMetrics,
  renderMetrics,
}));

import { registerObservabilityRoutes } from './observability';

describe('observability routes', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify();
    buildLivenessReport.mockReturnValue({
      status: 'ok',
      service: 'backend',
      checkedAt: '2026-01-01T00:00:00.000Z',
      uptimeSeconds: 12,
    });
    buildReadinessReport.mockResolvedValue({
      status: 'ready',
      service: 'backend',
      checkedAt: '2026-01-01T00:00:00.000Z',
      uptimeSeconds: 12,
      checks: [],
    });
    getMetricsContentType.mockReturnValue('text/plain; version=0.0.4');
    refreshOperationalMetrics.mockResolvedValue(undefined);
    renderMetrics.mockResolvedValue('# metrics');

    await registerObservabilityRoutes(app as never);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns raw JSON for readiness failures', async () => {
    buildReadinessReport.mockResolvedValueOnce({
      status: 'not_ready',
      service: 'backend',
      checkedAt: '2026-01-01T00:00:00.000Z',
      uptimeSeconds: 12,
      checks: [
        {
          name: 'postgres',
          required: true,
          status: 'down',
          latencyMs: 5,
          error: 'connection refused',
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'not_ready',
      service: 'backend',
      checkedAt: '2026-01-01T00:00:00.000Z',
      uptimeSeconds: 12,
      checks: [
        {
          name: 'postgres',
          required: true,
          status: 'down',
          latencyMs: 5,
          error: 'connection refused',
        },
      ],
    });
  });

  it('returns Prometheus text for metrics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(refreshOperationalMetrics).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain; version=0.0.4');
    expect(response.body).toBe('# metrics');
  });
});
