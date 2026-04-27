import fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendTelegramMessage } = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock('../../../shared/notify-telegram', () => ({
  escapeTelegramMarkdown: (value: string) => value,
  sendTelegramMessage,
}));

import { registerBillingAnomalyRoutes } from './billing-anomaly';

describe('billing anomaly routes', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify();
    sendTelegramMessage.mockReset();
    sendTelegramMessage.mockResolvedValue({
      chat: 'page',
      messageId: 202,
      chatId: 'page-chat',
    });

    await registerBillingAnomalyRoutes(app as never);
  });

  afterEach(async () => {
    await app.close();
  });

  it('relays billing anomalies into the page chat', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/billing-anomaly',
      payload: {
        title: 'AWS spend anomaly',
        severity: 'critical',
        provider: 'aws',
        projectName: 'reward-prod',
        currentSpend: 842.13,
        expectedSpend: 350,
        currency: 'USD',
        dashboardUrl: 'https://console.aws.amazon.com/cost-management/home',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: 'page',
        markdown: true,
        text: expect.stringContaining('AWS spend anomaly'),
      })
    );
    expect(response.json()).toEqual({
      ok: true,
      data: {
        accepted: true,
        chat: 'page',
        messageId: 202,
      },
    });
  });

  it('rejects unsupported payload shapes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/billing-anomaly',
      payload: ['unexpected'],
    });

    expect(response.statusCode).toBe(400);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
