import { describe, expect, it } from 'vitest';

import {
  buildDrawDistributionTelemetry,
  buildSaasDistributionSnapshots,
} from './distribution-monitoring';

describe('distribution monitoring', () => {
  it('builds exact and bucket payout expectations for a draw', () => {
    const telemetry = buildDrawDistributionTelemetry({
      availablePrizes: [
        {
          rewardAmount: '5.00',
          weight: 3,
        },
      ],
      missWeight: 7,
      actualRewardAmount: '5.00',
    });

    expect(telemetry).toMatchObject({
      bucketScheme: 'payout_amount_v1',
      actualPayoutBucket: 'gt1_to_lte5',
      expectedRewardAmount: '1.50',
      expectedPayoutHistogram: {
        '0.00': '0.700000000000',
        '5.00': '0.300000000000',
      },
      expectedBucketHistogram: {
        zero: '0.700000000000',
        gt1_to_lte5: '0.300000000000',
      },
    });
  });

  it('builds rolling snapshots and flags breached windows once sample thresholds are met', () => {
    const now = new Date('2026-04-28T12:00:00.000Z');
    const telemetry = buildDrawDistributionTelemetry({
      availablePrizes: [
        {
          rewardAmount: '5.00',
          weight: 3,
        },
      ],
      missWeight: 7,
      actualRewardAmount: '5.00',
    });

    const snapshots = buildSaasDistributionSnapshots(
      [
        {
          projectId: 7,
          projectSlug: 'alpha',
          environment: 'sandbox',
          projectMetadata: {
            distributionMonitoring: {
              minDrawCount: {
                '1m': 2,
                '1h': 2,
                '24h': 2,
              },
              evDeviationRatioThreshold: 0.1,
              bucketDeviationRatioThreshold: 0.05,
              trackingCoverageRatioThreshold: 1,
            },
          },
          createdAt: new Date('2026-04-28T11:59:40.000Z'),
          rewardAmount: '5.00',
          recordMetadata: {
            distribution: telemetry,
          },
        },
        {
          projectId: 7,
          projectSlug: 'alpha',
          environment: 'sandbox',
          projectMetadata: {
            distributionMonitoring: {
              minDrawCount: {
                '1m': 2,
                '1h': 2,
                '24h': 2,
              },
              evDeviationRatioThreshold: 0.1,
              bucketDeviationRatioThreshold: 0.05,
              trackingCoverageRatioThreshold: 1,
            },
          },
          createdAt: new Date('2026-04-28T11:58:00.000Z'),
          rewardAmount: '5.00',
          recordMetadata: {
            distribution: telemetry,
          },
        },
      ],
      now,
    );

    const oneMinute = snapshots.find((snapshot) => snapshot.windowKey === '1m');
    const oneHour = snapshots.find((snapshot) => snapshot.windowKey === '1h');

    expect(oneMinute).toMatchObject({
      drawCount: 1,
      trackedDrawCount: 1,
      alertEligible: false,
      breachReasons: [],
      actualPayoutSum: '5.00',
      expectedPayoutSum: '1.50',
    });
    expect(oneHour).toMatchObject({
      drawCount: 2,
      trackedDrawCount: 2,
      trackingCoverageRatio: 1,
      alertEligible: true,
      actualPayoutSum: '10.00',
      expectedPayoutSum: '3.00',
      payoutDeviationAmount: '7.00',
      breachReasons: ['ev_deviation', 'bucket_share_deviation'],
      actualBucketHistogram: {
        zero: 0,
        gt0_to_lte1: 0,
        gt1_to_lte5: 2,
        gt5_to_lte10: 0,
        gt10_to_lte25: 0,
        gt25_to_lte100: 0,
        gt100: 0,
      },
      expectedBucketHistogram: {
        zero: 1.4,
        gt0_to_lte1: 0,
        gt1_to_lte5: 0.6,
        gt5_to_lte10: 0,
        gt10_to_lte25: 0,
        gt25_to_lte100: 0,
        gt100: 0,
      },
    });
  });
});
