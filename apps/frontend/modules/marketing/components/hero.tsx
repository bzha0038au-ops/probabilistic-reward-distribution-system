import Image from 'next/image';
import Link from 'next/link';
import { TbArrowRight, TbBroadcast, TbCardsFilled, TbClockHour4, TbShieldCheck, TbTargetArrow } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Messages } from '@/lib/i18n/messages';

import { MarketingNav } from './nav';
import { Section } from './section';

export function Hero({ messages }: { messages: Messages }) {
  const hero = messages.marketing.hero;
  const signalLabels = hero.signalLabels;

  return (
    <div className="relative overflow-hidden">
      <MarketingNav messages={messages} />
      <Section className="page-safe-bottom pt-5 pb-12 sm:pb-16">
        <div className="landing-stage-panel relative overflow-hidden rounded-[2.5rem] p-6 sm:p-8 lg:p-10 xl:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,213,61,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(97,88,255,0.16),transparent_30%)]" />
          <div className="relative grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
            <div className="space-y-6 xl:pr-8">
              <Badge className="retro-kicker landing-kicker hover:bg-[rgba(255,213,61,0.16)]">
                {hero.badge}
              </Badge>
              <h1 className="retro-section-title max-w-4xl text-[var(--landing-stage-panel-text)]">
                {hero.title}
              </h1>
              <p className="landing-stage-copy max-w-2xl text-base leading-8 sm:text-lg">
                {hero.description}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button asChild size="xl" variant="arcade" className="w-full sm:w-auto">
                  <Link href="/register">
                    <span>{hero.primaryCta}</span>
                    <TbArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  variant="arcadeOutline"
                  size="xl"
                  asChild
                  className="landing-stage-outline w-full sm:w-auto"
                >
                  <Link href="#games">
                    <span>{hero.secondaryCta}</span>
                    <TbCardsFilled className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="landing-stage-surface rounded-[1.25rem] px-4 py-4">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                    <TbShieldCheck className="h-4 w-4" />
                    {signalLabels.proof}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[var(--landing-stage-panel-text)]">
                    {hero.stats.transactionIntegrity}
                  </p>
                </div>
                <div className="landing-stage-surface rounded-[1.25rem] px-4 py-4">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-violet-soft)]">
                    <TbBroadcast className="h-4 w-4" />
                    {signalLabels.live}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[var(--landing-stage-panel-text)]">
                    {hero.stats.modularDomains}
                  </p>
                </div>
                <div className="landing-stage-surface rounded-[1.25rem] px-4 py-4">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                    <TbTargetArrow className="h-4 w-4" />
                    {signalLabels.daily}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[var(--landing-stage-panel-text)]">
                    {hero.stats.paymentRisk}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="landing-surface-panel overflow-hidden rounded-[2rem] border-none">
                <CardHeader className="space-y-5 px-6 pb-3 pt-6 sm:px-7">
                  <div className="flex flex-wrap gap-2">
                    {hero.card1.items.map((item, index) => (
                      <Badge
                        key={item.label}
                        className={
                          index % 3 === 0
                            ? 'retro-badge retro-badge-gold border-none'
                            : index % 3 === 1
                              ? 'retro-badge retro-badge-violet border-none'
                              : 'retro-badge retro-badge-green border-none'
                        }
                      >
                        {item.label}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                    <div className="space-y-3">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.26em] text-[var(--retro-orange)]">
                        <TbCardsFilled className="h-4 w-4" />
                        {hero.card1.title}
                      </p>
                      <CardDescription className="landing-copy text-sm leading-6">
                        {hero.card1.description}
                      </CardDescription>
                    </div>
                    <div className="rounded-[1.6rem] border border-[var(--landing-border-soft)] bg-black/5 p-4">
                      <Image
                        src="/assets/landing/feature.svg"
                        alt={hero.card1.title}
                        width={420}
                        height={320}
                        className="h-auto w-full"
                        priority
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 px-6 pb-6 sm:grid-cols-2 sm:px-7">
                  {hero.card1.items.map((item) => (
                    <div
                      key={item.label}
                      className="landing-surface-subtle rounded-[1.25rem] px-4 py-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--landing-muted-strong)]">
                        {item.label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[var(--landing-text)]">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="landing-surface-panel rounded-[2rem] border-none">
                <CardHeader className="space-y-3">
                  <CardTitle className="inline-flex items-center gap-3 text-[1.45rem] tracking-tight text-[var(--landing-text)]">
                    <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--landing-border-soft)] bg-black/5 text-[var(--retro-orange)]">
                      <TbClockHour4 className="h-5 w-5" />
                    </span>
                    {hero.card2.title}
                  </CardTitle>
                  <CardDescription className="landing-copy text-sm leading-6">
                    {hero.card2.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm lg:grid-cols-[1fr_auto] lg:items-end">
                  <p className="landing-copy text-base leading-7">{hero.card2.body}</p>
                  <div className="grid gap-2 text-right">
                    <span className="inline-flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                      <TbClockHour4 className="h-4 w-4" />
                      {signalLabels.sessionFlow}
                    </span>
                    <span className="text-3xl font-semibold text-[var(--landing-text)]">24h</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
