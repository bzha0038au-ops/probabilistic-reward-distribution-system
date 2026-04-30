import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { buildBackendUrl, loadPublicSaasStatusPage } from '../lib/status';

const originalFetch = globalThis.fetch;

const validStatusPage = {
  summary: {
    generatedAt: '2026-05-01T00:00:00.000Z',
    latestMinuteStart: '2026-05-01T00:00:00.000Z',
    currentStatus: 'operational',
    currentWindowMinutes: 5,
    totalRequestsLastHour: 42,
    availabilityEligibleRequestsLastHour: 42,
    availabilityErrorRatePctLastHour: 0,
    peakApiP95MsLastHour: 180,
    workerLagMsCurrent: 0,
  },
  monthlySla: {
    month: '2026-05',
    targetPct: 99.9,
    actualPct: 100,
    metTarget: true,
    observedMinutes: 1,
    elapsedMinutes: 1,
    coveragePct: 100,
    operationalMinutes: 1,
    degradedMinutes: 0,
    outageMinutes: 0,
    trackingStartedAt: '2026-05-01T00:00:00.000Z',
  },
  thresholds: {
    apiErrorRatePct: { degraded: 2, outage: 10 },
    apiP95Ms: { degraded: 1000, outage: 2500 },
    workerLagMs: { degraded: 60000, outage: 300000 },
    monthlySlaTargetPct: 99.9,
  },
  recentMinutes: [
    {
      minuteStart: '2026-05-01T00:00:00.000Z',
      totalRequestCount: 42,
      availabilityEligibleRequestCount: 42,
      availabilityErrorCount: 0,
      errorRatePct: 0,
      apiP95Ms: 180,
      workerLagMs: 0,
      stripeWebhookReadyCount: 0,
      stripeWebhookLagMs: 0,
      outboundWebhookReadyCount: 0,
      outboundWebhookLagMs: 0,
      apiStatus: 'operational',
      workerStatus: 'operational',
      overallStatus: 'operational',
      computedAt: '2026-05-01T00:00:05.000Z',
    },
  ],
} as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('loadPublicSaasStatusPage returns parsed status data for a valid envelope', async () => {
  let requestedUrl = '';

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    return new Response(JSON.stringify({ ok: true, data: validStatusPage }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  }) as typeof fetch;

  const result = await loadPublicSaasStatusPage();

  assert.equal(result.error, null);
  assert.equal(result.data?.summary.currentStatus, 'operational');
  assert.equal(result.data?.recentMinutes.length, 1);
  assert.equal(requestedUrl, buildBackendUrl('/status/saas'));
});

test('loadPublicSaasStatusPage returns an error when the backend envelope is invalid', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  }) as typeof fetch;

  const result = await loadPublicSaasStatusPage();

  assert.equal(result.data, null);
  assert.match(
    result.error ?? '',
    /invalid API envelope/i,
  );
});
