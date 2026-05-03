import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SectionProps {
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  align?: 'left' | 'center';
}

export function Section({
  children,
  className,
  eyebrow,
  title,
  description,
  align = 'left',
}: SectionProps) {
  return (
    <section className={cn('page-safe-x w-full', className)}>
      <div className="mx-auto w-full max-w-[88rem]">
        {(eyebrow || title || description) && (
          <div
            className={cn(
              'mb-10 space-y-4',
              align === 'center' && 'text-center'
            )}
          >
            {eyebrow && (
              <p className="retro-kicker border-none bg-[rgba(184,75,9,0.14)] text-[var(--retro-orange)] shadow-none">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-3xl font-semibold tracking-tight text-[var(--landing-text,var(--retro-ink))] md:text-4xl">
                {title}
              </h2>
            )}
            {description && (
              <p className="max-w-3xl text-base leading-7 text-[var(--landing-muted,rgba(15,17,31,0.72))] md:text-lg">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
