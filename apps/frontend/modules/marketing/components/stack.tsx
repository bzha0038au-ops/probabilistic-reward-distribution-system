import type { IconType } from 'react-icons';
import { TbCards, TbGift, TbShieldCheck, TbSparkles, TbTargetArrow, TbWaveSine } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import type { Messages } from '@/lib/i18n/messages';

export function StackStrip({ messages }: { messages: Messages }) {
  const stack = messages.marketing.stack;
  const stackIcons: IconType[] = [TbCards, TbSparkles, TbCards, TbGift, TbTargetArrow, TbShieldCheck];

  return (
    <section id="games" className="page-safe-x py-10 sm:py-12">
      <div className="landing-stage-panel mx-auto flex w-full max-w-[88rem] flex-col gap-6 rounded-[2.25rem] px-6 py-6 sm:px-8 sm:py-8 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex shrink-0 flex-col gap-3 xl:max-w-md">
          <span className="retro-kicker landing-kicker inline-flex w-fit items-center gap-2">
            <TbWaveSine className="h-4 w-4" />
            {stack.title}
          </span>
          <p className="max-w-lg text-lg font-semibold tracking-tight text-[var(--landing-stage-panel-text)] sm:text-[1.4rem]">
            {stack.lead}
          </p>
          <p className="landing-stage-copy text-sm leading-7">
            {stack.description}
          </p>
        </div>
        <div className="flex max-w-3xl flex-wrap gap-3">
          {stack.items.map((item, index) => {
            const Icon = stackIcons[index];
            return (
              <Badge
                key={item}
                variant="secondary"
                className={
                  index % 3 === 0
                    ? 'retro-badge retro-badge-gold border-none'
                    : index % 3 === 1
                      ? 'retro-badge retro-badge-violet border-none'
                      : 'retro-badge retro-badge-green border-none'
                }
              >
                <Icon className="h-4 w-4" />
                {item}
              </Badge>
            );
          })}
        </div>
      </div>
    </section>
  );
}
