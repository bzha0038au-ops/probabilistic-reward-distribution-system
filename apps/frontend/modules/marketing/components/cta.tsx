import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { Messages } from '@/lib/i18n/messages';

import { Section } from './section';

export function CallToAction({ messages }: { messages: Messages }) {
  const cta = messages.marketing.cta;
  return (
    <Section className="py-16">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-brand-50 p-8 shadow-sm md:flex md:items-center md:justify-between">
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-slate-900">
            {cta.title}
          </h3>
          <p className="text-slate-600">
            {cta.description}
          </p>
        </div>
        <div className="mt-6 flex gap-3 md:mt-0">
          <Button asChild>
            <Link href="/register">{cta.primary}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app">{cta.secondary}</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
