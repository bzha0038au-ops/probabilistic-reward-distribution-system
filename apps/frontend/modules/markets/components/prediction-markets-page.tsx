'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PredictionMarketSummary, PredictionMarketStatus } from '@reward/shared-types/prediction-market';

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
import { Input } from '@/components/ui/input';
import { browserUserApiClient } from '@/lib/api/user-client';
import { cn } from '@/lib/utils';
import {
  formatMarketAmount,
  formatMarketDateTime,
  formatMarketStatus,
} from '../lib/format';

type MarketSortMode = 'openNow' | 'endingSoon' | 'largestPool';

const countPositions = (market: PredictionMarketSummary) =>
  market.outcomePools.reduce((sum, pool) => sum + pool.positionCount, 0);

const parseMarketNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTimestamp = (value: string | Date | null | undefined) => {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
};

const statusPriority: Record<PredictionMarketStatus, number> = {
  open: 0,
  locked: 1,
  resolved: 2,
  cancelled: 3,
  draft: 4,
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const resolveMarketListStatusClasses = (status: PredictionMarketStatus) => {
  switch (status) {
    case 'open':
      return 'retro-badge-gold';
    case 'locked':
      return 'border-none bg-[#fff2cf] text-[var(--retro-orange)]';
    case 'resolved':
      return 'border-none bg-[rgba(34,166,109,0.16)] text-[var(--retro-green)]';
    case 'cancelled':
      return 'border-none bg-[rgba(227,74,60,0.14)] text-[var(--retro-red)]';
    default:
      return 'retro-badge-ink border-none';
  }
};

const resolveOutcomeShare = (
  poolAmount: string,
  totalPoolAmount: string,
) => {
  const total = parseMarketNumber(totalPoolAmount);
  const amount = parseMarketNumber(poolAmount);

  if (total <= 0 || amount <= 0) {
    return 0;
  }

  return amount / total;
};

const buildProbabilityBars = (share: number) => {
  const normalizedShare = Math.max(0.12, Math.min(0.9, share || 0.5));
  return Array.from({ length: 8 }, (_, index) => {
    const step = 0.24 + index * 0.08;
    return Math.max(0.18, Math.min(0.92, step * normalizedShare + 0.08));
  });
};

const estimateTrade = (stakeAmount: string, share: number) => {
  const stake = parseMarketNumber(stakeAmount);
  const impliedPrice = Math.max(0.05, Math.min(0.95, share || 0.5));

  if (stake <= 0) {
    return {
      impliedPrice,
      estimatedShares: 0,
      potentialReturn: 0,
      roiPercent: 0,
    };
  }

  const estimatedShares = stake / impliedPrice;
  const potentialReturn = estimatedShares;
  const roiPercent = ((potentialReturn - stake) / stake) * 100;

  return {
    impliedPrice,
    estimatedShares,
    potentialReturn,
    roiPercent,
  };
};

export function PredictionMarketsPage() {
  const locale = useLocale();
  const t = useTranslations();
  const [markets, setMarkets] = useState<PredictionMarketSummary[] | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [selectedOutcomeKey, setSelectedOutcomeKey] = useState<string>('');
  const [sortMode, setSortMode] = useState<MarketSortMode>('endingSoon');
  const [stakeAmount, setStakeAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browserUserApiClient.listPredictionMarkets();

      if (!response.ok) {
        setError(response.error?.message ?? t('markets.loadFailed'));
        setLoading(false);
        return;
      }

      setMarkets(response.data);
    } catch {
      setError(t('markets.loadFailed'));
    }

    setLoading(false);
  }, [t]);

  useEffect(() => {
    void refreshMarkets();
  }, [refreshMarkets]);

  const liveMarketCount = useMemo(
    () => (markets ?? []).filter((market) => market.status === 'open').length,
    [markets],
  );

  const totalPoolAmount = useMemo(
    () =>
      (markets ?? []).reduce(
        (sum, market) => sum + parseMarketNumber(market.totalPoolAmount),
        0,
      ),
    [markets],
  );

  const totalPositionCount = useMemo(
    () => (markets ?? []).reduce((sum, market) => sum + countPositions(market), 0),
    [markets],
  );

  const sortedMarkets = useMemo(() => {
    if (!markets) {
      return [];
    }

    return [...markets].sort((left, right) => {
      if (sortMode === 'largestPool') {
        const poolDelta =
          parseMarketNumber(right.totalPoolAmount) -
          parseMarketNumber(left.totalPoolAmount);
        if (poolDelta !== 0) {
          return poolDelta;
        }
      }

      if (sortMode === 'endingSoon') {
        const timeDelta = toTimestamp(left.locksAt) - toTimestamp(right.locksAt);
        if (timeDelta !== 0) {
          return timeDelta;
        }
      }

      const statusDelta = statusPriority[left.status] - statusPriority[right.status];
      if (statusDelta !== 0) {
        return statusDelta;
      }

      const poolDelta =
        parseMarketNumber(right.totalPoolAmount) -
        parseMarketNumber(left.totalPoolAmount);
      if (poolDelta !== 0) {
        return poolDelta;
      }

      return toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
    });
  }, [markets, sortMode]);

  useEffect(() => {
    if (sortedMarkets.length === 0) {
      setSelectedMarketId(null);
      return;
    }

    const stillExists = sortedMarkets.some((market) => market.id === selectedMarketId);
    if (!stillExists) {
      setSelectedMarketId(sortedMarkets[0]?.id ?? null);
    }
  }, [selectedMarketId, sortedMarkets]);

  const selectedMarket =
    sortedMarkets.find((market) => market.id === selectedMarketId) ?? sortedMarkets[0] ?? null;

  useEffect(() => {
    if (!selectedMarket) {
      setSelectedOutcomeKey('');
      return;
    }

    const hasSelectedOutcome = selectedMarket.outcomePools.some(
      (pool) => pool.outcomeKey === selectedOutcomeKey,
    );

    if (!hasSelectedOutcome) {
      setSelectedOutcomeKey(selectedMarket.outcomePools[0]?.outcomeKey ?? '');
    }
  }, [selectedMarket, selectedOutcomeKey]);

  const selectedPool =
    selectedMarket?.outcomePools.find((pool) => pool.outcomeKey === selectedOutcomeKey) ??
    selectedMarket?.outcomePools[0] ??
    null;

  const selectedPoolShare = selectedMarket && selectedPool
    ? resolveOutcomeShare(selectedPool.totalStakeAmount, selectedMarket.totalPoolAmount)
    : 0;

  const tradeEstimate = estimateTrade(stakeAmount, selectedPoolShare);
  const probabilityBars = buildProbabilityBars(selectedPoolShare);

  const sortButtons: Array<{ key: MarketSortMode; label: string }> = [
    { key: 'openNow', label: t('markets.filterOpenNow') },
    { key: 'endingSoon', label: t('markets.filterEndingSoon') },
    { key: 'largestPool', label: t('markets.filterLargestPool') },
  ];

  return (
    <section className="space-y-6" data-testid="markets-list-page">
      <Card className="retro-panel-featured rounded-[1.9rem] border-none">
        <CardContent className="grid gap-6 p-6 pt-6 lg:grid-cols-[1.1fr,0.9fr] lg:p-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-[2.8rem] font-semibold leading-[0.94] tracking-[-0.05em] text-[var(--retro-ink)] md:text-[4.1rem]">
                {t('markets.title')}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.72)]">
                {t('markets.description')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="arcadeDark">
                <Link href="/app/markets/portfolio">{t('markets.openPortfolio')}</Link>
              </Button>
              <Button
                type="button"
                variant="arcadeOutline"
                onClick={() => void refreshMarkets()}
                disabled={loading}
              >
                {loading ? t('common.loading') : t('markets.refreshList')}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="retro-panel rounded-[1.3rem] border-none px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                {t('markets.summaryLiveMarkets')}
              </p>
              <p className="mt-3 text-3xl font-semibold text-[var(--retro-ink)]">
                {t('markets.marketCountValue', { count: liveMarketCount })}
              </p>
            </div>
            <div className="retro-panel rounded-[1.3rem] border-none px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                {t('markets.summaryTotalPool')}
              </p>
              <p className="mt-3 text-3xl font-semibold text-[var(--retro-ink)]">
                {formatMarketAmount(locale, totalPoolAmount)}
              </p>
            </div>
            <div className="retro-panel rounded-[1.3rem] border-none px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                {t('markets.summaryPositionCount')}
              </p>
              <p className="mt-3 text-3xl font-semibold text-[var(--retro-ink)]">
                {t('markets.positionCountValue', { count: totalPositionCount })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="rounded-[1.5rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] text-[var(--retro-ink)]">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6" data-testid="markets-list-error" role="alert">
              {error}
            </p>
            <Button type="button" variant="arcadeOutline" onClick={() => void refreshMarkets()}>
              {t('markets.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!markets && loading ? (
        <Card className="retro-panel rounded-[1.5rem] border-none">
          <CardContent className="pt-6 text-sm text-[rgba(15,17,31,0.62)]">
            {t('markets.loadingList')}
          </CardContent>
        </Card>
      ) : null}

      {markets && markets.length === 0 ? (
        <Card className="retro-panel rounded-[1.5rem] border-none">
          <CardHeader>
            <CardTitle className="text-[var(--retro-ink)]">{t('markets.emptyTitle')}</CardTitle>
            <CardDescription className="text-[rgba(15,17,31,0.62)]">
              {t('markets.emptyDescription')}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {sortedMarkets.length > 0 && selectedMarket ? (
        <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              {sortButtons.map((button) => (
                <Button
                  key={button.key}
                  type="button"
                  variant={sortMode === button.key ? 'arcade' : 'arcadeOutline'}
                  onClick={() => setSortMode(button.key)}
                  data-testid={`market-filter-${button.key}`}
                >
                  {button.label}
                </Button>
              ))}
            </div>

            <div className="space-y-4">
              {sortedMarkets.map((market) => {
                const positionCount = countPositions(market);
                const selected = market.id === selectedMarket.id;

                return (
                  <Card
                    key={market.id}
                    className={cn(
                      'cursor-pointer rounded-[1.7rem] border-none transition-[transform,box-shadow]',
                      selected
                        ? 'retro-panel-featured shadow-[8px_8px_0px_0px_rgba(255,213,61,0.92)]'
                        : 'retro-panel hover:-translate-y-1',
                    )}
                    data-testid={`market-summary-${market.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMarketId(market.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedMarketId(market.id);
                      }
                    }}
                  >
                    <CardContent className="space-y-5 p-5 md:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'retro-badge border-none',
                                resolveMarketListStatusClasses(market.status),
                              )}
                            >
                              {formatMarketStatus(market.status, t)}
                            </Badge>
                            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(15,17,31,0.46)]">
                              {market.roundKey}
                            </span>
                            {market.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-[rgba(15,17,31,0.12)] bg-white/84 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[rgba(15,17,31,0.56)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-[1.75rem] font-semibold leading-tight text-[var(--retro-ink)]">
                              {market.title}
                            </h3>
                            <p className="max-w-3xl text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                              {market.description?.trim() || t('markets.noDescription')}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                            {t('markets.totalPool')}
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--retro-ink)]">
                            {formatMarketAmount(locale, market.totalPoolAmount)}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {market.outcomePools.map((pool) => {
                          const share = resolveOutcomeShare(
                            pool.totalStakeAmount,
                            market.totalPoolAmount,
                          );

                          return (
                            <div
                              key={pool.outcomeKey}
                              className="relative overflow-hidden rounded-[1.2rem] border border-[rgba(15,17,31,0.14)] bg-white/84 px-4 py-4"
                            >
                              <div
                                className={cn(
                                  'absolute inset-y-0 left-0 opacity-18',
                                  pool.outcomeKey === selectedOutcomeKey && selected
                                    ? 'bg-[var(--retro-orange)]'
                                    : 'bg-[var(--retro-violet)]',
                                )}
                                style={{ width: `${Math.max(12, share * 100)}%` }}
                              />
                              <div className="relative flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--retro-ink)]">
                                    {pool.label}
                                  </p>
                                  <p className="mt-1 text-xs text-[rgba(15,17,31,0.54)]">
                                    {t('markets.positionCountValue', {
                                      count: pool.positionCount,
                                    })}
                                  </p>
                                </div>
                                <p className="text-2xl font-semibold text-[var(--retro-orange)]">
                                  {formatPercent(share)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(15,17,31,0.12)] pt-4 text-sm text-[rgba(15,17,31,0.58)]">
                        <span>
                          {t('markets.locksAt')}: {formatMarketDateTime(locale, market.locksAt, t('markets.unknownTime'))}
                        </span>
                        <span>{t('markets.positionCountValue', { count: positionCount })}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <aside className="xl:sticky xl:top-28 xl:self-start">
            <Card
              className="retro-panel relative overflow-hidden rounded-[1.8rem] border-none"
              data-testid="market-preview-panel"
            >
              <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-18" />
              <CardContent className="relative space-y-5 p-5 md:p-6">
                <div className="space-y-3 border-b border-[rgba(15,17,31,0.12)] pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgba(15,17,31,0.12)] bg-white/88 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.54)]">
                      {selectedMarket.roundKey}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'retro-badge border-none',
                        resolveMarketListStatusClasses(selectedMarket.status),
                      )}
                    >
                      {formatMarketStatus(selectedMarket.status, t)}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-[2rem] font-semibold leading-tight text-[var(--retro-ink)]">
                      {selectedMarket.title}
                    </h2>
                    <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                      {selectedMarket.description?.trim() || t('markets.noDescription')}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm text-[rgba(15,17,31,0.64)]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                        {t('markets.resolutionSourceLabel')}
                      </p>
                      <p className="mt-1 text-[var(--retro-ink)]">{selectedMarket.sourceOfTruth}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                        {t('markets.rulesLabel')}
                      </p>
                      <p className="mt-1 text-[var(--retro-ink)]">{selectedMarket.resolutionRules}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-[1.45rem] border border-[rgba(15,17,31,0.12)] bg-white/76 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.54)]">
                      {t('markets.probabilityBoard')}
                    </p>
                    <p className="text-2xl font-semibold text-[var(--retro-orange)]">
                      {formatPercent(selectedPoolShare)}
                    </p>
                  </div>
                  <div className="flex h-40 items-end gap-2 rounded-[1.1rem] border border-[rgba(15,17,31,0.1)] bg-[rgba(255,255,255,0.9)] px-3 pb-3 pt-8">
                    {probabilityBars.map((bar, index) => (
                      <div
                        key={`${selectedMarket.id}-${index}`}
                        className="flex-1 rounded-t-[0.45rem] border border-[rgba(15,17,31,0.08)] bg-[linear-gradient(180deg,#d4956e,#b84b09)]"
                        style={{ height: `${Math.max(18, Math.round(bar * 100))}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-[var(--retro-ink)]">
                      {t('markets.tradePreviewTitle')}
                    </p>
                    <p className="text-sm leading-6 text-[rgba(15,17,31,0.66)]">
                      {t('markets.tradePreviewDescription')}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedMarket.outcomePools.map((pool) => {
                      const active = pool.outcomeKey === selectedOutcomeKey;
                      const share = resolveOutcomeShare(
                        pool.totalStakeAmount,
                        selectedMarket.totalPoolAmount,
                      );

                      return (
                        <button
                          key={pool.outcomeKey}
                          type="button"
                          className={cn(
                            'rounded-[1.1rem] border-2 px-4 py-4 text-left transition-[transform,border-color,box-shadow,background-color]',
                            active
                              ? 'border-[var(--retro-ink)] bg-[var(--retro-orange)] text-[var(--retro-ivory)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.94)]'
                              : 'border-[rgba(15,17,31,0.14)] bg-white/88 text-[var(--retro-ink)] hover:border-[var(--retro-orange)]',
                          )}
                          onClick={() => setSelectedOutcomeKey(pool.outcomeKey)}
                          data-testid={`market-outcome-preview-${pool.outcomeKey}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-black uppercase tracking-[0.18em]">
                              {pool.label}
                            </span>
                            <span className="text-lg font-semibold">
                              {formatPercent(share)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              'mt-2 text-xs',
                              active ? 'text-[rgba(255,250,241,0.78)]' : 'text-[rgba(15,17,31,0.54)]',
                            )}
                          >
                            {formatMarketAmount(locale, pool.totalStakeAmount)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/82 p-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.54)]">
                      {t('markets.previewStakeLabel')}
                    </label>
                    <div className="mt-3">
                      <Input
                        value={stakeAmount}
                        onChange={(event) => setStakeAmount(event.target.value)}
                        inputMode="decimal"
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-[rgba(15,17,31,0.66)]">
                      <div className="flex items-center justify-between gap-3">
                        <span>{t('markets.impliedPriceLabel')}</span>
                        <span className="font-semibold text-[var(--retro-ink)]">
                          {Math.round(tradeEstimate.impliedPrice * 100)}c
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{t('markets.estimateSharesLabel')}</span>
                        <span className="font-semibold text-[var(--retro-ink)]">
                          {formatMarketAmount(locale, tradeEstimate.estimatedShares)} {selectedPool?.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{t('markets.potentialReturnLabel')}</span>
                        <span className="font-semibold text-[var(--retro-orange)]">
                          {formatMarketAmount(locale, tradeEstimate.potentialReturn)} ({tradeEstimate.roiPercent >= 0 ? '+' : ''}
                          {Math.round(tradeEstimate.roiPercent)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      asChild
                      variant="arcadeDark"
                      data-testid={`market-open-${selectedMarket.id}`}
                    >
                      <Link href={`/app/markets/${selectedMarket.id}`}>
                        {selectedMarket.status === 'open'
                          ? t('markets.openMarket')
                          : t('markets.viewMarket')}
                      </Link>
                    </Button>
                    <Button asChild variant="arcadeOutline">
                      <Link href="/app/markets/portfolio">{t('markets.openPortfolio')}</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
