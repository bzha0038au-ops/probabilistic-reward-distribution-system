import Image from 'next/image';
import type { IconType } from 'react-icons';
import { TbCardsFilled, TbCircleCheck, TbGiftFilled, TbShieldCheck } from 'react-icons/tb';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Messages } from '@/lib/i18n/messages';

import { Section } from './section';

function FeatureRow({
  title,
  description,
  image,
  reverse,
  bullets,
  id,
}: {
  title: string;
  description: string;
  image: string;
  reverse?: boolean;
  bullets: { label: string; copy: string }[];
  id?: string;
}) {
  const rowIconMap: Record<string, IconType> = {
    lobby: TbCardsFilled,
    rewards: TbGiftFilled,
    fairness: TbShieldCheck,
  };
  const RowIcon = rowIconMap[id ?? 'lobby'] ?? TbCardsFilled;

  return (
    <div
      id={id}
      className={cn(
        'landing-surface-panel grid items-center gap-8 rounded-[2.2rem] p-6 sm:p-8 lg:grid-cols-2',
        reverse && 'lg:[&>div:first-child]:order-2'
      )}
    >
      <div className="space-y-4">
        <h3 className="inline-flex items-center gap-3 text-2xl font-semibold text-[var(--landing-text)] md:text-3xl">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-[var(--landing-border-soft)] bg-black/5 text-[var(--retro-orange)]">
            <RowIcon className="h-5 w-5" />
          </span>
          {title}
        </h3>
        <p className="landing-copy text-base leading-7 md:text-lg">{description}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {bullets.map((bullet) => (
            <Card
              key={bullet.label}
              className="landing-surface-subtle rounded-[1.35rem] border-none shadow-none"
            >
              <CardHeader className="space-y-1">
                <CardTitle className="inline-flex items-center gap-2 text-base text-[var(--landing-text)]">
                  <TbCircleCheck className="h-4 w-4 text-[var(--retro-green)]" />
                  {bullet.label}
                </CardTitle>
                <CardDescription className="landing-copy leading-6">
                  {bullet.copy}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
      <div className="landing-stage-panel flex justify-center rounded-[1.85rem] p-4 sm:p-6">
        <Image
          src={image}
          alt={title}
          width={420}
          height={320}
          className="h-auto w-full max-w-sm"
        />
      </div>
    </div>
  );
}

export function FeatureSection({ messages }: { messages: Messages }) {
  const features = messages.marketing.features;
  const rowIds = ['lobby', 'rewards', 'fairness'];

  return (
    <Section
      className="pt-14 pb-8 sm:pt-16 sm:pb-10"
      eyebrow={features.eyebrow}
      title={features.title}
      description={features.description}
    >
      <div className="space-y-12 sm:space-y-14">
        {features.rows.map((row, index) => (
          <FeatureRow key={row.title} id={rowIds[index]} {...row} />
        ))}
      </div>
    </Section>
  );
}
