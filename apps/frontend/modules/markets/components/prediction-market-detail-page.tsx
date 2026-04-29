"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  PredictionMarketDetail,
  PredictionMarketPool,
  PredictionPosition,
} from "@reward/shared-types/prediction-market";

import { useLocale, useTranslations } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import { useCurrentUserSession } from "@/modules/app/components/current-session-provider";
import {
  formatMarketAmount,
  formatMarketDateTime,
  formatMarketStatus,
  formatPositionStatus,
  resolveMarketStatusClasses,
  resolvePositionStatusClasses,
} from "../lib/format";

type PredictionMarketDetailPageProps = {
  marketId: number;
};

const STAKE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

const getOutcomeLabel = (market: PredictionMarketDetail, outcomeKey: string) =>
  market.outcomes.find((outcome) => outcome.key === outcomeKey)?.label ??
  outcomeKey;

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

const poolShare = (pool: PredictionMarketPool, totalPoolAmount: string) => {
  const total = Number(totalPoolAmount);
  const amount = Number(pool.totalStakeAmount);

  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(amount)) {
    return "0%";
  }

  return `${((amount / total) * 100).toFixed(1)}%`;
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
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
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

  const refreshWalletBalance = async () => {
    try {
      const walletResponse = await browserUserApiClient.getWalletBalance();
      if (walletResponse.ok) {
        setWalletBalance(walletResponse.data.balance.withdrawableBalance);
      }
    } catch {
      // Keep the latest market state visible even if the balance refresh fails.
    }
  };

  const refreshMarket = async () => {
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
        setWalletBalance(walletResponse.data.balance.withdrawableBalance);
      }
    } catch {
      setError(t("markets.loadFailed"));
    }

    setLoading(false);
  };

  useEffect(() => {
    void refreshMarket();
  }, [locale, marketId]);

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
      walletBalance !== null &&
      Number(parsed.data.stakeAmount) > Number(walletBalance)
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
          <Button
            asChild
            type="button"
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
          >
            <Link href="/app/markets">{t("markets.backToMarkets")}</Link>
          </Button>
          <Button
            asChild
            type="button"
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
          >
            <Link href="/app/markets/portfolio">
              {t("markets.openPortfolio")}
            </Link>
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleRefresh}
          disabled={loading}
          className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
          data-testid="market-refresh-button"
        >
          {loading ? t("common.loading") : t("markets.refreshDetail")}
        </Button>
      </div>

      {error ? (
        <Card className="border-rose-300/30 bg-rose-400/12 text-rose-50">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p
              className="text-sm leading-6"
              data-testid="market-detail-error"
              role="alert"
            >
              {error}
            </p>
            <Button type="button" variant="outline" onClick={handleRefresh}>
              {t("markets.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!market && loading ? (
        <Card className="border-white/10 bg-white/[0.04] text-slate-100">
          <CardContent className="pt-6 text-sm text-slate-300">
            {t("markets.loadingDetail")}
          </CardContent>
        </Card>
      ) : null}

      {market ? (
        <>
          <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
            <CardHeader className="gap-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]",
                        resolveMarketStatusClasses(market.status),
                      )}
                    >
                      {formatMarketStatus(market.status, t)}
                    </Badge>
                    <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      {market.roundKey}
                    </span>
                  </div>
                  <CardTitle className="text-3xl">{market.title}</CardTitle>
                  <CardDescription className="max-w-3xl text-sm leading-6 text-slate-300">
                    {market.description?.trim() || t("markets.noDescription")}
                  </CardDescription>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {t("markets.totalPool")}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {formatMarketAmount(locale, market.totalPoolAmount)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {t("markets.availableBalance")}
                    </p>
                    <p
                      className="mt-1 text-2xl font-semibold text-white"
                      data-testid="market-available-balance"
                    >
                      {formatMarketAmount(locale, walletBalance)}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {t("markets.opensAt")}
                  </dt>
                  <dd className="mt-2 text-sm text-slate-100">
                    {formatMarketDateTime(
                      locale,
                      market.opensAt,
                      t("markets.unknownTime"),
                    )}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {t("markets.locksAt")}
                  </dt>
                  <dd className="mt-2 text-sm text-slate-100">
                    {formatMarketDateTime(
                      locale,
                      market.locksAt,
                      t("markets.unknownTime"),
                    )}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {t("markets.resolvesAt")}
                  </dt>
                  <dd className="mt-2 text-sm text-slate-100">
                    {formatMarketDateTime(
                      locale,
                      market.resolvesAt,
                      t("markets.unknownTime"),
                    )}
                  </dd>
                </div>
              </dl>
            </CardHeader>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
            <Card className="border-white/10 bg-white/[0.04] text-slate-100">
              <CardHeader>
                <CardTitle>{t("markets.poolBreakdown")}</CardTitle>
                <CardDescription className="text-slate-300">
                  {t("markets.poolDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {market.outcomePools.map((pool) => (
                  <div
                    key={pool.outcomeKey}
                    className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{pool.label}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {t("markets.positionCountValue", {
                            count: pool.positionCount,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-white">
                          {formatMarketAmount(locale, pool.totalStakeAmount)}
                        </p>
                        <p className="text-sm text-slate-400">
                          {t("markets.poolShareValue", {
                            share: poolShare(pool, market.totalPoolAmount),
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.04] text-slate-100">
              <CardHeader>
                <CardTitle>{t("markets.betTitle")}</CardTitle>
                <CardDescription className="text-slate-300">
                  {t("markets.betDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {disabledReason ? (
                  <div className="rounded-2xl border border-amber-300/30 bg-amber-400/12 px-4 py-3 text-sm text-amber-50">
                    {disabledReason}
                  </div>
                ) : null}

                {formError ? (
                  <div
                    className="rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-sm text-rose-50"
                    data-testid="market-form-error"
                    role="alert"
                  >
                    {formError}
                  </div>
                ) : null}

                {notice ? (
                  <div
                    className="rounded-2xl border border-emerald-300/30 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-50"
                    data-testid="market-notice"
                    role="status"
                  >
                    {notice}
                  </div>
                ) : null}

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
                      <p className="text-sm font-medium text-slate-200">
                        {t("markets.outcomeLabel")}
                      </p>
                      <div className="grid gap-3">
                        {market.outcomes.map((outcome) => {
                          const selected = outcome.key === outcomeKey;

                          return (
                            <button
                              key={outcome.key}
                              type="button"
                              onClick={() => setOutcomeKey(outcome.key)}
                              className={cn(
                                "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                                selected
                                  ? "border-cyan-300/60 bg-cyan-400/12 text-white"
                                  : "border-white/10 bg-slate-950/40 text-slate-200 hover:bg-white/8",
                              )}
                              data-testid={`market-outcome-option-${outcome.key}`}
                            >
                              <span className="font-medium">
                                {outcome.label}
                              </span>
                              <span className="text-sm text-slate-300">
                                {formatMarketAmount(
                                  locale,
                                  market.outcomePools.find(
                                    (pool) => pool.outcomeKey === outcome.key,
                                  )?.totalStakeAmount ?? "0.00",
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="market-stake-amount"
                        className="text-slate-200"
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
                        className="border-white/10 bg-slate-950/40 text-white placeholder:text-slate-500"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full rounded-full"
                      disabled={
                        Boolean(disabledReason) || pendingAction || loading
                      }
                      data-testid="market-place-button"
                    >
                      {submitting
                        ? t("markets.placingBet")
                        : t("markets.placeBet")}
                    </Button>
                  </fieldset>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/10 bg-white/[0.04] text-slate-100">
            <CardHeader>
              <CardTitle>{t("markets.yourPositions")}</CardTitle>
              <CardDescription className="text-slate-300">
                {t("markets.positionsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4" data-testid="market-positions">
              {market.userPositions.length === 0 ? (
                <p className="text-sm text-slate-300">
                  {t("markets.noPositions")}
                </p>
              ) : (
                market.userPositions.map((position: PredictionPosition) => (
                  <div
                    key={position.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    data-testid={`market-position-${position.id}`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">
                            {getOutcomeLabel(market, position.outcomeKey)}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                              resolvePositionStatusClasses(position.status),
                            )}
                          >
                            {formatPositionStatus(position.status, t)}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300">
                          {position.status === "sold" && position.settledAt
                            ? `${t("markets.positionSoldAt")}: ${formatMarketDateTime(
                                locale,
                                position.settledAt,
                                t("markets.unknownTime"),
                              )}`
                            : position.settledAt
                              ? `${t("markets.positionSettledAt")}: ${formatMarketDateTime(
                                  locale,
                                  position.settledAt,
                                  t("markets.unknownTime"),
                                )}`
                              : `${t("markets.positionCreatedAt")}: ${formatMarketDateTime(
                                  locale,
                                  position.createdAt,
                                  t("markets.unknownTime"),
                                )}`}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[280px]">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            {t("markets.stakeAmountLabel")}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {formatMarketAmount(locale, position.stakeAmount)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            {t("markets.payoutAmount")}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {formatMarketAmount(locale, position.payoutAmount)}
                          </p>
                        </div>
                        {market.status === "open" &&
                        position.status === "open" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white sm:col-span-2"
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
          </Card>
        </>
      ) : null}
    </section>
  );
}
