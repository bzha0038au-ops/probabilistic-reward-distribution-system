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
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'success'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-950'
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
        'rounded-xl border border-slate-200 bg-slate-50 px-5 py-4',
        className,
      )}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className="mt-2 text-3xl font-semibold text-slate-950"
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
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{timestamp}</p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              'font-semibold',
              amountTone === 'negative' ? 'text-rose-600' : 'text-emerald-600',
            )}
          >
            {amount}
          </p>
          {badges ? (
            <div className="mt-2 flex flex-wrap justify-end gap-2">{badges}</div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-sm text-slate-500 sm:grid-cols-2">
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
    <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
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
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-slate-950">{title}</h4>
            {statusBadges}
          </div>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {rewardLabel}
          </p>
          <p className="text-lg font-semibold text-slate-950">{rewardAmount}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{progressLabel}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-500 transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
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
    <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-950">{title}</p>
          {userAgent ? (
            <p className="mt-1 break-all text-slate-500">{userAgent}</p>
          ) : null}
        </div>
        {badge}
      </div>
      <div className="mt-3 grid gap-1 text-slate-500">{details}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
