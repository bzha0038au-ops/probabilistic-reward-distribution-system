'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  PredictionMarketHistoryResponse,
  PredictionMarketPortfolioFilter,
  PredictionMarketPortfolioItem,
  PredictionPosition,
} from '@reward/shared-types/prediction-market';

import { useLocale, useTranslations } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { browserUserApiClient } from '@/lib/api/user-client';
import { cn } from '@/lib/utils';
import {
  formatMarketAmount,
  formatMarketDateTime,
  formatMarketStatus,
  formatPortfolioFilter,
  formatPortfolioStatus,
  formatPositionStatus,
  resolveMarketStatusClasses,
  resolvePortfolioStatusClasses,
  resolvePositionStatusClasses,
} from '../lib/format';

const PAGE_SIZE = 10;
const PORTFOLIO_FILTERS: readonly PredictionMarketPortfolioFilter[] = [
  'all',
  'open',
  'resolved',
  'refunded',
];

const getOutcomeLabel = (
  item: PredictionMarketPortfolioItem,
  outcomeKey: string,
) =>
  item.market.outcomes.find((outcome) => outcome.key === outcomeKey)?.label ??
  outcomeKey;

const renderPositionTimestamp = (
  locale: ReturnType<typeof useLocale>,
  t: (key: string) => string,
  position: PredictionPosition,
) => {
  if (position.settledAt) {
    return `${t('markets.positionSettledAt')}: ${formatMarketDateTime(
      locale,
      position.settledAt,
      t('markets.unknownTime'),
    )}`;
  }

  return `${t('markets.positionCreatedAt')}: ${formatMarketDateTime(
    locale,
    position.createdAt,
    t('markets.unknownTime'),
  )}`;
};

