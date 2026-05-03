"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssetCode } from "@reward/shared-types/economy";
import type {
  PredictionMarketDetail,
  PredictionMarketPool,
  PredictionMarketStatus,
  PredictionPosition,
  PredictionPositionStatus,
} from "@reward/shared-types/prediction-market";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import { useLocale, useTranslations } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { browserUserApiClient } from "@/lib/api/user-client";
import { readWalletAssetAvailableBalance } from "@/lib/economy-wallet";
import { cn } from "@/lib/utils";
import { useCurrentUserSession } from "@/modules/app/components/current-session-provider";
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
  formatPositionStatus,
} from "../lib/format";

type PredictionMarketDetailPageProps = {
  marketId: number;
};

const STAKE_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const PREDICTION_MARKET_ASSET_CODE: AssetCode = "B_LUCK";

const getOutcomeLabel = (market: PredictionMarketDetail, outcomeKey: string) =>
  market.outcomes.find((outcome) => outcome.key === outcomeKey)?.label ??
  outcomeKey;

const getPredictionMarketAvailableBalance = (
  wallet: WalletBalanceResponse,
) => readWalletAssetAvailableBalance(wallet, PREDICTION_MARKET_ASSET_CODE);

const parseMarketNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computePoolShare = (
  pool: PredictionMarketPool | null | undefined,
  totalPoolAmount: string | number | null | undefined,
) => {
  if (!pool) {
    return 0;
  }

  const total = parseMarketNumber(totalPoolAmount);
  const amount = parseMarketNumber(pool.totalStakeAmount);

  if (total <= 0 || amount <= 0) {
    return 0;
  }

  return amount / total;
};

const formatSharePercent = (share: number) => `${(share * 100).toFixed(1)}%`;

const estimateTradePreview = (
  stakeAmount: string,
  pool: PredictionMarketPool | null,
  totalPoolAmount: string | null | undefined,
) => {
  const stake = parseMarketNumber(stakeAmount);
  const share = computePoolShare(pool, totalPoolAmount);
  const impliedPrice = Math.max(0.05, Math.min(0.95, share || 0.5));

  if (stake <= 0) {
    return {
      impliedPrice,
      estimatedShares: 0,
      potentialReturn: 0,
      share,
    };
  }

  return {
    impliedPrice,
    estimatedShares: stake / impliedPrice,
    potentialReturn: stake / impliedPrice,
    share,
  };
};

