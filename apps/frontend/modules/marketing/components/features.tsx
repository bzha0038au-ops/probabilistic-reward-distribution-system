import Image from 'next/image';

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
}: {
  title: string;
  description: string;
  image: string;
  reverse?: boolean;
  bullets: { label: string; copy: string }[];
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-8 lg:grid-cols-2',
        reverse && 'lg:[&>div:first-child]:order-2'
      )}
    >
      <div className="space-y-4">
        <h3 className="text-2xl font-semibold text-slate-900 md:text-3xl">
          {title}
        </h3>
        <p className="text-base text-slate-600 md:text-lg">{description}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {bullets.map((bullet) => (
            <Card key={bullet.label} className="border-slate-200">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">{bullet.label}</CardTitle>
                <CardDescription>{bullet.copy}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
      <div className="flex justify-center rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
  return (
    <Section
      className="py-14 sm:py-16"
      eyebrow={features.eyebrow}
      title={features.title}
      description={features.description}
    >
      <div className="space-y-16">
        {features.rows.map((row) => (
          <FeatureRow key={row.title} {...row} />
        ))}
      </div>
    </Section>
  );
}
