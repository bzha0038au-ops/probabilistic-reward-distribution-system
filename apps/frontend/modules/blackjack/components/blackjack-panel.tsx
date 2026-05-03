"use client";

import { startTransition, useEffect, useState } from "react";
import type { DealerEvent } from "@reward/shared-types/dealer";
import type {
  BlackjackAction,
  BlackjackCardView,
  BlackjackGame,
  BlackjackGameStatus,
  BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";
import { BLACKJACK_CONFIG } from "@reward/shared-types/blackjack";
import type { PlayModeType } from "@reward/shared-types/play-mode";
import {
  applyDealerEventFeed,
  createDealerRealtimeClient,
} from "@reward/user-core";

import { DealerFeed } from "@/components/dealer-feed";
import { PlayModeSwitcher } from "@/components/play-mode-switcher";
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
const realtimeApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000";

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
      "Blackjack on a shared table where an AI dealer sits across from the player while the shared wallet and prize-pool ledger settle every hand.",
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
    effectiveStake: "Total stake",
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
    tableTitle: "Same-table seating",
    tableId: "Table",
    seat: "Seat",
    aiDealer: "AI dealer",
    you: "You",
    dealerFeedTitle: "Dealer commentary",
    dealerFeedEmpty: "The dealer will narrate the hand here once the cards are moving.",
    dealerAiTag: "AI",
    dealerRuleTag: "Rule",
    potentialReturn: "Potential return",
    splitHands: "Split hands",
    tableRulesTitle: "Table rules",
    stageTitle: "Table view",
    stakeDockTitle: "Seat the next hand",
    stageHint:
      "Set the stake, review the table rules, then open the next hand from the dock below.",
  },
  "zh-CN": {
    title: "二十一点",
    description:
      "二十一点现在显式接入同桌 AI 智能荷官，牌局仍然复用共享钱包、奖池和账本结算。",
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
    effectiveStake: "总下注",
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
    tableTitle: "同桌席位",
    tableId: "桌号",
    seat: "座位",
    aiDealer: "AI 智能荷官",
    you: "你",
    dealerFeedTitle: "荷官播报",
    dealerFeedEmpty: "发牌后，智能荷官会在这里播报动作、节奏和简短解说。",
    dealerAiTag: "AI",
    dealerRuleTag: "规则",
    potentialReturn: "潜在回报",
    splitHands: "分牌手牌",
    tableRulesTitle: "牌桌规则",
    stageTitle: "牌桌视图",
    stakeDockTitle: "开启下一手",
    stageHint: "先设置下注、查看牌桌规则，再从下方控制坞发起下一手牌局。",
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

function getActionLabel(
  locale: keyof typeof copy,
  action: BlackjackAction,
) {
  const c = copy[locale];
  return action === "hit"
    ? c.hit
    : action === "stand"
      ? c.stand
      : action === "double"
        ? c.double
        : c.split;
}

function getActionTone(action: BlackjackAction) {
  switch (action) {
    case "stand":
      return "border-[var(--retro-ink)] bg-[#ffd7d2] text-[var(--retro-ink)] hover:bg-[#ffc5bd]";
    case "hit":
      return "border-[var(--retro-ink)] bg-[var(--retro-orange)] text-[var(--retro-ivory)] hover:bg-[var(--retro-orange-soft)]";
    case "split":
      return "border-[var(--retro-ink)] bg-[#a6a1ff] text-[var(--retro-ivory)] hover:bg-[#928cff]";
    case "double":
      return "border-[var(--retro-ink)] bg-[rgba(255,255,255,0.92)] text-[var(--retro-orange)] hover:bg-white";
    default:
      return "border-[var(--retro-ink)] bg-white text-[var(--retro-ink)]";
  }
}

function formatProjectedReturn(
  stakeAmount: string,
  multiplier: string,
) {
  const stake = Number(stakeAmount);
  const payoutMultiplier = Number(multiplier);

  if (!Number.isFinite(stake) || !Number.isFinite(payoutMultiplier)) {
    return "0.00";
  }

  return (stake * payoutMultiplier).toFixed(2);
}

function CardFace(props: {
  card: BlackjackCardView;
  hiddenLabel: string;
  className?: string;
}) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <div
      className={cn(
        "flex h-36 w-24 flex-col justify-between rounded-[1.35rem] border-2 p-3 text-left shadow-[6px_6px_0px_0px_rgba(15,17,31,0.32)]",
        hidden
          ? "border-[#202745] bg-[linear-gradient(180deg,rgba(17,23,45,0.98),rgba(9,11,27,1))] text-slate-500"
          : "border-[var(--retro-ink)] bg-[var(--retro-ivory)] text-slate-950",
        !hidden && isRedSuit(props.card) ? "text-rose-600" : null,
        props.className,
      )}
    >
      {hidden ? (
        <div className="flex h-full items-center justify-center text-center text-xs font-semibold tracking-[0.24em] text-slate-500">
          {props.hiddenLabel}
        </div>
      ) : (
        <>
          <span className="text-xl font-bold leading-none">{props.card.rank}</span>
          <span className="self-end text-2xl">{suit}</span>
        </>
      )}
    </div>
  );
}

