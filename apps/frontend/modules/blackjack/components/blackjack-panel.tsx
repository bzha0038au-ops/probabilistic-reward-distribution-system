"use client";

import { startTransition, useEffect, useState } from "react";
import type {
  BlackjackAction,
  BlackjackCardView,
  BlackjackGame,
  BlackjackGameStatus,
  BlackjackMutationResponse,
  BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";
import { BLACKJACK_CONFIG } from "@reward/shared-types/blackjack";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, useTranslations } from "@/components/i18n-provider";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

const statusTone = {
  active: "border-sky-400/30 bg-sky-400/10 text-sky-100",
  player_blackjack: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  dealer_blackjack: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  player_bust: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  dealer_bust: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  player_win: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  dealer_win: "border-slate-400/30 bg-slate-400/10 text-slate-100",
  push: "border-amber-300/30 bg-amber-300/10 text-amber-100",
} as const;

const copy = {
  en: {
    title: "Blackjack",
    description:
      "Classic player-vs-dealer blackjack with split support on the shared wallet and prize-pool ledger.",
    balance: "Current balance",
    fairness: "Fairness commit",
    minStake: "Min stake",
    maxStake: "Max stake",
    natural: "Natural payout",
    dealerRule: "Dealer rule",
    doubleRule: "Double",
    splitAcesRule: "Split aces",
    hitSplitAcesRule: "Hit split aces",
    resplitRule: "Re-split",
    tenValueSplitRule: "10-value split",
    maxSplitHands: "Max split hands",
    hitSoft17: "Hit soft 17",
    standSoft17: "Stand on all 17s",
    singleHand: "One active table at a time",
    stake: "Stake amount",
    start: "Start hand",
    starting: "Opening hand...",
    dealer: "Dealer",
    player: "Player",
    visibleTotal: "Visible total",
    total: "Total",
    actions: "Actions",
    hit: "Hit",
    stand: "Stand",
    double: "Double",
    split: "Split",
    acting: "Settling...",
    recent: "Recent hands",
    noRecent: "No completed hands yet.",
    noActive: "No active hand. Enter a stake to deal the next round.",
    hidden: "Hidden",
    invalidStake: "Enter a valid stake amount.",
    payout: "Payout",
    points: "Points",
    hand: "Hand",
    currentBet: "Bet",
  },
  "zh-CN": {
    title: "二十一点",
    description:
      "经典庄闲二十一点，支持分牌并直接复用共享钱包、奖池和账本结算。",
    balance: "当前余额",
    fairness: "公平性提交",
    minStake: "最小下注",
    maxStake: "最大下注",
    natural: "天生二十一点赔付",
    dealerRule: "庄家规则",
    doubleRule: "加倍",
    splitAcesRule: "拆 A",
    hitSplitAcesRule: "拆 A 后要牌",
    resplitRule: "重复分牌",
    tenValueSplitRule: "10-value 等价分牌",
    maxSplitHands: "最大分牌手数",
    hitSoft17: "soft 17 继续要牌",
    standSoft17: "所有 17 点停牌",
    singleHand: "同一时间仅允许一局进行中",
    stake: "下注金额",
    start: "开始发牌",
    starting: "正在开局...",
    dealer: "庄家",
    player: "玩家",
    visibleTotal: "可见点数",
    total: "总点数",
    actions: "操作",
    hit: "要牌",
    stand: "停牌",
    double: "加倍",
    split: "分牌",
    acting: "正在结算...",
    recent: "最近牌局",
    noRecent: "还没有已结算牌局。",
    noActive: "当前没有进行中的牌局，输入下注金额后即可开始。",
    hidden: "暗牌",
    invalidStake: "请输入合法的下注金额。",
    payout: "派奖",
    points: "点数",
    hand: "手牌",
    currentBet: "当前下注",
  },
} as const;

type BlackjackPanelProps = {
  disabled?: boolean;
  disabledReason?: string | null;
  onBalanceChange?: (balance: string) => void;
  onRoundComplete?: () => void;
};

function shortenCommitHash(value: string) {
  return value.length > 16
    ? `${value.slice(0, 8)}...${value.slice(-6)}`
    : value;
}

