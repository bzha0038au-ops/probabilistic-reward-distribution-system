'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import {
  TbBell,
  TbChartDonut,
  TbGiftFilled,
  TbHome2,
  TbId,
  TbLayoutDashboard,
  TbCards,
  TbRosetteDiscountCheck,
  TbShieldCheck,
  TbSparkles,
  TbUser,
  TbUserShield,
  TbUsers,
  TbWallet,
} from 'react-icons/tb';
import type { CurrentUserSessionResponse } from '@reward/shared-types/auth';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoutForm } from '@/components/logout-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NotificationsBell } from './notifications-bell';

export type AppShellNavItem = {
  href: string;
  label: string;
  icon?: AppShellIconName;
  match?: 'exact' | 'prefix';
  prefixes?: string[];
};

type AppShellIconName =
  | 'home'
  | 'dashboard'
  | 'games'
  | 'tables'
  | 'markets'
  | 'wallet'
  | 'fairness'
  | 'community'
  | 'rewards'
  | 'notifications'
  | 'portfolio'
  | 'profile'
  | 'security'
  | 'kyc'
  | 'spin';

const appShellIconMap: Record<AppShellIconName, IconType> = {
  home: TbHome2,
  dashboard: TbLayoutDashboard,
  games: TbCards,
  tables: TbCards,
  markets: TbChartDonut,
  wallet: TbWallet,
  fairness: TbShieldCheck,
  community: TbUsers,
  rewards: TbGiftFilled,
  notifications: TbBell,
  portfolio: TbRosetteDiscountCheck,
  profile: TbUser,
  security: TbUserShield,
  kyc: TbId,
  spin: TbSparkles,
};

type AppShellFrameProps = {
  children: ReactNode;
  currentSession: CurrentUserSessionResponse;
  brandLabel: string;
  shellTitle: string;
  signedInAsLabel: string;
  dailySpinLabel: string;
  signOutLabel: string;
  topNav: AppShellNavItem[];
  railPrimary: AppShellNavItem[];
  railSecondary?: AppShellNavItem[];
  mobileTabs?: AppShellNavItem[];
  dailySpinHref?: string;
};

