import type { IconType } from 'react-icons';
import { TbBolt, TbClockHour4, TbCoin, TbTrophy, TbUsers } from 'react-icons/tb';

import type { Messages } from '@/lib/i18n/messages';

import { Section } from './section';

export function Metrics({ messages }: { messages: Messages }) {
  const [primary, secondary, featured] = messages.marketing.metrics;
  const panel = messages.marketing.metricsPanel;
  const metricIcons: IconType[] = [TbUsers, TbBolt];

  return (
    <Section className="py-10 sm:py-14">
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="landing-surface-panel rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="retro-kicker inline-flex items-center gap-2 border-none bg-[rgba(184,75,9,0.14)] text-[var(--retro-orange)] shadow-none">
                <TbTrophy className="h-4 w-4" />
                {panel.kicker}
              </p>
              <h3 className="text-3xl font-semibold tracking-tight text-[var(--landing-text)] sm:text-[2.6rem]">
                {featured.value}
              </h3>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                {featured.label}
              </p>
            </div>
            <div className="retro-badge retro-badge-gold border-none text-base">
              <TbCoin className="h-4 w-4" />
              {panel.badge}
            </div>
          </div>
          <p className="landing-copy mt-6 max-w-2xl text-base leading-7">
            {featured.detail}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {[primary, secondary].map((metric, index) => {
            const Icon = metricIcons[index];
            return (
              <div
                key={metric.label}
                className="landing-surface-panel rounded-[2rem] px-6 py-6"
              >
                <div className="inline-flex rounded-full border border-[var(--landing-border-soft)] bg-black/5 p-2 text-[var(--retro-orange)]">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-4xl font-semibold tracking-tight text-[var(--landing-text)]">
                  {metric.value}
                </p>
                <p className="mt-3 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                  {metric.label}
                </p>
                <p className="landing-copy mt-3 text-sm leading-6">
                  {metric.detail}
                </p>
              </div>
            );
          })}
          <div className="landing-stage-panel rounded-[2rem] px-6 py-6 sm:col-span-2">
            <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr] md:items-center">
              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                  <TbClockHour4 className="h-4 w-4" />
                  {panel.supportTitle}
                </p>
                <p className="text-2xl font-semibold tracking-tight text-[var(--landing-stage-panel-text)]">
                  {panel.supportLead}
                </p>
              </div>
              <p className="landing-stage-copy text-sm leading-7">
                {panel.supportDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
