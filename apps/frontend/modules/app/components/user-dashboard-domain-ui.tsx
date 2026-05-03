import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type DashboardFeedbackNoticeProps = {
  tone: 'success' | 'warning' | 'danger';
  children: ReactNode;
  className?: string;
  testId?: string;
};

export function DashboardFeedbackNotice({
  tone,
  children,
  className,
  testId,
}: DashboardFeedbackNoticeProps) {
  return (
    <div
      className={cn(
        'rounded-[1.3rem] border-2 px-4 py-3 text-sm shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]',
        tone === 'success'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : tone === 'warning'
            ? 'border-[var(--retro-gold)] bg-[#fff6d8] text-[var(--retro-ink)]'
            : 'border-red-300 bg-red-50 text-red-900',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

type WalletSummaryCardProps = {
  label: string;
  value: string;
  className?: string;
  valueTestId?: string;
};

export function WalletSummaryCard({
  label,
  value,
  className,
  valueTestId,
}: WalletSummaryCardProps) {
  return (
    <div
      className={cn(
        'retro-panel rounded-[1.45rem] border-none px-5 py-4',
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
        {label}
      </p>
      <p
        className="mt-3 text-3xl font-semibold tracking-tight text-[var(--retro-ink)]"
        data-testid={valueTestId}
      >
        {value}
      </p>
    </div>
  );
}

type WalletActivityCardProps = {
  title: string;
  timestamp: string;
  amount: string;
  amountTone: 'positive' | 'negative';
  badges?: ReactNode;
  beforeLabel: string;
  beforeValue: string;
  afterLabel: string;
  afterValue: string;
};

export function WalletActivityCard({
  title,
  timestamp,
  amount,
  amountTone,
  badges,
  beforeLabel,
  beforeValue,
  afterLabel,
  afterValue,
}: WalletActivityCardProps) {
  return (
    <div className="retro-panel rounded-[1.35rem] border-none px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[var(--retro-ink)]">{title}</p>
          <p className="mt-1 text-sm text-[rgba(15,17,31,0.62)]">{timestamp}</p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              'font-semibold',
              amountTone === 'negative'
                ? 'text-[var(--retro-red)]'
                : 'text-[var(--retro-green)]',
            )}
          >
            {amount}
          </p>
          {badges ? (
            <div className="mt-2 flex flex-wrap justify-end gap-2">{badges}</div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-sm text-[rgba(15,17,31,0.62)] sm:grid-cols-2">
        <p>
          {beforeLabel}: {beforeValue}
        </p>
        <p>
          {afterLabel}: {afterValue}
        </p>
      </div>
    </div>
  );
}

type RewardSummaryCardProps = {
  label: string;
  value: string | number;
};

export function RewardSummaryCard({ label, value }: RewardSummaryCardProps) {
  return (
    <div className="retro-panel rounded-[1.35rem] border-none px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--retro-ink)]">{value}</p>
    </div>
  );
}

type RewardMissionCardProps = {
  title: string;
  description: string;
  statusBadges?: ReactNode;
  rewardLabel: string;
  rewardAmount: string;
  progressLabel: string;
  progressPercent: number;
  metaLines?: ReactNode;
  action?: ReactNode;
};

export function RewardMissionCard({
  title,
  description,
  statusBadges,
  rewardLabel,
  rewardAmount,
  progressLabel,
  progressPercent,
  metaLines,
  action,
}: RewardMissionCardProps) {
  return (
    <div className="retro-panel rounded-[1.55rem] border-none p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-[var(--retro-ink)]">{title}</h4>
            {statusBadges}
          </div>
          <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--retro-orange)]">
            {rewardLabel}
          </p>
          <p className="text-lg font-semibold text-[var(--retro-ink)]">{rewardAmount}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-[rgba(15,17,31,0.62)]">
          <span>{progressLabel}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[rgba(15,17,31,0.08)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--retro-gold)] via-[var(--retro-orange)] to-[var(--retro-violet)] transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[rgba(15,17,31,0.62)]">
        <div className="space-y-1">{metaLines}</div>
        {action}
      </div>
    </div>
  );
}

type SecuritySessionCardProps = {
  title: string;
  badge?: ReactNode;
  userAgent?: string | null;
  details: ReactNode;
  action?: ReactNode;
};

export function SecuritySessionCard({
  title,
  badge,
  userAgent = null,
  details,
  action,
}: SecuritySessionCardProps) {
  return (
    <div className="retro-panel rounded-[1.35rem] border-none px-4 py-4 text-sm text-[rgba(15,17,31,0.74)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-[var(--retro-ink)]">{title}</p>
          {userAgent ? (
            <p className="mt-1 break-all text-[rgba(15,17,31,0.58)]">{userAgent}</p>
          ) : null}
        </div>
        {badge}
      </div>
      <div className="mt-3 grid gap-1 text-[rgba(15,17,31,0.62)]">{details}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