const matchesPath = (pathname: string, item: AppShellNavItem) => {
  if (item.prefixes?.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  if (item.match === 'exact') {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

function NavGlyph({ glyph }: { glyph?: AppShellIconName }) {
  const Icon = glyph ? appShellIconMap[glyph] : null;

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-base text-current"
    >
      {Icon ? <Icon className="h-5 w-5" /> : '•'}
    </span>
  );
}

function InlineShellIcon({ icon }: { icon?: AppShellIconName }) {
  if (!icon) return null;
  const Icon = appShellIconMap[icon];

  return <Icon aria-hidden="true" className="h-4 w-4" />;
}

export function AppShellFrame({
  children,
  currentSession,
  brandLabel,
  shellTitle,
  signedInAsLabel,
  dailySpinLabel,
  signOutLabel,
  topNav,
  railPrimary,
  railSecondary = [],
  mobileTabs = [],
  dailySpinHref = '/app/slot',
}: AppShellFrameProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-app-screen bg-[var(--retro-navy)] text-slate-100">
      <header className="sticky top-0 z-40 border-b-2 border-[#151b34] bg-[var(--retro-navy)] shadow-[0_4px_0_0_rgba(3,5,14,0.88)]">
        <div className="page-safe-x mx-auto flex h-20 w-full max-w-[1600px] items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/app"
              className="retro-brand-mark shrink-0 rounded-[0.95rem] px-4 py-2 text-[1.1rem] sm:text-[1.35rem]"
            >
              {brandLabel}
            </Link>

            <nav className="hidden items-center gap-8 xl:flex">
              {topNav.map((item) => {
                const active = matchesPath(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'retro-shell-link h-full py-1',
                      active && 'retro-shell-link-active',
                    )}
                  >
                    <InlineShellIcon icon={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <NotificationsBell
              className="!h-10 !border-[#1f2747] !bg-[#121833] !px-3 !text-[var(--retro-gold)] hover:!bg-[#181f3d] hover:!text-[#ffe27b]"
              badgeClassName="!bg-[var(--retro-gold)] !text-[var(--retro-ink)]"
            />
            <LocaleSwitcher
              size="sm"
              containerClassName="hidden sm:flex"
              buttonClassName="!h-10 !min-w-[3.6rem] !rounded-full !border-2 !font-semibold !tracking-[0.12em]"
              activeButtonClassName="!border-[var(--retro-ink)] !bg-[var(--retro-gold)] !text-[var(--retro-ink)] !shadow-[3px_3px_0px_0px_rgba(15,17,31,0.94)]"
              inactiveButtonClassName="!border-[#1f2747] !bg-[#121833] !text-slate-200 hover:!text-[var(--retro-gold)]"
            />
            <LogoutForm
              label={signOutLabel}
              buttonClassName="!rounded-full !border-2 !border-[var(--retro-ink)] !bg-[var(--retro-orange)] !px-5 !text-[0.82rem] !font-semibold !uppercase !tracking-[0.18em] !text-[var(--retro-ivory)] !shadow-[4px_4px_0px_0px_rgba(15,17,31,0.94)] hover:!translate-x-[2px] hover:!translate-y-[2px] hover:!bg-[var(--retro-orange-soft)] hover:!shadow-[2px_2px_0px_0px_rgba(15,17,31,0.94)]"
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(var(--app-height)-5rem)]">
        <aside className="retro-scroll-mask hidden w-72 shrink-0 flex-col border-r-2 border-[#151b34] bg-[var(--retro-navy-soft)] px-4 py-6 shadow-[4px_0_0_0_rgba(3,5,14,0.8)] xl:flex">
          <div className="space-y-3 px-2">
            <div>
              <p className="text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                {shellTitle}
              </p>
              <p className="mt-2 break-all text-sm text-slate-300">
                {signedInAsLabel}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-1 flex-col gap-2">
            {railPrimary.map((item) => {
              const active = matchesPath(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'retro-rail-link',
                    active && 'retro-rail-link-active',
                  )}
                >
                  <NavGlyph glyph={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 border-t-2 border-[#1c2240] pt-6">
            <Button
              asChild
              variant="arcadeDark"
              size="xl"
              className="w-full justify-center rounded-[1.2rem]"
            >
              <Link href={dailySpinHref}>
                <NavGlyph glyph="spin" />
                {dailySpinLabel}
              </Link>
            </Button>
          </div>

          {railSecondary.length > 0 ? (
            <div className="mt-6 border-t border-[#1c2240] pt-6">
              <div className="flex flex-col gap-2">
                {railSecondary.map((item) => {
                  const active = matchesPath(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'retro-rail-link text-[0.76rem] tracking-[0.16em]',
                        active && 'retro-rail-link-active',
                      )}
                    >
                      <NavGlyph glyph={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="relative min-w-0 flex-1 bg-[var(--retro-ivory)] text-[var(--retro-ink)]">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-30" />
          <div className="page-safe-x page-safe-y relative mx-auto w-full max-w-[1520px]">
            {children}
            <div aria-hidden="true" className="h-20 xl:hidden" />
          </div>
        </main>
      </div>

      {mobileTabs.length > 0 ? (
        <nav
          aria-label="Mobile tab bar"
          className="page-safe-x page-safe-bottom fixed inset-x-0 bottom-0 z-40 xl:hidden"
        >
          <div className="mx-auto mb-2 flex h-[4.75rem] w-full max-w-2xl items-end gap-2 rounded-[1.6rem] border-2 border-[#151b34] bg-[rgba(9,11,27,0.97)] px-3 pb-2 pt-1 shadow-[0_12px_32px_rgba(3,5,14,0.5)] backdrop-blur">
            {mobileTabs.map((item) => {
              const active = matchesPath(pathname, item);
              const emphasized = item.icon === 'games';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex min-w-0 flex-1 flex-col items-center text-center transition-transform',
                    emphasized
                      ? '-translate-y-7 justify-start self-start'
                      : 'justify-end gap-1 pb-1',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-center justify-center transition-all',
                      emphasized
                        ? active
                          ? 'h-[4.6rem] w-[4.6rem] rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-gold)] text-[var(--retro-ink)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.94)]'
                          : 'h-[4.6rem] w-[4.6rem] rounded-full border-2 border-[#6c4d0d] bg-[linear-gradient(180deg,#f4c43a,#e0a80d)] text-[var(--retro-ink)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.82)]'
                        : active
                          ? 'h-10 w-10 rounded-[1rem] border-2 border-[var(--retro-ink)] bg-[var(--retro-gold)] text-[var(--retro-ink)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.94)]'
                          : 'h-10 w-10 rounded-[1rem] border border-white/10 bg-white/[0.05] text-slate-300 group-hover:border-[var(--retro-gold)] group-hover:text-[var(--retro-gold)]',
                    )}
                  >
                    <InlineShellIcon icon={item.icon} />
                  </span>
                  <span
                    className={cn(
                      'truncate text-[0.58rem] font-semibold uppercase tracking-[0.12em]',
                      emphasized
                        ? active
                          ? 'mt-2.5 text-[var(--retro-gold)]'
                          : 'mt-2.5 text-[#f8d66f]'
                        : active
                          ? 'text-[var(--retro-gold)]'
                          : 'text-slate-400 group-hover:text-[var(--retro-gold)]',
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
