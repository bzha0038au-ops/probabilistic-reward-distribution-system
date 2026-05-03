'use client';

import Link from 'next/link';
import type { IconType } from 'react-icons';
import {
  TbChevronRight,
  TbCreditCard,
  TbDeviceDesktop,
  TbGiftFilled,
  TbHistory,
  TbId,
  TbLock,
  TbMail,
  TbPhone,
  TbShieldCheck,
  TbWallet,
} from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';
import type { UserDashboardCopy } from './user-dashboard-copy';
import type { UserDashboardController } from './use-user-dashboard';
import { formatUserDashboardActivityType } from './user-dashboard-utils';

type Translate = (key: string) => string;

type ProfilePageController = Pick<
  UserDashboardController,
  'activityEntries' | 'currentSession' | 'currentUser' | 'sessions' | 'wallet' | 'walletBalance'
>;

type UserDashboardProfilePageProps = {
  controller: ProfilePageController;
  copy: UserDashboardCopy;
  emailVerified: boolean;
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  locale: Locale;
  phoneVerified: boolean;
  t: Translate;
};

type QuickAction = {
  href: string;
  icon: IconType;
  title: string;
};

type SummaryItem = {
  href: string;
  icon: IconType;
  title: string;
  value: string;
  description?: string;
  tone?: 'gold' | 'green' | 'violet' | 'ink';
};

const summaryToneClass: Record<NonNullable<SummaryItem['tone']>, string> = {
  gold: 'border-[rgba(255,213,61,0.28)] bg-[rgba(255,213,61,0.12)] text-[var(--retro-gold)]',
  green: 'border-[rgba(34,166,109,0.28)] bg-[rgba(34,166,109,0.12)] text-[var(--retro-green)]',
  violet: 'border-[rgba(97,88,255,0.24)] bg-[rgba(97,88,255,0.12)] text-[var(--retro-violet)]',
  ink: 'border-[rgba(15,17,31,0.14)] bg-[rgba(15,17,31,0.06)] text-[var(--retro-ink)]',
};

function derivePlayerName(email: string) {
  const localPart = email.split('@')[0] ?? email;
  const normalized = localPart.replace(/[._-]+/g, ' ').trim();

  if (!normalized) {
    return 'Player';
  }

  return normalized
    .split(/\s+/)
    .map((part) =>
      part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');
}

function deriveMonogram(playerName: string) {
  const compact = playerName.replace(/\s+/g, '');
  return compact.slice(0, 2).toUpperCase() || 'PL';
}

function ProfileQuickActionLink({ href, icon: Icon, title }: QuickAction) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center gap-3 rounded-[1.35rem] border-2 border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-4 text-center transition hover:border-[var(--retro-gold)] hover:bg-[rgba(255,213,61,0.08)]"
    >
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-[rgba(255,213,61,0.26)] bg-[rgba(255,255,255,0.92)] text-[var(--retro-orange)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.24)] transition group-hover:translate-y-[-1px]">
        <Icon aria-hidden="true" className="h-6 w-6" />
      </span>
      <span className="text-sm font-bold tracking-[-0.02em] text-white">{title}</span>
    </Link>
  );
}

function ProfileSummaryRow({
  href,
  icon: Icon,
  title,
  value,
  description,
  tone = 'ink',
}: SummaryItem) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[1.15rem] border border-[rgba(15,17,31,0.1)] bg-white/92 px-4 py-3 transition hover:border-[var(--retro-gold)] hover:bg-white"
    >
      <span
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border text-base shadow-[3px_3px_0px_0px_rgba(15,17,31,0.08)]',
          summaryToneClass[tone],
        )}
      >
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--retro-ink)]">{title}</p>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-[rgba(15,17,31,0.58)]">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="max-w-[11rem] text-right text-sm font-semibold text-[var(--retro-ink)]">
          {value}
        </span>
        <TbChevronRight
          aria-hidden="true"
          className="h-4 w-4 text-[rgba(15,17,31,0.38)] transition group-hover:text-[var(--retro-orange)]"
        />
      </div>
    </Link>
  );
}

function ProfileSummarySection({
  title,
  items,
}: {
  title: string;
  items: SummaryItem[];
}) {
  return (
    <Card className="overflow-hidden rounded-[1.5rem] border-none bg-[rgba(255,255,255,0.96)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.12)]">
      <CardHeader className="border-b border-[rgba(15,17,31,0.08)] pb-4">
        <CardTitle className="text-[1.1rem] font-black uppercase tracking-[0.08em] text-[var(--retro-ink)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {items.map((item) => (
          <ProfileSummaryRow key={`${item.href}-${item.title}`} {...item} />
        ))}
      </CardContent>
    </Card>
  );
}

