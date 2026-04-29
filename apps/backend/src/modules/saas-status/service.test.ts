import { describe, expect, it } from 'vitest';

import {
  calculateObservedSlaPct,
  resolveSaasApiStatus,
  resolveSaasMetricStatus,
  resolveSaasWorkerStatus,
} from './service';

describe('saas status service helpers', () => {
  it('classifies metric thresholds into operational, degraded, and outage', () => {
    expect(
      resolveSaasMetricStatus(1.5, {
        degraded: 2,
        outage: 10,
      })
    ).toBe('operational');
    expect(
      resolveSaasMetricStatus(2, {
        degraded: 2,
        outage: 10,
      })
    ).toBe('degraded');
    expect(
      resolveSaasMetricStatus(12, {
        degraded: 2,
        outage: 10,
      })
    ).toBe('outage');
  });

  it('promotes API status to the worst threshold breach', () => {
    expect(
      resolveSaasApiStatus(0, 2600, {
        apiErrorRatePct: { degraded: 2, outage: 10 },
        apiP95Ms: { degraded: 1000, outage: 2500 },
      })
    ).toBe('outage');
    expect(
      resolveSaasApiStatus(3, 300, {
        apiErrorRatePct: { degraded: 2, outage: 10 },
        apiP95Ms: { degraded: 1000, outage: 2500 },
      })
    ).toBe('degraded');
  });

  it('reports worker lag and observed SLA percentages', () => {
    expect(
      resolveSaasWorkerStatus(75_000, {
        workerLagMs: { degraded: 60_000, outage: 300_000 },
      })
    ).toBe('degraded');
    expect(calculateObservedSlaPct(997, 1000)).toBe(99.7);
  });
});
