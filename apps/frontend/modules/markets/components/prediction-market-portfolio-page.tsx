"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  PredictionMarketHistoryResponse,
  PredictionMarketPortfolioFilter,
  PredictionMarketPortfolioItem,
  PredictionMarketPortfolioStatus,
  PredictionMarketStatus,
  PredictionPosition,
  PredictionPositionStatus,
} from "@reward/shared-types/prediction-market";

import { useLocale, useTranslations } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import {
  formatMarketAmount,
  formatMarketDateTime,
  formatMarketStatus,
  formatPortfolioFilter,
  formatPortfolioStatus,
  formatPositionStatus,
} from "../lib/format";

const PAGE_SIZE = 10;
const PORTFOLIO_FILTERS: readonly PredictionMarketPortfolioFilter[] = [
  "all",
  "open",
  "resolved",
  "refunded",
];

const getOutcomeLabel = (
  item: PredictionMarketPortfolioItem,
  outcomeKey: string,
) =>
  item.market.outcomes.find((outcome) => outcome.key === outcomeKey)?.label ??
  outcomeKey;

const parseMarketNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTimestamp = (value: string | Date | null | undefined) => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const resolvePortfolioTone = (
  status: PredictionMarketPortfolioStatus,
): "success" | "info" | "neutral" => {
  switch (status) {
    case "open":
      return "success";
    case "resolved":
      return "info";
    default:
      return "neutral";
  }
};