export function UserDashboardProfilePage({
  controller,
  copy: c,
  emailVerified,
  formatAmount,
  formatDateTime,
  locale,
  phoneVerified,
  t,
}: UserDashboardProfilePageProps) {
  const totalBalanceRaw = controller.wallet?.balance.totalBalance ?? controller.walletBalance;
  const withdrawableRaw =
    controller.wallet?.balance.withdrawableBalance ?? controller.walletBalance;
  const bonusRaw = controller.wallet?.balance.bonusBalance ?? '0';
  const lockedRaw = controller.wallet?.balance.lockedBalance ?? '0';
  const recentEntries = controller.activityEntries.slice(0, 4);
  const playerName = derivePlayerName(controller.currentUser.email);
  const playerMonogram = deriveMonogram(playerName);
  const activeSessionCount = new Set(controller.sessions.map((entry) => entry.sessionId)).size;
  const securityTier = phoneVerified
    ? c.securityTierAdvanced
    : emailVerified
      ? c.securityTierActive
      : c.securityTierPending;

  const quickActions: QuickAction[] = [
    { href: '/app/wallet', icon: TbWallet, title: t('app.navWallet') },
    { href: '/app/rewards', icon: TbGiftFilled, title: t('app.navRewards') },
    { href: '/app/payments', icon: TbCreditCard, title: t('app.navPayments') },
    { href: '/app/wallet#wallet-ledger', icon: TbHistory, title: c.transactionsTitle },
  ];

  const verificationItems: SummaryItem[] = [
    {
      href: '/app/security',
      icon: TbMail,
      title: c.securityEmailStepTitle,
      value: emailVerified ? c.verified : c.pending,
      description: emailVerified ? c.emailVerified : c.emailPending,
      tone: emailVerified ? 'green' : 'gold',
    },
    {
      href: '/app/security',
      icon: TbPhone,
      title: c.securityPhoneStepTitle,
      value: phoneVerified ? c.verified : c.pending,
      description: phoneVerified ? c.phoneVerified : c.phonePending,
      tone: phoneVerified ? 'green' : 'violet',
    },
    {
      href: '/app/verification',
      icon: TbId,
      title: c.verificationRouteTitle,
      value: c.verificationRouteStatus,
      description: c.verificationRouteDescription,
      tone: 'ink',
    },
  ];

  const securityItems: SummaryItem[] = [
    {
      href: '/app/security',
      icon: TbShieldCheck,
      title: c.securityRouteTitle,
      value: securityTier,
      description: c.securityRouteDescription,
      tone: phoneVerified ? 'green' : emailVerified ? 'gold' : 'violet',
    },
    {
      href: '/app/security',
      icon: TbHistory,
      title: c.sessionsTitle,
      value: String(activeSessionCount),
      description: c.sessionsDescription,
      tone: 'ink',
    },
    {
      href: '/app/security',
      icon: TbDeviceDesktop,
      title: c.profileCurrentDeviceTitle,
      value: formatDateTime(controller.currentSession.lastSeenAt),
      description: `${c.expires}: ${formatDateTime(controller.currentSession.expiresAt)}`,
      tone: 'ink',
    },
  ];

  const payoutItems: SummaryItem[] = [
    {
      href: '/app/payments',
      icon: TbCreditCard,
      title: c.paymentsRouteTitle,
      value: phoneVerified ? c.verified : c.pending,
      description: phoneVerified ? c.financeUnlocked : c.financeLocked,
      tone: phoneVerified ? 'green' : 'gold',
    },
    {
      href: '/app/rewards',
      icon: TbGiftFilled,
      title: c.rewardsRouteTitle,
      value: formatAmount(bonusRaw),
      description: c.rewardsRouteDescription,
      tone: 'violet',
    },
    {
      href: '/app/wallet',
      icon: TbLock,
      title: c.profileLockedBalanceLabel,
      value: formatAmount(lockedRaw),
      description: c.walletRouteDescription,
      tone: 'ink',
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="retro-panel-dark overflow-hidden rounded-[2rem] border-none">
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge className="retro-badge retro-badge-gold border-none">
                {c.profileWalletEyebrow}
              </Badge>
              <div className="space-y-2">
                <h2 className="text-[2.6rem] font-black tracking-[-0.05em] text-white md:text-[3.4rem]">
                  {t('app.navProfile')}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                  {c.profileWalletDescription}
                </p>
              </div>
            </div>
            <Badge className="retro-badge retro-badge-violet border-none">
              {c.profileTierLabel}: {securityTier}
            </Badge>
          </div>

          <div className="overflow-hidden rounded-[1.7rem] border-2 border-[var(--retro-ink)] bg-[linear-gradient(135deg,#f7b13d_0%,#f08f2f_34%,#d86928_72%,#b84b09_100%)] shadow-[8px_8px_0px_0px_rgba(15,17,31,0.94)]">
            <div className="space-y-5 p-5 text-[var(--retro-ink)] md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.72rem] font-black uppercase tracking-[0.24em] text-[rgba(15,17,31,0.72)]">
                    {c.profileTotalBalanceLabel}
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <span className="text-[3.4rem] font-black leading-none tracking-[-0.06em] md:text-[4.8rem]">
                      {formatAmount(totalBalanceRaw)}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full border border-[rgba(15,17,31,0.22)] bg-[rgba(255,255,255,0.22)] px-4 py-2 text-sm font-bold">
                  {c.profileLockedBalanceLabel} {formatAmount(lockedRaw)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <span className="retro-stat-chip bg-[rgba(15,17,31,0.88)] text-[var(--retro-ivory)]">
                  {c.currentBalance}: {formatAmount(withdrawableRaw)}
                </span>
                <span className="retro-stat-chip bg-[rgba(255,255,255,0.22)] text-[var(--retro-ink)]">
                  {c.rewardsRouteTitle}: {formatAmount(bonusRaw)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--retro-gold)]">
                {c.profileQuickActionsTitle}
              </h3>
              <Button asChild size="sm" variant="arcadeOutline">
                <Link href="/app/wallet">{t('app.navWallet')}</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {quickActions.map((action) => (
                <ProfileQuickActionLink key={action.href} {...action} />
              ))}
            </div>
          </div>

          <Card className="rounded-[1.55rem] border-none bg-[rgba(255,255,255,0.96)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.12)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-[1.2rem] font-black uppercase tracking-[0.08em] text-[var(--retro-ink)]">
                {c.profileRecentActivityTitle}
              </CardTitle>
              <CardDescription className="text-[rgba(15,17,31,0.62)]">
                {c.profileRecentActivityDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentEntries.length === 0 ? (
                <p className="text-sm text-[rgba(15,17,31,0.56)]">{c.profileNoRecentActivity}</p>
              ) : (
                recentEntries.map((entry) => {
                  const positive = !entry.amount.startsWith('-');

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-4 rounded-[1.1rem] border border-[rgba(15,17,31,0.08)] bg-[rgba(15,17,31,0.03)] px-4 py-3"
                    >
                      <span
                        className={cn(
                          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black shadow-[3px_3px_0px_0px_rgba(15,17,31,0.08)]',
                          positive
                            ? 'border-[rgba(34,166,109,0.26)] bg-[rgba(34,166,109,0.12)] text-[var(--retro-green)]'
                            : 'border-[rgba(184,75,9,0.22)] bg-[rgba(184,75,9,0.12)] text-[var(--retro-orange)]',
                        )}
                      >
                        {positive ? '+' : '-'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[var(--retro-ink)]">
                          {formatUserDashboardActivityType(locale, entry.entryType)}
                        </p>
                        <p className="mt-1 text-sm text-[rgba(15,17,31,0.56)]">
                          {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'shrink-0 text-right font-semibold',
                          positive ? 'text-[var(--retro-green)]' : 'text-[var(--retro-orange)]',
                        )}
                      >
                        {formatAmount(entry.amount)}
                      </p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card className="retro-panel-dark overflow-hidden rounded-[2rem] border-none">
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge className="retro-badge retro-badge-gold border-none">
                {c.profileAccountEyebrow}
              </Badge>
              <div className="space-y-2">
                <h2 className="text-[2.4rem] font-black tracking-[-0.05em] text-white md:text-[3rem]">
                  {t('app.navProfile')}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                  {c.profileAccountDescription}
                </p>
              </div>
            </div>
            <Button asChild variant="arcadeOutline">
              <Link href="/app/security">{t('app.navSecurity')}</Link>
            </Button>
          </div>

          <div className="rounded-[1.6rem] border-2 border-[rgba(255,213,61,0.28)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,242,228,0.96))] p-5 shadow-[5px_5px_0px_0px_rgba(15,17,31,0.18)] md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--retro-gold)] bg-[var(--retro-ink)] text-[1.7rem] font-black text-[var(--retro-gold)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.16)]">
                  {playerMonogram}
                </span>
                <div className="space-y-1">
                  <p className="text-[2rem] font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                    {playerName}
                  </p>
                  <p className="text-sm text-[rgba(15,17,31,0.58)]">
                    {controller.currentUser.email}
                  </p>
                </div>
              </div>
              <div className="space-y-2 md:text-right">
                <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.48)]">
                  {c.profileTierLabel}
                </p>
                <Badge className="retro-badge retro-badge-gold border-none">
                  {securityTier}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ProfileSummarySection
              title={c.profileVerificationSummaryTitle}
              items={verificationItems}
            />
            <ProfileSummarySection
              title={c.profileSecuritySummaryTitle}
              items={securityItems}
            />
            <ProfileSummarySection
              title={c.profilePayoutSummaryTitle}
              items={payoutItems}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
