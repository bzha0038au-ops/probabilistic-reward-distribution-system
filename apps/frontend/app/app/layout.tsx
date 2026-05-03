import type { ReactNode } from 'react';
import { redirect } from "next/navigation";

import { getServerTranslations } from '@/lib/i18n/server';
import { AppShellFrame } from '@/modules/app/components/app-shell-frame';
import { CurrentSessionProvider } from '@/modules/app/components/current-session-provider';
import { requireCurrentUserSession } from '@/modules/app/server/current-session';

export default async function ProtectedAppLayout({
  children,
}: LayoutProps<'/app'>) {
  const t = await getServerTranslations();
  const currentSession = await requireCurrentUserSession();
  if (currentSession.legal.requiresAcceptance) {
    redirect("/legal");
  }
  const topNav = [
    { href: '/app', label: t('common.dashboard'), icon: 'dashboard' as const, match: 'exact' as const },
    {
      href: '/app/holdem',
      label: 'Tables',
      icon: 'tables' as const,
      prefixes: ['/app/holdem', '/app/blackjack', '/app/slot', '/app/quick-eight'],
    },
    { href: '/app/markets', label: t('app.navMarkets'), icon: 'markets' as const, match: 'prefix' as const },
    { href: '/app/wallet', label: t('app.navWallet'), icon: 'wallet' as const, match: 'prefix' as const },
    { href: '/app/fairness', label: t('app.navFairness'), icon: 'fairness' as const, match: 'prefix' as const },
  ];
  const railPrimary = [
    { href: '/app/community', label: t('app.navCommunity'), icon: 'community' as const },
    { href: '/app/rewards', label: t('app.navRewards'), icon: 'rewards' as const },
    { href: '/app/notifications', label: t('app.navNotifications'), icon: 'notifications' as const },
    { href: '/app/markets/portfolio', label: 'Portfolio', icon: 'portfolio' as const },
  ];
  const railSecondary = [
    { href: '/app/profile', label: t('app.navProfile'), icon: 'profile' as const },
    { href: '/app/security', label: t('app.navSecurity'), icon: 'security' as const },
    { href: '/app/verification', label: 'KYC', icon: 'kyc' as const },
  ];
  const mobileTabs = [
    { href: '/app', label: t('app.navHome'), icon: 'home' as const, match: 'exact' as const },
    { href: '/app/markets', label: t('app.navMarkets'), icon: 'markets' as const, match: 'prefix' as const },
    {
      href: '/app/holdem',
      label: t('app.navGames'),
      icon: 'games' as const,
      prefixes: ['/app/holdem', '/app/blackjack', '/app/slot', '/app/quick-eight', '/app/gacha'],
    },
    { href: '/app/community', label: t('app.navCommunity'), icon: 'community' as const, match: 'prefix' as const },
    {
      href: '/app/profile',
      label: t('app.navProfile'),
      icon: 'profile' as const,
      prefixes: ['/app/profile', '/app/security', '/app/wallet', '/app/rewards', '/app/verification', '/app/notifications', '/app/payments'],
    },
  ];

  return (
    <CurrentSessionProvider value={currentSession}>
      <AppShellFrame
        currentSession={currentSession}
        brandLabel={t('marketing.nav.brand')}
        shellTitle={t('app.shellTitle')}
        signedInAsLabel={t('app.signedInAs', { email: currentSession.user.email })}
        dailySpinLabel="Daily Spin"
        signOutLabel={t('common.signOut')}
        topNav={topNav}
        railPrimary={railPrimary}
        railSecondary={railSecondary}
        mobileTabs={mobileTabs}
      >
        {children as ReactNode}
      </AppShellFrame>
    </CurrentSessionProvider>
  );
}
