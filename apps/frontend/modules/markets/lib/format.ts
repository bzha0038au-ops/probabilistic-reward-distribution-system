import type {
  PredictionMarketPortfolioFilter,
  PredictionMarketPortfolioStatus,
  PredictionMarketStatus,
  PredictionPositionStatus,
} from '@reward/shared-types/prediction-market';
import type { Locale } from '@/lib/i18n/messages';

export function formatMarketAmount(
  locale: Locale,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === '') {
    return '0.00';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatMarketDateTime(
  locale: Locale,
  value: string | Date | null | undefined,
  fallback: string,
) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function formatMarketStatus(
  status: PredictionMarketStatus,
  t: (key: string) => string,
) {
  return t(`markets.status.${status}`);
}

export function formatPortfolioFilter(
  status: PredictionMarketPortfolioFilter,
  t: (key: string) => string,
) {
  return t(`markets.portfolioFilter.${status}`);
}

export function formatPortfolioStatus(
  status: PredictionMarketPortfolioStatus,
  t: (key: string) => string,
) {
  return t(`markets.portfolioStatus.${status}`);
}

export function formatPositionStatus(
  status: PredictionPositionStatus,
  t: (key: string) => string,
) {
  return t(`markets.positionStatus.${status}`);
}

export function resolveMarketStatusClasses(status: PredictionMarketStatus) {
  switch (status) {
    case 'open':
      return 'border-emerald-300/30 bg-emerald-400/15 text-emerald-50';
    case 'locked':
      return 'border-amber-300/30 bg-amber-400/15 text-amber-50';
    case 'resolved':
      return 'border-cyan-300/30 bg-cyan-400/15 text-cyan-50';
    case 'cancelled':
      return 'border-rose-300/30 bg-rose-400/15 text-rose-50';
    default:
      return 'border-white/15 bg-white/8 text-slate-100';
  }
}

export function resolvePositionStatusClasses(
  status: PredictionPositionStatus,
) {
  switch (status) {
    case 'won':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'lost':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'refunded':
      return 'border-slate-200 bg-slate-100 text-slate-900';
    default:
      return 'border-cyan-200 bg-cyan-50 text-cyan-900';
  }
}

export function resolvePortfolioStatusClasses(
  status: PredictionMarketPortfolioStatus,
) {
  switch (status) {
    case 'open':
      return 'border-emerald-300/30 bg-emerald-400/15 text-emerald-50';
    case 'resolved':
      return 'border-cyan-300/30 bg-cyan-400/15 text-cyan-50';
    case 'refunded':
      return 'border-slate-300/30 bg-slate-200/15 text-slate-50';
    default:
      return 'border-white/15 bg-white/8 text-slate-100';
  }
}
