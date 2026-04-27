import fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendTelegramMessage } = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock('../../../shared/notify-telegram', () => ({
  escapeTelegramMarkdown: (value: string) => value,
  sendTelegramMessage,
}));

import { registerAlertRelayRoutes } from './alert-relay';

describe('alert relay routes', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify();
    sendTelegramMessage.mockReset();
    sendTelegramMessage.mockResolvedValue({
      chat: 'page',
      messageId: 101,
      chatId: 'page-chat',
    });

    await registerAlertRelayRoutes(app as never);
  });

  afterEach(async () => {
    await app.close();
  });

  it('routes critical alerts into the page chat', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/alert-relay',
      payload: {
        status: 'firing',
        receiver: 'backend',
        commonLabels: {
          severity: 'critical',
        },
        alerts: [
          {
            status: 'firing',
            labels: {
              alertname: 'BackendHighLatency',
              severity: 'critical',
            },
            annotations: {
              summary: 'p99 latency above 2s',
              runbook_url: 'https://example.com/runbook/backend-high-latency',
            },
            startsAt: '2026-04-28T00:00:00.000Z',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: 'page',
        text: expect.stringContaining('BackendHighLatency'),
      })
    );
    expect(sendTelegramMessage.mock.calls[0]?.[0]?.text.split('\n')[0]).toBe(
      'https://example.com/runbook/backend-high-latency'
    );
    expect(response.json()).toEqual({
      ok: true,
      data: {
        accepted: true,
        chat: 'page',
        severity: 'critical',
        alerts: 1,
        messageId: 101,
      },
    });
  });

  it('accepts generic ops-notify payloads and keeps the runbook url on the first line', async () => {
    sendTelegramMessage.mockResolvedValue({
      chat: 'ticket',
      messageId: 303,
      chatId: 'ticket-chat',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/internal/alert-relay',
      payload: {
        severity: 'ticket',
        title: 'Reward Stripe API is degraded',
        runbook_url: 'https://example.com/runbook/stripe',
        source: 'reward-system-ops',
        body: [
          'https://example.com/runbook/stripe',
          '[ticket] Reward Stripe API is degraded',
          'Stripe rate limiting, Stripe 5xx responses, or queued outbound retries indicate degraded provider automation.',
          'source=reward-system-ops',
        ].join('\n'),
      },
    });

    expect(response.statusCode).toBe(202);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: 'ticket',
        text: [
          'https://example.com/runbook/stripe',
          '[ticket] Reward Stripe API is degraded',
          'Stripe rate limiting, Stripe 5xx responses, or queued outbound retries indicate degraded provider automation.',
          'source=reward-system-ops',
        ].join('\n'),
      })
    );
    expect(response.json()).toEqual({
      ok: true,
      data: {
        accepted: true,
        chat: 'ticket',
        severity: 'ticket',
        alerts: 1,
        messageId: 303,
      },
    });
  });

  it('routes text-only ops-notify payloads using the rendered severity prefix', async () => {
    sendTelegramMessage.mockResolvedValue({
      chat: 'page',
      messageId: 404,
      chatId: 'page-chat',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/internal/alert-relay',
      payload: {
        text: [
          'https://example.com/runbook/not-ready',
          '[critical] Reward backend is not ready',
          'A required dependency has been unhealthy for at least 5 minutes.',
          'source=reward-system-ops',
        ].join('\n'),
      },
    });

    expect(response.statusCode).toBe(202);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: 'page',
        text: [
          'https://example.com/runbook/not-ready',
          '[critical] Reward backend is not ready',
          'A required dependency has been unhealthy for at least 5 minutes.',
          'source=reward-system-ops',
        ].join('\n'),
      })
    );
    expect(response.json()).toEqual({
      ok: true,
      data: {
        accepted: true,
        chat: 'page',
        severity: 'critical',
        alerts: 1,
        messageId: 404,
      },
    });
  });

  it('rejects malformed alertmanager payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/alert-relay',
      payload: {
        alerts: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
