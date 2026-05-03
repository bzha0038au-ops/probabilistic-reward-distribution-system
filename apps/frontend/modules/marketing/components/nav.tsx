import Link from 'next/link';
import { TbArrowRight, TbCardsFilled, TbGiftFilled, TbShieldCheck } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import type { Messages } from '@/lib/i18n/messages';

import { LandingThemeToggle } from './theme-toggle';

export function MarketingNav({ messages }: { messages: Messages }) {
  const nav = messages.marketing.nav;

  return (
    <header className="page-safe-x page-safe-top relative z-30">
      <div className="landing-nav-shell mx-auto flex w-full max-w-[88rem] flex-col gap-3 rounded-[2rem] px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <Link
            href="/"
            className="retro-brand-mark inline-flex shrink-0 whitespace-nowrap rounded-[0.95rem] px-3 py-2 text-[0.82rem] leading-none sm:rounded-[1rem] sm:px-4 sm:text-[1.05rem]"
          >
            {nav.brand}
          </Link>

          <nav className="hidden items-center gap-2 xl:flex">
            <a href="#games" className="landing-nav-link inline-flex gap-2">
              <TbCardsFilled className="h-4 w-4" />
              {nav.games}
            </a>
            <a href="#rewards" className="landing-nav-link inline-flex gap-2">
              <TbGiftFilled className="h-4 w-4" />
              {nav.rewards}
            </a>
            <a href="#fairness" className="landing-nav-link inline-flex gap-2">
              <TbShieldCheck className="h-4 w-4" />
              {nav.fairness}
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LandingThemeToggle
              lightLabel={nav.themeLight}
              darkLabel={nav.themeDark}
            />
            <LocaleSwitcher
              size="sm"
              buttonClassName="!h-10 !rounded-full !border !border-[var(--landing-nav-control-border)] !bg-[var(--landing-nav-control-bg)] !px-2.5 !text-[0.72rem] !font-semibold !tracking-[0.1em] !text-[var(--landing-nav-control-text)] sm:!px-3 sm:!text-[0.78rem] sm:!tracking-[0.14em]"
              activeButtonClassName="!border-transparent !bg-[var(--retro-gold)] !text-[var(--retro-ink)] !shadow-none"
              inactiveButtonClassName="hover:!border-[var(--landing-nav-control-hover-border)] hover:!bg-[var(--landing-nav-control-hover-bg)]"
            />
            <Link href="/login" className="landing-nav-link hidden items-center gap-2 lg:inline-flex">
              <TbArrowRight className="h-4 w-4" />
              {nav.signIn}
            </Link>
            <Button asChild size="sm" variant="arcadeDark" className="!h-10">
              <Link href="/register">
                <span>{nav.getStarted}</span>
                <TbArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link href="/login" className="landing-nav-link flex flex-1 items-center gap-1.5 px-2 text-[0.62rem] tracking-[0.11em] sm:text-[0.68rem] sm:tracking-[0.13em]">
            <TbArrowRight className="h-4 w-4" />
            {nav.signIn}
          </Link>
          <a href="#games" className="landing-nav-link flex flex-1 items-center gap-1.5 px-2 text-[0.62rem] tracking-[0.11em] sm:text-[0.68rem] sm:tracking-[0.13em]">
            <TbCardsFilled className="h-4 w-4" />
            {nav.games}
          </a>
          <a href="#fairness" className="landing-nav-link flex flex-1 items-center gap-1.5 px-2 text-[0.62rem] tracking-[0.11em] sm:text-[0.68rem] sm:tracking-[0.13em]">
            <TbShieldCheck className="h-4 w-4" />
            {nav.fairness}
          </a>
        </div>
      </div>
    </header>
  );
}
