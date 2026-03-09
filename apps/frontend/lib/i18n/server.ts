import { cookies, headers } from 'next/headers';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getMessages,
  type Locale,
} from './messages';
import { createTranslator } from './translator';

export const LOCALE_COOKIE = 'reward_locale';

const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE;
  const lowered = value.toLowerCase();
  if (lowered.startsWith('zh')) return 'zh-CN';
  if (lowered.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
};

const getHeaderLocale = () => {
  try {
    const accept = headers().get('accept-language');
    return accept?.split(',')[0]?.trim() ?? null;
  } catch {
    return null;
  }
};

export const getServerLocale = (): Locale => {
  try {
    const cookieStore = cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
      return cookieLocale as Locale;
    }
  } catch {
    // Ignore cookie access errors (e.g. during build).
  }

  return normalizeLocale(getHeaderLocale());
};

export const getServerMessages = (locale = getServerLocale()) =>
  getMessages(locale);

export const getServerTranslations = (locale = getServerLocale()) =>
  createTranslator(getMessages(locale) as Record<string, unknown>);
