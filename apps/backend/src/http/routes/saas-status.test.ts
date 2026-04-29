import fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getPublicSaasStatusPage } = vi.hoisted(() => ({
  getPublicSaasStatusPage: vi.fn(),
}));

vi.mock('../../modules/saas-status/service', () => ({
  getPublicSaasStatusPage,
}));

import { registerSaasStatusRoutes } from './saas-status';

describe('saas status routes', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify();
    getPublicSaasStatusPage.mockResolvedValue({
      summary: {
        generatedAt: '2026-04-29T00:00:00.000Z',
        latestMinuteStart: '2026-04-29T00:00:00.000Z',
        currentStatus: 'operational',
        currentWindowMinutes: 5,
        totalRequestsLastHour: 120,
        availabilityEligibleRequestsLastHour: 120,
        availabilityErrorRatePctLastHour: 0,
        peakApiP95MsLastHour: 280,
        workerLagMsCurrent: 0,
      },
      monthlySla: {
        month: '2026-04',
        targetPct: 99.9,
        actualPct: 100,
        metTarget: true,
        observedMinutes: 1,
        elapsedMinutes: 1,
        coveragePct: 100,
        operationalMinutes: 1,
        degradedMinutes: 0,
        outageMinutes: 0,
        trackingStartedAt: '2026-04-29T00:00:00.000Z',
      },
      thresholds: {
        apiErrorRatePct: { degraded: 2, outage: 10 },
        apiP95Ms: { degraded: 1000, outage: 2500 },
        workerLagMs: { degraded: 60000, outage: 300000 },
        monthlySlaTargetPct: 99.9,
      },
      recentMinutes: [],
    });

    await registerSaasStatusRoutes(app as never);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns public SaaS status payloads through the standard envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/status/saas',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: expect.objectContaining({
        summary: expect.objectContaining({
          currentStatus: 'operational',
        }),
        monthlySla: expect.objectContaining({
          month: '2026-04',
        }),
      }),
    });
  });
});