const validatePlacePosition = (
  t: (key: string) => string,
  payload: {
    outcomeKey: string;
    stakeAmount: string;
  },
) => {
  const normalizedOutcomeKey = payload.outcomeKey.trim();
  if (!normalizedOutcomeKey) {
    return {
      ok: false as const,
      message: t("markets.validationOutcomeRequired"),
    };
  }

  const normalizedStakeAmount = payload.stakeAmount.trim();
  if (!normalizedStakeAmount) {
    return {
      ok: false as const,
      message: t("markets.validationStakeRequired"),
    };
  }

  if (!STAKE_PATTERN.test(normalizedStakeAmount)) {
    return {
      ok: false as const,
      message: t("markets.validationStakeFormat"),
    };
  }

  if (Number(normalizedStakeAmount) <= 0) {
    return {
      ok: false as const,
      message: t("markets.validationStakePositive"),
    };
  }

  return {
    ok: true as const,
    data: {
      outcomeKey: normalizedOutcomeKey,
      stakeAmount: normalizedStakeAmount,
    },
  };
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

export function PredictionMarketDetailPage({
  marketId,
}: PredictionMarketDetailPageProps) {
  const locale = useLocale();
  const t = useTranslations();
  const { showToast } = useToast();
  const currentSession = useCurrentUserSession();
  const emailVerified = Boolean(currentSession.user.emailVerifiedAt);

  const [market, setMarket] = useState<PredictionMarketDetail | null>(null);
  const [availableBalance, setAvailableBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sellingPositionId, setSellingPositionId] = useState<number | null>(
    null,
  );
  const [outcomeKey, setOutcomeKey] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshWalletBalance = useCallback(async () => {
    try {
      const walletResponse = await browserUserApiClient.getWalletBalance();
      if (walletResponse.ok) {
        setAvailableBalance(
          getPredictionMarketAvailableBalance(walletResponse.data),
        );
      }
    } catch {
      // Keep current market state visible even if the balance refresh fails.
    }
  }, []);

  const refreshMarket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [marketResponse, walletResponse] = await Promise.all([
        browserUserApiClient.getPredictionMarket(marketId),
        browserUserApiClient.getWalletBalance(),
      ]);

      if (!marketResponse.ok) {
        setError(marketResponse.error?.message ?? t("markets.loadFailed"));
        setLoading(false);
        return;
      }

      setMarket(marketResponse.data);

      if (walletResponse.ok) {
        setAvailableBalance(
          getPredictionMarketAvailableBalance(walletResponse.data),
        );
      }
    } catch {
      setError(t("markets.loadFailed"));
    }

    setLoading(false);
  }, [marketId, t]);

  useEffect(() => {
    void refreshMarket();
  }, [marketId, refreshMarket]);

  useEffect(() => {
    if (!market) {
      return;
    }

    const hasSelectedOutcome = market.outcomes.some(
      (outcome) => outcome.key === outcomeKey,
    );

    if (!hasSelectedOutcome) {
      setOutcomeKey("");
    }
  }, [market, outcomeKey]);

  const disabledReason = useMemo(() => {
    if (!emailVerified) {
      return t("app.marketsLocked");
    }

    if (market && market.status !== "open") {
      return t("markets.marketLockedNotice");
    }

    return null;
  }, [emailVerified, market, t]);

  const selectedPool = useMemo(
    () =>
      market?.outcomePools.find((pool) => pool.outcomeKey === outcomeKey) ??
      market?.outcomePools[0] ??
      null,
    [market, outcomeKey],
  );

  const preview = useMemo(
    () =>
      estimateTradePreview(
        stakeAmount,
        selectedPool,
        market?.totalPoolAmount ?? null,
      ),
    [market?.totalPoolAmount, selectedPool, stakeAmount],
  );

  const openPositionCount = useMemo(
    () =>
      market?.userPositions.filter((position) => position.status === "open")
        .length ?? 0,
    [market],
  );

  const handleRefresh = () => {
    setNotice(null);
    setFormError(null);
    void refreshMarket();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!market) {
      return;
    }

    setFormError(null);
    setNotice(null);

    if (disabledReason) {
      setFormError(disabledReason);
      return;
    }

    const parsed = validatePlacePosition(t, {
      outcomeKey,
      stakeAmount,
    });

    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }

    if (
      availableBalance !== null &&
      Number(parsed.data.stakeAmount) > Number(availableBalance)
    ) {
      setFormError(t("markets.validationStakeBalance"));
      return;
    }

    setSubmitting(true);

    try {
      const response = await browserUserApiClient.placePredictionPosition(
        market.id,
        {
          outcomeKey: parsed.data.outcomeKey,
          stakeAmount: parsed.data.stakeAmount,
        },
      );

      if (!response.ok) {
        const message = response.error?.message ?? t("markets.placeFailed");
        setFormError(message);
        showToast({
          tone: "error",
          description: message,
        });
        setSubmitting(false);
        return;
      }

      setMarket(response.data.market);
      setStakeAmount("");
      setNotice(t("markets.positionPlaced"));
      showToast({
        tone: "success",
        description: t("markets.positionPlaced"),
      });
    } catch {
      const message = t("markets.placeFailed");
      setFormError(message);
      showToast({
        tone: "error",
        description: message,
      });
    }

    setSubmitting(false);
    await refreshWalletBalance();
  };

  const handleSellPosition = async (positionId: number) => {
    if (!market) {
      return;
    }

    setFormError(null);
    setNotice(null);

    if (disabledReason) {
      setFormError(disabledReason);
      return;
    }

    setSellingPositionId(positionId);

    try {
      const response = await browserUserApiClient.sellPredictionPosition(
        market.id,
        positionId,
      );

      if (!response.ok) {
        const message = response.error?.message ?? t("markets.sellFailed");
        setFormError(message);
        showToast({
          tone: "error",
          description: message,
        });
        setSellingPositionId(null);
        return;
      }

      setMarket(response.data.market);
      setNotice(t("markets.positionSold"));
      showToast({
        tone: "success",
        description: t("markets.positionSold"),
      });
    } catch {
      const message = t("markets.sellFailed");
      setFormError(message);
      showToast({
        tone: "error",
        description: message,
      });
    }

    setSellingPositionId(null);
    await refreshWalletBalance();
  };

  const pendingAction = submitting || sellingPositionId !== null;

  return (
    <section className="space-y-6" data-testid="market-detail-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Button asChild type="button" variant="arcadeOutline">
            <Link href="/app/markets">{t("markets.backToMarkets")}</Link>
          </Button>
          <Button asChild type="button" variant="arcadeOutline">
            <Link href="/app/markets/portfolio">
              {t("markets.openPortfolio")}
            </Link>
          </Button>
        </div>

        <Button
          type="button"
          variant="arcadeOutline"
          onClick={handleRefresh}
          disabled={loading}
          data-testid="market-refresh-button"
        >
          {loading ? t("common.loading") : t("markets.refreshDetail")}
        </Button>
      </div>

      {error ? (
        <GameStatusNotice
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          surface="light"
          tone="danger"
        >
          <p data-testid="market-detail-error" role="alert">
            {error}
          </p>
          <Button type="button" variant="arcadeOutline" onClick={handleRefresh}>
            {t("markets.retry")}
          </Button>
        </GameStatusNotice>
      ) : null}

      {!market && loading ? (
        <GameSurfaceCard tone="light">
          <CardContent className="p-6 text-sm text-[rgba(15,17,31,0.68)]">
            {t("markets.loadingDetail")}
          </CardContent>
        </GameSurfaceCard>
      ) : null}

      {market ? (
        <>
          <GameSurfaceCard className="overflow-hidden" tone="light">
            <CardContent className="retro-ivory-surface relative p-6 md:p-8">
              <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
              <div className="relative grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
                <div className="space-y-5">
                  <div className="space-y-4">
                    <span className="retro-kicker">{t("markets.title")}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <GamePill
                        surface="light"
                        tone={resolveMarketTone(market.status)}
                      >
                        {formatMarketStatus(market.status, t)}
                      </GamePill>
                      <span className="rounded-full border border-[rgba(15,17,31,0.14)] bg-white/84 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.58)]">
                        {market.roundKey}
                      </span>
                      {market.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[rgba(15,17,31,0.12)] bg-[rgba(97,88,255,0.08)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--retro-violet)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h1 className="text-[2.75rem] font-semibold leading-[0.94] tracking-[-0.05em] text-[var(--retro-ink)] md:text-[3.95rem]">
                      {market.title}
                    </h1>
                    <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.7)]">
                      {market.description?.trim() || t("markets.noDescription")}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <GamePill surface="light" tone="accent">
                      {t("markets.tradePreviewTitle")}
                    </GamePill>
                    <GamePill surface="light" tone="info">
                      {t("markets.poolBreakdown")}
                    </GamePill>
                    <GamePill surface="light" tone="neutral">
                      {t("markets.rulesLabel")}
                    </GamePill>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <GameMetricTile
                    tone="light"
                    label={t("markets.totalPool")}
                    value={formatMarketAmount(locale, market.totalPoolAmount)}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={t("markets.availableBalance")}
                    value={
                      <span data-testid="market-available-balance">
                        {formatMarketAmount(locale, availableBalance)}
                      </span>
                    }
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={t("markets.positionCount")}
                    value={t("markets.positionCountValue", {
                      count: market.userPositions.length,
                    })}
                    valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-ink)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={t("markets.summaryPositionCount")}
                    value={openPositionCount}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-green)]"
                  />
                  <GameSectionBlock className="sm:col-span-2" tone="light">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                          {t("markets.opensAt")}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[var(--retro-ink)]">
                          {formatMarketDateTime(
                            locale,
                            market.opensAt,
                            t("markets.unknownTime"),
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                          {t("markets.locksAt")}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[var(--retro-ink)]">
                          {formatMarketDateTime(
                            locale,
                            market.locksAt,
                            t("markets.unknownTime"),
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                          {t("markets.resolvesAt")}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[var(--retro-ink)]">
                          {formatMarketDateTime(
                            locale,
                            market.resolvesAt,
                            t("markets.unknownTime"),
                          )}
                        </p>
                      </div>
                    </div>
                  </GameSectionBlock>
                </div>
              </div>
            </CardContent>
          </GameSurfaceCard>

          <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
            <div className="space-y-6">
              <GameSurfaceCard tone="light">
                <CardContent className="space-y-5 p-5 md:p-6">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                      {t("markets.probabilityBoard")}
                    </p>
                    <h2 className="text-[1.9rem] font-semibold tracking-[-0.04em] text-[var(--retro-ink)]">
                      {t("markets.poolBreakdown")}
                    </h2>
                    <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                      {t("markets.poolDescription")}
                    </p>
                  </div>

                  <div className="retro-felt-surface rounded-[2.5rem] px-5 py-6 md:px-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      {market.outcomePools.map((pool) => {
                        const share = computePoolShare(
                          pool,
                          market.totalPoolAmount,
                        );
                        const selected = pool.outcomeKey === outcomeKey;

                        return (
                          <div
                            key={pool.outcomeKey}
                            className={cn(
                              "rounded-[1.6rem] border-2 p-4 transition",
                              selected
                                ? "border-[var(--retro-gold)] bg-[rgba(255,213,61,0.18)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.38)]"
                                : "border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.06)]",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-lg font-black uppercase tracking-[0.14em] text-white">
                                  {pool.label}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                                  {t("markets.positionCountValue", {
                                    count: pool.positionCount,
                                  })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-black tracking-[-0.04em] text-white">
                                  {formatSharePercent(share)}
                                </p>
                                <p className="mt-1 text-xs text-slate-200">
                                  {formatMarketAmount(
                                    locale,
                                    pool.totalStakeAmount,
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 h-4 rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(7,10,23,0.5)] p-1">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  selected
                                    ? "bg-[var(--retro-gold)]"
                                    : "bg-[var(--retro-violet-soft)]",
                                )}
                                style={{
                                  width: `${Math.max(10, Math.min(100, share * 100))}%`,
                                }}
                              />
                            </div>

                            <p className="mt-3 text-xs leading-5 text-slate-200">
                              {t("markets.poolShareValue", {
                                share: formatSharePercent(share),
                              })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                    <GameSectionBlock tone="light">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                        {t("markets.resolutionSourceLabel")}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--retro-ink)]">
                        {market.sourceOfTruth}
                      </p>
                    </GameSectionBlock>

                    <GameSectionBlock tone="light">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                        {t("markets.rulesLabel")}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--retro-ink)]">
                        {market.resolutionRules}
                      </p>
                    </GameSectionBlock>
                  </div>
                </CardContent>
              </GameSurfaceCard>

              <GameSurfaceCard tone="light">
                <CardHeader className="space-y-2 pb-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                    {t("markets.yourPositions")}
                  </p>
                  <CardTitle className="text-[1.9rem] tracking-[-0.04em] text-[var(--retro-ink)]">
                    {t("markets.yourPositions")}
                  </CardTitle>
                  <CardDescription className="text-[rgba(15,17,31,0.68)]">
                    {t("markets.positionsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent
                  className="space-y-4 p-5 pt-5 md:p-6"
                  data-testid="market-positions"
                >
                  {market.userPositions.length === 0 ? (
                    <GameStatusNotice surface="light" tone="neutral">
                      {t("markets.noPositions")}
                    </GameStatusNotice>
                  ) : (
                    market.userPositions.map((position) => (
                      <div
                        key={position.id}
                        className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/84 p-4 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]"
                        data-testid={`market-position-${position.id}`}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-[var(--retro-ink)]">
                                {getOutcomeLabel(market, position.outcomeKey)}
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

                          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[280px]">
                            <GameSectionBlock tone="light">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.48)]">
                                {t("markets.stakeAmountLabel")}
                              </p>
                              <p className="mt-2 text-lg font-black tracking-[-0.03em] text-[var(--retro-ink)]">
                                {formatMarketAmount(locale, position.stakeAmount)}
                              </p>
                            </GameSectionBlock>
                            <GameSectionBlock tone="light">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.48)]">
                                {t("markets.payoutAmount")}
                              </p>
                              <p className="mt-2 text-lg font-black tracking-[-0.03em] text-[var(--retro-ink)]">
                                {formatMarketAmount(locale, position.payoutAmount)}
                              </p>
                            </GameSectionBlock>
                            {market.status === "open" &&
                            position.status === "open" ? (
                              <Button
                                type="button"
                                variant="arcadeOutline"
                                className="sm:col-span-2"
                                disabled={
                                  Boolean(disabledReason) ||
                                  pendingAction ||
                                  loading
                                }
                                onClick={() => void handleSellPosition(position.id)}
                                data-testid={`market-sell-position-button-${position.id}`}
                              >
                                {sellingPositionId === position.id
                                  ? t("markets.sellingPosition")
                                  : t("markets.sellPosition")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </GameSurfaceCard>
            </div>

            <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
              <GameSurfaceCard tone="dark">
                <CardContent className="space-y-5 p-5 md:p-6">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                      {t("markets.tradePreviewTitle")}
                    </p>
                    <div className="space-y-2">
                      <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-slate-50">
                        {t("markets.betTitle")}
                      </h2>
                      <p className="text-sm leading-6 text-slate-300">
                        {t("markets.betDescription")}
                      </p>
                    </div>
                  </div>

                  {disabledReason ? (
                    <GameStatusNotice surface="dark" tone="warning">
                      {disabledReason}
                    </GameStatusNotice>
                  ) : null}

                  {formError ? (
                    <GameStatusNotice
                      surface="dark"
                      tone="danger"
                      className="text-sm"
                    >
                      <span data-testid="market-form-error" role="alert">
                        {formError}
                      </span>
                    </GameStatusNotice>
                  ) : null}

                  {notice ? (
                    <GameStatusNotice
                      surface="dark"
                      tone="success"
                      className="text-sm"
                    >
                      <span data-testid="market-notice" role="status">
                        {notice}
                      </span>
                    </GameStatusNotice>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <GameMetricTile
                      label={t("markets.previewStakeLabel")}
                      tone="dark"
                      value={formatMarketAmount(locale, stakeAmount)}
                      valueClassName="text-xl font-black tracking-[-0.04em] text-[var(--retro-gold)]"
                    />
                    <GameMetricTile
                      label={t("markets.impliedPriceLabel")}
                      tone="dark"
                      value={formatSharePercent(preview.impliedPrice)}
                      valueClassName="text-xl font-black tracking-[-0.04em] text-cyan-100"
                    />
                    <GameMetricTile
                      label={t("markets.estimateSharesLabel")}
                      tone="dark"
                      value={formatMarketAmount(locale, preview.estimatedShares)}
                      valueClassName="text-xl font-black tracking-[-0.04em] text-slate-50"
                    />
                    <GameMetricTile
                      label={t("markets.potentialReturnLabel")}
                      tone="dark"
                      value={formatMarketAmount(locale, preview.potentialReturn)}
                      valueClassName="text-xl font-black tracking-[-0.04em] text-emerald-100"
                    />
                  </div>

                  <form
                    className="space-y-4"
                    onSubmit={handleSubmit}
                    data-testid="market-place-form"
                  >
                    <fieldset
                      disabled={pendingAction || loading}
                      className="space-y-4"
                    >
                      <div className="space-y-3">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                          {t("markets.outcomeLabel")}
                        </p>
                        <div className="grid gap-3">
                          {market.outcomes.map((outcome) => {
                            const pool =
                              market.outcomePools.find(
                                (entry) => entry.outcomeKey === outcome.key,
                              ) ?? null;
                            const share = computePoolShare(
                              pool,
                              market.totalPoolAmount,
                            );
                            const selected = outcome.key === outcomeKey;

                            return (
                              <button
                                key={outcome.key}
                                type="button"
                                onClick={() => setOutcomeKey(outcome.key)}
                                className={cn(
                                  "rounded-[1.25rem] border-2 px-4 py-4 text-left transition",
                                  selected
                                    ? "border-[var(--retro-gold)] bg-[rgba(255,213,61,0.18)] text-white shadow-[4px_4px_0px_0px_rgba(15,17,31,0.36)]"
                                    : "border-[#202745] bg-[rgba(255,255,255,0.04)] text-slate-100 hover:border-[var(--retro-violet-soft)] hover:bg-[rgba(97,88,255,0.08)]",
                                )}
                                data-testid={`market-outcome-option-${outcome.key}`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <span className="block text-base font-semibold">
                                      {outcome.label}
                                    </span>
                                    <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-slate-300">
                                      {t("markets.poolShareValue", {
                                        share: formatSharePercent(share),
                                      })}
                                    </span>
                                  </div>
                                  <span className="text-lg font-black tracking-[-0.03em]">
                                    {formatMarketAmount(
                                      locale,
                                      pool?.totalStakeAmount ?? "0.00",
                                    )}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="market-stake-amount"
                          className="text-slate-100"
                        >
                          {t("markets.stakeAmountLabel")}
                        </Label>
                        <Input
                          id="market-stake-amount"
                          value={stakeAmount}
                          onChange={(event) => setStakeAmount(event.target.value)}
                          placeholder={t("markets.stakePlaceholder")}
                          inputMode="decimal"
                          autoComplete="off"
                          className="retro-field-dark h-12 border-none px-4 text-base text-white"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="arcade"
                        className="w-full"
                        disabled={Boolean(disabledReason) || pendingAction || loading}
                        data-testid="market-place-button"
                      >
                        {submitting
                          ? t("markets.placingBet")
                          : t("markets.placeBet")}
                      </Button>
                    </fieldset>
                  </form>
                </CardContent>
              </GameSurfaceCard>

              <GameSurfaceCard tone="light">
                <CardContent className="space-y-4 p-5 md:p-6">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                      {t("markets.tradePreviewDescription")}
                    </p>
                    <h3 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                      {selectedPool?.label ?? t("markets.outcomesLabel")}
                    </h3>
                  </div>

                  <GameSectionBlock tone="light">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                        {t("markets.poolBreakdown")}
                      </p>
                      <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                        {t("markets.tradePreviewDescription")}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <GameMetricTile
                        tone="light"
                        label={t("markets.totalStake")}
                        value={formatMarketAmount(
                          locale,
                          selectedPool?.totalStakeAmount ?? "0.00",
                        )}
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-ink)]"
                      />
                      <GameMetricTile
                        tone="light"
                        label={t("markets.positionCount")}
                        value={selectedPool?.positionCount ?? 0}
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-violet)]"
                      />
                    </div>
                  </GameSectionBlock>
                </CardContent>
              </GameSurfaceCard>
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}
