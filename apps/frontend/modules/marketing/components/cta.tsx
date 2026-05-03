import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { Messages } from '@/lib/i18n/messages';

import { Section } from './section';

export function CallToAction({ messages }: { messages: Messages }) {
  const cta = messages.marketing.cta;
  return (
    <Section className="pt-6 pb-8 sm:pt-8 sm:pb-10">
      <div className="landing-stage-panel rounded-[2.25rem] p-5 sm:p-6 md:flex md:items-center md:justify-between md:gap-8">
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold tracking-tight text-[var(--landing-stage-panel-text)]">
            {cta.title}
          </h3>
          <p className="landing-stage-copy max-w-2xl leading-7">
            {cta.description}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-0">
          <Button asChild variant="arcade" className="w-full sm:w-auto">
            <Link href="/register">{cta.primary}</Link>
          </Button>
          <Button
            variant="arcadeOutline"
            asChild
            className="landing-stage-outline w-full sm:w-auto"
          >
            <Link href="#games">{cta.secondary}</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
