import en from '@/locales/en.json';
import zhCN from '@/locales/zh-CN.json';

export const messages = {
  en,
  'zh-CN': zhCN,
};

export type Locale = keyof typeof messages;
export type Messages = typeof en;

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh-CN'];

export const isSupportedLocale = (value?: string | null): value is Locale =>
  Boolean(value && SUPPORTED_LOCALES.includes(value as Locale));

export const getMessages = (locale: Locale) =>
  messages[locale] ?? messages[DEFAULT_LOCALE];