function cardRotation(index: number, total: number, reversed = false) {
  const midpoint = (total - 1) / 2;
  const direction = reversed ? -1 : 1;
  return (index - midpoint) * 7 * direction;
}

function TableCardFan(props: {
  cards: BlackjackCardView[];
  hiddenLabel: string;
  reversed?: boolean;
}) {
  return (
    <div className="flex min-h-[12rem] items-end justify-center">
      {props.cards.map((card, index) => (
        <div
          key={`${card.rank ?? "hidden"}-${card.suit ?? "unknown"}-${index}`}
          className={cn("relative", index === 0 ? "" : "-ml-7")}
          style={{
            transform: `rotate(${cardRotation(index, props.cards.length, props.reversed)}deg) translateY(${Math.abs(
              cardRotation(index, props.cards.length, props.reversed),
            ) * 0.6}px)`,
            zIndex: index + 1,
          }}
        >
          <CardFace card={card} hiddenLabel={props.hiddenLabel} />
        </div>
      ))}
    </div>
  );
}

function TableScorePill(props: {
  label: string;
  scoreLabel: string;
  scoreValue: string | number;
  accent: "dealer" | "player";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border-2 px-6 py-2 shadow-[6px_6px_0px_0px_rgba(15,17,31,0.28)]",
        props.accent === "player"
          ? "border-[var(--retro-ink)] bg-[var(--retro-orange)] text-[var(--retro-ivory)]"
          : "border-[var(--retro-ink)] bg-[rgba(255,255,255,0.92)] text-[var(--retro-ink)]",
      )}
    >
      <span className="text-[1.45rem] font-semibold uppercase tracking-[0.14em]">
        {props.label}
      </span>
      <span
        className={cn(
          "grid min-h-[2.75rem] min-w-[2.75rem] place-items-center rounded-full border-2 px-3 text-lg font-semibold",
          props.accent === "player"
            ? "border-[var(--retro-ink)] bg-[rgba(255,255,255,0.92)] text-[var(--retro-orange)]"
            : "border-[rgba(184,75,9,0.24)] bg-[#ffe6dd] text-[var(--retro-orange)]",
        )}
      >
        {props.scoreValue}
      </span>
      <span className="sr-only">
        {props.scoreLabel}: {props.scoreValue}
      </span>
    </div>
  );
}

function TableStatusRibbon(props: {
  locale: keyof typeof copy;
  game: BlackjackGame;
}) {
  const c = copy[props.locale];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-[rgba(15,17,31,0.14)] bg-white/74 px-4 py-3 text-sm text-[rgba(15,17,31,0.68)]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            statusTone[props.game.status],
          )}
        >
          {getStatusLabel(props.locale, props.game.status)}
        </span>
        {props.game.linkedGroup ? (
          <span className="rounded-full border border-[rgba(15,17,31,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,17,31,0.56)]">
            {c.hand} {props.game.linkedGroup.executionIndex}/{props.game.linkedGroup.executionCount}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,17,31,0.48)]">
        <span>
          {c.tableId}: {props.game.table.tableId}
        </span>
        <span>
          {c.currentBet}: {formatAmount(props.game.totalStake)}
        </span>
      </div>
    </div>
  );
}

