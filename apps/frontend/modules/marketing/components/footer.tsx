import Link from 'next/link';
import { TbArrowRight, TbCardsFilled, TbGiftFilled, TbShieldCheck } from 'react-icons/tb';
import type { Messages } from '@/lib/i18n/messages';

export function MarketingFooter({ messages }: { messages: Messages }) {
  const footer = messages.marketing.footer;
  const nav = messages.marketing.nav;

  return (
    <footer className="page-safe-x page-safe-bottom pt-4 pb-10 sm:pt-6 sm:pb-12">
      <div className="landing-stage-panel mx-auto flex w-full max-w-[88rem] flex-col gap-6 rounded-[2.2rem] px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <span className="retro-brand-mark inline-flex w-fit shrink-0 whitespace-nowrap rounded-[0.95rem] px-3 py-2 text-[0.82rem] leading-none sm:px-4 sm:text-[1rem]">
              {nav.brand}
            </span>
            <p className="landing-stage-copy max-w-xl text-sm leading-7">
              {footer.copyright}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#games" className="landing-stage-link inline-flex gap-2">
              <TbCardsFilled className="h-4 w-4" />
              {nav.games}
            </a>
            <a href="#rewards" className="landing-stage-link inline-flex gap-2">
              <TbGiftFilled className="h-4 w-4" />
              {nav.rewards}
            </a>
            <a href="#fairness" className="landing-stage-link inline-flex gap-2">
              <TbShieldCheck className="h-4 w-4" />
              {nav.fairness}
            </a>
            <Link href="/login" className="landing-stage-link inline-flex gap-2">
              <TbArrowRight className="h-4 w-4" />
              {footer.signIn}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
