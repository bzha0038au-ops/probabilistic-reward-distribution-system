'use client';

import Link from 'next/link';
import type { IconType } from 'react-icons';
import { TbArrowUpRight } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type GameplayRouteCardProps = {
  href: string;
  title: string;
  description: string;
  openLabel: string;
  statusLabel: string;
  lockedNote?: string | null;
  accent?: 'orange' | 'violet' | 'gold' | 'green';
  eyebrow?: string;
  className?: string;
  icon?: IconType;
  players?: string;
  playersLabel?: string;
  rewardRange?: string;
  rewardRangeLabel?: string;
  riskLabelHeading?: string;
  riskLabel?: string;
  buttonVariant?: 'arcade' | 'arcadeDark' | 'arcadeOutline';
};

export function GameplayRouteCard({
  href,
  title,
  statusLabel,
  lockedNote = null,
  accent = 'orange',
  eyebrow,
  className,
  icon: Icon,
}: GameplayRouteCardProps) {
  const iconToneClass =
    accent === 'violet'
      ? 'border-[#3a3178] bg-[rgba(101,93,251,0.14)] text-[#655dfb]'
      : accent === 'gold'
        ? 'border-[#b08a12] bg-[#fff2ba] text-[#b7791f]'
        : accent === 'green'
          ? 'border-[#1d6b4b] bg-[rgba(34,166,109,0.14)] text-[#148356]'
          : 'border-[#b84b09] bg-[rgba(184,75,9,0.12)] text-[var(--retro-orange)]';

  return (
    <Link
      href={href}
      className={cn(
        'retro-panel group flex h-full flex-col justify-between rounded-[1.45rem] border-none p-5 transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0px_0px_rgba(15,17,31,0.92)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border-2 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]',
            iconToneClass,
          )}
        >
          {Icon ? <Icon aria-hidden="true" className="h-6 w-6" /> : <span className="text-xl">•</span>}
        </span>
        {statusLabel ? (
          <Badge
            variant="outline"
            className={
              accent === 'violet'
                ? 'retro-badge retro-badge-violet border-none'
                : accent === 'gold'
                  ? 'retro-badge retro-badge-gold border-none'
                  : accent === 'green'
                    ? 'retro-badge retro-badge-green border-none'
                    : 'retro-badge border-none bg-[rgba(184,75,9,0.14)] text-[var(--retro-orange)]'
            }
          >
            {statusLabel}
          </Badge>
        ) : null}
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.52)]">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="text-lg font-semibold leading-tight text-[var(--retro-ink)]">{title}</h3>
        </div>
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(15,17,31,0.12)] bg-white/70 text-[var(--retro-ink)] transition-colors group-hover:border-[var(--retro-ink)]"
        >
          <TbArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      {lockedNote ? (
        <p className="mt-4 rounded-[1rem] border border-[var(--retro-gold)] bg-[#fff6d8] px-3 py-2 text-sm text-[var(--retro-ink)]">
          {lockedNote}
        </p>
      ) : null}
    </Link>
  );
}