function isRedSuit(card: BlackjackCardView) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function formatAmount(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatToggle(locale: keyof typeof copy, enabled: boolean) {
  if (locale === "zh-CN") {
    return enabled ? "开启" : "关闭";
  }

  return enabled ? "On" : "Off";
}

function formatPlayerTotals(game: {
  playerTotals?: number[];
  playerTotal: number;
}) {
  if (Array.isArray(game.playerTotals) && game.playerTotals.length > 0) {
    return game.playerTotals.join(" / ");
  }

  return String(game.playerTotal);
}

function getStatusLabel(
  locale: keyof typeof copy,
  status: BlackjackGameStatus,
) {
  const labels = {
    en: {
      active: "Active",
      player_blackjack: "Blackjack",
      dealer_blackjack: "Dealer blackjack",
      player_bust: "Bust",
      dealer_bust: "Dealer bust",
      player_win: "Win",
      dealer_win: "Dealer win",
      push: "Push",
    },
    "zh-CN": {
      active: "进行中",
      player_blackjack: "天生二十一点",
      dealer_blackjack: "庄家天生二十一点",
      player_bust: "爆牌",
      dealer_bust: "庄家爆牌",
      player_win: "获胜",
      dealer_win: "庄家获胜",
      push: "平局",
    },
  } as const;

  return labels[locale][status];
}

function getPlayerHandStateLabel(
  locale: keyof typeof copy,
  state: BlackjackGame["playerHands"][number]["state"],
) {
  const labels = {
    en: {
      active: "Active",
      waiting: "Waiting",
      stood: "Standing",
      bust: "Bust",
      win: "Win",
      lose: "Lose",
      push: "Push",
    },
    "zh-CN": {
      active: "当前手",
      waiting: "待处理",
      stood: "已停牌",
      bust: "爆牌",
      win: "获胜",
      lose: "输牌",
      push: "平局",
    },
  } as const;

  return labels[locale][state];
}

const playerHandTone = {
  active: "border-cyan-400/35 bg-cyan-400/10 text-cyan-100",
  waiting: "border-slate-700 bg-slate-900/80 text-slate-300",
  stood: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  bust: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  win: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  lose: "border-slate-700 bg-slate-900/80 text-slate-300",
  push: "border-amber-300/30 bg-amber-300/10 text-amber-100",
} as const;

function CardFace(props: { card: BlackjackCardView; hiddenLabel: string }) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <div
      className={cn(
        "flex h-24 w-16 flex-col justify-between rounded-2xl border p-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.24)]",
        hidden
          ? "border-slate-700 bg-slate-900 text-slate-500"
          : "border-slate-700 bg-white text-slate-950",
        !hidden && isRedSuit(props.card) ? "text-rose-600" : null,
      )}
    >
      {hidden ? (
        <div className="flex h-full items-center justify-center text-center text-xs font-semibold tracking-[0.24em] text-slate-500">
          {props.hiddenLabel}
        </div>
      ) : (
        <>
          <span className="text-sm font-bold">{props.card.rank}</span>
          <span className="self-end text-lg">{suit}</span>
        </>
      )}
    </div>
  );
}

