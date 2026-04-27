import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  escapeTelegramMarkdown,
  resetConfig,
} from './index';
import { sendTelegramMessage } from './notify-telegram';

describe('notify telegram', () => {
  const originalEnv = {
    databaseUrl: process.env.DATABASE_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramPageChatId: process.env.TELEGRAM_PAGE_CHAT_ID,
    telegramTicketChatId: process.env.TELEGRAM_TICKET_CHAT_ID,
    telegramDigestChatId: process.env.TELEGRAM_DIGEST_CHAT_ID,
  };

  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.DATABASE_URL =
      originalEnv.databaseUrl ?? 'postgres://reward:reward@localhost:5432/reward_test';
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_PAGE_CHAT_ID = 'page-chat';
    process.env.TELEGRAM_TICKET_CHAT_ID = 'ticket-chat';
    process.env.TELEGRAM_DIGEST_CHAT_ID = 'digest-chat';
    resetConfig();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    resetConfig();
    vi.unstubAllGlobals();

    if (originalEnv.databaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv.databaseUrl;
    }

    if (originalEnv.telegramBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalEnv.telegramBotToken;
    }

    if (originalEnv.telegramPageChatId === undefined) {
      delete process.env.TELEGRAM_PAGE_CHAT_ID;
    } else {
      process.env.TELEGRAM_PAGE_CHAT_ID = originalEnv.telegramPageChatId;
    }

    if (originalEnv.telegramTicketChatId === undefined) {
      delete process.env.TELEGRAM_TICKET_CHAT_ID;
    } else {
      process.env.TELEGRAM_TICKET_CHAT_ID = originalEnv.telegramTicketChatId;
    }

    if (originalEnv.telegramDigestChatId === undefined) {
      delete process.env.TELEGRAM_DIGEST_CHAT_ID;
    } else {
      process.env.TELEGRAM_DIGEST_CHAT_ID = originalEnv.telegramDigestChatId;
    }
  });

  it('posts markdown messages to the configured Telegram chat', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          message_id: 42,
          chat: {
            id: 'ticket-chat',
          },
        },
      }),
    });

    const result = await sendTelegramMessage({
      chat: 'ticket',
      text: '*hello*',
      markdown: true,
    });

    expect(result).toEqual({
      chat: 'ticket',
      messageId: 42,
      chatId: 'ticket-chat',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: 'ticket-chat',
          text: '*hello*',
          disable_web_page_preview: true,
          parse_mode: 'MarkdownV2',
        }),
      })
    );
  });

  it('escapes Telegram markdown v2 special characters', () => {
    expect(escapeTelegramMarkdown('cpu_spike (90%)!')).toBe(
      'cpu\\_spike \\(90%\\)\\!'
    );
  });
});
