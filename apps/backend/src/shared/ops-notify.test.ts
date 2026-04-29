import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchOpsAlert } from './ops-notify';

describe('ops notify', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers to both Slack and PagerDuty when configured', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'ok',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({
          status: 'success',
          dedup_key: 'wallet-reconciliation:user-42',
        }),
      });

    const result = await dispatchOpsAlert({
      summary: 'Wallet reconciliation alert opened',
      text: 'delta=6.75 user=42',
      severity: 'critical',
      source: 'reward-backend',
      dedupKey: 'wallet-reconciliation:user-42',
      slackWebhookUrl: 'https://hooks.slack.test/services/abc',
      pagerDutyRoutingKey: 'pd-routing-key',
    });

    expect(result).toEqual({
      delivered: true,
      channels: ['slack', 'pagerduty'],
      pagerDutyDedupKey: 'wallet-reconciliation:user-42',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://hooks.slack.test/services/abc',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://events.pagerduty.com/v2/enqueue',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          routing_key: 'pd-routing-key',
          event_action: 'trigger',
          dedup_key: 'wallet-reconciliation:user-42',
          payload: {
            summary: 'Wallet reconciliation alert opened',
            severity: 'critical',
            source: 'reward-backend',
            component: undefined,
            custom_details: {
              text: 'delta=6.75 user=42',
            },
          },
        }),
      })
    );
  });

  it('accepts resolve events without a PagerDuty payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        status: 'success',
        dedup_key: 'wallet-reconciliation:user-42',
      }),
    });

    const result = await dispatchOpsAlert({
      summary: 'Wallet reconciliation alert resolved',
      text: 'resolved',
      severity: 'critical',
      source: 'reward-backend',
      dedupKey: 'wallet-reconciliation:user-42',
      action: 'resolve',
      pagerDutyRoutingKey: 'pd-routing-key',
    });

    expect(result).toEqual({
      delivered: true,
      channels: ['pagerduty'],
      pagerDutyDedupKey: 'wallet-reconciliation:user-42',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://events.pagerduty.com/v2/enqueue',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          routing_key: 'pd-routing-key',
          event_action: 'resolve',
          dedup_key: 'wallet-reconciliation:user-42',
        }),
      })
    );
  });
});
