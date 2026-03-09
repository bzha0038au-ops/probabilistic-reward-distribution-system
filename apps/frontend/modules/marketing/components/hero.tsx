import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Messages } from '@/lib/i18n/messages';

import { MarketingNav } from './nav';
import { Section } from './section';

export function Hero({ messages }: { messages: Messages }) {
  const hero = messages.marketing.hero;
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-brand-200/60 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl" />

      <MarketingNav messages={messages} />
      <Section className="py-12">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Badge className="w-fit bg-brand-100 text-brand-700">
              {hero.badge}
            </Badge>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
              {hero.title}
            </h1>
            <p className="text-lg text-slate-600">
              {hero.description}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/register">{hero.primaryCta}</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/app">{hero.secondaryCta}</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-slate-500">
              <div>
                <span className="block text-2xl font-semibold text-slate-900">
                  100%
                </span>
                {hero.stats.transactionIntegrity}
              </div>
              <div>
                <span className="block text-2xl font-semibold text-slate-900">
                  7
                </span>
                {hero.stats.modularDomains}
              </div>
              <div>
                <span className="block text-2xl font-semibold text-slate-900">
                  0
                </span>
                {hero.stats.paymentRisk}
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{hero.card1.title}</CardTitle>
                <CardDescription>{hero.card1.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-slate-600">
                {hero.card1.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-900">{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-brand-200/60 bg-brand-50/70">
              <CardHeader>
                <CardTitle>{hero.card2.title}</CardTitle>
                <CardDescription>{hero.card2.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                {hero.card2.body}
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
