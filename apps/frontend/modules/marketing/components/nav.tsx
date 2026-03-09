import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import type { Messages } from '@/lib/i18n/messages';

export function MarketingNav({ messages }: { messages: Messages }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-sm font-semibold text-white">
          PP
        </span>
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          {messages.marketing.nav.brand}
        </span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/app" className="text-slate-600 hover:text-slate-900">
          {messages.marketing.nav.dashboard}
        </Link>
        <Link href="/login" className="text-slate-600 hover:text-slate-900">
          {messages.marketing.nav.signIn}
        </Link>
        <Button asChild size="sm">
          <Link href="/register">{messages.marketing.nav.getStarted}</Link>
        </Button>
        <LocaleSwitcher size="sm" />
      </nav>
    </header>
  );
}
