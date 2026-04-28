'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PredictionMarketSummary } from '@reward/shared-types/prediction-market';

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
  resolveMarketStatusClasses,
} from '../lib/format';

const countPositions = (market: PredictionMarketSummary) =>
  market.outcomePools.reduce((sum, pool) => sum + pool.positionCount, 0);

export function PredictionMarketsPage() {
  const locale = useLocale();
  const t = useTranslations();
  const [markets, setMarkets] = useState<PredictionMarketSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMarkets = async () => {
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
  };

  useEffect(() => {
    void refreshMarkets();
  }, [locale]);

  return (
    <section className="space-y-6" data-testid="markets-list-page">
      <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-3xl">{t('markets.title')}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 text-slate-300">
              {t('markets.description')}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              type="button"
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              <Link href="/app/markets/portfolio">{t('markets.openPortfolio')}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshMarkets()}
              disabled={loading}
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              {loading ? t('common.loading') : t('markets.refreshList')}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-rose-300/30 bg-rose-400/12 text-rose-50">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6" data-testid="markets-list-error" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" onClick={() => void refreshMarkets()}>
              {t('markets.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!markets && loading ? (
        <Card className="border-white/10 bg-white/[0.04] text-slate-100">
          <CardContent className="pt-6 text-sm text-slate-300">
            {t('markets.loadingList')}
          </CardContent>
        </Card>
      ) : null}

      {markets && markets.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-slate-100">
          <CardHeader>
            <CardTitle>{t('markets.emptyTitle')}</CardTitle>
            <CardDescription className="text-slate-300">
              {t('markets.emptyDescription')}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {markets && markets.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {markets.map((market) => {
            const positionCount = countPositions(market);

            return (
              <Card
                key={market.id}
                className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.22)]"
                data-testid={`market-summary-${market.id}`}
              >
                <CardHeader className="gap-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]',
                            resolveMarketStatusClasses(market.status),
                          )}
                        >
                          {formatMarketStatus(market.status, t)}
                        </Badge>
                        <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                          {market.roundKey}
                        </span>
                      </div>
                      <CardTitle className="text-2xl">{market.title}</CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        {market.description?.trim() || t('markets.noDescription')}
                      </CardDescription>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-right">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        {t('markets.totalPool')}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {formatMarketAmount(locale, market.totalPoolAmount)}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {t('markets.locksAt')}
                      </dt>
                      <dd className="mt-2 text-sm text-slate-100">
                        {formatMarketDateTime(
                          locale,
                          market.locksAt,
                          t('markets.unknownTime'),
                        )}
                      </dd>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {t('markets.positionCount')}
                      </dt>
                      <dd className="mt-2 text-sm text-slate-100">
                        {t('markets.positionCountValue', { count: positionCount })}
                      </dd>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {t('markets.outcomesLabel')}
                      </dt>
                      <dd className="mt-2 text-sm text-slate-100">
                        {market.outcomes.length}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
                      {t('markets.poolBreakdown')}
                    </h3>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {market.outcomePools.map((pool) => (
                        <div
                          key={pool.outcomeKey}
                          className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-white">{pool.label}</p>
                            <p className="text-sm text-slate-300">
                              {formatMarketAmount(locale, pool.totalStakeAmount)}
                            </p>
                          </div>
                          <p className="mt-2 text-sm text-slate-400">
                            {t('markets.positionCountValue', {
                              count: pool.positionCount,
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    asChild
                    className="rounded-full"
                    data-testid={`market-open-${market.id}`}
                  >
                    <Link href={`/app/markets/${market.id}`}>
                      {market.status === 'open'
                        ? t('markets.openMarket')
                        : t('markets.viewMarket')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
