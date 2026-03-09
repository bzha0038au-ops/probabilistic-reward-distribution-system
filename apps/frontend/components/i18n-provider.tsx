'use client';

import { createContext, useContext, useMemo } from 'react';

import type { Locale, Messages } from '@/lib/i18n/messages';
import { createTranslator } from '@/lib/i18n/translator';

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const t = useMemo(
    () => createTranslator(messages as Record<string, unknown>),
    [messages]
  );

  return (
    <I18nContext.Provider value={{ locale, messages, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslations must be used within I18nProvider');
  }
  return ctx.t;
}

export function useLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useLocale must be used within I18nProvider');
  }
  return ctx.locale;
}