export function PredictionMarketPortfolioPage() {
  const locale = useLocale();
  const t = useTranslations();
  const [status, setStatus] = useState<PredictionMarketPortfolioFilter>('all');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [history, setHistory] = useState<PredictionMarketHistoryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await browserUserApiClient.getPredictionMarketHistory({
          status,
          page,
          limit: PAGE_SIZE,
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(response.error?.message ?? t('markets.portfolioLoadFailed'));
          setLoading(false);
          return;
        }

        setHistory(response.data);
      } catch {
        if (!cancelled) {
          setError(t('markets.portfolioLoadFailed'));
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [locale, page, refreshKey, status]);

  const handleFilterChange = (nextStatus: PredictionMarketPortfolioFilter) => {
    if (nextStatus === status) {
      return;
    }

    setPage(1);
    setStatus(nextStatus);
  };

  const items = history?.items ?? [];
  const hasItems = items.length > 0;

  return (
    <section className="space-y-6" data-testid="markets-portfolio-page">
      <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
        <CardHeader className="gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-3xl">
                {t('markets.portfolioTitle')}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6 text-slate-300">
                {t('markets.portfolioDescription')}
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                type="button"
                variant="outline"
                className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
              >
                <Link href="/app/markets">{t('markets.browseMarkets')}</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setRefreshKey((value) => value + 1)}
                className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
              >
                {loading ? t('common.loading') : t('markets.refreshPortfolio')}
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-sky-300/20 bg-sky-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/80">
              {t('markets.portfolioExposureTitle')}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-50/90">
              {t('markets.portfolioExposureDescription')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PORTFOLIO_FILTERS.map((filter) => {
              const active = filter === status;

              return (
                <Button
                  key={filter}
                  type="button"
                  variant="outline"
                  onClick={() => handleFilterChange(filter)}
                  className={cn(
                    'rounded-full border px-4 text-xs uppercase tracking-[0.22em]',
                    active
                      ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-50'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white',
                  )}
                >
                  {formatPortfolioFilter(filter, t)}
                </Button>
              );
            })}
          </div>
        </CardHeader>
      </Card>

      {history ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-white/10 bg-white/[0.04] text-slate-100">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {t('markets.portfolioMarketCount')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {history.summary.marketCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.04] text-slate-100">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {t('markets.portfolioPositionCount')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {history.summary.positionCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.04] text-slate-100">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {t('markets.openExposure')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {formatMarketAmount(locale, history.summary.openStakeAmount)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.04] text-slate-100">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {t('markets.settledAndRefunded')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatMarketAmount(locale, history.summary.settledPayoutAmount)}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {t('markets.refundedInlineValue', {
                  amount: formatMarketAmount(locale, history.summary.refundedAmount),
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {error ? (
        <Card className="border-rose-300/30 bg-rose-400/12 text-rose-50">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p
              className="text-sm leading-6"
              data-testid="markets-portfolio-error"
              role="alert"
            >
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              {t('markets.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!history && loading ? (
        <Card className="border-white/10 bg-white/[0.04] text-slate-100">
          <CardContent className="pt-6 text-sm text-slate-300">
            {t('markets.loadingPortfolio')}
          </CardContent>
        </Card>
      ) : null}

      {history && !hasItems ? (
        <Card className="border-white/10 bg-white/[0.04] text-slate-100">
          <CardHeader>
            <CardTitle>{t('markets.portfolioEmptyTitle')}</CardTitle>
            <CardDescription className="text-slate-300">
              {status === 'all'
                ? t('markets.portfolioEmptyDescription')
                : t('markets.portfolioEmptyFilteredDescription')}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {hasItems ? (
        <div className="space-y-5">
          {items.map((item) => (
            <Card
              key={item.market.id}
              className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.22)]"
              data-testid={`markets-portfolio-item-${item.market.id}`}
            >
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]',
                          resolvePortfolioStatusClasses(item.portfolioStatus),
                        )}
                      >
                        {formatPortfolioStatus(item.portfolioStatus, t)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]',
                          resolveMarketStatusClasses(item.market.status),
                        )}
                      >
                        {formatMarketStatus(item.market.status, t)}
                      </Badge>
                      <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        {item.market.roundKey}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-2xl">{item.market.title}</CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        {item.market.description?.trim() ||
                          t('markets.noDescription')}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3 xl:items-end">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 xl:text-right">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        {t('markets.lastActivity')}
                      </p>
                      <p className="mt-1 text-sm text-white">
                        {formatMarketDateTime(
                          locale,
                          item.lastActivityAt,
                          t('markets.unknownTime'),
                        )}
                      </p>
                    </div>

                    <Button asChild className="rounded-full">
                      <Link href={`/app/markets/${item.market.id}`}>
                        {t('markets.viewMarket')}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {t('markets.portfolioPositionCount')}
                    </dt>
                    <dd className="mt-2 text-sm text-slate-100">
                      {item.positionCount}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {t('markets.totalStake')}
                    </dt>
                    <dd className="mt-2 text-sm text-slate-100">
                      {formatMarketAmount(locale, item.totalStakeAmount)}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {t('markets.openExposure')}
                    </dt>
                    <dd className="mt-2 text-sm text-slate-100">
                      {formatMarketAmount(locale, item.openStakeAmount)}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {t('markets.settledPayout')}
                    </dt>
                    <dd className="mt-2 text-sm text-slate-100">
                      {formatMarketAmount(locale, item.settledPayoutAmount)}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {t('markets.refundedAmount')}
                    </dt>
                    <dd className="mt-2 text-sm text-slate-100">
                      {formatMarketAmount(locale, item.refundedAmount)}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
                    {t('markets.yourPositions')}
                  </h3>

                  <div className="grid gap-3">
                    {item.positions.map((position) => (
                      <div
                        key={position.id}
                        className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">
                                {getOutcomeLabel(item, position.outcomeKey)}
                              </p>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'border',
                                  resolvePositionStatusClasses(position.status),
                                )}
                              >
                                {formatPositionStatus(position.status, t)}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-400">
                              {renderPositionTimestamp(locale, t, position)}
                            </p>
                          </div>

                          <dl className="grid gap-3 sm:grid-cols-2 lg:min-w-[16rem]">
                            <div>
                              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                {t('markets.stakeAmountLabel')}
                              </dt>
                              <dd className="mt-1 text-sm text-slate-100">
                                {formatMarketAmount(locale, position.stakeAmount)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                {t('markets.payoutAmount')}
                              </dt>
                              <dd className="mt-1 text-sm text-slate-100">
                                {formatMarketAmount(locale, position.payoutAmount)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {history ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">
            {t('markets.portfolioPageValue', { page })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              {t('markets.previousPage')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!history.hasNext || loading}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              {t('markets.nextPage')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
