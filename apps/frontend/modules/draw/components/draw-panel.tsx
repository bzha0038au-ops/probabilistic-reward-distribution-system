"use client";

import { startTransition, useEffect, useState } from "react";
import type {
  DrawCatalogResponse,
  DrawOverviewResponse,
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawPrizeRarity,
  DrawResult,
} from "@reward/shared-types/draw";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-provider";
import { useLocale, useTranslations } from "@/components/i18n-provider";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";

type DrawPanelProps = {
  disabled?: boolean;
  disabledReason?: string | null;
  onBalanceChange?: (balance: string) => void;
  onDrawComplete?: () => void;
};

const rarityToneMap: Record<
  DrawPrizeRarity,
  {
    card: string;
    badge: string;
    accent: string;
  }
> = {
  common: {
    card: "border-white/10 bg-white/[0.04]",
    badge: "border-slate-400/25 bg-slate-400/10 text-slate-100",
    accent: "text-slate-100",
  },
  rare: {
    card: "border-cyan-300/20 bg-cyan-300/10",
    badge: "border-cyan-300/30 bg-cyan-300/15 text-cyan-50",
    accent: "text-cyan-50",
  },
  epic: {
    card: "border-rose-300/20 bg-rose-300/10",
    badge: "border-rose-300/30 bg-rose-300/15 text-rose-50",
    accent: "text-rose-50",
  },
  legendary: {
    card: "border-amber-300/25 bg-amber-300/12",
    badge: "border-amber-300/35 bg-amber-300/18 text-amber-50",
    accent: "text-amber-50",
  },
};