function HandBlock(props: {
  locale: keyof typeof copy;
  label: string;
  hand: BlackjackGame["dealerHand"];
}) {
  const c = copy[props.locale];
  const totalLabel = props.hand.total === null ? c.visibleTotal : c.total;
  const totalValue = props.hand.total ?? props.hand.visibleTotal ?? "—";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-100">{props.label}</p>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
          {totalLabel}: {totalValue}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {props.hand.cards.map((card, index) => (
          <CardFace
            key={`${card.rank ?? "hidden"}-${card.suit ?? "unknown"}-${index}`}
            card={card}
            hiddenLabel={c.hidden}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerHandBlock(props: {
  locale: keyof typeof copy;
  hand: BlackjackGame["playerHands"][number];
}) {
  const c = copy[props.locale];
  const totalValue = props.hand.total ?? props.hand.visibleTotal ?? "—";

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        props.hand.active
          ? "border-cyan-400/45 bg-cyan-400/10"
          : "border-slate-800 bg-slate-900/70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-100">
            {c.hand} {props.hand.index + 1}
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                playerHandTone[props.hand.state],
              )}
            >
              {getPlayerHandStateLabel(props.locale, props.hand.state)}
            </span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {c.currentBet}: {formatAmount(props.hand.stakeAmount)}
            </span>
          </div>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
          {c.total}: {totalValue}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {props.hand.cards.map((card, index) => (
          <CardFace
            key={`${props.hand.index}-${card.rank ?? "hidden"}-${card.suit ?? "unknown"}-${index}`}
            card={card}
            hiddenLabel={c.hidden}
          />
        ))}
      </div>
    </div>
  );
}

export function BlackjackPanel({
  disabled = false,
  disabledReason = null,
  onBalanceChange,
  onRoundComplete,
}: BlackjackPanelProps) {
  const locale = useLocale();
  const t = useTranslations();
  const c = copy[locale];
  const [overview, setOverview] = useState<BlackjackOverviewResponse | null>(
    null,
  );
  const [stakeAmount, setStakeAmount] = useState(BLACKJACK_CONFIG.minStake);
  const [loading, setLoading] = useState(false);
  const [actingAction, setActingAction] = useState<
    BlackjackAction | "start" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const currentConfig = overview?.config ?? BLACKJACK_CONFIG;

  async function refreshOverview() {
    const response = await browserUserApiClient.getBlackjackOverview();
    if (!response.ok) {
      setError(response.error?.message ?? t("draw.errorFallback"));
      return;
    }

    startTransition(() => {
      setOverview(response.data);
      setStakeAmount((current) =>
        current.trim() === "" || current === BLACKJACK_CONFIG.minStake
          ? response.data.config.minStake
          : current,
      );
      onBalanceChange?.(response.data.balance);
      setError(null);
    });
  }

  useEffect(() => {
    void refreshOverview();
  }, []);

  async function handleStart() {
    if (!stakeAmount.trim()) {
      setError(c.invalidStake);
      return;
    }

    setLoading(true);
    setActingAction("start");
    setError(null);

    const response = await browserUserApiClient.startBlackjack({
      stakeAmount: stakeAmount.trim(),
    });

    if (!response.ok) {
      setError(response.error?.message ?? t("draw.errorFallback"));
    } else {
      await refreshOverview();
      onRoundComplete?.();
    }

    setLoading(false);
    setActingAction(null);
  }

  async function handleAction(action: BlackjackAction) {
    if (!overview?.activeGame) {
      return;
    }

    setLoading(true);
    setActingAction(action);
    setError(null);

    const response = await browserUserApiClient.actOnBlackjack(
      overview.activeGame.id,
      { action },
    );

    if (!response.ok) {
      setError(response.error?.message ?? t("draw.errorFallback"));
    } else {
      await refreshOverview();
      onRoundComplete?.();
    }

    setLoading(false);
    setActingAction(null);
  }

  return (
    <Card className="border-slate-800 bg-slate-950/90 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-xl">{c.title}</CardTitle>
            <CardDescription className="max-w-2xl text-slate-400">
              {c.description}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
              {c.balance}: {formatAmount(overview?.balance ?? "0")}
            </span>
            {overview ? (
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-sm text-slate-300">
                {c.fairness}: {shortenCommitHash(overview.fairness.commitHash)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.minStake}: {currentConfig.minStake}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.maxStake}: {currentConfig.maxStake}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.natural}: {currentConfig.naturalPayoutMultiplier}x
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.dealerRule}:{" "}
            {currentConfig.dealerHitsSoft17 ? c.hitSoft17 : c.standSoft17}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.doubleRule}:{" "}
            {formatToggle(locale, currentConfig.doubleDownAllowed)}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.splitAcesRule}:{" "}
            {formatToggle(locale, currentConfig.splitAcesAllowed)}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.hitSplitAcesRule}:{" "}
            {formatToggle(locale, currentConfig.hitSplitAcesAllowed)}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.resplitRule}:{" "}
            {formatToggle(locale, currentConfig.resplitAllowed)}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.maxSplitHands}: {currentConfig.maxSplitHands}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.tenValueSplitRule}:{" "}
            {formatToggle(locale, currentConfig.splitTenValueCardsAllowed)}
          </span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
            {c.singleHand}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!overview?.activeGame ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="max-w-xs flex-1 space-y-2">
                <label className="text-sm font-medium text-slate-100">
                  {c.stake}
                </label>
                <Input
                  value={stakeAmount}
                  onChange={(event) => setStakeAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder={currentConfig.minStake}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
                <p className="text-xs text-slate-400">
                  {c.minStake} {currentConfig.minStake} / {c.maxStake}{" "}
                  {currentConfig.maxStake}
                </p>
              </div>
              <Button
                onClick={handleStart}
                disabled={loading || disabled}
                className="sm:min-w-[10rem]"
              >
                {actingAction === "start" ? c.starting : c.start}
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-400">{c.noActive}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={cn(
                "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                statusTone[overview.activeGame.status],
              )}
            >
              {getStatusLabel(locale, overview.activeGame.status)}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <HandBlock
                locale={locale}
                label={c.dealer}
                hand={overview.activeGame.dealerHand}
              />
              <div className="space-y-4">
                {overview.activeGame.playerHands.map((hand) => (
                  <PlayerHandBlock
                    key={`${overview.activeGame?.id}-${hand.index}`}
                    locale={locale}
                    hand={hand}
                  />
                ))}
              </div>
            </div>

            {overview.activeGame.availableActions.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm font-medium text-slate-100">
                  {c.actions}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {overview.activeGame.availableActions.map((action) => (
                    <Button
                      key={action}
                      type="button"
                      onClick={() => void handleAction(action)}
                      disabled={loading || disabled}
                      variant={action === "double" ? "outline" : "default"}
                      className={
                        action === "double"
                          ? "border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900"
                          : undefined
                      }
                    >
                      {actingAction === action
                        ? c.acting
                        : action === "hit"
                          ? c.hit
                          : action === "stand"
                            ? c.stand
                            : action === "double"
                              ? c.double
                              : c.split}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {disabledReason ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {disabledReason}
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-100">{c.recent}</p>
            {overview?.recentGames.length ? (
              <span className="text-xs text-slate-400">
                {overview.recentGames.length}
              </span>
            ) : null}
          </div>

          {overview?.recentGames.length ? (
            <div className="mt-4 grid gap-3">
              {overview.recentGames.map((game) => (
                <div
                  key={game.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        statusTone[game.status],
                      )}
                    >
                      {getStatusLabel(locale, game.status)}
                    </span>
                    <span className="text-sm text-slate-300">
                      {c.stake} {formatAmount(game.totalStake)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                    <span>
                      {c.points} P {formatPlayerTotals(game)} / D{" "}
                      {game.dealerTotal}
                    </span>
                    <span className="font-medium text-emerald-200">
                      {c.payout} {formatAmount(game.payoutAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{c.noRecent}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
