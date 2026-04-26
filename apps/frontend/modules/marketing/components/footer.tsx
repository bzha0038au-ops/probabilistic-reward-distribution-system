import Link from 'next/link';
import type { Messages } from '@/lib/i18n/messages';

export function MarketingFooter({ messages }: { messages: Messages }) {
  const footer = messages.marketing.footer;
  return (
    <footer className="border-t border-slate-200 bg-white/70">
      <div className="page-safe-x page-safe-bottom mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 py-6 text-sm text-slate-500 md:flex-row md:items-center">
        <span>{footer.copyright}</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/app" className="hover:text-slate-900">
            {footer.app}
          </Link>
          <Link href="/login" className="hover:text-slate-900">
            {footer.signIn}
          </Link>
        </div>
      </div>
    </footer>
  );
}
