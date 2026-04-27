'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type GameplayRouteCardProps = {
  href: string;
  title: string;
  description: string;
  openLabel: string;
  statusLabel: string;
  lockedNote?: string | null;
};

export function GameplayRouteCard({
  href,
  title,
  description,
  openLabel,
  statusLabel,
  lockedNote = null,
}: GameplayRouteCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
        <Badge
          variant="outline"
          className="rounded-full border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-800"
        >
          {statusLabel}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      {lockedNote ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lockedNote}
        </p>
      ) : null}
      <Button asChild className="mt-5 rounded-full">
        <Link href={href}>{openLabel}</Link>
      </Button>
    </div>
  );
}
