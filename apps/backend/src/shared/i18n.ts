import '@fastify/cookie';
import type { FastifyRequest } from 'fastify';

import { context } from './context';

export type Locale = 'en' | 'zh-CN';

const DEFAULT_LOCALE: Locale = 'en';
const LOCALE_COOKIE = 'reward_locale';

const translations: Record<Locale, Record<string, string>> = {
  en: {},
  'zh-CN': {
    Unauthorized: '未授权',
    'Invalid request.': '请求参数无效。',
    'User already exists.': '用户已存在。',
    'Invalid credentials.': '账号或密码错误。',
    'Invalid admin credentials.': '管理员账号或密码错误。',
    'Invalid bank card id.': '无效的银行卡 ID。',
    'Bank card not found.': '未找到银行卡。',
    'Amount must be greater than 0.': '金额必须大于 0。',
    'Invalid prize id.': '无效的奖品 ID。',
    'Prize not found.': '未找到奖品。',
    'Internal server error': '服务器内部错误。',
  },
};

const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE;
  const lowered = value.toLowerCase();
  if (lowered.startsWith('zh')) return 'zh-CN';
  if (lowered.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
};

const readHeader = (
  header?: string | string[] | null
): string | undefined => {
  if (!header) return undefined;
  if (Array.isArray(header)) return header[0];
  return header;
};

export const resolveLocaleFromRequest = (request: FastifyRequest): Locale => {
  const headerLocale = readHeader(request.headers['x-locale']);
  if (headerLocale) return normalizeLocale(headerLocale);

  const cookieLocale = request.cookies?.[LOCALE_COOKIE];
  if (cookieLocale) return normalizeLocale(cookieLocale);

  const acceptLanguage = readHeader(request.headers['accept-language']);
  if (acceptLanguage) {
    const first = acceptLanguage.split(',')[0]?.trim();
    return normalizeLocale(first);
  }

  return DEFAULT_LOCALE;
};

export const translate = (message: string, locale?: Locale) => {
  const activeLocale = locale ?? context().getStore()?.locale ?? DEFAULT_LOCALE;
  return translations[activeLocale]?.[message] ?? message;
};

export const getLocaleCookieName = () => LOCALE_COOKIE;
