import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './messages';

const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE;
  const lowered = value.toLowerCase();
  if (lowered.startsWith('zh')) return 'zh-CN';
  if (lowered.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
};

const readCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${escapedName}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
};

export const getClientLocale = (): Locale => {
  const cookieLocale = readCookie('reward_locale');
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  if (typeof navigator !== 'undefined') {
    return normalizeLocale(navigator.language);
  }

  return DEFAULT_LOCALE;
};
