import type { ReactNode } from 'react';
import Link from 'next/link';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoutForm } from '@/components/logout-form';
import { buttonVariants } from '@/components/ui/button';
import { getServerTranslations } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import { CurrentSessionProvider } from '@/modules/app/components/current-session-provider';
import { requireCurrentUserSession } from '@/modules/app/server/current-session';

export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = getServerTranslations();
  const currentSession = await requireCurrentUserSession();
  const navItems = [
    { href: '/app', label: t('common.dashboard') },
    { href: '/app/rewards', label: t('app.navRewards') },
    { href: '/app/wallet', label: t('app.navWallet') },
    { href: '/app/payments', label: t('app.navPayments') },
    { href: '/app/security', label: t('app.navSecurity') },
    { href: '/app/slot', label: t('app.navGacha') },
    { href: '/app/quick-eight', label: t('app.navQuickEight') },
    { href: '/app/blackjack', label: t('app.navBlackjack') },
    { href: '/app/fairness', label: t('app.navFairness') },
  ];

  return (
    <CurrentSessionProvider value={currentSession}>
      <main className="min-h-app-screen bg-slate-950 text-slate-100">
        <div className="page-safe-x page-safe-y mx-auto flex w-full max-w-7xl flex-col gap-6">
          <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/75">
                  {t('app.shellTitle')}
                </p>
                <p className="break-all text-sm text-slate-400 sm:break-normal">
                  {t('app.signedInAs', { email: currentSession.user.email })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'sm' }),
                        'rounded-full border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white'
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <LocaleSwitcher />
                <LogoutForm label={t('common.signOut')} />
              </div>
            </div>
          </header>

          {children}
        </div>
      </main>
    </CurrentSessionProvider>
  );
}