const formatAmount = (
  locale: string,
  value: string | number | null | undefined,
) => {
  if (value === null || value === undefined || value === "") {
    return "0.00";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
};

const formatRevealTime = (
  locale: string,
  fairness: DrawCatalogResponse["fairness"] | null | undefined,
) => {
  if (!fairness) {
    return "--";
  }

  const revealAt = new Date(
    (fairness.epoch + 1) * fairness.epochSeconds * 1000,
  );

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(revealAt);
};

const truncateHash = (
  value: string | null | undefined,
  head = 10,
  tail = 8,
) => {
  if (!value) {
    return "--";
  }
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const getHighlightPrize = (
  results: DrawPlayResponse["results"],
): DrawPrizePresentation | null => {
  const ordered: DrawPrizeRarity[] = ["legendary", "epic", "rare", "common"];
  for (const rarity of ordered) {
    const match = results.find(
      (result) => result.prize?.displayRarity === rarity,
    );
    if (match?.prize) {
      return match.prize;
    }
  }

  return results.find((result) => result.prize)?.prize ?? null;
};

const getFeaturedPrizes = (catalog: DrawCatalogResponse | null) => {
  if (!catalog) {
    return [] as DrawPrizePresentation[];
  }
  if (catalog.featuredPrizes.length > 0) {
    return catalog.featuredPrizes;
  }
  return catalog.prizes.slice(0, 4);
};

const calculateFallbackEndingBalance = (
  currentBalance: string | undefined,
  drawCost: string,
  rewardAmount: string,
) => {
  const nextValue =
    Number(currentBalance ?? "0") - Number(drawCost) + Number(rewardAmount);

  if (!Number.isFinite(nextValue)) {
    return currentBalance ?? "0.00";
  }

  return nextValue.toFixed(2);
};

const buildSingleDrawSummary = (
  result: DrawResult,
  overview: DrawOverviewResponse | null,
  currentCatalog: DrawCatalogResponse,
): DrawPlayResponse => ({
  requestedCount: 1,
  count: 1,
  totalCost: result.drawCost,
  totalReward: result.rewardAmount,
  winCount: result.status === "won" ? 1 : 0,
  endingBalance:
    overview?.balance ??
    calculateFallbackEndingBalance(
      currentCatalog.balance,
      result.drawCost,
      result.rewardAmount,
  ),
  highestRarity: result.prize?.displayRarity ?? null,
  pity: overview?.pity ?? currentCatalog.pity,
  playMode: overview?.playMode ?? currentCatalog.playMode,
  results: [result],
});

export function DrawPanel({
  disabled = false,
  disabledReason = null,
  onBalanceChange,
  onDrawComplete,
}: DrawPanelProps) {
  const locale = useLocale();
  const t = useTranslations();
  const { showToast } = useToast();
  const [drawCatalog, setDrawCatalog] = useState<DrawCatalogResponse | null>(
    null,
  );
  const [lastDrawPlay, setLastDrawPlay] = useState<DrawPlayResponse | null>(
    null,
  );
  const [loadingDrawCatalog, setLoadingDrawCatalog] = useState(false);
  const [playingDrawCount, setPlayingDrawCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const featuredPrizes = getFeaturedPrizes(drawCatalog);
  const highlightPrize = lastDrawPlay
    ? getHighlightPrize(lastDrawPlay.results)
    : (featuredPrizes[0] ?? null);
  const multiDrawCount = drawCatalog?.recommendedBatchCount ?? 1;
  const drawDisabled = disabled || !drawCatalog?.drawEnabled;
  const pityProgress =
    drawCatalog?.pity && drawCatalog.pity.threshold > 0
      ? Math.min(
          drawCatalog.pity.currentStreak / drawCatalog.pity.threshold,
          1,
        ) * 100
      : 0;

  const applyCatalog = (nextCatalog: DrawCatalogResponse) => {
    setDrawCatalog(nextCatalog);
    setCatalogError(null);
    onBalanceChange?.(nextCatalog.balance);
  };

  const fetchDrawOverview = async () => browserUserApiClient.getDrawOverview();

  const refreshDrawCatalog = async () => {
    setLoadingDrawCatalog(true);
    const response = await fetchDrawOverview();

    if (!response.ok) {
      setLoadingDrawCatalog(false);
      const message = response.error?.message ?? t("draw.catalogLoadFailed");
      setCatalogError(message);
      showToast({
        tone: "error",
        description: message,
        durationMs: 5200,
      });
      return null;
    }

    applyCatalog(response.data);
    setLoadingDrawCatalog(false);
    return response.data;
  };

  useEffect(() => {
    void refreshDrawCatalog();
  }, [locale]);

  const handlePlayDraw = async (count: number) => {
    if (!drawCatalog || drawDisabled) {
      return;
    }

    setError(null);
    setCatalogError(null);
    setPlayingDrawCount(count);

    if (count === 1) {
      const response = await browserUserApiClient.runDraw();

      if (!response.ok) {
        setPlayingDrawCount(null);
        const message = response.error?.message ?? t("draw.errorFallback");
        setError(message);
        showToast({
          tone: "error",
          description: message,
          durationMs: 5200,
        });
        return;
      }

      const nextDrawPlay = buildSingleDrawSummary(
        response.data,
        await refreshDrawCatalog(),
        drawCatalog,
      );

      startTransition(() => {
        setLastDrawPlay(nextDrawPlay);
        setDrawCatalog((current) =>
          current
            ? {
                ...current,
                balance: nextDrawPlay.endingBalance,
                pity: nextDrawPlay.pity,
              }
            : current,
        );
      });

      onBalanceChange?.(nextDrawPlay.endingBalance);
      onDrawComplete?.();
      setPlayingDrawCount(null);

      showToast({
        tone: "success",
        title: t("draw.latestSingleResult"),
        description: t("draw.summaryReward", {
          amount: formatAmount(locale, nextDrawPlay.totalReward),
        }),
      });
      return;
    }

    const response = await browserUserApiClient.playDraw({ count });

    if (!response.ok) {
      setPlayingDrawCount(null);
      const message = response.error?.message ?? t("draw.errorFallback");
      setError(message);
      showToast({
        tone: "error",
        description: message,
        durationMs: 5200,
      });
      return;
    }

    const nextDrawPlay = response.data;

    startTransition(() => {
      setLastDrawPlay(nextDrawPlay);
      setDrawCatalog((current) =>
        current
          ? {
              ...current,
              balance: nextDrawPlay.endingBalance,
              pity: nextDrawPlay.pity,
            }
          : current,
      );
    });

    onBalanceChange?.(nextDrawPlay.endingBalance);
    onDrawComplete?.();
    setPlayingDrawCount(null);

    showToast({
      tone: "success",
      title: t("draw.latestBatchResult", { count }),
      description: t("draw.summaryReward", {
        amount: formatAmount(locale, nextDrawPlay.totalReward),
      }),
    });
    await refreshDrawCatalog();
  };

  return (
    <Card className="overflow-hidden border-white/10 bg-[#050816] text-slate-100 shadow-[0_30px_120px_rgba(15,23,42,0.65)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.15),rgba(2,6,23,0.92))]" />

      <CardHeader className="relative z-10 border-b border-white/8 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full border-amber-300/30 bg-amber-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-50"
              >
                {t("draw.modeLabel")}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-cyan-300/30 bg-cyan-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-cyan-50"
              >
                {t("draw.fairnessLive")}
              </Badge>
            </div>
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-white">
                {t("draw.title")}
              </CardTitle>
              <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {t("draw.subtitle")}
              </CardDescription>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-200/15 bg-amber-200/10 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-100/70">
                {t("draw.currentBalance")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatAmount(locale, drawCatalog?.balance ?? "0")}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">
                {t("draw.spinCostLabel")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatAmount(locale, drawCatalog?.drawCost ?? "0")}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 grid gap-6 p-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(2,6,23,0.98))] p-5 shadow-[0_30px_80px_rgba(2,6,23,0.7)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  {t("draw.payoutTableTitle")}
                </p>
                <h3 className="text-2xl font-semibold text-white">
                  {highlightPrize?.name ?? t("draw.noPrizes")}
                </h3>
                <p className="max-w-xl text-sm leading-6 text-slate-300">
                  {t("draw.payoutTableSubtitle")}
                </p>
              </div>

              {highlightPrize ? (
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3",
                    rarityToneMap[highlightPrize.displayRarity].card,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                        rarityToneMap[highlightPrize.displayRarity].badge,
                      )}
                    >
                      {t(`draw.rarities.${highlightPrize.displayRarity}`)}
                    </Badge>
                    <span className="text-xs text-slate-300">
                      {t(`draw.stockStates.${highlightPrize.stockState}`)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-3 text-2xl font-semibold",
                      rarityToneMap[highlightPrize.displayRarity].accent,
                    )}
                  >
                    {formatAmount(locale, highlightPrize.rewardAmount)}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-400">
                    {t("draw.rewardValue")}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {featuredPrizes.length > 0 ? (
                featuredPrizes.map((prize) => (
                  <div
                    key={prize.id}
                    className={cn(
                      "rounded-[1.6rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                      rarityToneMap[prize.displayRarity].card,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                          rarityToneMap[prize.displayRarity].badge,
                        )}
                      >
                        {t(`draw.rarities.${prize.displayRarity}`)}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                        {t(`draw.stockStates.${prize.stockState}`)}
                      </span>
                    </div>
                    <p className="mt-5 text-lg font-semibold text-white">
                      {prize.name}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-amber-100">
                      {formatAmount(locale, prize.rewardAmount)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">
                      {t("draw.rewardValue")}
                    </p>
                    <p className="mt-4 text-sm text-slate-300">
                      Stock {prize.stock}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 sm:col-span-2 xl:col-span-4">
                  {t("draw.noPrizes")}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[1.85rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.pityTitle")}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {drawCatalog?.pity.enabled
                    ? drawCatalog.pity.active
                      ? t("draw.pityActive", {
                          boost: drawCatalog.pity.maxBoostPct,
                        })
                      : t("draw.pityProgress", {
                          streak: drawCatalog.pity.currentStreak,
                          threshold: drawCatalog.pity.threshold,
                        })
                    : t("draw.pityDisabled")}
                </p>
              </div>
              {drawCatalog?.pity ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-cyan-300/25 bg-cyan-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-50"
                >
                  {drawCatalog.pity.enabled &&
                  drawCatalog.pity.drawsUntilBoost !== null
                    ? t("draw.pityRemaining", {
                        count: drawCatalog.pity.drawsUntilBoost,
                      })
                    : t("draw.pityOff")}
                </Badge>
              ) : null}
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-900/80">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#f59e0b,#ef4444)] transition-all duration-500"
                style={{ width: `${pityProgress}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {drawCatalog?.pity.enabled
                ? t("draw.pityDescription")
                : t("draw.pityDisabledDescription")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              onClick={() => void handlePlayDraw(1)}
              disabled={
                loadingDrawCatalog || playingDrawCount !== null || drawDisabled
              }
              className="h-14 rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ef4444)] text-sm font-semibold uppercase tracking-[0.24em] text-slate-950 shadow-[0_18px_45px_rgba(245,158,11,0.28)] hover:opacity-95"
            >
              {playingDrawCount === 1
                ? t("draw.drawing")
                : t("draw.spinButton", {
                    amount: formatAmount(locale, drawCatalog?.drawCost ?? "0"),
                  })}
            </Button>
            <Button
              onClick={() => void handlePlayDraw(multiDrawCount)}
              disabled={
                loadingDrawCatalog ||
                playingDrawCount !== null ||
                drawDisabled ||
                multiDrawCount <= 1
              }
              variant="outline"
              className="h-14 rounded-2xl border-white/10 bg-white/[0.04] text-sm font-semibold uppercase tracking-[0.24em] text-white hover:bg-white/[0.08]"
            >
              {playingDrawCount === multiDrawCount
                ? t("draw.drawing")
                : t("draw.multiDraw", { count: multiDrawCount })}
            </Button>
            <Button
              onClick={() => void refreshDrawCatalog()}
              disabled={loadingDrawCatalog || playingDrawCount !== null}
              variant="ghost"
              className="h-14 rounded-2xl text-sm font-semibold uppercase tracking-[0.24em] text-slate-200 hover:bg-white/[0.06] hover:text-white"
            >
              {t("draw.refreshPool")}
            </Button>
          </div>

          {disabledReason ? (
            <p className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
              {disabledReason}
            </p>
          ) : null}

          {!drawCatalog?.drawEnabled && drawCatalog ? (
            <p className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
              {t("draw.disabledBySystem")}
            </p>
          ) : null}

          {drawCatalog && drawCatalog.maxBatchCount <= 1 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {t("draw.multiLocked", { max: drawCatalog.maxBatchCount })}
            </p>
          ) : null}

          {catalogError ? (
            <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">
              {catalogError}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">
              {error}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.85rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.recentResultsTitle")}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {t("draw.recentResultsSubtitle")}
                </p>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-100"
              >
                {t("draw.sessionLiveLabel")}
              </Badge>
            </div>

            {lastDrawPlay ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-emerald-300/14 text-emerald-50">
                    {t("draw.summaryWins", { count: lastDrawPlay.winCount })}
                  </Badge>
                  <Badge className="bg-cyan-300/14 text-cyan-50">
                    {t("draw.summaryReward", {
                      amount: formatAmount(locale, lastDrawPlay.totalReward),
                    })}
                  </Badge>
                  <Badge className="bg-white/10 text-slate-50">
                    {t("draw.summaryBalance", {
                      amount: formatAmount(locale, lastDrawPlay.endingBalance),
                    })}
                  </Badge>
                </div>

                {highlightPrize ? (
                  <div
                    className={cn(
                      "rounded-[1.6rem] border p-4",
                      rarityToneMap[highlightPrize.displayRarity].card,
                    )}
                  >
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                      {t("draw.highlightTitle")}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {highlightPrize.name}
                    </p>
                    <p className="mt-2 text-sm text-slate-200">
                      {t(`draw.rarities.${highlightPrize.displayRarity}`)} ·{" "}
                      {t("draw.rewardValue")}{" "}
                      {formatAmount(locale, highlightPrize.rewardAmount)}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-3">
                  {lastDrawPlay.results.map((result) => {
                    const rarity = result.prize?.displayRarity ?? "common";
                    return (
                      <div
                        key={result.id}
                        className={cn(
                          "rounded-[1.4rem] border p-4",
                          rarityToneMap[rarity].card,
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                              {t(`draw.statuses.${result.status}`)}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-white">
                              {result.prize?.name ?? t("draw.missCardTitle")}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                              {t(`draw.statusDescriptions.${result.status}`)}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                                rarityToneMap[rarity].badge,
                              )}
                            >
                              {t(`draw.rarities.${rarity}`)}
                            </Badge>
                            <p className="mt-3 text-xl font-semibold text-amber-100">
                              {formatAmount(locale, result.rewardAmount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                {t("draw.noRecentResults")}
              </p>
            )}
          </div>

          <div className="rounded-[1.85rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.fairnessPanelTitle")}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {t("draw.fairnessPanelSubtitle")}
                </p>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-amber-300/25 bg-amber-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-50"
              >
                {t("draw.commitRevealLabel")}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-300">
                  {t("draw.commitLabel")}
                </span>
                <span className="font-mono text-sm text-slate-100">
                  {truncateHash(drawCatalog?.fairness.commitHash)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-300">
                  {t("draw.epochLabel")}
                </span>
                <span className="text-sm text-slate-100">
                  {drawCatalog?.fairness.epoch ?? "--"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-300">
                  {t("draw.revealLabel")}
                </span>
                <span className="text-sm text-slate-100">
                  {formatRevealTime(locale, drawCatalog?.fairness)}
                </span>
              </div>
              {lastDrawPlay?.results[0]?.fairness?.clientNonce ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">
                    {t("draw.clientNonceLabel")}
                  </span>
                  <span className="font-mono text-sm text-slate-100">
                    {truncateHash(
                      lastDrawPlay.results[0].fairness?.clientNonce,
                      8,
                      6,
                    )}
                  </span>
                </div>
              ) : null}
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-300">
              {t("draw.fairnessExplainer")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