const resolveMarketTone = (
  status: PredictionMarketStatus,
): "success" | "warning" | "info" | "danger" | "neutral" => {
  switch (status) {
    case "open":
      return "success";
    case "locked":
      return "warning";
    case "resolved":
      return "info";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
};

const resolvePositionTone = (
  status: PredictionPositionStatus,
): "warning" | "success" | "danger" | "neutral" | "info" => {
  switch (status) {
    case "sold":
      return "warning";
    case "won":
      return "success";
    case "lost":
      return "danger";
    case "refunded":
      return "neutral";
    default:
      return "info";
  }
};

const renderPositionTimestamp = (
  locale: ReturnType<typeof useLocale>,
  t: (key: string) => string,
  position: PredictionPosition,
) => {
  if (position.status === "sold" && position.settledAt) {
    return `${t("markets.positionSoldAt")}: ${formatMarketDateTime(
      locale,
      position.settledAt,
      t("markets.unknownTime"),
    )}`;
  }

  if (position.settledAt) {
    return `${t("markets.positionSettledAt")}: ${formatMarketDateTime(
      locale,
      position.settledAt,
      t("markets.unknownTime"),
    )}`;
  }

  return `${t("markets.positionCreatedAt")}: ${formatMarketDateTime(
    locale,
    position.createdAt,
    t("markets.unknownTime"),
  )}`;
};

const countPortfolioStatus = (
  items: PredictionMarketPortfolioItem[],
  status: PredictionMarketPortfolioStatus,
) => items.filter((item) => item.portfolioStatus === status).length;

export function PredictionMarketPortfolioPage() {
  const locale = useLocale();
  const t = useTranslations();
  const [status, setStatus] = useState<PredictionMarketPortfolioFilter>("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [history, setHistory] =
    useState<PredictionMarketHistoryResponse | null>(null);
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
          setError(response.error?.message ?? t("markets.portfolioLoadFailed"));
          setLoading(false);
          return;
        }

        setHistory(response.data);
      } catch {
        if (!cancelled) {
          setError(t("markets.portfolioLoadFailed"));
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
  }, [page, refreshKey, status]);

  const handleFilterChange = (nextStatus: PredictionMarketPortfolioFilter) => {
    if (nextStatus === status) {
      return;
    }

    setPage(1);
    setStatus(nextStatus);
  };

  const items = history?.items ?? [];
  const hasItems = items.length > 0;
  const recentItems = [...items]
    .sort((left, right) => toTimestamp(right.lastActivityAt) - toTimestamp(left.lastActivityAt))
    .slice(0, 3);
  const openItemCount = countPortfolioStatus(items, "open");
  const resolvedItemCount = countPortfolioStatus(items, "resolved");
  const refundedItemCount = countPortfolioStatus(items, "refunded");

  return (
    <section className="space-y-6" data-testid="markets-portfolio-page">
      <GameSurfaceCard className="overflow-hidden" tone="light">
        <CardContent className="retro-ivory-surface relative p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
            <div className="space-y-5">
              <div className="space-y-4">
                <span className="retro-kicker">{t("markets.openPortfolio")}</span>
                <div className="space-y-3">
                  <h1 className="text-[2.7rem] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--retro-ink)] md:text-[3.8rem]">
                    {t("markets.portfolioTitle")}
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.7)]">
                    {t("markets.portfolioDescription")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <GamePill surface="light" tone="accent">
                  {t("markets.openExposure")}
                </GamePill>
                <GamePill surface="light" tone="info">
                  {t("markets.settledPayout")}
                </GamePill>
                <GamePill surface="light" tone="neutral">
                  {t("markets.refundedAmount")}
                </GamePill>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild variant="arcadeDark">
                  <Link href="/app/markets">{t("markets.browseMarkets")}</Link>
                </Button>
                <Button
                  type="button"
                  variant="arcadeOutline"
                  disabled={loading}
                  onClick={() => setRefreshKey((value) => value + 1)}
                >
                  {loading ? t("common.loading") : t("markets.refreshPortfolio")}
                </Button>
              </div>

              <div className="flex flex-wrap gap-3">
                {PORTFOLIO_FILTERS.map((filter) => {
                  const active = filter === status;

                  return (
                    <Button
                      key={filter}
                      type="button"
                      variant={active ? "arcade" : "arcadeOutline"}
                      onClick={() => handleFilterChange(filter)}
                      data-testid={`markets-portfolio-filter-${filter}`}
                      className={cn(!active && "bg-white/86")}
                    >
                      {formatPortfolioFilter(filter, t)}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {history ? (
                <>
                  <GameMetricTile
                    tone="light"
                    label={t("markets.portfolioMarketCount")}
                    value={history.summary.marketCount}
                    valueClassName="text-3xl font-black tracking-[-0.04em] text-[var(--retro-ink)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={t("markets.portfolioPositionCount")}
                    value={history.summary.positionCount}
                    valueClassName="text-3xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={t("markets.openExposure")}
                    value={formatMarketAmount(locale, history.summary.openStakeAmount)}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={t("markets.settledPayout")}
                    value={formatMarketAmount(
                      locale,
                      history.summary.settledPayoutAmount,
                    )}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-green)]"
                  />
                </>
              ) : (
                <GameSectionBlock
                  className="sm:col-span-2"
                  tone="light"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                    {t("markets.portfolioExposureTitle")}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[rgba(15,17,31,0.72)]">
                    {loading
                      ? t("markets.loadingPortfolio")
                      : t("markets.portfolioExposureDescription")}
                  </p>
                </GameSectionBlock>
              )}

              <GameSectionBlock className="sm:col-span-2" tone="light">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                  {t("markets.portfolioExposureTitle")}
                </p>
                <p className="mt-3 text-sm leading-6 text-[rgba(15,17,31,0.72)]">
                  {t("markets.portfolioExposureDescription")}
                </p>
              </GameSectionBlock>
            </div>
          </div>
        </CardContent>
      </GameSurfaceCard>

      {error ? (
        <GameStatusNotice
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          surface="light"
          tone="danger"
        >
          <p data-testid="markets-portfolio-error" role="alert">
            {error}
          </p>
          <Button
            type="button"
            variant="arcadeOutline"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            {t("markets.retry")}
          </Button>
        </GameStatusNotice>
      ) : null}

      {!history && loading ? (
        <GameSurfaceCard tone="light">
          <CardContent className="p-6 text-sm text-[rgba(15,17,31,0.68)]">
            {t("markets.loadingPortfolio")}
          </CardContent>
        </GameSurfaceCard>
      ) : null}

      {history && !hasItems ? (
        <GameSurfaceCard tone="light">
          <CardHeader>
            <CardTitle className="text-[var(--retro-ink)]">
              {t("markets.portfolioEmptyTitle")}
            </CardTitle>
            <CardDescription className="text-[rgba(15,17,31,0.68)]">
              {status === "all"
                ? t("markets.portfolioEmptyDescription")
                : t("markets.portfolioEmptyFilteredDescription")}
            </CardDescription>
          </CardHeader>
        </GameSurfaceCard>
      ) : null}

      {hasItems ? (
        <div className="grid gap-6 xl:grid-cols-[1.04fr,0.96fr]">
          <div className="space-y-5">
            {items.map((item) => (
              <GameSurfaceCard
                key={item.market.id}
                className="overflow-hidden"
                tone="light"
              >
                <CardContent
                  className="retro-ivory-surface relative p-5 md:p-6"
                  data-testid={`markets-portfolio-item-${item.market.id}`}
                >
                  <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
                  <div className="relative space-y-5">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <GamePill
                            surface="light"
                            tone={resolvePortfolioTone(item.portfolioStatus)}
                          >
                            {formatPortfolioStatus(item.portfolioStatus, t)}
                          </GamePill>
                          <GamePill
                            surface="light"
                            tone={resolveMarketTone(item.market.status)}
                          >
                            {formatMarketStatus(item.market.status, t)}
                          </GamePill>
                          <span className="rounded-full border border-[rgba(15,17,31,0.14)] bg-white/84 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.58)]">
                            {item.market.roundKey}
                          </span>
                          {item.market.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-[rgba(15,17,31,0.12)] bg-[rgba(97,88,255,0.08)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--retro-violet)]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <CardTitle className="text-[1.9rem] leading-tight tracking-[-0.04em] text-[var(--retro-ink)]">
                            {item.market.title}
                          </CardTitle>
                          <p className="max-w-3xl text-sm leading-6 text-[rgba(15,17,31,0.7)]">
                            {item.market.description?.trim() ||
                              t("markets.noDescription")}
                          </p>
                        </div>
                      </div>

                      <GameSectionBlock
                        className="xl:min-w-[17rem]"
                        tone="light"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                          {t("markets.lastActivity")}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[var(--retro-ink)]">
                          {formatMarketDateTime(
                            locale,
                            item.lastActivityAt,
                            t("markets.unknownTime"),
                          )}
                        </p>

                        <div className="mt-4 space-y-2 text-sm text-[rgba(15,17,31,0.68)]">
                          <p>
                            {t("markets.locksAt")}:{" "}
                            {formatMarketDateTime(
                              locale,
                              item.market.locksAt,
                              t("markets.unknownTime"),
                            )}
                          </p>
                          <p>
                            {t("markets.resolvesAt")}:{" "}
                            {formatMarketDateTime(
                              locale,
                              item.market.resolvesAt,
                              t("markets.unknownTime"),
                            )}
                          </p>
                        </div>

                        <Button asChild className="mt-4 w-full" variant="arcadeDark">
                          <Link href={`/app/markets/${item.market.id}`}>
                            {t("markets.viewMarket")}
                          </Link>
                        </Button>
                      </GameSectionBlock>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <GameMetricTile
                        tone="light"
                        label={t("markets.totalStake")}
                        value={formatMarketAmount(locale, item.totalStakeAmount)}
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-ink)]"
                      />
                      <GameMetricTile
                        tone="light"
                        label={t("markets.openExposure")}
                        value={formatMarketAmount(locale, item.openStakeAmount)}
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-orange)]"
                      />
                      <GameMetricTile
                        tone="light"
                        label={t("markets.settledPayout")}
                        value={formatMarketAmount(
                          locale,
                          item.settledPayoutAmount,
                        )}
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-violet)]"
                      />
                      <GameMetricTile
                        tone="light"
                        label={t("markets.refundedAmount")}
                        value={formatMarketAmount(locale, item.refundedAmount)}
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-green)]"
                      />
                    </div>

                    <GameSectionBlock className="space-y-4" tone="light">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-black uppercase tracking-[0.16em] text-[var(--retro-ink)]">
                            {t("markets.yourPositions")}
                          </h3>
                          <p className="mt-1 text-sm text-[rgba(15,17,31,0.6)]">
                            {t("markets.positionCountValue", {
                              count: item.positionCount,
                            })}
                          </p>
                        </div>
                        <GamePill
                          surface="light"
                          tone={resolvePortfolioTone(item.portfolioStatus)}
                        >
                          {formatPortfolioStatus(item.portfolioStatus, t)}
                        </GamePill>
                      </div>

                      <div className="grid gap-3">
                        {item.positions.map((position) => (
                          <div
                            key={position.id}
                            className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/84 p-4 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-semibold text-[var(--retro-ink)]">
                                    {getOutcomeLabel(item, position.outcomeKey)}
                                  </p>
                                  <GamePill
                                    surface="light"
                                    tone={resolvePositionTone(position.status)}
                                  >
                                    {formatPositionStatus(position.status, t)}
                                  </GamePill>
                                </div>
                                <p className="text-sm text-[rgba(15,17,31,0.58)]">
                                  {renderPositionTimestamp(locale, t, position)}
                                </p>
                              </div>

                              <dl className="grid gap-3 sm:grid-cols-2 lg:min-w-[16rem]">
                                <div>
                                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.48)]">
                                    {t("markets.stakeAmountLabel")}
                                  </dt>
                                  <dd className="mt-1 text-sm font-semibold text-[var(--retro-ink)]">
                                    {formatMarketAmount(
                                      locale,
                                      position.stakeAmount,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.48)]">
                                    {t("markets.payoutAmount")}
                                  </dt>
                                  <dd className="mt-1 text-sm font-semibold text-[var(--retro-ink)]">
                                    {formatMarketAmount(
                                      locale,
                                      position.payoutAmount,
                                    )}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </div>
                        ))}
                      </div>
                    </GameSectionBlock>
                  </div>
                </CardContent>
              </GameSurfaceCard>
            ))}

            <GameSectionBlock
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              tone="light"
            >
              <p className="text-sm text-[rgba(15,17,31,0.62)]">
                {t("markets.portfolioPageValue", { page })}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="arcadeOutline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  {t("markets.previousPage")}
                </Button>
                <Button
                  type="button"
                  variant="arcadeOutline"
                  disabled={!history?.hasNext || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t("markets.nextPage")}
                </Button>
              </div>
            </GameSectionBlock>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
            <GameSurfaceCard tone="dark">
              <CardContent className="space-y-5 p-5 md:p-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {t("markets.portfolioExposureTitle")}
                  </p>
                  <div className="space-y-2">
                    <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-slate-50">
                      {t("markets.portfolioTitle")}
                    </h2>
                    <p className="text-sm leading-6 text-slate-300">
                      {t("markets.portfolioExposureDescription")}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <GameMetricTile
                    label={t("markets.portfolioStatus.open")}
                    tone="dark"
                    value={openItemCount}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-gold)]"
                  />
                  <GameMetricTile
                    label={t("markets.portfolioStatus.resolved")}
                    tone="dark"
                    value={resolvedItemCount}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-cyan-100"
                  />
                  <GameMetricTile
                    label={t("markets.portfolioStatus.refunded")}
                    tone="dark"
                    value={refundedItemCount}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-slate-50"
                  />
                  <GameMetricTile
                    label={t("markets.totalStake")}
                    tone="dark"
                    value={formatMarketAmount(
                      locale,
                      history?.summary.totalStakeAmount,
                    )}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-emerald-100"
                  />
                </div>
              </CardContent>
            </GameSurfaceCard>

            <GameSurfaceCard tone="light">
              <CardContent className="space-y-4 p-5 md:p-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                    {t("markets.lastActivity")}
                  </p>
                  <h3 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                    {t("markets.portfolioExposureTitle")}
                  </h3>
                  <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                    {t("markets.portfolioDescription")}
                  </p>
                </div>

                <div className="space-y-3">
                  {recentItems.map((item) => (
                    <div
                      key={item.market.id}
                      className="rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-4 py-4 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-[var(--retro-ink)]">
                            {item.market.title}
                          </p>
                          <p className="text-xs text-[rgba(15,17,31,0.54)]">
                            {formatMarketDateTime(
                              locale,
                              item.lastActivityAt,
                              t("markets.unknownTime"),
                            )}
                          </p>
                        </div>
                        <GamePill
                          className="shrink-0"
                          surface="light"
                          tone={resolvePortfolioTone(item.portfolioStatus)}
                        >
                          {formatPortfolioStatus(item.portfolioStatus, t)}
                        </GamePill>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,17,31,0.5)]">
                        <span>
                          {t("markets.positionCountValue", {
                            count: item.positionCount,
                          })}
                        </span>
                        <span>·</span>
                        <span>
                          {t("markets.openExposure")}:{" "}
                          {formatMarketAmount(locale, item.openStakeAmount)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {recentItems.length === 0 ? (
                    <GameStatusNotice surface="light" tone="neutral">
                      {t("markets.portfolioEmptyDescription")}
                    </GameStatusNotice>
                  ) : null}
                </div>
              </CardContent>
            </GameSurfaceCard>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
