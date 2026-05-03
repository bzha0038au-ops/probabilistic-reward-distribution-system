"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import type {
  DrawCatalogResponse,
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawPrizeRarity,
  DrawResult,
} from "@reward/shared-types/draw";
import type { PlayModeType } from "@reward/shared-types/play-mode";

import { PlayModeSwitcher } from "@/components/play-mode-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-provider";
import { useLocale, useTranslations } from "@/components/i18n-provider";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import {
  buildPrizeSymbolMap,
  buildSlotFinale,
  createRollingReels,
  getSymbolById,
  type SlotFinale,
  type SlotSymbolId,
} from "@/modules/draw/lib/slot-machine";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import {
  TbArrowLeft,
  TbCoin,
  TbGift,
  TbHelpCircle,
  TbHistory,
} from "react-icons/tb";

type DrawPanelProps = {
  disabled?: boolean;
  disabledReason?: string | null;
  onBalanceChange?: (balance: string) => void;
  onDrawComplete?: () => void;
  variant?: "slot" | "gacha";
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

const slotGlyphMap: Record<SlotSymbolId, string> = {
  crown: "✦",
  gem: "◆",
  star: "★",
  comet: "☄",
  coin: "◎",
  vault: "⬣",
};

const drawStatusToneMap: Record<
  DrawResult["status"],
  "success" | "warning" | "danger" | "neutral"
> = {
  won: "success",
  miss: "neutral",
  out_of_stock: "warning",
  budget_exhausted: "danger",
  payout_limited: "warning",
};

const createDeterministicRandom = (seed: number) => {
  let current = seed % 2147483647;
  if (current <= 0) {
    current += 2147483646;
  }

  return () => {
    current = (current * 16807) % 2147483647;
    return (current - 1) / 2147483646;
  };
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

const getHighlightResult = (results: DrawPlayResponse["results"]) => {
  const ordered: DrawPrizeRarity[] = ["legendary", "epic", "rare", "common"];
  for (const rarity of ordered) {
    const match = results.find(
      (result) => result.prize?.displayRarity === rarity,
    );
    if (match) {
      return match;
    }
  }

  return results[0] ?? null;
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

function SlotSymbolFace(props: {
  symbolId: SlotSymbolId;
  active?: boolean;
  dimmed?: boolean;
}) {
  const symbol = getSymbolById(props.symbolId);

  return (
    <div
      className={cn(
        "flex h-28 flex-col items-center justify-center gap-2 rounded-[1.4rem] border-2 px-2 text-center shadow-[4px_4px_0px_0px_rgba(15,17,31,0.18)] transition-transform",
        props.active
          ? cn(
              "bg-gradient-to-br text-[var(--retro-ink)]",
              symbol.accentClassName,
              symbol.frameClassName,
            )
          : "border-[rgba(15,17,31,0.16)] bg-white/88 text-[var(--retro-ink)]",
        props.dimmed ? "opacity-35" : null,
      )}
    >
      <span className="text-4xl leading-none">{slotGlyphMap[symbol.id]}</span>
      <span className="text-[0.68rem] font-black uppercase tracking-[0.18em]">
        {symbol.shortLabel}
      </span>
    </div>
  );
}

export function DrawPanel({
  disabled = false,
  disabledReason = null,
  onBalanceChange,
  onDrawComplete,
  variant = "slot",
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
  const [updatingPlayMode, setUpdatingPlayMode] = useState(false);
  const [playingDrawCount, setPlayingDrawCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const featuredPrizes = getFeaturedPrizes(drawCatalog);
  const highlightResult = lastDrawPlay
    ? getHighlightResult(lastDrawPlay.results)
    : null;
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
  const activePrizePool = drawCatalog?.prizes ?? featuredPrizes;
  const prizeSymbolMap = useMemo(
    () => buildPrizeSymbolMap(activePrizePool),
    [activePrizePool],
  );
  const slotPresentation = useMemo(() => {
    if (highlightResult) {
      return buildSlotFinale(
        highlightResult,
        activePrizePool,
        createDeterministicRandom(highlightResult.id + activePrizePool.length + 11),
      );
    }

    return null;
  }, [activePrizePool, highlightResult]);
  const previewReels = useMemo(() => {
    if (slotPresentation) {
      return slotPresentation.reels;
    }

    return createRollingReels(
      activePrizePool,
      null,
      0,
      createDeterministicRandom(activePrizePool.length + 17),
    );
  }, [activePrizePool, slotPresentation]);
  const slotTone: SlotFinale["tone"] = slotPresentation?.tone ?? "near-miss";
  const latestRewardAmount = lastDrawPlay
    ? formatAmount(locale, lastDrawPlay.totalReward)
    : "0.00";
  const livePoolCount = drawCatalog?.prizes.length ?? 0;
  const gachaLuckyStreak = drawCatalog?.pity.currentStreak ?? 0;
  const gachaBonusMultiplier = drawCatalog?.playMode.appliedMultiplier ?? 1;
  const gachaRecentResults = lastDrawPlay?.results.slice(0, 4) ?? [];
  const gachaRecentCards = (
    gachaRecentResults.length > 0
      ? gachaRecentResults.map((result) => ({
          id: `result-${result.id}`,
          name: result.prize?.name ?? t("draw.missCardTitle"),
          amount: formatAmount(locale, result.rewardAmount),
          rarity: result.prize?.displayRarity ?? "common",
          meta: new Date(result.createdAt).toLocaleTimeString(locale, {
            hour: "numeric",
            minute: "2-digit",
          }),
          symbolId: result.prize ? prizeSymbolMap.get(result.prize.id) ?? "coin" : "coin",
        }))
      : featuredPrizes.slice(0, 4).map((prize, index) => ({
          id: `pool-${prize.id}-${index}`,
          name: prize.name,
          amount: formatAmount(locale, prize.rewardAmount),
          rarity: prize.displayRarity,
          meta: t("draw.gachaPoolFallback"),
          symbolId: prizeSymbolMap.get(prize.id) ?? "coin",
        }))
  ) satisfies Array<{
    id: string;
    name: string;
    amount: string;
    rarity: DrawPrizeRarity;
    meta: string;
    symbolId: SlotSymbolId;
  }>;

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

  const handleChangePlayMode = async (type: PlayModeType) => {
    if (!drawCatalog || updatingPlayMode) {
      return;
    }

    setUpdatingPlayMode(true);
    const response = await browserUserApiClient.setPlayMode("draw", { type });
    setUpdatingPlayMode(false);

    if (!response.ok) {
      const message = response.error?.message ?? t("draw.errorFallback");
      setError(message);
      showToast({
        tone: "error",
        description: message,
        durationMs: 5200,
      });
      return;
    }

    startTransition(() => {
      setDrawCatalog((current) =>
        current
          ? {
              ...current,
              playMode: response.data.snapshot,
            }
          : current,
      );
    });
  };

  const handlePlayDraw = async (count: number) => {
    if (!drawCatalog || drawDisabled) {
      return;
    }

    setError(null);
    setCatalogError(null);
    setPlayingDrawCount(count);

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

  if (variant === "gacha") {
    return (
      <section
        className="space-y-6"
        data-testid="gacha-stage"
      >
        <GameSurfaceCard className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(38,48,132,0.92),rgba(18,18,52,0.98)_34%,rgba(9,10,22,1)_78%)] px-4 py-5 text-white sm:px-6">
              <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_50%_18%,rgba(255,206,84,0.12),transparent_18%),radial-gradient(circle_at_50%_36%,rgba(255,255,255,0.05),transparent_28%),repeating-conic-gradient(from_0deg_at_50%_28%,rgba(255,255,255,0.06)_0deg,transparent_8deg,transparent_22deg)]" />
              <div className="relative space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href="/app"
                    aria-label={t("draw.poolTitle")}
                    className="flex size-11 items-center justify-center rounded-full border-2 border-[rgba(255,215,113,0.42)] bg-[rgba(11,13,24,0.78)] text-[var(--retro-gold)] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] transition-colors hover:bg-[rgba(23,26,42,0.92)]"
                  >
                    <TbArrowLeft className="size-5" />
                  </Link>
                  <div className="text-center">
                    <p className="text-[2rem] font-black uppercase tracking-[-0.05em] text-[var(--retro-orange)] drop-shadow-[0_3px_0_rgba(0,0,0,0.55)] sm:text-[2.4rem]">
                      {t("draw.gachaRouteTitle")}
                    </p>
                    <p className="-mt-1 text-[1.2rem] font-black uppercase tracking-[-0.04em] text-[var(--retro-gold)] drop-shadow-[0_2px_0_rgba(0,0,0,0.55)]">
                      {t("draw.gachaRouteSubtitle")}
                    </p>
                  </div>
                  <a
                    href="#gacha-fairness"
                    aria-label={t("draw.fairnessPanelTitle")}
                    className="flex size-11 items-center justify-center rounded-full border-2 border-[rgba(255,215,113,0.42)] bg-[rgba(11,13,24,0.78)] text-[var(--retro-gold)] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] transition-colors hover:bg-[rgba(23,26,42,0.92)]"
                  >
                    <TbHelpCircle className="size-5" />
                  </a>
                </div>

                <div className="mx-auto max-w-[24rem]">
                  <div className="relative mx-auto w-full max-w-[18rem] pt-2">
                    <div className="relative mx-auto h-[22rem] w-[15rem]">
                      <div className="absolute inset-x-2 top-0 h-[11.8rem] rounded-[45%] border-[5px] border-[#f0d4a1] bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.45),rgba(255,255,255,0.1)_18%,transparent_22%),radial-gradient(circle_at_50%_58%,rgba(111,177,255,0.5),transparent_58%),linear-gradient(180deg,rgba(88,84,187,0.92),rgba(70,54,146,0.9))] shadow-[inset_0_0_0_2px_rgba(34,22,68,0.4),0_8px_0_0_rgba(0,0,0,0.24)]" />
                      <div className="absolute left-7 top-10 size-16 rounded-full border-4 border-[#f3e0bf] bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.55),transparent_40%),linear-gradient(180deg,#f4e6c8,#b88f58)]" />
                      <div className="absolute right-7 top-12 size-16 rounded-full border-4 border-[#f3e0bf] bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.55),transparent_40%),linear-gradient(180deg,#f6d08e,#c76535)]" />
                      <div className="absolute left-[5.1rem] top-[6.8rem] size-16 rounded-full border-4 border-[#f3e0bf] bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.55),transparent_40%),linear-gradient(180deg,#8fd7ff,#4588df)]" />
                      <div className="absolute right-[5.1rem] top-[4.3rem] size-14 rounded-full border-4 border-[#f3e0bf] bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.55),transparent_40%),linear-gradient(180deg,#564ec6,#2f2f83)]" />
                      <div className="absolute left-[3rem] top-[8.8rem] size-14 rounded-full border-4 border-[#f3e0bf] bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.55),transparent_40%),linear-gradient(180deg,#ffd089,#d3614a)]" />
                      <div className="absolute right-[3rem] top-[9rem] size-14 rounded-full border-4 border-[#f3e0bf] bg-[radial-gradient(circle_at_32%_32%,rgba(255,255,255,0.55),transparent_40%),linear-gradient(180deg,#ffd979,#d9a13d)]" />
                      <div className="absolute inset-x-4 top-[10.3rem] h-[9.4rem] rounded-[2.2rem] border-[5px] border-[#692128] bg-[linear-gradient(180deg,#d85d58,#8f2332)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.08),0_8px_0_0_rgba(0,0,0,0.25)]" />
                      <div className="absolute inset-x-[4.1rem] top-[13.6rem] h-[2.6rem] rounded-[1.3rem] border-4 border-[#5f3448] bg-[linear-gradient(180deg,#644778,#332645)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.06)]" />
                      <div className="absolute inset-x-[5.7rem] top-[14.3rem] size-5 rounded-full border-2 border-[#c7a0ff] bg-[#40305d]" />
                      <div className="absolute inset-x-[4.8rem] bottom-4 h-[2.1rem] rounded-[1rem] border-4 border-[#5e1823] bg-[linear-gradient(180deg,#822539,#4b0f1e)]" />
                    </div>

                    <div className="pointer-events-none absolute left-0 top-[10.8rem] text-left">
                      <p className="text-[0.78rem] font-black uppercase tracking-[0.18em] text-white/78">
                        {t("draw.gachaLuckyStreak")}
                      </p>
                      <p className="mt-1 text-[2.5rem] font-black leading-none text-[var(--retro-gold)]">
                        {gachaLuckyStreak}
                      </p>
                    </div>
                    <div className="pointer-events-none absolute right-0 top-[11rem] text-right">
                      <p className="text-[0.78rem] font-black uppercase tracking-[0.18em] text-white/78">
                        {t("draw.gachaBonusLabel")}
                      </p>
                      <p className="mt-1 text-[2.1rem] font-black leading-none text-[var(--retro-gold)]">
                        x{gachaBonusMultiplier}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mx-auto max-w-[20rem] space-y-3">
                  <Button
                    onClick={() => void handlePlayDraw(1)}
                    disabled={loadingDrawCatalog || playingDrawCount !== null || drawDisabled}
                    variant="arcadeDark"
                    size="xl"
                    className="h-16 w-full rounded-[1.35rem] border-[3px] border-[#8b5a12] bg-[linear-gradient(180deg,#ffd760,#dca52a)] text-[2rem] font-black uppercase tracking-[-0.04em] text-[#1a140f] shadow-[0_7px_0_0_rgba(78,48,10,0.95)] hover:bg-[linear-gradient(180deg,#ffdf7f,#e5b443)]"
                  >
                    <span>{playingDrawCount === 1 ? t("draw.drawing") : t("draw.gachaDrawCta")}</span>
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[rgba(24,18,12,0.16)] px-3 py-1 text-base">
                      <TbCoin className="size-4" />
                      {formatAmount(locale, drawCatalog?.drawCost ?? "0")}
                    </span>
                  </Button>
                  <p className="text-center text-sm font-semibold text-[var(--retro-gold)]">
                    {t("draw.gachaNextReveal")}: {formatRevealTime(locale, drawCatalog?.fairness)}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    asChild
                    variant="arcadeOutline"
                    className="h-14 rounded-[1.15rem] border-[rgba(255,255,255,0.12)] bg-[rgba(19,20,43,0.92)] text-white hover:bg-[rgba(32,33,60,0.95)] hover:text-white"
                  >
                    <Link href="/app/rewards">
                      <TbGift className="size-5" />
                      {t("draw.gachaGiftPacks")}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="arcadeOutline"
                    className="h-14 rounded-[1.15rem] border-[rgba(255,255,255,0.12)] bg-[rgba(19,20,43,0.92)] text-white hover:bg-[rgba(32,33,60,0.95)] hover:text-white"
                  >
                    <a href="#gacha-recent">
                      <TbHistory className="size-5" />
                      {t("draw.gachaHistory")}
                    </a>
                  </Button>
                </div>

                {disabledReason ? (
                  <GameStatusNotice tone="warning">{disabledReason}</GameStatusNotice>
                ) : null}
                {!drawCatalog?.drawEnabled && drawCatalog ? (
                  <GameStatusNotice tone="warning">{t("draw.disabledBySystem")}</GameStatusNotice>
                ) : null}
                {catalogError ? (
                  <GameStatusNotice tone="info">{catalogError}</GameStatusNotice>
                ) : null}
                {error ? <GameStatusNotice tone="danger">{error}</GameStatusNotice> : null}
              </div>
            </div>
          </CardContent>
        </GameSurfaceCard>

        <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <div id="gacha-recent">
            <GameSurfaceCard className="overflow-hidden">
            <CardHeader className="pb-0">
              <CardTitle>{t("draw.gachaRecentWins")}</CardTitle>
              <CardDescription className="text-slate-300">
                {t("draw.gachaRecentWinsSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 p-6 pt-5 sm:grid-cols-4">
              {gachaRecentCards.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[1.35rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] p-3 text-center shadow-[4px_4px_0px_0px_rgba(3,5,14,0.55)]"
                >
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full border-2 border-[rgba(255,213,61,0.32)] bg-[rgba(255,213,61,0.12)] text-2xl text-[var(--retro-gold)]">
                    {slotGlyphMap[entry.symbolId]}
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-white">{entry.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{entry.meta}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-3 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                      rarityToneMap[entry.rarity].badge,
                    )}
                  >
                    {t(`draw.rarities.${entry.rarity}`)}
                  </Badge>
                  <p className="mt-3 text-sm font-black tracking-[-0.03em] text-[var(--retro-gold)]">
                    {entry.amount}
                  </p>
                </div>
              ))}
            </CardContent>
            </GameSurfaceCard>
          </div>

          <div className="space-y-6" id="gacha-fairness">
            <GameSurfaceCard tone="light" className="overflow-hidden">
              <CardHeader className="pb-0">
                <CardTitle className="text-[var(--retro-ink)]">{t("draw.fairnessPanelTitle")}</CardTitle>
                <CardDescription className="text-[rgba(15,17,31,0.68)]">
                  {t("draw.fairnessPanelSubtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-5">
                <GameStatusNotice tone="info" surface="light">
                  {t("draw.commitRevealLabel")}
                </GameStatusNotice>
                <GameSectionBlock tone="light" className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[rgba(15,17,31,0.58)]">{t("draw.commitLabel")}</span>
                    <span className="font-mono text-sm font-semibold text-[var(--retro-ink)]">
                      {truncateHash(drawCatalog?.fairness.commitHash)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[rgba(15,17,31,0.58)]">{t("draw.epochLabel")}</span>
                    <span className="text-sm font-semibold text-[var(--retro-ink)]">
                      {drawCatalog?.fairness.epoch ?? "--"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[rgba(15,17,31,0.58)]">{t("draw.revealLabel")}</span>
                    <span className="text-sm font-semibold text-[var(--retro-ink)]">
                      {formatRevealTime(locale, drawCatalog?.fairness)}
                    </span>
                  </div>
                </GameSectionBlock>
                <GameSectionBlock tone="light" className="space-y-3">
                  <p className="text-sm text-[rgba(15,17,31,0.72)]">
                    {t("draw.fairnessExplainer")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <GameMetricTile
                      tone="light"
                      label={t("draw.currentBalance")}
                      value={formatAmount(locale, drawCatalog?.balance ?? "0")}
                      valueClassName="text-xl font-black tracking-[-0.04em]"
                    />
                    <GameMetricTile
                      tone="light"
                      label={t("draw.lastResultLabel")}
                      value={latestRewardAmount}
                      valueClassName="text-xl font-black tracking-[-0.04em] text-[var(--retro-orange)]"
                    />
                  </div>
                </GameSectionBlock>
              </CardContent>
            </GameSurfaceCard>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <GameSurfaceCard tone="light" className="overflow-hidden">
        <CardContent className="retro-ivory-surface relative px-6 py-4">
          <div className="absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="retro-badge retro-badge-ink">
                {t("draw.commitRevealLabel")}
              </span>
              <span className="font-mono text-sm font-semibold text-[var(--retro-ink)]">
                {truncateHash(drawCatalog?.fairness.commitHash)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <GamePill tone="info" surface="light">
                {t("draw.fairnessEpoch", {
                  epoch: drawCatalog?.fairness.epoch ?? "--",
                })}
              </GamePill>
              <GamePill tone="warning" surface="light">
                {t("draw.revealLabel")}: {formatRevealTime(locale, drawCatalog?.fairness)}
              </GamePill>
            </div>
          </div>
        </CardContent>
      </GameSurfaceCard>

      <div className="grid gap-6 2xl:grid-cols-[340px,minmax(0,1fr)]">
        <div className="space-y-6">
          <GameSurfaceCard tone="light" className="overflow-hidden">
            <CardContent className="p-0">
              <div className="retro-ivory-surface relative overflow-hidden px-6 py-7">
                <div className="absolute inset-0 retro-dot-overlay opacity-20" />
                <div className="relative space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <span className="retro-badge retro-badge-gold border-none">
                        {t("draw.banner")}
                      </span>
                      <div className="space-y-2">
                        <CardTitle className="text-[2.4rem] tracking-[-0.05em] text-[var(--retro-orange)]">
                          {t("draw.title")}
                        </CardTitle>
                        <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                          {t("draw.subtitle")}
                        </CardDescription>
                      </div>
                    </div>
                    <GamePill tone="accent" surface="light">
                      {t("draw.fairnessLive")}
                    </GamePill>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <GameMetricTile
                      tone="light"
                      label={t("draw.currentBalance")}
                      value={formatAmount(locale, drawCatalog?.balance ?? "0")}
                      valueClassName="text-2xl font-black tracking-[-0.04em]"
                    />
                    <GameMetricTile
                      tone="light"
                      label={t("draw.spinCostLabel")}
                      value={formatAmount(locale, drawCatalog?.drawCost ?? "0")}
                      valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                    />
                    <GameMetricTile
                      tone="light"
                      label={t("draw.livePoolLabel")}
                      value={livePoolCount}
                      valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <PlayModeSwitcher
                  gameKey="draw"
                  snapshot={drawCatalog?.playMode ?? null}
                  disabled={drawDisabled || playingDrawCount !== null}
                  loading={updatingPlayMode}
                  onSelect={(type) => void handleChangePlayMode(type)}
                />
              </div>
            </CardContent>
          </GameSurfaceCard>

          <GameSurfaceCard className="overflow-hidden">
            <CardContent className="space-y-5 p-6">
              <GameSectionBlock className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--retro-gold)]">
                      {t("draw.pityTitle")}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {drawCatalog?.pity.enabled
                        ? t("draw.pityDescription")
                        : t("draw.pityDisabledDescription")}
                    </p>
                  </div>
                  {drawCatalog?.pity ? (
                    <GamePill tone="info">
                      {drawCatalog.pity.enabled &&
                      drawCatalog.pity.drawsUntilBoost !== null
                        ? t("draw.pityRemaining", {
                            count: drawCatalog.pity.drawsUntilBoost,
                          })
                        : t("draw.pityOff")}
                    </GamePill>
                  ) : null}
                </div>

                <div>
                  <p className="text-lg font-semibold text-white">
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
                  <div className="mt-4 h-3 overflow-hidden rounded-full border border-[#202745] bg-[rgba(255,255,255,0.04)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#6158ff,#f4c542,#c75a00)] transition-all duration-500"
                      style={{ width: `${pityProgress}%` }}
                    />
                  </div>
                </div>
              </GameSectionBlock>

              {lastDrawPlay ? (
                <GameSectionBlock className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <GamePill tone="success">
                      {t("draw.summaryWins", { count: lastDrawPlay.winCount })}
                    </GamePill>
                    <GamePill tone="info">
                      {t("draw.summaryReward", {
                        amount: formatAmount(locale, lastDrawPlay.totalReward),
                      })}
                    </GamePill>
                    <GamePill tone="neutral">
                      {t("draw.summaryBalance", {
                        amount: formatAmount(locale, lastDrawPlay.endingBalance),
                      })}
                    </GamePill>
                  </div>

                  {highlightPrize ? (
                    <div
                      className={cn(
                        "rounded-[1.4rem] border-2 p-4",
                        rarityToneMap[highlightPrize.displayRarity].card,
                      )}
                    >
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        {t("draw.highlightTitle")}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {highlightPrize.name}
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {t("draw.rewardValue")}{" "}
                        {formatAmount(locale, highlightPrize.rewardAmount)}
                      </p>
                    </div>
                  ) : null}
                </GameSectionBlock>
              ) : (
                <GameStatusNotice tone="neutral">
                  {t("draw.awaitingResultBody")}
                </GameStatusNotice>
              )}

              {disabledReason ? (
                <GameStatusNotice tone="warning">{disabledReason}</GameStatusNotice>
              ) : null}
              {!drawCatalog?.drawEnabled && drawCatalog ? (
                <GameStatusNotice tone="warning">
                  {t("draw.disabledBySystem")}
                </GameStatusNotice>
              ) : null}
              {drawCatalog && drawCatalog.maxBatchCount <= 1 ? (
                <GameStatusNotice tone="neutral">
                  {t("draw.multiLocked", { max: drawCatalog.maxBatchCount })}
                </GameStatusNotice>
              ) : null}
              {catalogError ? (
                <GameStatusNotice tone="info">{catalogError}</GameStatusNotice>
              ) : null}
              {error ? <GameStatusNotice tone="danger">{error}</GameStatusNotice> : null}
            </CardContent>
          </GameSurfaceCard>
        </div>

        <div className="space-y-6">
          <GameSurfaceCard tone="light" className="overflow-hidden">
            <CardContent className="retro-ivory-surface relative overflow-hidden px-6 py-6 md:px-8">
              <div className="absolute inset-0 retro-dot-overlay opacity-15" />
              <div className="relative rounded-[3rem] border-2 border-[var(--retro-ink)] bg-[rgba(199,90,0,0.12)] p-2 shadow-[8px_8px_0px_0px_rgba(15,17,31,0.22)]">
                <div className="rounded-[2.7rem] border-2 border-[var(--retro-ink)] bg-[var(--retro-orange)] px-6 py-5 text-[var(--retro-ivory)] shadow-[6px_6px_0px_0px_rgba(15,17,31,0.82)]">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <GamePill tone="warning" surface="light">
                          {t("draw.gachaTitle")}
                        </GamePill>
                        <GamePill
                          tone={
                            slotTone === "win"
                              ? "success"
                              : slotTone === "blocked"
                                ? "danger"
                                : "neutral"
                          }
                          surface="light"
                        >
                          {lastDrawPlay
                            ? t(`draw.statuses.${highlightResult?.status ?? "miss"}`)
                            : t("draw.awaitingResult")}
                        </GamePill>
                      </div>
                      <CardTitle className="text-[2.7rem] tracking-[-0.05em] text-[var(--retro-ivory)]">
                        {highlightPrize?.name ?? t("draw.missCardTitle")}
                      </CardTitle>
                    </div>

                    <div className="rounded-full border-2 border-[var(--retro-ink)] bg-[#fff3e0] px-5 py-3 text-[var(--retro-ink)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.9)]">
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.52)]">
                        {t("draw.rewardValue")}
                      </p>
                      <p className="mt-1 text-2xl font-black tracking-[-0.04em]">
                        {highlightPrize
                          ? formatAmount(locale, highlightPrize.rewardAmount)
                          : formatAmount(locale, "0")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[2.35rem] border-2 border-[var(--retro-ink)] bg-[rgba(252,248,242,0.98)] px-5 py-6 text-[var(--retro-ink)]">
                    <div className="relative overflow-hidden rounded-[2rem] border-2 border-[rgba(15,17,31,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,236,227,0.94))] px-5 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[rgba(199,90,0,0.22)]" />
                      <div className="relative mx-auto grid max-w-[720px] gap-4 md:grid-cols-3">
                        {previewReels.map((reel, reelIndex) => (
                          <div
                            key={`reel-${reelIndex}`}
                            className="grid gap-4 rounded-[1.9rem] border-2 border-[rgba(15,17,31,0.16)] bg-white/50 p-4"
                          >
                            {reel.map((symbolId, rowIndex) => (
                              <SlotSymbolFace
                                key={`${reelIndex}-${rowIndex}-${symbolId}`}
                                symbolId={symbolId}
                                active={rowIndex === 1}
                                dimmed={rowIndex !== 1}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                      {t("draw.presentationNote")}
                    </p>

                    <div className="mt-6 grid gap-4 xl:grid-cols-[0.92fr,1.15fr,0.93fr]">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <GameMetricTile
                          tone="light"
                          label={t("draw.currentBalance")}
                          value={formatAmount(locale, drawCatalog?.balance ?? "0")}
                          valueClassName="text-xl font-black tracking-[-0.04em]"
                        />
                        <GameMetricTile
                          tone="light"
                          label={t("draw.lastResultLabel")}
                          value={latestRewardAmount}
                          valueClassName="text-xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                        />
                      </div>

                      <div className="flex flex-col justify-center gap-3">
                        <Button
                          onClick={() => void handlePlayDraw(1)}
                          disabled={
                            loadingDrawCatalog ||
                            playingDrawCount !== null ||
                            drawDisabled
                          }
                          variant="arcadeDark"
                          size="xl"
                          className="h-16 text-base"
                        >
                          {playingDrawCount === 1
                            ? t("draw.drawing")
                            : t("draw.spinButton", {
                                amount: formatAmount(locale, drawCatalog?.drawCost ?? "0"),
                              })}
                        </Button>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Button
                            onClick={() => void handlePlayDraw(multiDrawCount)}
                            disabled={
                              loadingDrawCatalog ||
                              playingDrawCount !== null ||
                              drawDisabled ||
                              multiDrawCount <= 1
                            }
                            variant="arcade"
                            className="h-14"
                          >
                            {playingDrawCount === multiDrawCount
                              ? t("draw.drawing")
                              : t("draw.multiDraw", { count: multiDrawCount })}
                          </Button>
                          <Button
                            onClick={() => void refreshDrawCatalog()}
                            disabled={loadingDrawCatalog || playingDrawCount !== null}
                            variant="arcadeOutline"
                            className="h-14"
                          >
                            {t("draw.refreshPool")}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <GameStatusNotice tone="info" surface="light">
                          {t("draw.resultSubtitle", {
                            count: lastDrawPlay?.results.length ?? 0,
                          })}
                        </GameStatusNotice>
                        <GameStatusNotice tone="warning" surface="light">
                          {drawCatalog?.pity.enabled &&
                          drawCatalog.pity.drawsUntilBoost !== null
                            ? t("draw.pityRemaining", {
                                count: drawCatalog.pity.drawsUntilBoost,
                              })
                            : t("draw.pityOff")}
                        </GameStatusNotice>
                        <GameStatusNotice tone="neutral" surface="light">
                          {t("draw.summaryReward", { amount: latestRewardAmount })}
                        </GameStatusNotice>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </GameSurfaceCard>

          <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
            <GameSurfaceCard className="overflow-hidden">
              <CardHeader className="pb-0">
                <CardTitle>{t("draw.poolTitle")}</CardTitle>
                <CardDescription className="text-slate-300">
                  {t("draw.poolSubtitle", { count: livePoolCount })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-5">
                {featuredPrizes.length > 0 ? (
                  featuredPrizes.map((prize) => {
                    const symbolId = prizeSymbolMap.get(prize.id) ?? "coin";
                    return (
                      <GameSectionBlock key={prize.id} className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-[1.2rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] p-3 text-2xl text-[var(--retro-gold)]">
                              {slotGlyphMap[symbolId]}
                            </div>
                            <div>
                              <p className="font-semibold text-white">{prize.name}</p>
                              <p className="mt-1 text-sm text-slate-300">
                                {t("draw.rewardValue")}{" "}
                                {formatAmount(locale, prize.rewardAmount)}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                              rarityToneMap[prize.displayRarity].badge,
                            )}
                          >
                            {t(`draw.rarities.${prize.displayRarity}`)}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                          <span>{t(`draw.stockStates.${prize.stockState}`)}</span>
                          <span>Stock {prize.stock}</span>
                        </div>
                      </GameSectionBlock>
                    );
                  })
                ) : (
                  <GameStatusNotice tone="neutral">{t("draw.poolEmpty")}</GameStatusNotice>
                )}
              </CardContent>
            </GameSurfaceCard>

            <div className="space-y-6">
              <GameSurfaceCard tone="light" className="overflow-hidden">
                <CardHeader className="pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-[var(--retro-ink)]">
                        {t("draw.recentResultsTitle")}
                      </CardTitle>
                      <CardDescription className="text-[rgba(15,17,31,0.68)]">
                        {t("draw.recentResultsSubtitle")}
                      </CardDescription>
                    </div>
                    <GamePill tone="accent" surface="light">
                      {t("draw.sessionLiveLabel")}
                    </GamePill>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-6 pt-5">
                  {lastDrawPlay ? (
                    lastDrawPlay.results.map((result) => {
                      const rarity = result.prize?.displayRarity ?? "common";
                      return (
                        <GameSectionBlock
                          key={result.id}
                          tone="light"
                          className="space-y-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.24em] text-[rgba(15,17,31,0.48)]">
                                {t(`draw.statuses.${result.status}`)}
                              </p>
                              <p className="mt-2 text-lg font-semibold text-[var(--retro-ink)]">
                                {result.prize?.name ?? t("draw.missCardTitle")}
                              </p>
                            </div>
                            <GamePill
                              tone={drawStatusToneMap[result.status]}
                              surface="light"
                            >
                              {t(`draw.rarities.${rarity}`)}
                            </GamePill>
                          </div>

                          <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                            {t(`draw.statusDescriptions.${result.status}`)}
                          </p>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[rgba(15,17,31,0.52)]">
                              {t("draw.rewardValue")}
                            </span>
                            <span className="text-lg font-black tracking-[-0.04em] text-[var(--retro-orange)]">
                              {formatAmount(locale, result.rewardAmount)}
                            </span>
                          </div>
                        </GameSectionBlock>
                      );
                    })
                  ) : (
                    <GameStatusNotice tone="neutral" surface="light">
                      {t("draw.noRecentResults")}
                    </GameStatusNotice>
                  )}
                </CardContent>
              </GameSurfaceCard>

              <GameSurfaceCard className="overflow-hidden">
                <CardHeader className="pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{t("draw.fairnessPanelTitle")}</CardTitle>
                      <CardDescription className="text-slate-300">
                        {t("draw.fairnessPanelSubtitle")}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-300/25 bg-amber-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-50"
                    >
                      {t("draw.commitRevealLabel")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-6 pt-5">
                  <GameSectionBlock className="space-y-3">
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
                    {highlightResult?.fairness?.clientNonce ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-300">
                          {t("draw.clientNonceLabel")}
                        </span>
                        <span className="font-mono text-sm text-slate-100">
                          {truncateHash(highlightResult.fairness.clientNonce, 8, 6)}
                        </span>
                      </div>
                    ) : null}
                  </GameSectionBlock>

                  <p className="text-sm leading-6 text-slate-300">
                    {t("draw.fairnessExplainer")}
                  </p>
                </CardContent>
              </GameSurfaceCard>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
