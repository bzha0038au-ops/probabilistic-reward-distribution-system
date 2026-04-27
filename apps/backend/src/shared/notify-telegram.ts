import { getConfigView } from './config';
import { domainError, internalInvariantError } from './errors';

const config = getConfigView();

const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;
const TELEGRAM_MAX_MESSAGE_LENGTH = 4_096;
const TELEGRAM_TRUNCATED_SUFFIX = '\n\nTruncated';
const TELEGRAM_MARKDOWN_SPECIAL_CHARACTERS = new Set([
  '_',
  '*',
  '[',
  ']',
  '(',
  ')',
  '~',
  '`',
  '>',
  '#',
  '+',
  '-',
  '=',
  '|',
  '{',
  '}',
  '.',
  '!',
  '\\',
]);

export type TelegramChatTarget = 'page' | 'ticket' | 'digest';

export type SendTelegramMessageInput = {
  chat: TelegramChatTarget;
  text: string;
  markdown?: boolean;
  disableWebPagePreview?: boolean;
};

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
  result?: {
    message_id?: number;
    chat?: {
      id?: number | string;
    };
  };
};

const readConfiguredValue = (value: string, envName: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw internalInvariantError(`${envName} is not set`);
  }

  return trimmed;
};

const resolveTelegramChatId = (chat: TelegramChatTarget) => {
  switch (chat) {
    case 'page':
      return readConfiguredValue(config.telegramPageChatId, 'TELEGRAM_PAGE_CHAT_ID');
    case 'ticket':
      return readConfiguredValue(
        config.telegramTicketChatId,
        'TELEGRAM_TICKET_CHAT_ID'
      );
    case 'digest':
      return readConfiguredValue(
        config.telegramDigestChatId,
        'TELEGRAM_DIGEST_CHAT_ID'
      );
    default: {
      const unsupported: never = chat;
      throw internalInvariantError(
        `Unsupported Telegram chat target: ${String(unsupported)}`
      );
    }
  }
};

const withTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const parseTelegramResponse = async (response: Response) => {
  try {
    return (await response.json()) as TelegramApiResponse;
  } catch {
    return null;
  }
};

export const escapeTelegramMarkdown = (value: string) =>
  Array.from(value, (character) =>
    TELEGRAM_MARKDOWN_SPECIAL_CHARACTERS.has(character)
      ? `\\${character}`
      : character
  ).join('');

export const truncateTelegramText = (
  value: string,
  maxLength = TELEGRAM_MAX_MESSAGE_LENGTH
) => {
  if (value.length <= maxLength) {
    return value;
  }

  const sliceLength = Math.max(maxLength - TELEGRAM_TRUNCATED_SUFFIX.length, 1);
  return `${value.slice(0, sliceLength).trimEnd()}${TELEGRAM_TRUNCATED_SUFFIX}`;
};

export const sendTelegramMessage = async ({
  chat,
  text,
  markdown = false,
  disableWebPagePreview = true,
}: SendTelegramMessageInput) => {
  const botToken = readConfiguredValue(config.telegramBotToken, 'TELEGRAM_BOT_TOKEN');
  const message = truncateTelegramText(text.trim());
  if (!message) {
    throw domainError(400, 'Telegram message text is required.');
  }

  const response = await withTimeout((signal) =>
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: resolveTelegramChatId(chat),
        text: message,
        disable_web_page_preview: disableWebPagePreview,
        ...(markdown ? { parse_mode: 'MarkdownV2' } : {}),
      }),
    })
  );

  const parsed = await parseTelegramResponse(response);
  if (!response.ok || !parsed?.ok) {
    throw domainError(502, `Telegram sendMessage failed with status ${response.status}`, {
      details: parsed?.description ? [parsed.description] : undefined,
    });
  }

  return {
    chat,
    messageId: parsed.result?.message_id ?? null,
    chatId: parsed.result?.chat?.id ?? null,
  };
};
