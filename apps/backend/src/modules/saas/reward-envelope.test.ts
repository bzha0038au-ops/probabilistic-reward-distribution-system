import { describe, expect, it } from 'vitest';

import {
  assertRewardEnvelopeNotRejected,
  evaluateRewardEnvelopeDecision,
  type RewardEnvelopeState,
} from './reward-envelope';

const baseDate = new Date('2026-04-28T00:00:00.000Z');

const makeEnvelopeState = (
  overrides: Partial<RewardEnvelopeState> = {}
): RewardEnvelopeState => ({
  id: 1,
  tenantId: 10,
  projectId: null,
  window: 'minute',
  onCapHitStrategy: 'mute',
  budgetCap: '10.0000',
  expectedPayoutPerCall: '2.0000',
  varianceCap: '1.0000',
  currentConsumed: '0.0000',
  currentCallCount: 0,
  currentWindowStartedAt: baseDate,
  updatedAt: baseDate,
  scope: 'tenant',
  ...overrides,
});

describe('reward envelope', () => {
  it('mutes when the expected payout would breach the budget cap', () => {
    const decision = evaluateRewardEnvelopeDecision(
      [
        makeEnvelopeState({
          projectId: 22,
          scope: 'project',
          budgetCap: '3.0000',
          expectedPayoutPerCall: '5.0000',
        }),
      ],
      { kind: 'expected' }
    );

    expect(decision).toEqual({
      mode: 'mute',
      triggered: [
        {
          scope: 'project',
          window: 'minute',
          reason: 'budget_cap',
          strategy: 'mute',
        },
      ],
    });
  });

  it('rejects when any triggered envelope uses reject strategy', () => {
    const decision = evaluateRewardEnvelopeDecision(
      [
        makeEnvelopeState({
          onCapHitStrategy: 'reject',
          budgetCap: '1.0000',
          expectedPayoutPerCall: '2.0000',
        }),
      ],
      { kind: 'expected' }
    );

    expect(() => assertRewardEnvelopeNotRejected(decision)).toThrow(
      /Reward envelope limit exceeded/
    );
  });

  it('uses actual payout for the variance safeguard', () => {
    const decision = evaluateRewardEnvelopeDecision(
      [
        makeEnvelopeState({
          projectId: 33,
          scope: 'project',
          budgetCap: '999.0000',
          expectedPayoutPerCall: '0.5000',
          varianceCap: '0.2500',
        }),
      ],
      { kind: 'actual', rewardAmount: '4.00' }
    );

    expect(decision).toEqual({
      mode: 'mute',
      triggered: [
        {
          scope: 'project',
          window: 'minute',
          reason: 'variance_cap',
          strategy: 'mute',
        },
      ],
    });
  });

  it('allows calls when no envelope is triggered', () => {
    const decision = evaluateRewardEnvelopeDecision(
      [makeEnvelopeState()],
      { kind: 'actual', rewardAmount: '1.50' }
    );

    expect(decision).toEqual({
      mode: 'allow',
      triggered: [],
    });
  });
});
