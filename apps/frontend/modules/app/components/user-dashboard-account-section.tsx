'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { IconType } from 'react-icons';
import {
  TbChevronLeft,
  TbChevronRight,
  TbCards,
  TbChartDonut,
  TbGiftFilled,
  TbHash,
  TbId,
  TbShieldCheck,
  TbSparkles,
  TbUsers,
  TbWallet,
} from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { UserDashboardCopy } from './user-dashboard-copy';
import { GameplayRouteCard } from './user-dashboard-route-card';

type Translate = (key: string) => string;

type UserDashboardAccountSectionProps = {
  copy: UserDashboardCopy;
  emailVerified: boolean;
  phoneVerified: boolean;
  showGameplayRoutes: boolean;
  t: Translate;
};

type ActivitySlide = {
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  accent: 'orange' | 'violet' | 'gold' | 'green';
  icon: IconType;
  badges: Array<{
    label: string;
    tone: 'gold' | 'green' | 'violet' | 'ink';
  }>;
  signals: Array<{
    label: string;
    value: string;
  }>;
};

function OverviewActivitySlider({
  copy: c,
  emailVerified,
  phoneVerified,
  t,
}: Pick<UserDashboardAccountSectionProps, 'copy' | 'emailVerified' | 'phoneVerified' | 't'>) {
  const slides: ActivitySlide[] = [
    {
      eyebrow: c.overviewHeroEyebrow,
      title: c.overviewHeroTitle,
      description: c.overviewHeroDescription,
      primaryHref: '/app/markets',
      primaryLabel: c.overviewHeroPrimary,
      secondaryHref: '/app/rewards',
      secondaryLabel: c.overviewHeroSecondary,
      accent: 'gold',
      icon: TbChartDonut,
      badges: [
        { label: emailVerified ? c.drawUnlocked : c.emailPending, tone: 'gold' },
        { label: phoneVerified ? c.phoneVerified : c.phonePending, tone: phoneVerified ? 'green' : 'violet' },
        { label: c.fairnessStatus, tone: 'ink' },
      ],
      signals: [
        { label: c.marketsTitle, value: c.marketsStatus },
        { label: c.rewardsRouteTitle, value: c.rewardsRouteStatus },
        { label: t('app.navFairness'), value: c.fairnessStatus },
      ],
    },
    {
      eyebrow: c.overviewRewardsEyebrow,
      title: c.overviewRewardsTitle,
      description: c.overviewRewardsDescription,
      primaryHref: '/app/rewards',
      primaryLabel: c.overviewRewardsPrimary,
      secondaryHref: '/app/slot',
      secondaryLabel: c.overviewRewardsSecondary,
      accent: 'orange',
      icon: TbGiftFilled,
      badges: [
        { label: c.rewardsRouteStatus, tone: 'gold' },
        { label: c.walletRouteStatus, tone: 'green' },
        { label: c.riskHigh, tone: 'violet' },
      ],
      signals: [
        { label: c.rewardsRouteTitle, value: c.verified },
        { label: c.walletRouteTitle, value: c.currentBalance },
        { label: c.gachaTitle, value: c.riskHigh },
      ],
    },
    {
      eyebrow: c.overviewCommunityEyebrow,
      title: c.overviewCommunityTitle,
      description: c.overviewCommunityDescription,
      primaryHref: '/app/community',
      primaryLabel: c.overviewCommunityPrimary,
      secondaryHref: '/app/fairness',
      secondaryLabel: c.overviewCommunitySecondary,
      accent: 'violet',
      icon: TbUsers,
      badges: [
        { label: t('app.navCommunity'), tone: 'violet' },
        { label: c.fairnessStatus, tone: 'green' },
        { label: phoneVerified ? c.verified : c.pending, tone: 'gold' },
      ],
      signals: [
        { label: t('app.navCommunity'), value: c.verified },
        { label: t('app.navFairness'), value: c.fairnessStatus },
        { label: c.securityRouteTitle, value: phoneVerified ? c.phoneVerified : c.phonePending },
      ],
    },
  ];
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const activeSlide = slides[activeSlideIndex];
  const HeroIcon = activeSlide.icon;
  const accentGlowClass =
    activeSlide.accent === 'violet'
      ? 'bg-[radial-gradient(circle_at_top_left,rgba(132,119,255,0.24),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(72,61,180,0.26),transparent_28%)]'
      : activeSlide.accent === 'green'
        ? 'bg-[radial-gradient(circle_at_top_left,rgba(34,166,109,0.18),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(12,78,54,0.24),transparent_28%)]'
        : activeSlide.accent === 'orange'
          ? 'bg-[radial-gradient(circle_at_top_left,rgba(216,106,40,0.16),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(184,75,9,0.24),transparent_28%)]'
          : 'bg-[radial-gradient(circle_at_top_left,rgba(255,213,61,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(97,88,255,0.2),transparent_28%)]';
  const iconToneClass =
    activeSlide.accent === 'violet'
      ? 'border-[#3a3178] bg-[rgba(101,93,251,0.18)] text-[#8e85ff]'
      : activeSlide.accent === 'green'
        ? 'border-[#1d6b4b] bg-[rgba(34,166,109,0.16)] text-[#33d18f]'
        : activeSlide.accent === 'orange'
          ? 'border-[#8c3405] bg-[rgba(184,75,9,0.2)] text-[#ffab74]'
          : 'border-[#6c4d0d] bg-[rgba(255,213,61,0.18)] text-[var(--retro-gold)]';

  const badgeToneClass: Record<ActivitySlide['badges'][number]['tone'], string> = {
    gold: 'retro-badge retro-badge-gold border-none',
    green: 'retro-badge retro-badge-green border-none',
    violet: 'retro-badge retro-badge-violet border-none',
    ink: 'retro-badge retro-badge-ink border-none',
  };

  const moveSlide = (direction: -1 | 1) => {
    setActiveSlideIndex((current) => (current + direction + slides.length) % slides.length);
  };

  return (
    <Card className="retro-panel-dark relative overflow-hidden rounded-[1.95rem] border-none">
      <div className={`pointer-events-none absolute inset-0 ${accentGlowClass}`} />
      <CardContent className="relative grid gap-6 p-6 pt-6 lg:grid-cols-[1.12fr,0.88fr] lg:p-8">
        <div className="space-y-5 overflow-hidden">
          <div className="overflow-hidden rounded-[1.65rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)]">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${activeSlideIndex * 100}%)` }}
            >
              {slides.map((slide) => {
                const SlideIcon = slide.icon;
                return (
                  <div key={slide.title} className="w-full shrink-0 p-5 sm:p-6">
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                          <Badge className="retro-badge retro-badge-gold border-none">
                            {slide.eyebrow}
                          </Badge>
                          <h2 className="max-w-3xl text-[2.15rem] font-semibold leading-[0.98] tracking-[-0.05em] text-white md:text-[3rem]">
                            {slide.title}
                          </h2>
                        </div>
                        <span
                          className={cn(
                            'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem] border-2 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.28)]',
                            slide.accent === 'violet'
                              ? 'border-[#3a3178] bg-[rgba(101,93,251,0.16)] text-[#8e85ff]'
                              : slide.accent === 'green'
                                ? 'border-[#1d6b4b] bg-[rgba(34,166,109,0.16)] text-[#34d399]'
                                : slide.accent === 'orange'
                                  ? 'border-[#8c3405] bg-[rgba(184,75,9,0.18)] text-[#ffab74]'
                                  : 'border-[#6c4d0d] bg-[rgba(255,213,61,0.16)] text-[var(--retro-gold)]',
                          )}
                        >
                          <SlideIcon aria-hidden="true" className="h-7 w-7" />
                        </span>
                      </div>
                      <p className="max-w-2xl text-base leading-7 text-slate-300">
                        {slide.description}
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <Button asChild variant="arcadeDark">
                          <Link href={slide.primaryHref}>{slide.primaryLabel}</Link>
                        </Button>
                        <Button asChild variant="arcadeOutline">
                          <Link href={slide.secondaryHref}>{slide.secondaryLabel}</Link>
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {slide.badges.map((badge) => (
                          <Badge key={badge.label} className={badgeToneClass[badge.tone]}>
                            {badge.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="retro-panel-dark-soft rounded-[1.45rem] border-none">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="text-xl text-[var(--retro-gold)]">
                    {c.overviewQueueTitle}
                  </CardTitle>
                  <CardDescription className="text-slate-300">
                    {c.overviewQueueDescription}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveSlide(-1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-[var(--retro-gold)] hover:text-[var(--retro-gold)]"
                    aria-label="Previous activity"
                  >
                    <TbChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-[var(--retro-gold)] hover:text-[var(--retro-gold)]"
                    aria-label="Next activity"
                  >
                    <TbChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {slides.map((slide, index) => {
                const selected = index === activeSlideIndex;
                const SlideIcon = slide.icon;
                return (
                  <button
                    key={slide.title}
                    type="button"
                    onClick={() => setActiveSlideIndex(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[1rem] border-2 px-4 py-3 text-left transition',
                      selected
                        ? 'border-[var(--retro-gold)] bg-[rgba(255,213,61,0.08)] text-white'
                        : 'border-[#202745] bg-[rgba(255,255,255,0.04)] text-slate-300 hover:border-[#39436f] hover:text-white',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
                        selected ? iconToneClass : 'border-white/10 bg-white/[0.04] text-slate-300',
                      )}
                    >
                      <SlideIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                        {slide.eyebrow}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-5">
                        {slide.title}
                      </p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="retro-panel rounded-[1.45rem] border-none">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border-2 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]',
                    iconToneClass,
                  )}
                >
                  <HeroIcon aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-xl text-[var(--retro-ink)]">
                    {c.overviewSignalsTitle}
                  </CardTitle>
                  <CardDescription className="text-[rgba(15,17,31,0.68)]">
                    {c.overviewSignalsDescription}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {activeSlide.signals.map((signal) => (
                <div
                  key={signal.label}
                  className="flex items-center justify-between rounded-[1rem] border border-[rgba(15,17,31,0.12)] bg-white/78 px-4 py-3"
                >
                  <span className="text-[rgba(15,17,31,0.68)]">{signal.label}</span>
                  <span className="font-semibold text-[var(--retro-ink)]">{signal.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

export function UserDashboardAccountSection({
  copy: c,
  emailVerified,
  phoneVerified,
  showGameplayRoutes,
  t,
}: UserDashboardAccountSectionProps) {
  return (
    <>
      {showGameplayRoutes ? (
        <section className="space-y-6">
          <OverviewActivitySlider
            copy={c}
            emailVerified={emailVerified}
            phoneVerified={phoneVerified}
            t={t}
          />

          <Card className="retro-panel-featured rounded-[1.9rem] border-none">
            <CardHeader>
              <CardTitle className="text-[1.9rem] text-[var(--retro-ink)]">
                {c.lobbyTitle}
              </CardTitle>
              <CardDescription className="max-w-3xl text-[rgba(15,17,31,0.68)]">
                {c.lobbyDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <GameplayRouteCard
                href="/app/blackjack"
                title={c.blackjackTitle}
                description={c.blackjackDescription}
                openLabel={c.blackjackOpen}
                statusLabel={c.riskLow}
                eyebrow="Live"
                accent="violet"
                icon={TbCards}
              />
              <GameplayRouteCard
                href="/app/holdem"
                title={c.holdemTitle}
                description={c.holdemDescription}
                openLabel={c.holdemOpen}
                statusLabel={c.riskMedium}
                eyebrow="Tables"
                accent="green"
                icon={TbCards}
              />
              <GameplayRouteCard
                href="/app/slot"
                title={c.gachaTitle}
                description={c.gachaDescription}
                openLabel={c.gachaOpen}
                statusLabel={c.riskHigh}
                eyebrow="Jackpot"
                accent="orange"
                icon={TbSparkles}
              />
              <GameplayRouteCard
                href="/app/quick-eight"
                title={c.quickEightTitle}
                description={c.quickEightDescription}
                openLabel={c.quickEightOpen}
                statusLabel={c.riskMedium}
                eyebrow="Queue"
                accent="gold"
                icon={TbHash}
              />
              <GameplayRouteCard
                href="/app/markets"
                title={c.marketsTitle}
                description={c.marketsDescription}
                openLabel={c.marketsOpen}
                statusLabel={c.marketsStatus}
                eyebrow="Markets"
                accent="violet"
                icon={TbChartDonut}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

    </>
  );
}
