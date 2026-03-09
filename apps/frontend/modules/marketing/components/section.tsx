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
    <section className={cn('mx-auto w-full max-w-6xl px-6', className)}>
      {(eyebrow || title || description) && (
        <div
          className={cn(
            'mb-10 space-y-3',
            align === 'center' && 'text-center'
          )}
        >
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 className="text-3xl font-semibold text-slate-900 md:text-4xl">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-base text-slate-600 md:text-lg">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
