'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/components/i18n-provider';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/messages';

const LABELS: Record<Locale, string> = {
  en: 'EN',
  'zh-CN': '中文',
};

export function LocaleSwitcher({ size = 'sm' }: { size?: 'sm' | 'default' }) {
  const router = useRouter();
  const locale = useLocale();
  const [, startTransition] = useTransition();

  const updateLocale = async (nextLocale: Locale) => {
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: nextLocale }),
    });
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center gap-2">
      {SUPPORTED_LOCALES.map((option) => (
        <Button
          key={option}
          variant={option === locale ? 'default' : 'outline'}
          size={size}
          onClick={() => updateLocale(option)}
        >
          {LABELS[option]}
        </Button>
      ))}
    </div>
  );
}