function SplitHandSummary(props: {
  locale: keyof typeof copy;
  hand: BlackjackGame["playerHands"][number];
}) {
  const c = copy[props.locale];
  const totalValue = props.hand.total ?? props.hand.visibleTotal ?? "—";

  return (
    <div
      className={cn(
        "rounded-[1.4rem] border-2 p-4 transition-colors",
        props.hand.active
          ? "border-[var(--retro-gold)] bg-[rgba(255,213,61,0.08)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.45)]"
          : "border-[#202745] bg-[rgba(7,10,23,0.72)]",
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
            <span className="rounded-full border-2 border-[#202745] bg-[rgba(9,11,27,0.58)] px-3 py-1 text-xs text-slate-200">
              {c.currentBet}: {formatAmount(props.hand.stakeAmount)}
            </span>
          </div>
        </div>
        <span className="rounded-full border-2 border-[#202745] bg-[rgba(9,11,27,0.58)] px-3 py-1 text-xs font-medium text-slate-200">
          {c.total}: {totalValue}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {props.hand.cards.map((card, index) => (
          <CardFace
            key={`${props.hand.index}-${card.rank ?? "hidden"}-${card.suit ?? "unknown"}-${index}`}
            card={card}
            hiddenLabel={c.hidden}
            className="h-28 w-20 rounded-[1.15rem] text-base shadow-[4px_4px_0px_0px_rgba(15,17,31,0.24)]"
          />
        ))}
      </div>
    </div>
  );
}

function getTableSeatLabel(
  locale: keyof typeof copy,
  seat: BlackjackGame["table"]["seats"][number],
) {
  const c = copy[locale];
  const occupant =
    seat.role === "dealer" && seat.participantType === "ai_robot"
      ? c.aiDealer
      : seat.isSelf
        ? c.you
        : c.player;

  return `${occupant} · ${c.seat} ${seat.seatIndex + 1}`;
}

function TableBlock(props: {
  locale: keyof typeof copy;
  game: BlackjackGame;
}) {
  const c = copy[props.locale];

  return (
    <div className="retro-panel-dark rounded-[1.45rem] border-none p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-100">{c.tableTitle}</p>
          <p className="text-xs text-slate-400">
            {c.tableId}: {props.game.table.tableId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.game.table.seats.map((seat) => (
            <span
              key={`${props.game.table.tableId}-${seat.participantId}-${seat.seatIndex}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                seat.role === "dealer"
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700 text-slate-300",
              )}
            >
              {getTableSeatLabel(props.locale, seat)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const appendDealerEventToOverview = (params: {
  currentOverview: BlackjackOverviewResponse | null;
  event: DealerEvent;
}) => {
  if (!params.currentOverview) {
    return params.currentOverview;
  }

  const activeGames =
    params.currentOverview.activeGames.length > 0
      ? params.currentOverview.activeGames
      : params.currentOverview.activeGame
        ? [params.currentOverview.activeGame]
        : [];
  if (activeGames.length === 0) {
    return params.currentOverview;
  }

  let updated = false;
  const nextActiveGames = activeGames.map((game) => {
    const matchesActiveGame =
      params.event.referenceId === game.id ||
      params.event.tableRef === game.table.tableId ||
      params.event.tableRef === `blackjack:${game.id}`;
    if (!matchesActiveGame) {
      return game;
    }

    updated = true;
    return {
      ...game,
      dealerEvents: applyDealerEventFeed({
        currentEvents: game.dealerEvents,
        event: params.event,
      }),
    };
  });
  if (!updated) {
    return params.currentOverview;
  }

  return {
    ...params.currentOverview,
    activeGames: nextActiveGames,
    activeGame: nextActiveGames[0] ?? null,
  } satisfies BlackjackOverviewResponse;
};

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
  const [updatingPlayMode, setUpdatingPlayMode] = useState(false);
  const [actingAction, setActingAction] = useState<{
    gameId: number | null;
    action: BlackjackAction | "start";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentConfig = overview?.config ?? BLACKJACK_CONFIG;
  const activeGames = overview
    ? overview.activeGames.length > 0
      ? overview.activeGames
      : overview.activeGame
        ? [overview.activeGame]
        : []
    : [];
  const effectiveStakePreview = (() => {
    const numericStake = Number(stakeAmount || "0");
    if (!Number.isFinite(numericStake)) {
      return null;
    }
    return (
      numericStake * (overview?.playMode.appliedMultiplier ?? 1)
    ).toFixed(2);
  })();
  const projectedStakeReturn = effectiveStakePreview
    ? formatProjectedReturn(
        effectiveStakePreview,
        currentConfig.winPayoutMultiplier,
      )
    : null;

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

  useEffect(() => {
    let disposed = false;

    const client = createDealerRealtimeClient({
      baseUrl: realtimeApiBaseUrl,
      getAuthToken: async () => {
        const tokenResponse = await browserUserApiClient.getUserRealtimeToken();
        if (!tokenResponse.ok) {
          if (tokenResponse.status === 401) {
            return null;
          }

          throw new Error(tokenResponse.error.message);
        }

        return tokenResponse.data.token;
      },
      onDealerEvent: (event) => {
        if (disposed) {
          return;
        }

        startTransition(() => {
          setOverview((currentOverview) =>
            appendDealerEventToOverview({
              currentOverview,
              event,
            }),
          );
        });
      },
      onUnauthorized: () => {
        if (!disposed) {
          setError("Session expired or was revoked. Refresh and sign in again.");
        }
      },
      onWarning: (warning) => {
        if (!disposed) {
          setError(warning);
        }
      },
    });

    client.start();
    return () => {
      disposed = true;
      client.stop();
    };
  }, []);

  async function handleChangePlayMode(type: PlayModeType) {
    if (!overview || updatingPlayMode) {
      return;
    }

    setUpdatingPlayMode(true);
    const response = await browserUserApiClient.setPlayMode("blackjack", { type });
    setUpdatingPlayMode(false);

    if (!response.ok) {
      setError(response.error?.message ?? t("draw.errorFallback"));
      return;
    }

    startTransition(() => {
      setOverview((current) =>
        current
          ? {
              ...current,
              playMode: response.data.snapshot,
            }
          : current,
      );
    });
  }

  async function handleStart() {
    if (!stakeAmount.trim()) {
      setError(c.invalidStake);
      return;
    }

    setLoading(true);
    setActingAction({ gameId: null, action: "start" });
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

  async function handleAction(gameId: number, action: BlackjackAction) {
    if (!activeGames.some((game) => game.id === gameId)) {
      return;
    }

    setLoading(true);
    setActingAction({ gameId, action });
    setError(null);

    const response = await browserUserApiClient.actOnBlackjack(gameId, { action });

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
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-[1.95rem] border-none bg-transparent shadow-none">
        <div className="relative overflow-hidden rounded-[1.95rem] border-2 border-[var(--retro-ink)] bg-[linear-gradient(180deg,rgba(253,249,244,0.98),rgba(244,238,231,0.98))] shadow-[8px_8px_0px_0px_rgba(15,17,31,0.94)]">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-20" />

          <CardHeader className="relative space-y-5 p-5 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="retro-panel flex items-center gap-4 rounded-[1.35rem] border-none px-4 py-4">
                <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-orange)] text-xl font-black text-[var(--retro-ivory)]">
                  $
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.56)]">
                    {c.balance}
                  </p>
                  <p className="text-2xl font-semibold text-[var(--retro-orange)]">
                    {formatAmount(overview?.balance ?? "0")}
                  </p>
                </div>
              </div>

              {overview ? (
                <div className="retro-panel flex items-center gap-3 rounded-[1.35rem] border-none px-4 py-4">
                  <div className="grid h-11 w-11 place-items-center rounded-full border border-[rgba(97,88,255,0.28)] bg-[rgba(97,88,255,0.14)] text-[var(--retro-violet)]">
                    ◌
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.56)]">
                      {c.fairness}
                    </p>
                    <p className="text-sm font-medium text-[rgba(15,17,31,0.7)]">
                      {shortenCommitHash(overview.fairness.commitHash)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <CardTitle className="text-[2.7rem] leading-[0.94] tracking-[-0.05em] text-[var(--retro-ink)] md:text-[4.1rem]">
                {c.title}
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.7)]">
                {c.description}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="relative space-y-6 p-5 pt-0 md:p-8 md:pt-0">
            {disabledReason ? (
              <p className="rounded-[1rem] border-2 border-[var(--retro-gold)] bg-[#fff2bf] px-3 py-2 text-sm text-[var(--retro-ink)]">
                {disabledReason}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-3 py-2 text-sm text-[var(--retro-ink)]">
                {error}
              </p>
            ) : null}

            {activeGames.length === 0 ? (
              <div className="space-y-5">
                <div
                  className="rounded-[1.85rem] border border-[rgba(15,17,31,0.14)] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.94),rgba(247,240,233,0.98))] px-5 py-8 md:px-8 md:py-10"
                  data-testid="blackjack-table-stage"
                >
                  <div className="flex min-h-[38rem] flex-col items-center justify-between">
                    <div className="space-y-4 text-center">
                      <TableScorePill
                        label={c.dealer}
                        scoreLabel={c.visibleTotal}
                        scoreValue="?"
                        accent="dealer"
                      />
                      <div className="flex min-h-[12rem] items-end justify-center gap-0">
                        {[0, 1].map((index) => (
                          <div
                            key={`idle-dealer-${index}`}
                            className={index === 0 ? "" : "-ml-7"}
                            style={{
                              transform: `rotate(${index === 0 ? -7 : 6}deg) translateY(${index === 0 ? 8 : 0}px)`,
                              zIndex: index + 1,
                            }}
                          >
                            <CardFace
                              card={{ rank: null, suit: null, hidden: true }}
                              hiddenLabel={c.hidden}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 text-center">
                      <div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-orange)] text-[var(--retro-ivory)] shadow-[8px_8px_0px_0px_rgba(15,17,31,0.94)]">
                        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] opacity-80">
                          {c.currentBet}
                        </span>
                        <span className="mt-2 text-[2rem] font-semibold leading-none">
                          {effectiveStakePreview ? formatAmount(effectiveStakePreview) : "0.00"}
                        </span>
                      </div>
                      {projectedStakeReturn ? (
                        <div className="inline-flex items-center gap-2 rounded-[0.8rem] border border-[rgba(184,75,9,0.16)] bg-white/78 px-4 py-2 text-sm text-[rgba(15,17,31,0.68)]">
                          <span>{c.potentialReturn}:</span>
                          <span className="font-semibold text-[var(--retro-violet)]">
                            {formatAmount(projectedStakeReturn)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4 text-center">
                      <div className="flex min-h-[12rem] items-end justify-center gap-0">
                        {[0, 1].map((index) => (
                          <div
                            key={`idle-player-${index}`}
                            className={index === 0 ? "" : "-ml-7"}
                            style={{
                              transform: `rotate(${index === 0 ? -6 : 7}deg) translateY(${index === 0 ? 0 : 8}px)`,
                              zIndex: index + 1,
                            }}
                          >
                            <CardFace
                              card={{ rank: null, suit: null, hidden: true }}
                              hiddenLabel={c.hidden}
                            />
                          </div>
                        ))}
                      </div>
                      <TableScorePill
                        label={c.you}
                        scoreLabel={c.total}
                        scoreValue="?"
                        accent="player"
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="mx-auto w-full max-w-4xl rounded-[1.8rem] border-2 border-[var(--retro-ink)] bg-[rgba(255,255,255,0.72)] p-4 shadow-[8px_8px_0px_0px_rgba(15,17,31,0.94)]"
                  data-testid="blackjack-action-dock"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.56)]">
                    {c.stakeDockTitle}
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-[var(--retro-ink)]">
                        {c.stake}
                      </label>
                      <Input
                        value={stakeAmount}
                        onChange={(event) => setStakeAmount(event.target.value)}
                        inputMode="decimal"
                        placeholder={currentConfig.minStake}
                        className="retro-field h-12"
                      />
                      <div className="flex flex-wrap gap-2 text-xs text-[rgba(15,17,31,0.58)]">
                        <span>
                          {c.minStake} {currentConfig.minStake}
                        </span>
                        <span>•</span>
                        <span>
                          {c.maxStake} {currentConfig.maxStake}
                        </span>
                        {effectiveStakePreview ? (
                          <>
                            <span>•</span>
                            <span>
                              {c.effectiveStake}: {formatAmount(effectiveStakePreview)}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <p className="text-sm text-[rgba(15,17,31,0.62)]">
                        {c.stageHint}
                      </p>
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleStart}
                        disabled={loading || disabled}
                        variant="arcadeDark"
                        className="h-14 w-full"
                      >
                        {actingAction?.action === "start" ? c.starting : c.start}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-[rgba(15,17,31,0.54)]">{c.noActive}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {activeGames.map((game) => {
                  const primaryHand =
                    game.playerHands.find((hand) => hand.active) ??
                    (game.activeHandIndex !== null
                      ? game.playerHands[game.activeHandIndex]
                      : null) ??
                    game.playerHands[0];
                  const splitHands = game.playerHands.filter(
                    (hand) => hand.index !== primaryHand.index,
                  );
                  const dealerTotalLabel =
                    game.dealerHand.total === null ? c.visibleTotal : c.total;
                  const dealerTotalValue =
                    game.dealerHand.total ?? game.dealerHand.visibleTotal ?? "—";
                  const playerTotalValue =
                    primaryHand.total ?? primaryHand.visibleTotal ?? "—";
                  const projectedReturn = formatProjectedReturn(
                    game.totalStake,
                    currentConfig.winPayoutMultiplier,
                  );
                  const actionOrder: BlackjackAction[] = [
                    "stand",
                    "hit",
                    "split",
                    "double",
                  ];

                  return (
                    <article key={game.id} className="space-y-5">
                      <TableStatusRibbon locale={locale} game={game} />

                      <div
                        className="rounded-[1.85rem] border border-[rgba(15,17,31,0.14)] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.94),rgba(247,240,233,0.98))] px-5 py-8 md:px-8 md:py-10"
                        data-testid="blackjack-table-stage"
                      >
                        <div className="flex min-h-[40rem] flex-col items-center justify-between gap-6">
                          <div className="space-y-4 text-center">
                            <TableScorePill
                              label={c.dealer}
                              scoreLabel={dealerTotalLabel}
                              scoreValue={dealerTotalValue}
                              accent="dealer"
                            />
                            <TableCardFan
                              cards={game.dealerHand.cards}
                              hiddenLabel={c.hidden}
                              reversed
                            />
                          </div>

                          <div className="space-y-4 text-center">
                            <div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-orange)] text-[var(--retro-ivory)] shadow-[8px_8px_0px_0px_rgba(15,17,31,0.94)]">
                              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] opacity-80">
                                {c.currentBet}
                              </span>
                              <span className="mt-2 text-[2rem] font-semibold leading-none">
                                {formatAmount(game.totalStake)}
                              </span>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-[0.8rem] border border-[rgba(184,75,9,0.16)] bg-white/78 px-4 py-2 text-sm text-[rgba(15,17,31,0.68)]">
                              <span>{c.potentialReturn}:</span>
                              <span className="font-semibold text-[var(--retro-violet)]">
                                {formatAmount(projectedReturn)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-4 text-center">
                            <TableCardFan
                              cards={primaryHand.cards}
                              hiddenLabel={c.hidden}
                            />
                            <TableScorePill
                              label={c.you}
                              scoreLabel={c.total}
                              scoreValue={playerTotalValue}
                              accent="player"
                            />
                          </div>
                        </div>
                      </div>

                      {splitHands.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(15,17,31,0.56)]">
                            {c.splitHands}
                          </p>
                          <div className="grid gap-4 lg:grid-cols-2">
                            {splitHands.map((hand) => (
                              <SplitHandSummary
                                key={`${game.id}-${hand.index}`}
                                locale={locale}
                                hand={hand}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div
                        className="mx-auto w-full max-w-5xl rounded-[1.8rem] border-2 border-[var(--retro-ink)] bg-[rgba(255,255,255,0.72)] p-4 shadow-[8px_8px_0px_0px_rgba(15,17,31,0.94)]"
                        data-testid="blackjack-action-dock"
                      >
                        <div className="grid gap-3 md:grid-cols-4">
                          {actionOrder.map((action) => {
                            const enabled = game.availableActions.includes(action);
                            return (
                              <button
                                key={`${game.id}-${action}`}
                                type="button"
                                onClick={() => void handleAction(game.id, action)}
                                disabled={!enabled || loading || disabled}
                                className={cn(
                                  "rounded-[1.2rem] border-2 px-4 py-5 text-center shadow-[4px_4px_0px_0px_rgba(15,17,31,0.94)] transition-[transform,background-color,box-shadow,opacity]",
                                  getActionTone(action),
                                  enabled && !loading && !disabled
                                    ? "hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(15,17,31,0.94)]"
                                    : "cursor-not-allowed opacity-45",
                                )}
                              >
                                <span className="block text-[1.65rem] font-semibold uppercase tracking-[0.08em]">
                                  {actingAction?.gameId === game.id &&
                                  actingAction.action === action
                                    ? "..."
                                    : getActionLabel(locale, action)}
                                </span>
                                <span className="mt-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] opacity-75">
                                  {c.actions}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <DealerFeed
                        aiLabel={c.dealerAiTag}
                        dealerLabel={c.aiDealer}
                        emptyLabel={c.dealerFeedEmpty}
                        events={game.dealerEvents}
                        ruleLabel={c.dealerRuleTag}
                        title={c.dealerFeedTitle}
                      />
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
        <Card className="retro-panel-dark rounded-[1.8rem] border-none">
          <CardHeader>
            <CardTitle className="text-[1.6rem] text-white">
              {c.tableRulesTitle}
            </CardTitle>
            <CardDescription className="text-slate-300">
              {c.stageTitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <PlayModeSwitcher
              gameKey="blackjack"
              snapshot={overview?.playMode ?? null}
              disabled={loading || disabled || activeGames.length > 0}
              loading={updatingPlayMode}
              onSelect={(type) => void handleChangePlayMode(type)}
            />

            {activeGames.length > 0 ? (
              <TableBlock locale={locale} game={activeGames[0]!} />
            ) : null}

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.minStake}: {currentConfig.minStake}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.maxStake}: {currentConfig.maxStake}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.natural}: {currentConfig.naturalPayoutMultiplier}x
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.dealerRule}:{" "}
                {currentConfig.dealerHitsSoft17 ? c.hitSoft17 : c.standSoft17}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.doubleRule}:{" "}
                {formatToggle(locale, currentConfig.doubleDownAllowed)}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.splitAcesRule}:{" "}
                {formatToggle(locale, currentConfig.splitAcesAllowed)}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.hitSplitAcesRule}:{" "}
                {formatToggle(locale, currentConfig.hitSplitAcesAllowed)}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.resplitRule}:{" "}
                {formatToggle(locale, currentConfig.resplitAllowed)}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.maxSplitHands}: {currentConfig.maxSplitHands}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.tenValueSplitRule}:{" "}
                {formatToggle(locale, currentConfig.splitTenValueCardsAllowed)}
              </span>
              <span className="rounded-full border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-slate-300">
                {c.singleHand}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="retro-panel-dark rounded-[1.8rem] border-none">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[1.6rem] text-white">{c.recent}</CardTitle>
              {overview?.recentGames.length ? (
                <span className="text-xs text-slate-400">{overview.recentGames.length}</span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {overview?.recentGames.length ? (
              <div className="grid gap-3">
                {overview.recentGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] border-2 border-[#202745] bg-[rgba(7,10,23,0.72)] px-4 py-3"
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
                        {c.points} P {formatPlayerTotals(game)} / D {game.dealerTotal}
                      </span>
                      <span className="font-medium text-emerald-200">
                        {c.payout} {formatAmount(game.payoutAmount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">{c.noRecent}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
