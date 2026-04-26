import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { Messages } from '@/lib/i18n/messages';

import { Section } from './section';

export function CallToAction({ messages }: { messages: Messages }) {
  const cta = messages.marketing.cta;
  return (
    <Section className="py-14 sm:py-16">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-brand-50 p-6 shadow-sm sm:p-8 md:flex md:items-center md:justify-between">
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-slate-900">
            {cta.title}
          </h3>
          <p className="text-slate-600">
            {cta.description}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-0">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/register">{cta.primary}</Link>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/app">{cta.secondary}</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
