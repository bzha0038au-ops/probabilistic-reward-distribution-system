"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TbArrowLeft, TbMinus, TbPlus, TbShieldCheck, TbTrophy } from "react-icons/tb";
import {
  HOLD_EM_CREATE_MAX_SEAT_OPTIONS,
  HOLDEM_CONFIG,
  HOLDEM_DEFAULT_PRESENCE_HEARTBEAT_MS,
  HOLDEM_REALTIME_LOBBY_TOPIC,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  holdemTableEmojiValues,
  type HoldemAction,
  type HoldemCardView,
  type HoldemTableMessage,
  type HoldemTable,
  type HoldemTableType,
  type HoldemTableResponse,
  type HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import type { DealerEvent } from "@reward/shared-types/dealer";
import type { PlayModeType } from "@reward/shared-types/play-mode";
import { buildHoldemRealtimeTableTopic } from "@reward/shared-types/holdem";
import type { HandHistory } from "@reward/shared-types/hand-history";
import {
  applyDealerEventFeed,
  applyHoldemTableMessage,
  applyHoldemPrivateRealtimeUpdate,
  applyHoldemRealtimeUpdate,
  createHoldemRealtimeClient,
  type HoldemRealtimeClient,
  type HoldemRealtimeConnectionStatus,
  type HoldemRealtimeObservation,
} from "@reward/user-core";

import { useLocale } from "@/components/i18n-provider";
import { PlayModeSwitcher } from "@/components/play-mode-switcher";
import { DealerFeed } from "@/components/dealer-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import { HoldemReplayDetail } from "@/modules/holdem/components/holdem-replay-detail";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;
const HOLDEM_REALTIME_OBSERVATION_BATCH_SIZE = 20;
const HOLDEM_REALTIME_OBSERVATION_FLUSH_INTERVAL_MS = 5_000;
const HOLDEM_REALTIME_OBSERVATION_MAX_PENDING = 100;
const DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT = "1000.00";
const DEFAULT_HOLDEM_TOURNAMENT_PAYOUT_PLACES = "1";
const createableHoldemTableTypes = ["casual", "cash", "tournament"] as const satisfies readonly HoldemTableType[];

const copy = {
  en: {
    title: "Texas Hold'em",
    description:
      "Multiplayer casual bonus-balance tables and cash tables with shared table state, action clocks, and side-pot showdown settlement.",
    lobby: "Lobby",
    createTable: "Create table",
    tableMode: "Table mode",
    tableName: "Table name",
    tableNamePlaceholder: "Optional public table name",
    seats: "Seats",
    botPlayers: "Bot seats",
    botBuyIn: "Bot buy-in",
    buyIn: "Buy-in",
    effectiveBuyIn: "Effective buy-in",
    tournamentStartingStack: "Starting stack",
    tournamentPayoutPlaces: "Payout places",
    casualTableHint:
      "Casual tables use bonus balance, do not charge rake, and do not require KYC.",
    casualBotHint:
      "Seat-level bots are casual-only. They occupy real opponent seats, never control dealing randomness, and auto-act until action returns to a human seat.",
    cashTableHint: "Cash tables use withdrawable balance and the live rake policy.",
    tournamentTableHint:
      "Tournament tables freeze buy-ins into a pooled prize pool, seat every entry with the same starting stack, and only settle prizes after elimination order is final.",
    tournamentPayoutPlacesHint:
      "Final payout slots are capped to the actual registration count, up to three places.",
    create: "Create and sit",
    createBusy: "Opening table...",
    join: "Join table",
    joinBusy: "Buying in...",
    leave: "Leave table",
    leaveBusy: "Cashing out...",
    sitOut: "Sit out",
    sitOutBusy: "Sitting out...",
    sitIn: "Sit back in",
    sitInBusy: "Returning to table...",
    start: "Start hand",
    startBusy: "Shuffling...",
    refresh: "Refresh",
    loading: "Loading tables...",
    noTables: "No tables yet. Open the first table from the left rail.",
    players: "Players",
    blinds: "Blinds",
    tableType: "Table type",
    cashTable: "Cash",
    casualTable: "Casual",
    tournamentTable: "Tournament",
    rakePolicy: "Rake",
    rakeCap: "cap",
    rakeNone: "No rake",
    rakeNoFlopNoDrop: "No flop, no drop",
    statusWaiting: "Waiting for players",
    statusActive: "Hand in progress",
    board: "Board",
    table: "Table",
    action: "Action",
    toCall: "To call",
    minRaiseTo: "Min raise to",
    stack: "Stack",
    committed: "In pot",
    totalCommitted: "Total invested",
    recentHands: "Recent hands",
    noRecentHands: "No settled hands yet.",
    hero: "You",
    openSeat: "Open seat",
    dealer: "Dealer",
    bot: "Bot",
    smallBlind: "SB",
    bigBlind: "BB",
    turn: "Turn",
    waitingSeat: "Waiting",
    sittingOutSeat: "Sitting out",
    activeSeat: "Live",
    foldedSeat: "Folded",
    allInSeat: "All-in",
    fold: "Fold",
    check: "Check",
    call: "Call",
    bet: "Bet",
    raise: "Raise",
    allIn: "All-in",
    amountHint:
      "For bet and raise, enter the total amount you want your seat committed to on this street.",
    emptySelection: "Pick or create a table to see the felt view.",
    pot: "Pot",
    winners: "Winners",
    fairness: "Fairness commit",
    fairGame: "Fair game",
    actionClock: "Action clock",
    timeBank: "Time bank",
    currentBet: "Current bet",
    betAmount: "Bet amount",
    potentialWin: "Potential win",
    hand: "Hand",
    viewReplay: "Open replay",
    hideReplay: "Hide replay",
    replayLoading: "Loading hand replay...",
    replayFailed: "Failed to load this hand replay.",
    replayDetail: "Replay detail",
    replaySummary: "Replay summary",
    replayTimeline: "Event timeline",
    replayParticipants: "Participants",
    replayStake: "Stake",
    replayPayout: "Payout",
    replayRake: "Rake",
    tableChat: "Table chat",
    tableChatEmpty: "No table chat yet. Seat in and break the silence.",
    tableChatPlaceholder: "Type a table message",
    tableChatSend: "Send",
    tableChatSending: "Sending...",
    tableChatReactions: "Reactions",
    tableChatSeatOnly: "Only seated players can chat or send table reactions.",
    addBots: "Add bots",
    addBotsBusy: "Seating bots...",
    dealerFeedTitle: "Dealer commentary",
    dealerFeedEmpty: "The dealer will call the rhythm here once the hand starts moving.",
    dealerHost: "AI dealer",
    dealerAiTag: "AI",
    dealerRuleTag: "Rule",
    replayStartedAt: "Started",
    replaySettledAt: "Settled",
    stagePreflop: "Preflop",
    stageFlop: "Flop",
    stageTurn: "Turn",
    stageRiver: "River",
    stageShowdown: "Showdown",
    eventHandStarted: "Hand started",
    eventCardsDealt: "Hole cards dealt",
    eventSmallBlindPosted: "Small blind posted",
    eventBigBlindPosted: "Big blind posted",
    eventTurnStarted: "Turn started",
    eventTurnTimedOut: "Turn timed out",
    eventPlayerActed: "Player acted",
    eventBoardRevealed: "Board revealed",
    eventShowdownResolved: "Showdown resolved",
    eventHandWonByFold: "Won by fold",
    eventHandSettled: "Hand settled",
    realtimeConnecting: "Connecting live table feed...",
    realtimeLive: "Live table feed active.",
    realtimeReconnecting: "Reconnecting live table feed...",
    realtimeResyncing: "Reconnected. Syncing authoritative table state...",
  },
  "zh-CN": {
    title: "德州扑克",
    description:
      "多人娱乐局和现金桌，共享桌面状态、行动时钟与边池摊牌结算。",
    lobby: "大厅",
    createTable: "创建牌桌",
    tableMode: "桌型模式",
    tableName: "桌名",
    tableNamePlaceholder: "可选，公开桌名称",
    seats: "人数",
    botPlayers: "人机席位",
    botBuyIn: "人机买入",
    buyIn: "买入金额",
    effectiveBuyIn: "实际买入",
    tournamentStartingStack: "起始筹码",
    tournamentPayoutPlaces: "派奖名次",
    casualTableHint: "娱乐局使用奖励余额买入，不抽水，且不要求 KYC。",
    casualBotHint:
      "seat 级人机仅限娱乐局。它们占真实对手位，不控制发牌随机性，并会自动行动直到轮回真人。",
    cashTableHint: "现金桌使用可提现余额买入，并应用实时抽水策略。",
    tournamentTableHint:
      "锦标赛会把买入汇总进奖池，所有参赛者统一起始筹码，直到淘汰名次确定后才统一派奖。",
    tournamentPayoutPlacesHint:
      "最终派奖名次数会按实际报名人数收口，最多只发到前三名。",
    create: "创建并入座",
    createBusy: "正在开桌...",
    join: "加入牌桌",
    joinBusy: "正在买入...",
    leave: "离桌",
    leaveBusy: "正在退桌...",
    sitOut: "暂离一手",
    sitOutBusy: "正在暂离...",
    sitIn: "回到桌上",
    sitInBusy: "正在恢复入局...",
    start: "开始发牌",
    startBusy: "正在洗牌...",
    refresh: "刷新",
    loading: "正在加载牌桌...",
    noTables: "还没有牌桌。先在左侧创建第一张牌桌。",
    players: "玩家数",
    blinds: "盲注",
    tableType: "桌型",
    cashTable: "现金桌",
    casualTable: "娱乐局",
    tournamentTable: "锦标赛",
    rakePolicy: "抽水",
    rakeCap: "封顶",
    rakeNone: "不抽水",
    rakeNoFlopNoDrop: "未发翻牌不抽水",
    statusWaiting: "等待开局",
    statusActive: "牌局进行中",
    board: "公共牌",
    table: "牌桌",
    action: "操作",
    toCall: "跟注到",
    minRaiseTo: "最小加到",
    stack: "筹码",
    committed: "本街投入",
    totalCommitted: "本手总投入",
    recentHands: "最近牌局",
    noRecentHands: "还没有已结算牌局。",
    hero: "你",
    openSeat: "空位",
    dealer: "庄位",
    bot: "人机",
    smallBlind: "小盲",
    bigBlind: "大盲",
    turn: "行动中",
    waitingSeat: "待开局",
    sittingOutSeat: "暂离",
    activeSeat: "在手",
    foldedSeat: "弃牌",
    allInSeat: "全下",
    fold: "弃牌",
    check: "过牌",
    call: "跟注",
    bet: "下注",
    raise: "加注",
    allIn: "全下",
    amountHint: "下注和加注输入的是你在当前街希望累计投入到多少，而不是增量。",
    emptySelection: "先选择或创建一张牌桌，再查看桌面视图。",
    pot: "底池",
    winners: "赢家",
    fairness: "公平性提交",
    fairGame: "公平牌局",
    actionClock: "行动时限",
    timeBank: "时间银行",
    currentBet: "当前下注",
    betAmount: "下注额度",
    potentialWin: "潜在赢取",
    hand: "手牌",
    viewReplay: "打开回放",
    hideReplay: "收起回放",
    replayLoading: "正在加载牌局回放...",
    replayFailed: "加载这手牌回放失败。",
    replayDetail: "详情页",
    replaySummary: "回放摘要",
    replayTimeline: "事件时间线",
    replayParticipants: "参与者",
    replayStake: "投入",
    replayPayout: "结算",
    replayRake: "抽水",
    tableChat: "桌内聊天",
    tableChatEmpty: "桌上还没人发消息。先入座再打破沉默。",
    tableChatPlaceholder: "输入桌内消息",
    tableChatSend: "发送",
    tableChatSending: "发送中...",
    tableChatReactions: "快捷表情",
    tableChatSeatOnly: "只有已入座玩家可以发送桌内聊天和表情。",
    addBots: "加入人机",
    addBotsBusy: "正在安排人机...",
    dealerFeedTitle: "荷官播报",
    dealerFeedEmpty: "牌局一旦转起来，智能荷官会在这里报节奏、播动作、补一句解说。",
    dealerHost: "智能荷官",
    dealerAiTag: "AI",
    dealerRuleTag: "规则",
    replayStartedAt: "开始时间",
    replaySettledAt: "结算时间",
    stagePreflop: "翻牌前",
    stageFlop: "翻牌",
    stageTurn: "转牌",
    stageRiver: "河牌",
    stageShowdown: "摊牌",
    eventHandStarted: "牌局开始",
    eventCardsDealt: "发出底牌",
    eventSmallBlindPosted: "小盲已下",
    eventBigBlindPosted: "大盲已下",
    eventTurnStarted: "轮到行动",
    eventTurnTimedOut: "行动超时",
    eventPlayerActed: "玩家行动",
    eventBoardRevealed: "翻开公共牌",
    eventShowdownResolved: "摊牌结算",
    eventHandWonByFold: "弃牌获胜",
    eventHandSettled: "牌局完成结算",
    realtimeConnecting: "正在连接牌桌实时通道...",
    realtimeLive: "牌桌实时通道已连接。",
    realtimeReconnecting: "牌桌实时通道重连中...",
    realtimeResyncing: "已重新连接，正在同步权威桌面状态...",
  },
} as const;

const realtimeApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000";

type HoldemCopy = (typeof copy)[keyof typeof copy];

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

function parseAmountValue(value: string | number | null | undefined) {
  const numeric =
    typeof value === "number" ? value : Number((value ?? "0").toString().trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTableType(copy: HoldemCopy, tableType: HoldemTable["tableType"]) {
  if (tableType === "tournament") {
    return copy.tournamentTable;
  }

  return tableType === "casual" ? copy.casualTable : copy.cashTable;
}

function formatRakePolicy(copy: HoldemCopy, table: Pick<HoldemTable, "tableType" | "rakePolicy">) {
  const policy = table.rakePolicy;
  if (table.tableType !== "cash" || !policy || policy.rakeBps <= 0) {
    return copy.rakeNone;
  }

  const base = `${formatPercent(policy.rakeBps / 100)}% ${copy.rakeCap} ${formatAmount(
    policy.capAmount,
  )}`;
  return policy.noFlopNoDrop ? `${base} · ${copy.rakeNoFlopNoDrop}` : base;
}

function formatStreetLabel(
  copy: HoldemCopy,
  stage: HoldemTable["stage"] | null | undefined,
) {
  if (stage === "flop") {
    return copy.stageFlop;
  }

  if (stage === "turn") {
    return copy.stageTurn;
  }

  if (stage === "river") {
    return copy.stageRiver;
  }

  if (stage === "showdown") {
    return copy.stageShowdown;
  }

  return copy.stagePreflop;
}

function formatDurationMs(value: number | null) {
  if (value === null || Number.isFinite(value) === false) {
    return "—";
  }

  const safeValue = Math.max(0, Math.ceil(value / 1_000));
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseTimeMs(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextValue = new Date(value).getTime();
  return Number.isNaN(nextValue) ? null : nextValue;
}

function resolveSeatTimeBankRemainingMs(
  table: HoldemTable | null,
  seat: HoldemTable["seats"][number] | null,
  nowMs: number,
) {
  if (!table || !seat) {
    return null;
  }

  if (!seat.isCurrentTurn) {
    return seat.timeBankRemainingMs;
  }

  const timeBankStartsAtMs = parseTimeMs(table.pendingActorTimeBankStartsAt);
  if (timeBankStartsAtMs === null || nowMs <= timeBankStartsAtMs) {
    return seat.timeBankRemainingMs;
  }

  return Math.max(0, seat.timeBankRemainingMs - (nowMs - timeBankStartsAtMs));
}

function isRedSuit(card: HoldemCardView) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function CardFace(props: { card: HoldemCardView }) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <div
      className={cn(
        "flex h-24 w-16 flex-col justify-between rounded-[1.35rem] border-2 p-3 text-left",
        hidden
          ? "border-[#202745] bg-[linear-gradient(180deg,rgba(9,11,27,0.94),rgba(17,23,45,0.96))] text-slate-500 shadow-[4px_4px_0px_0px_rgba(3,5,14,0.58)]"
          : "border-[rgba(15,17,31,0.94)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,240,234,0.98))] text-[var(--retro-ink)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.18)]",
        !hidden && isRedSuit(props.card) ? "text-rose-600" : null,
      )}
    >
      {hidden ? (
        <div className="flex h-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.28em]">
          Hold
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

function SeatBadge(props: { active: boolean; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full border-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
        props.active
          ? "border-[rgba(255,213,61,0.42)] bg-[rgba(255,213,61,0.14)] text-[var(--retro-gold)]"
          : "border-[#202745] bg-[rgba(255,255,255,0.04)] text-slate-300",
      )}
    >
      {props.children}
    </span>
  );
}

function formatSeatDisplayName(
  seat: HoldemTable["seats"][number] | null,
  copy: HoldemCopy,
) {
  if (!seat || seat.userId === null) {
    return copy.openSeat;
  }

  return seat.displayName ?? `Seat ${seat.seatIndex + 1}`;
}

function formatSeatAvatarLabel(seat: HoldemTable["seats"][number] | null) {
  if (!seat || seat.userId === null) {
    return "•";
  }

  const displayName = seat.displayName?.trim();
  if (!displayName) {
    return String(seat.seatIndex + 1);
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("").slice(0, 2) || displayName.slice(0, 1).toUpperCase();
}

function TableSeatNode(props: {
  seat: HoldemTable["seats"][number] | null;
  c: HoldemCopy;
  align?: "left" | "right" | "center";
}) {
  const isOpen = !props.seat || props.seat.userId === null;
  const roleLabels: string[] = [];
  if (props.seat?.isDealer) {
    roleLabels.push(props.c.dealer);
  }
  if (props.seat?.isSmallBlind) {
    roleLabels.push(props.c.smallBlind);
  }
  if (props.seat?.isBigBlind) {
    roleLabels.push(props.c.bigBlind);
  }
  const stateLabel = !props.seat
    ? props.c.waitingSeat
    : props.seat.winner
      ? props.c.winners
      : props.seat.isCurrentTurn
        ? props.c.turn
        : props.seat.status === "folded"
          ? props.c.foldedSeat
          : props.seat.sittingOut
            ? props.c.sittingOutSeat
            : props.seat.status === "all_in"
              ? props.c.allInSeat
              : props.c.activeSeat;

  return (
    <div
      className={cn(
        "rounded-[1.5rem] border-2 px-3 py-3 shadow-[4px_4px_0px_0px_rgba(3,5,14,0.56)]",
        isOpen
          ? "border-[#403125] bg-[rgba(22,18,16,0.92)] text-amber-50/70"
          : props.seat?.isCurrentTurn
            ? "border-[var(--retro-gold)] bg-[rgba(58,42,12,0.94)] text-white"
            : props.seat?.winner
              ? "border-emerald-400/60 bg-[rgba(11,56,39,0.94)] text-white"
              : "border-[#403125] bg-[rgba(18,16,18,0.94)] text-white",
        props.align === "right" ? "text-right" : props.align === "center" ? "text-center" : "",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3",
          props.align === "right" ? "flex-row-reverse" : "flex-row",
        )}
      >
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black uppercase",
            isOpen
              ? "border-[#6d5636] bg-[rgba(255,206,84,0.08)] text-amber-100/65"
              : "border-[var(--retro-gold)] bg-[rgba(255,206,84,0.18)] text-[var(--retro-gold)]",
          )}
        >
          {formatSeatAvatarLabel(props.seat)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black uppercase tracking-[0.04em]">
            {formatSeatDisplayName(props.seat, props.c)}
          </p>
          <p className="mt-1 text-lg font-black tracking-[-0.04em]">
            {isOpen ? "—" : formatAmount(props.seat?.stackAmount ?? "0.00")}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.2em]",
          props.align === "right" ? "justify-end" : props.align === "center" ? "justify-center" : "",
        )}
      >
        {roleLabels.map((roleLabel) => (
          <span
            key={`${props.seat?.seatIndex ?? "open"}-${roleLabel}`}
            className="rounded-full border border-[rgba(255,213,61,0.34)] bg-[rgba(255,213,61,0.14)] px-2 py-1 text-[var(--retro-gold)]"
          >
            {roleLabel}
          </span>
        ))}
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/70">
          {stateLabel}
        </span>
      </div>
    </div>
  );
}

function SeatCard(props: {
  table: HoldemTable;
  seat: HoldemTable["seats"][number];
  c: HoldemCopy;
}) {
  const isOpen = props.seat.userId === null;
  const title = isOpen
    ? `${props.c.openSeat} ${props.seat.seatIndex + 1}`
    : `${props.seat.displayName ?? `Seat ${props.seat.seatIndex + 1}`}${
        props.table.heroSeatIndex === props.seat.seatIndex ? ` · ${props.c.hero}` : ""
      }`;
  const stateLabel =
    props.seat.status === "active"
      ? props.c.activeSeat
      : props.seat.status === "folded"
        ? props.c.foldedSeat
        : props.seat.status === "all_in"
          ? props.c.allInSeat
          : props.seat.sittingOut
            ? props.c.sittingOutSeat
          : props.c.waitingSeat;

  return (
    <div
      className={cn(
        "rounded-[1.7rem] border-2 p-4 shadow-[4px_4px_0px_0px_rgba(3,5,14,0.58)] transition-colors",
        isOpen
          ? "border-dashed border-[#202745] bg-[rgba(255,255,255,0.03)]"
          : props.seat.winner
            ? "border-emerald-300/55 bg-[rgba(34,197,94,0.14)]"
            : props.seat.isCurrentTurn
              ? "border-[rgba(255,213,61,0.58)] bg-[rgba(255,213,61,0.14)]"
              : "border-[#202745] bg-[rgba(255,255,255,0.04)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">{title}</p>
          {!isOpen ? (
            <div className="flex flex-wrap gap-2">
              {props.seat.isBot ? (
                <SeatBadge active>{props.c.bot}</SeatBadge>
              ) : null}
              <SeatBadge active={props.seat.isDealer}>{props.c.dealer}</SeatBadge>
              <SeatBadge active={props.seat.isSmallBlind}>
                {props.c.smallBlind}
              </SeatBadge>
              <SeatBadge active={props.seat.isBigBlind}>{props.c.bigBlind}</SeatBadge>
              <SeatBadge active={props.seat.isCurrentTurn}>{props.c.turn}</SeatBadge>
            </div>
          ) : null}
        </div>
        {!isOpen ? (
          <Badge
            variant="outline"
            className="border-[#202745] bg-[rgba(255,255,255,0.04)] text-white"
          >
            {stateLabel}
          </Badge>
        ) : null}
      </div>

      {!isOpen ? (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            {props.seat.cards.length > 0 ? (
              props.seat.cards.map((card, index) => (
                <CardFace
                  key={`${props.seat.seatIndex}-${card.rank ?? "hidden"}-${index}`}
                  card={card}
                />
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-[#202745] px-4 py-6 text-sm text-slate-400">
                {props.c.waitingSeat}
              </div>
            )}
          </div>

          <dl className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                {props.c.stack}
              </dt>
              <dd className="mt-1 font-semibold text-white">
                {formatAmount(props.seat.stackAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                {props.c.committed}
              </dt>
              <dd className="mt-1 font-semibold text-white">
                {formatAmount(props.seat.committedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                {props.c.totalCommitted}
              </dt>
              <dd className="mt-1 font-semibold text-white">
                {formatAmount(props.seat.totalCommittedAmount)}
              </dd>
            </div>
          </dl>

          {props.seat.bestHand ? (
            <p className="mt-3 text-sm text-emerald-100">
              {props.seat.bestHand.label}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const updateSelectedTableDealerFeed = (params: {
  currentTable: HoldemTableResponse | null;
  event: DealerEvent;
}) => {
  if (
    params.currentTable === null ||
    params.event.tableId === null ||
    params.currentTable.table.id !== params.event.tableId
  ) {
    return params.currentTable;
  }

  return {
    table: {
      ...params.currentTable.table,
      dealerEvents: applyDealerEventFeed({
        currentEvents: params.currentTable.table.dealerEvents,
        event: params.event,
      }),
    },
    tables: params.currentTable.tables,
  } satisfies HoldemTableResponse;
};

export function HoldemPanel() {
  const locale = useLocale();
  const resolvedLocale = locale === "zh-CN" ? "zh-CN" : "en";
  const c = copy[resolvedLocale];

  const [tables, setTables] = useState<HoldemTablesResponse | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedTable, setSelectedTable] = useState<HoldemTableResponse | null>(
    null,
  );
  const [createName, setCreateName] = useState("");
  const [createTableType, setCreateTableType] =
    useState<(typeof createableHoldemTableTypes)[number]>("casual");
  const [createMaxSeats, setCreateMaxSeats] = useState<number>(2);
  const [createBotCount, setCreateBotCount] = useState("0");
  const [createBuyIn, setCreateBuyIn] = useState(HOLDEM_CONFIG.minimumBuyIn);
  const [createTournamentStartingStack, setCreateTournamentStartingStack] =
    useState(DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT);
  const [createTournamentPayoutPlaces, setCreateTournamentPayoutPlaces] =
    useState(DEFAULT_HOLDEM_TOURNAMENT_PAYOUT_PLACES);
  const [joinBuyIn, setJoinBuyIn] = useState(HOLDEM_CONFIG.minimumBuyIn);
  const [tableBotCount, setTableBotCount] = useState("1");
  const [tableBotBuyIn, setTableBotBuyIn] = useState(HOLDEM_CONFIG.minimumBuyIn);
  const [actionAmount, setActionAmount] = useState(HOLDEM_CONFIG.bigBlind);
  const [chatDraft, setChatDraft] = useState("");
  const [loadingLobby, setLoadingLobby] = useState(true);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [holdemPlayMode, setHoldemPlayMode] = useState<
    import("@reward/shared-types/play-mode").PlayModeSnapshot | null
  >(null);
  const [updatingPlayMode, setUpdatingPlayMode] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [holdemRealtimeStatus, setHoldemRealtimeStatus] =
    useState<HoldemRealtimeConnectionStatus>("connecting");
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [selectedReplayRoundId, setSelectedReplayRoundId] = useState<
    string | null
  >(null);
  const [selectedReplayHistory, setSelectedReplayHistory] =
    useState<HandHistory | null>(null);
  const [loadingReplayRoundId, setLoadingReplayRoundId] = useState<
    string | null
  >(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [tableMessages, setTableMessages] = useState<HoldemTableMessage[]>([]);
  const tablesRef = useRef<HoldemTablesResponse | null>(null);
  const selectedTableRef = useRef<HoldemTableResponse | null>(null);
  const selectedTableIdRef = useRef<number | null>(null);
  const holdemRealtimeClientRef = useRef<HoldemRealtimeClient | null>(null);
  const replayHistoryCacheRef = useRef(new Map<string, HandHistory>());
  const replayRequestIdRef = useRef(0);
  const realtimeObservationDisposedRef = useRef(false);
  const realtimeObservationQueueRef = useRef<HoldemRealtimeObservation[]>([]);
  const realtimeObservationFlushTimerRef = useRef<number | null>(null);
  const realtimeObservationFlushInFlightRef = useRef(false);
  const activeTable = selectedTable?.table ?? null;
  const activeSummary =
    tables?.tables.find((table) => table.id === selectedTableId) ?? null;
  const openSeatCount = activeTable
    ? activeTable.seats.filter((seat) => seat.userId === null).length
    : 0;
  const heroSeated = activeTable?.heroSeatIndex !== null && activeTable !== null;
  const heroSeat =
    activeTable && activeTable.heroSeatIndex !== null
      ? activeTable.seats[activeTable.heroSeatIndex] ?? null
      : null;
  const pendingActorSeat =
    activeTable && activeTable.pendingActorSeatIndex !== null
      ? activeTable.seats[activeTable.pendingActorSeatIndex] ?? null
      : null;
  const pendingActorClockMs = activeTable
    ? (() => {
        const deadlineAtMs = parseTimeMs(activeTable.pendingActorDeadlineAt);
        return deadlineAtMs === null ? null : Math.max(0, deadlineAtMs - clockNowMs);
      })()
    : null;
  const heroTimeBankMs = resolveSeatTimeBankRemainingMs(
    activeTable,
    heroSeat,
    clockNowMs,
  );
  const pendingActorTimeBankMs = resolveSeatTimeBankRemainingMs(
    activeTable,
    pendingActorSeat,
    clockNowMs,
  );
  const selectedReplayVisible =
    selectedReplayHistory !== null &&
    selectedReplayHistory.roundId === selectedReplayRoundId;
  const canSendTableMessages = activeTable !== null && heroSeated;
  const holdemModeMultiplier = holdemPlayMode?.appliedMultiplier ?? 1;
  const scaledBuyIn = (value: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return (numeric * holdemModeMultiplier).toFixed(2);
  };

  const clearRealtimeObservationFlushTimer = useCallback(() => {
    if (realtimeObservationFlushTimerRef.current !== null) {
      window.clearTimeout(realtimeObservationFlushTimerRef.current);
      realtimeObservationFlushTimerRef.current = null;
    }
  }, []);

  const flushRealtimeObservations = useCallback(async () => {
    if (
      realtimeObservationDisposedRef.current ||
      realtimeObservationFlushInFlightRef.current ||
      realtimeObservationQueueRef.current.length === 0
    ) {
      return;
    }

    clearRealtimeObservationFlushTimer();
    realtimeObservationFlushInFlightRef.current = true;
    const batch = realtimeObservationQueueRef.current.splice(
      0,
      HOLDEM_REALTIME_OBSERVATION_BATCH_SIZE,
    );

    try {
      const response = await browserUserApiClient.reportHoldemRealtimeObservations({
        surface: "web",
        observations: batch,
      });
      if (!response.ok && (response.status ?? 0) >= 500) {
        throw new Error(response.error.message);
      }
    } catch {
      if (!realtimeObservationDisposedRef.current) {
        realtimeObservationQueueRef.current = [
          ...batch,
          ...realtimeObservationQueueRef.current,
        ].slice(-HOLDEM_REALTIME_OBSERVATION_MAX_PENDING);
      }
    } finally {
      realtimeObservationFlushInFlightRef.current = false;
      if (
        !realtimeObservationDisposedRef.current &&
        realtimeObservationQueueRef.current.length > 0
      ) {
        realtimeObservationFlushTimerRef.current = window.setTimeout(() => {
          void flushRealtimeObservations();
        }, HOLDEM_REALTIME_OBSERVATION_FLUSH_INTERVAL_MS);
      }
    }
  }, [clearRealtimeObservationFlushTimer]);

  const enqueueRealtimeObservation = useCallback(
    (observation: HoldemRealtimeObservation) => {
      if (realtimeObservationDisposedRef.current) {
        return;
      }

      realtimeObservationQueueRef.current.push(observation);
      if (
        realtimeObservationQueueRef.current.length >
        HOLDEM_REALTIME_OBSERVATION_MAX_PENDING
      ) {
        realtimeObservationQueueRef.current.splice(
          0,
          realtimeObservationQueueRef.current.length -
            HOLDEM_REALTIME_OBSERVATION_MAX_PENDING,
        );
      }

      if (
        realtimeObservationQueueRef.current.length >=
        HOLDEM_REALTIME_OBSERVATION_BATCH_SIZE
      ) {
        void flushRealtimeObservations();
        return;
      }

      if (realtimeObservationFlushTimerRef.current === null) {
        realtimeObservationFlushTimerRef.current = window.setTimeout(() => {
          void flushRealtimeObservations();
        }, HOLDEM_REALTIME_OBSERVATION_FLUSH_INTERVAL_MS);
      }
    },
    [flushRealtimeObservations],
  );

  useEffect(() => {
    return () => {
      realtimeObservationDisposedRef.current = true;
      clearRealtimeObservationFlushTimer();
      realtimeObservationQueueRef.current = [];
    };
  }, [clearRealtimeObservationFlushTimer]);

  const refreshLobby = useCallback(async (preferredTableId?: number | null) => {
    setLoadingLobby(true);
    const response = await browserUserApiClient.getHoldemTables();
    setLoadingLobby(false);

    if (!response.ok) {
      setError(response.error.message);
      return null;
    }

    startTransition(() => {
      setTables(response.data);
      setSelectedTableId((current) => {
        if (preferredTableId !== undefined) {
          return preferredTableId;
        }
        return (
          current ??
          response.data.activeTableIds[0] ??
          response.data.currentTableId ??
          response.data.tables[0]?.id ??
          null
        );
      });
    });
    return response.data;
  }, []);

  const refreshTable = useCallback(async (tableId: number) => {
    setLoadingTable(true);
    const response = await browserUserApiClient.getHoldemTable(tableId);
    setLoadingTable(false);
    if (!response.ok) {
      setError(response.error.message);
      return null;
    }
    startTransition(() => {
      setSelectedTable(response.data);
    });
    return response.data;
  }, []);

  const refreshTableMessages = useCallback(async (tableId: number) => {
    setLoadingMessages(true);
    const response = await browserUserApiClient.getHoldemTableMessages(tableId);
    setLoadingMessages(false);

    if (!response.ok) {
      setError(response.error.message);
      return null;
    }

    startTransition(() => {
      setTableMessages(response.data.messages);
    });
    return response.data;
  }, []);

  const refreshPlayMode = useCallback(async () => {
    const response = await browserUserApiClient.getPlayMode("holdem");
    if (!response.ok) {
      setError(response.error.message);
      return null;
    }

    startTransition(() => {
      setHoldemPlayMode(response.data.snapshot);
    });
    return response.data.snapshot;
  }, []);

  const handleChangePlayMode = useCallback(
    async (type: PlayModeType) => {
      if (updatingPlayMode) {
        return;
      }

      setUpdatingPlayMode(true);
      const response = await browserUserApiClient.setPlayMode("holdem", { type });
      setUpdatingPlayMode(false);

      if (!response.ok) {
        setError(response.error.message);
        return;
      }

      startTransition(() => {
        setHoldemPlayMode(response.data.snapshot);
      });
    },
    [updatingPlayMode],
  );

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    selectedTableRef.current = selectedTable;
  }, [selectedTable]);

  useEffect(() => {
    selectedTableIdRef.current = selectedTableId;
  }, [selectedTableId]);

  const syncAuthoritativeHoldemState = useCallback(
    async (options?: {
      refreshLobby?: boolean;
      refreshTableId?: number | null;
      refreshMessagesTableId?: number | null;
      markRealtimeSynchronized?: boolean;
    }) => {
      const tasks: Array<Promise<unknown>> = [];

      if (options?.refreshLobby !== false) {
        tasks.push(refreshLobby(selectedTableIdRef.current));
      }
      if (options?.refreshTableId !== null && options?.refreshTableId !== undefined) {
        tasks.push(refreshTable(options.refreshTableId));
      }
      if (
        options?.refreshMessagesTableId !== null &&
        options?.refreshMessagesTableId !== undefined
      ) {
        tasks.push(refreshTableMessages(options.refreshMessagesTableId));
      }

      const results = await Promise.all(tasks);

      if (
        options?.markRealtimeSynchronized &&
        results.every((result) => Boolean(result))
      ) {
        holdemRealtimeClientRef.current?.markSynchronized();
      }
    },
    [refreshLobby, refreshTable, refreshTableMessages],
  );

  useEffect(() => {
    void refreshLobby();
  }, [refreshLobby]);

  useEffect(() => {
    void refreshPlayMode();
  }, [refreshPlayMode]);

  useEffect(() => {
    if (!selectedTableId) {
      setSelectedTable(null);
      setTableMessages([]);
      return;
    }
    void refreshTable(selectedTableId);
    void refreshTableMessages(selectedTableId);
  }, [refreshTable, refreshTableMessages, selectedTableId]);

  useEffect(() => {
    if (!tables && !selectedTableId) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshLobby(selectedTableId);
      if (selectedTableId) {
        void refreshTable(selectedTableId);
        void refreshTableMessages(selectedTableId);
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshLobby, refreshTable, refreshTableMessages, selectedTableId, tables]);

  useEffect(() => {
    if (!activeTable?.pendingActorDeadlineAt) {
      return;
    }

    setClockNowMs(Date.now());
    const interval = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(interval);
  }, [activeTable?.pendingActorDeadlineAt, activeTable?.pendingActorTimeBankStartsAt]);

  useEffect(() => {
    setChatDraft("");
  }, [activeTable?.id]);

  useEffect(() => {
    if (createTableType !== "casual") {
      setCreateBotCount("0");
    }
  }, [createTableType]);

  useEffect(() => {
    if (!activeTable) {
      return;
    }
    if (activeTable.tableType === "casual") {
      setTableBotBuyIn(activeTable.minimumBuyIn);
    }
  }, [activeTable?.id, activeTable?.minimumBuyIn, activeTable?.tableType]);

  useEffect(() => {
    const activeTableIds = tables?.activeTableIds ?? [];
    if (activeTableIds.length === 0) {
      return;
    }

    let cancelled = false;

    const touchPresence = async () => {
      for (const tableId of activeTableIds) {
        const response =
          await browserUserApiClient.touchHoldemTablePresence(tableId);
        if (cancelled) {
          return;
        }

        if (!response.ok && response.status !== 409) {
          setError(response.error.message);
          return;
        }
      }
    };

    void touchPresence();
    const interval = window.setInterval(() => {
      void touchPresence();
    }, HOLDEM_DEFAULT_PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tables?.activeTableIds]);

  useEffect(() => {
    let disposed = false;
    let refreshTimer: number | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const scheduleRefresh = (options?: {
      refreshLobby?: boolean;
      refreshTableId?: number | null;
      refreshMessagesTableId?: number | null;
      markRealtimeSynchronized?: boolean;
    }) => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        void syncAuthoritativeHoldemState({
          refreshLobby: options?.refreshLobby,
          refreshTableId:
            options?.refreshTableId ?? selectedTableIdRef.current,
          refreshMessagesTableId:
            options?.refreshMessagesTableId ?? selectedTableIdRef.current,
          markRealtimeSynchronized: options?.markRealtimeSynchronized,
        });
      }, 90);
    };

    const client = createHoldemRealtimeClient({
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
      onConnectionStatusChange: (status) => {
        if (!disposed) {
          setHoldemRealtimeStatus(status);
        }
      },
      onSyncNeeded: () => {
        scheduleRefresh({
          markRealtimeSynchronized: true,
        });
      },
      onUnauthorized: () => {
        if (!disposed) {
          setError("Session expired or was revoked. Refresh and sign in again.");
        }
      },
      onPublicUpdate: (update) => {
        const currentSelectedTable = selectedTableRef.current;
        const nextState = applyHoldemRealtimeUpdate({
          holdemTables: tablesRef.current,
          selectedHoldemTable: currentSelectedTable,
          selectedHoldemTableId: selectedTableIdRef.current,
          update,
        });

        startTransition(() => {
          if (nextState.nextLobby !== null) {
            setTables(nextState.nextLobby);
          }
          if (nextState.patchedSelectedTable && nextState.nextTable) {
            setSelectedTable(nextState.nextTable);
          }
        });
      },
      onPrivateUpdate: (update) => {
        const nextTable = applyHoldemPrivateRealtimeUpdate({
          selectedHoldemTable: selectedTableRef.current,
          selectedHoldemTableId: selectedTableIdRef.current,
          update,
        });

        if (nextTable) {
          startTransition(() => {
            setSelectedTable(nextTable);
          });
        }
      },
      onTableMessage: (nextMessage) => {
        if (selectedTableIdRef.current !== nextMessage.tableId) {
          return;
        }

        startTransition(() => {
          setTableMessages((currentMessages) =>
            applyHoldemTableMessage({
              currentMessages,
              message: nextMessage,
              maxMessages: HOLDEM_TABLE_MESSAGE_LIMIT,
            }),
          );
        });
      },
      onDealerEvent: (event) => {
        if (selectedTableIdRef.current !== event.tableId) {
          return;
        }

        startTransition(() => {
          setSelectedTable((currentTable) =>
            updateSelectedTableDealerFeed({
              currentTable,
              event,
            }),
          );
        });
      },
      onObservation: enqueueRealtimeObservation,
      onWarning: (warning) => {
        if (!disposed) {
          setError(warning);
        }
      },
    });

    holdemRealtimeClientRef.current = client;
    client.syncTopics([
      HOLDEM_REALTIME_LOBBY_TOPIC,
      ...new Set(
        [
          ...(tablesRef.current?.activeTableIds ?? []),
          ...(selectedTableIdRef.current !== null
            ? [selectedTableIdRef.current]
            : []),
        ].map((tableId) => buildHoldemRealtimeTableTopic(tableId)),
      ),
    ]);
    client.start();

    return () => {
      disposed = true;
      clearRefreshTimer();
      if (holdemRealtimeClientRef.current === client) {
        holdemRealtimeClientRef.current = null;
      }
      client.stop();
    };
  }, [enqueueRealtimeObservation, syncAuthoritativeHoldemState]);

  useEffect(() => {
    holdemRealtimeClientRef.current?.syncTopics([
      HOLDEM_REALTIME_LOBBY_TOPIC,
      ...new Set(
        [
          ...(tables?.activeTableIds ?? []),
          ...(selectedTableId !== null ? [selectedTableId] : []),
        ].map((tableId) => buildHoldemRealtimeTableTopic(tableId)),
      ),
    ]);
  }, [selectedTableId, tables?.activeTableIds]);

  useEffect(() => {
    if (!selectedReplayRoundId) {
      return;
    }

    const availableRoundIds = new Set(
      activeTable?.recentHands
        .map((hand) => hand.roundId)
        .filter((roundId): roundId is string => Boolean(roundId)) ?? [],
    );

    if (!availableRoundIds.has(selectedReplayRoundId)) {
      replayRequestIdRef.current += 1;
      setSelectedReplayRoundId(null);
      setSelectedReplayHistory(null);
      setLoadingReplayRoundId(null);
      setReplayError(null);
    }
  }, [activeTable, selectedReplayRoundId]);

  const toggleReplay = useCallback(
    async (roundId: string | null) => {
      if (!roundId) {
        return;
      }

      if (selectedReplayRoundId === roundId) {
        replayRequestIdRef.current += 1;
        setSelectedReplayRoundId(null);
        setSelectedReplayHistory(null);
        setLoadingReplayRoundId(null);
        setReplayError(null);
        return;
      }

      const cachedHistory = replayHistoryCacheRef.current.get(roundId) ?? null;
      const requestId = replayRequestIdRef.current + 1;
      replayRequestIdRef.current = requestId;

      setSelectedReplayRoundId(roundId);
      setReplayError(null);

      if (cachedHistory) {
        setLoadingReplayRoundId(null);
        setSelectedReplayHistory(cachedHistory);
        return;
      }

      setSelectedReplayHistory(null);
      setLoadingReplayRoundId(roundId);

      const response = await browserUserApiClient.getHandHistory(roundId);
      if (requestId !== replayRequestIdRef.current) {
        return;
      }

      setLoadingReplayRoundId(null);

      if (!response.ok) {
        setReplayError(response.error.message || c.replayFailed);
        return;
      }

      replayHistoryCacheRef.current.set(roundId, response.data);
      startTransition(() => {
        setSelectedReplayHistory(response.data);
      });
    },
    [c.replayFailed, selectedReplayRoundId],
  );

  const realtimeStatusLabel =
    holdemRealtimeStatus === "reconnecting"
      ? c.realtimeReconnecting
      : holdemRealtimeStatus === "resyncing"
        ? c.realtimeResyncing
        : holdemRealtimeStatus === "live"
          ? c.realtimeLive
          : c.realtimeConnecting;
  const tablePotAmount = activeTable
    ? activeTable.pots
        .reduce((total, pot) => total + (Number(pot.amount) || 0), 0)
        .toFixed(2)
    : "0.00";
  const tableStageLabel = activeTable
    ? formatStreetLabel(c, activeTable.stage)
    : c.statusWaiting;
  const opponentSeats =
    activeTable && activeTable.heroSeatIndex !== null
      ? activeTable.seats
          .filter((seat) => seat.seatIndex !== activeTable.heroSeatIndex)
          .sort((left, right) => left.seatIndex - right.seatIndex)
      : [];
  const topLeftSeat = opponentSeats[0] ?? null;
  const topRightSeat = opponentSeats[1] ?? null;
  const leftSeat = opponentSeats[2] ?? null;
  const rightSeat = opponentSeats[3] ?? null;
  const heroPocketCards = Array.from(
    { length: 2 },
    (_, index): HoldemCardView =>
      heroSeat?.cards[index] ?? {
        rank: null,
        suit: null,
        hidden: true,
      },
  );
  const availableActionList = activeTable?.availableActions?.actions ?? [];
  const featuredActions = [
    availableActionList.includes("fold") ? "fold" : null,
    availableActionList.includes("check")
      ? "check"
      : availableActionList.includes("call")
        ? "call"
        : null,
    availableActionList.includes("raise")
      ? "raise"
      : availableActionList.includes("bet")
        ? "bet"
        : availableActionList.includes("all_in")
          ? "all_in"
          : null,
  ].filter((value, index, allValues): value is HoldemAction => {
    if (value === null) {
      return false;
    }
    return allValues.indexOf(value) === index;
  });
  const overflowActions = availableActionList.filter(
    (action) => !featuredActions.includes(action),
  );
  const toCallAmount = parseAmountValue(activeTable?.availableActions?.toCall);
  const actionAmountValue = parseAmountValue(actionAmount);
  const actionStep = Math.max(parseAmountValue(activeTable?.bigBlind ?? "1.00"), 1);
  const potentialWinAmount = (
    parseAmountValue(tablePotAmount) +
    Math.max(toCallAmount, actionAmountValue)
  ).toFixed(2);

  async function runTableMutation(
    key: string,
    task: () => Promise<Awaited<ReturnType<typeof browserUserApiClient.getHoldemTable>>>,
  ) {
    setBusyAction(key);
    setError(null);
    setMessage(null);
    const response = await task();
    setBusyAction(null);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    startTransition(() => {
      setSelectedTable(response.data);
      setSelectedTableId(response.data.table.id);
    });
    await refreshLobby(response.data.table.id);
    await refreshTableMessages(response.data.table.id);
    await refreshPlayMode();
    setMessage(`${c.table} #${response.data.table.id}`);
  }

  const stepActionAmount = useCallback(
    (direction: "down" | "up") => {
      setActionAmount((currentValue) => {
        const nextValue =
          direction === "down"
            ? Math.max(0, parseAmountValue(currentValue) - actionStep)
            : parseAmountValue(currentValue) + actionStep;
        return nextValue.toFixed(2);
      });
    },
    [actionStep],
  );

  const runAction = useCallback(
    async (action: HoldemAction) => {
      if (!activeTable) {
        return;
      }

      await runTableMutation(action, () =>
        browserUserApiClient.actOnHoldemTable(activeTable.id, {
          action,
          amount:
            action === "bet" || action === "raise"
              ? actionAmount.trim()
              : undefined,
        }),
      );
    },
    [actionAmount, activeTable],
  );

  async function sendTableMessage(payload: {
    kind: "chat" | "emoji";
    text?: string;
    emoji?: (typeof holdemTableEmojiValues)[number];
  }) {
    if (!activeTable) {
      return;
    }

    setSendingMessage(true);
    setError(null);
    setMessage(null);

    const response = await browserUserApiClient.postHoldemTableMessage(
      activeTable.id,
      payload,
    );

    setSendingMessage(false);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    startTransition(() => {
      setTableMessages((currentMessages) =>
        applyHoldemTableMessage({
          currentMessages,
          message: response.data,
          maxMessages: HOLDEM_TABLE_MESSAGE_LIMIT,
        }),
      );
    });

    if (payload.kind === "chat") {
      setChatDraft("");
    }
  }

  return (
    <section className="grid gap-6 2xl:grid-cols-[360px,minmax(0,1fr)]">
      <div className="order-2 space-y-6 2xl:order-1">
        <GameSurfaceCard tone="light" className="overflow-hidden">
          <CardContent className="p-0">
            <div className="retro-ivory-surface relative overflow-hidden px-6 py-7">
              <div className="absolute inset-0 retro-dot-overlay opacity-20" />
              <div className="relative space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Badge className="retro-badge retro-badge-gold border-none">
                      {c.table}
                    </Badge>
                    <div className="space-y-2">
                      <CardTitle className="text-[2.4rem] tracking-[-0.05em] text-[var(--retro-orange)]">
                        {c.title}
                      </CardTitle>
                      <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                        {c.description}
                      </CardDescription>
                    </div>
                  </div>
                  <GamePill tone="accent" surface="light">
                    {realtimeStatusLabel}
                  </GamePill>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <GameMetricTile
                    tone="light"
                    label={c.lobby}
                    value={tables?.tables.length ?? 0}
                    valueClassName="text-2xl font-black tracking-[-0.04em]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.effectiveBuyIn}
                    value={scaledBuyIn(createBuyIn) ?? formatAmount(createBuyIn)}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <PlayModeSwitcher
                gameKey="holdem"
                snapshot={holdemPlayMode}
                disabled={busyAction !== null || heroSeated}
                loading={updatingPlayMode}
                onSelect={(type) => void handleChangePlayMode(type)}
              />
            </div>
          </CardContent>
        </GameSurfaceCard>

        <GameSurfaceCard className="overflow-hidden">
          <CardContent className="space-y-5 p-6">
            <GameSectionBlock className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--retro-gold)]">
                    {c.createTable}
                  </p>
                  <p className="text-sm text-slate-300">
                    {createTableType === "casual"
                      ? c.casualTableHint
                      : createTableType === "tournament"
                        ? c.tournamentTableHint
                        : c.cashTableHint}
                  </p>
                </div>
                <GamePill tone="warning">{formatTableType(c, createTableType)}</GamePill>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {c.tableMode}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {createableHoldemTableTypes.map((tableType) => {
                    const active = createTableType === tableType;
                    const label =
                      tableType === "casual"
                        ? c.casualTable
                        : tableType === "tournament"
                          ? c.tournamentTable
                          : c.cashTable;
                    return (
                      <button
                        key={tableType}
                        type="button"
                        onClick={() => setCreateTableType(tableType)}
                        data-testid={`holdem-create-table-type-${tableType}`}
                        className={cn(
                          "rounded-full border-2 px-3 py-2 text-sm font-semibold transition-colors",
                          active
                            ? "border-[rgba(255,213,61,0.42)] bg-[rgba(255,213,61,0.14)] text-[var(--retro-gold)]"
                            : "border-[#202745] bg-[rgba(255,255,255,0.04)] text-slate-300 hover:bg-[rgba(255,255,255,0.08)]",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {c.seats}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {HOLD_EM_CREATE_MAX_SEAT_OPTIONS.map((seatCount) => {
                    const active = createMaxSeats === seatCount;
                    return (
                      <button
                        key={seatCount}
                        type="button"
                        onClick={() => setCreateMaxSeats(seatCount)}
                        data-testid={`holdem-create-max-seats-${seatCount}`}
                        className={cn(
                          "rounded-full border-2 px-3 py-2 text-sm font-semibold transition-colors",
                          active
                            ? "border-[rgba(34,197,94,0.45)] bg-[rgba(34,197,94,0.14)] text-emerald-100"
                            : "border-[#202745] bg-[rgba(255,255,255,0.04)] text-slate-300 hover:bg-[rgba(255,255,255,0.08)]",
                        )}
                      >
                        {seatCount}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3">
                {createTableType === "casual" ? (
                  <div className="space-y-2">
                    <Label htmlFor="holdem-create-bot-count">{c.botPlayers}</Label>
                    <Input
                      id="holdem-create-bot-count"
                      value={createBotCount}
                      onChange={(event) => setCreateBotCount(event.target.value)}
                      inputMode="numeric"
                      aria-label={c.botPlayers}
                      className="retro-field-dark h-12"
                      data-testid="holdem-create-bot-count-input"
                    />
                    <p className="text-xs text-slate-400">{c.casualBotHint}</p>
                  </div>
                ) : null}

                <Input
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder={c.tableNamePlaceholder}
                  className="retro-field-dark h-12"
                />
                <Input
                  value={createBuyIn}
                  onChange={(event) => setCreateBuyIn(event.target.value)}
                  inputMode="decimal"
                  className="retro-field-dark h-12"
                  data-testid="holdem-create-buy-in-input"
                />

                {createTableType === "tournament" ? (
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="holdem-create-tournament-starting-stack">
                        {c.tournamentStartingStack}
                      </Label>
                      <Input
                        id="holdem-create-tournament-starting-stack"
                        value={createTournamentStartingStack}
                        onChange={(event) =>
                          setCreateTournamentStartingStack(event.target.value)
                        }
                        inputMode="decimal"
                        aria-label={c.tournamentStartingStack}
                        placeholder={c.tournamentStartingStack}
                        className="retro-field-dark h-12"
                        data-testid="holdem-create-tournament-starting-stack"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holdem-create-tournament-payout-places">
                        {c.tournamentPayoutPlaces}
                      </Label>
                      <Input
                        id="holdem-create-tournament-payout-places"
                        value={createTournamentPayoutPlaces}
                        onChange={(event) =>
                          setCreateTournamentPayoutPlaces(event.target.value)
                        }
                        inputMode="numeric"
                        aria-label={c.tournamentPayoutPlaces}
                        placeholder={c.tournamentPayoutPlaces}
                        className="retro-field-dark h-12"
                        data-testid="holdem-create-tournament-payout-places"
                      />
                    </div>
                    <p className="text-xs text-slate-400">
                      {c.tournamentPayoutPlacesHint}
                    </p>
                  </div>
                ) : null}

                {scaledBuyIn(createBuyIn) ? (
                  <GameStatusNotice tone="info">
                    {c.effectiveBuyIn}: {scaledBuyIn(createBuyIn)}
                  </GameStatusNotice>
                ) : null}
              </div>

              <Button
                variant="arcadeDark"
                size="xl"
                className="w-full"
                disabled={busyAction === "create"}
                onClick={() =>
                  void runTableMutation("create", () =>
                    browserUserApiClient.createHoldemTable({
                      tableName: createName.trim() || undefined,
                      buyInAmount: createBuyIn.trim(),
                      tableType: createTableType,
                      maxSeats: createMaxSeats,
                      botCount:
                        createTableType === "casual"
                          ? (() => {
                              const parsed = Number.parseInt(
                                createBotCount.trim(),
                                10,
                              );
                              return Number.isFinite(parsed) && parsed >= 0
                                ? parsed
                                : undefined;
                            })()
                          : undefined,
                      tournament:
                        createTableType === "tournament"
                          ? {
                              startingStackAmount:
                                createTournamentStartingStack.trim() || undefined,
                              payoutPlaces: (() => {
                                const parsed = Number.parseInt(
                                  createTournamentPayoutPlaces.trim(),
                                  10,
                                );
                                return Number.isFinite(parsed) && parsed > 0
                                  ? parsed
                                  : undefined;
                              })(),
                            }
                          : undefined,
                    }),
                  )
                }
              >
                {busyAction === "create" ? c.createBusy : c.create}
              </Button>
            </GameSectionBlock>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
                {c.lobby}
              </p>
              <Button
                variant="arcadeOutline"
                onClick={() => void refreshLobby(selectedTableId)}
              >
                {c.refresh}
              </Button>
            </div>

            <div className="space-y-3">
              {loadingLobby ? (
                <GameStatusNotice tone="neutral">{c.loading}</GameStatusNotice>
              ) : tables?.tables.length ? (
                tables.tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      if (table.id === selectedTableId) {
                        if (selectedTable?.table.id !== table.id) {
                          void refreshTable(table.id);
                          void refreshTableMessages(table.id);
                        }
                        return;
                      }
                      setSelectedTable(null);
                      setTableMessages([]);
                      setSelectedTableId(table.id);
                    }}
                    className={cn(
                      "w-full rounded-[1.6rem] border-2 p-4 text-left shadow-[4px_4px_0px_0px_rgba(3,5,14,0.58)] transition-colors",
                      table.id === selectedTableId
                        ? "border-[rgba(255,213,61,0.42)] bg-[rgba(255,213,61,0.14)]"
                        : "border-[#202745] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{table.name}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {c.blinds}: {formatAmount(table.smallBlind)} /{" "}
                          {formatAmount(table.bigBlind)}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {c.tableType}: {formatTableType(c, table.tableType)}
                        </p>
                      </div>
                      <GamePill tone={table.status === "active" ? "success" : "warning"}>
                        {table.status === "active" ? c.statusActive : c.statusWaiting}
                      </GamePill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                      <span>
                        {c.players}: {table.occupiedSeats}/{table.maxSeats}
                      </span>
                      <span>
                        {c.buyIn}: {formatAmount(table.minimumBuyIn)} -{" "}
                        {formatAmount(table.maximumBuyIn)}
                      </span>
                      <span>
                        {c.rakePolicy}: {formatRakePolicy(c, table)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <GameStatusNotice tone="neutral">{c.noTables}</GameStatusNotice>
              )}
            </div>
          </CardContent>
        </GameSurfaceCard>
      </div>

      <div className="order-1 space-y-6 2xl:order-2">
        <GameStatusNotice tone="info">{realtimeStatusLabel}</GameStatusNotice>
        {error ? <GameStatusNotice tone="danger">{error}</GameStatusNotice> : null}
        {message ? <GameStatusNotice tone="success">{message}</GameStatusNotice> : null}

        {activeTable ? (
          <>
            <GameSurfaceCard className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(37,41,71,0.96),rgba(8,10,19,0.99))] px-4 py-5 sm:px-6">
                  <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,213,61,0.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(97,88,255,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]" />
                  <div className="relative space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href="/app"
                        aria-label={c.lobby}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-[rgba(255,255,255,0.12)] bg-[rgba(12,14,26,0.82)] text-[var(--retro-ivory)] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] transition-colors hover:border-[var(--retro-gold)] hover:text-[var(--retro-gold)]"
                      >
                        <TbArrowLeft className="size-5" />
                      </Link>
                      <div className="min-w-0 text-center">
                        <CardTitle className="text-[2rem] uppercase tracking-[-0.04em] text-[var(--retro-gold)] sm:text-[2.4rem]">
                          {c.title}
                        </CardTitle>
                        <CardDescription
                          className="mt-1 truncate text-sm uppercase tracking-[0.26em] text-white/68"
                          data-testid="holdem-active-table-name"
                        >
                          {activeTable.name}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex size-11 items-center justify-center rounded-full border-2 border-[rgba(255,213,61,0.35)] bg-[rgba(255,213,61,0.12)] text-[var(--retro-gold)]">
                          <TbTrophy className="size-5" />
                        </div>
                        <div className="flex size-11 items-center justify-center rounded-full border-2 border-[rgba(255,255,255,0.12)] bg-[rgba(12,14,26,0.82)] text-emerald-200">
                          <TbShieldCheck className="size-5" />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                      <GamePill tone="warning">{formatTableType(c, activeTable.tableType)}</GamePill>
                      <GamePill
                        tone={activeTable.status === "active" ? "success" : "info"}
                      >
                        {activeTable.status === "active" ? c.statusActive : c.statusWaiting}
                      </GamePill>
                      <GamePill tone="neutral">{tableStageLabel}</GamePill>
                      <GamePill tone="neutral">
                        {c.table} #{activeTable.id}
                      </GamePill>
                    </div>

                    <div className="rounded-[2rem] border-2 border-[#5a4422] bg-[linear-gradient(180deg,rgba(31,25,20,0.98),rgba(14,13,16,0.98))] p-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.35)] sm:p-4">
                      <div className="grid gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <TableSeatNode seat={topLeftSeat} c={c} />
                          <TableSeatNode seat={topRightSeat} c={c} align="right" />
                        </div>

                        <div className="grid grid-cols-[86px_minmax(0,1fr)_86px] items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)_120px]">
                          <TableSeatNode seat={leftSeat} c={c} />

                          <div className="relative min-h-[29rem] overflow-hidden rounded-[3rem] border-[5px] border-[#6a4a25] bg-[radial-gradient(circle_at_top,rgba(46,90,46,0.98),rgba(17,45,25,0.98))] px-3 py-5 shadow-[inset_0_0_0_2px_rgba(248,202,87,0.08)]">
                            <div className="absolute inset-4 rounded-[2.4rem] border border-[rgba(255,255,255,0.08)]" />
                            <div className="relative flex h-full flex-col items-center">
                              <div className="text-center">
                                <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-white/62">
                                  {c.pot}
                                </p>
                                <p className="mt-1 text-[2rem] font-black tracking-[-0.06em] text-[var(--retro-gold)]">
                                  {formatAmount(tablePotAmount)}
                                </p>
                              </div>

                              <div className="mt-5 flex flex-wrap justify-center gap-2 sm:gap-3">
                                {Array.from({ length: 5 }, (_, index) => activeTable.communityCards[index] ?? null).map(
                                  (card, index) => (
                                    <CardFace
                                      key={`community-${index}`}
                                      card={card ?? { rank: null, suit: null, hidden: true }}
                                    />
                                  ),
                                )}
                              </div>

                              <div className="mt-5 flex items-end justify-center gap-2">
                                <span className="size-7 rounded-full border-2 border-[#f8d97e] bg-[#f7d567] shadow-[0_4px_0_0_rgba(0,0,0,0.22)]" />
                                <span className="size-8 rounded-full border-2 border-[#d9e7ff] bg-[#ffffff] shadow-[0_4px_0_0_rgba(0,0,0,0.22)]" />
                                <span className="size-10 rounded-full border-2 border-[#a7cfff] bg-[#6da8ff] shadow-[0_4px_0_0_rgba(0,0,0,0.22)]" />
                                <span className="size-9 rounded-full border-2 border-[#f7b1a4] bg-[#e15b43] shadow-[0_4px_0_0_rgba(0,0,0,0.22)]" />
                              </div>

                              {activeTable.pots.length > 1 ? (
                                <div className="mt-4 flex flex-wrap justify-center gap-2">
                                  {activeTable.pots.slice(1).map((pot) => (
                                    <GamePill key={`${pot.kind}-${pot.potIndex}`} tone="neutral">
                                      {c.pot} {pot.potIndex}: {formatAmount(pot.amount)}
                                    </GamePill>
                                  ))}
                                </div>
                              ) : null}

                              <div className="mt-auto w-full max-w-[15rem] rounded-[1.65rem] border-2 border-[var(--retro-gold)] bg-[rgba(9,12,18,0.88)] px-4 py-4 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.26)]">
                                <div className="flex justify-center gap-2">
                                  {heroPocketCards.map((card, index) => (
                                    <CardFace
                                      key={`hero-pocket-${index}`}
                                      card={card}
                                    />
                                  ))}
                                </div>
                                <p className="mt-3 text-[0.72rem] font-black uppercase tracking-[0.24em] text-white/58">
                                  {c.hero}
                                </p>
                                <p className="mt-1 text-[1.85rem] font-black tracking-[-0.05em] text-white">
                                  {formatAmount(heroSeat?.stackAmount ?? "0.00")}
                                </p>
                              </div>
                            </div>
                          </div>

                          <TableSeatNode seat={rightSeat} c={c} align="right" />
                        </div>
                      </div>
                    </div>

                    {!heroSeated ? (
                      <div className="rounded-[1.8rem] border-2 border-[rgba(255,255,255,0.12)] bg-[rgba(12,14,26,0.88)] p-4">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <Input
                            value={joinBuyIn}
                            onChange={(event) => setJoinBuyIn(event.target.value)}
                            inputMode="decimal"
                            className="retro-field-dark h-12"
                            data-testid="holdem-join-buyin-input"
                          />
                          <Button
                            variant="arcade"
                            size="xl"
                            disabled={busyAction === "join"}
                            onClick={() =>
                              void runTableMutation("join", () =>
                                browserUserApiClient.joinHoldemTable(activeTable.id, {
                                  buyInAmount: joinBuyIn.trim(),
                                }),
                              )
                            }
                          >
                            {busyAction === "join" ? c.joinBusy : c.join}
                          </Button>
                        </div>
                        {scaledBuyIn(joinBuyIn) ? (
                          <GameStatusNotice tone="info" className="mt-3">
                            {c.effectiveBuyIn}: {scaledBuyIn(joinBuyIn)}
                          </GameStatusNotice>
                        ) : null}
                      </div>
                    ) : null}

                    {heroSeated && activeTable.availableActions ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-[1.2fr,0.8fr]">
                          <div className="rounded-[1.8rem] border-2 border-[rgba(255,255,255,0.12)] bg-[rgba(12,14,26,0.88)] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.24)]">
                            <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-white/58">
                              {c.betAmount}
                            </p>
                            <div className="mt-3 grid grid-cols-[auto,1fr,auto] items-center gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="rounded-full border-[#4a4f66] bg-[rgba(255,255,255,0.04)] text-white hover:bg-[rgba(255,255,255,0.08)]"
                                onClick={() => stepActionAmount("down")}
                              >
                                <TbMinus className="size-4" />
                              </Button>
                              <Input
                                value={actionAmount}
                                onChange={(event) => setActionAmount(event.target.value)}
                                inputMode="decimal"
                                aria-label={c.betAmount}
                                className="h-12 border-0 bg-transparent px-0 text-center text-2xl font-black tracking-[-0.05em] text-white shadow-none ring-0 focus-visible:ring-0"
                                data-testid="holdem-action-amount-input"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="rounded-full border-[#4a4f66] bg-[rgba(255,255,255,0.04)] text-white hover:bg-[rgba(255,255,255,0.08)]"
                                onClick={() => stepActionAmount("up")}
                              >
                                <TbPlus className="size-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-[1.8rem] border-2 border-[rgba(255,255,255,0.12)] bg-[rgba(12,14,26,0.88)] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.24)]">
                            <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-white/58">
                              {c.potentialWin}
                            </p>
                            <p className="mt-4 text-right text-[2rem] font-black tracking-[-0.06em] text-[var(--retro-gold)]">
                              {formatAmount(potentialWinAmount)}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          {featuredActions.map((action) => {
                            const label =
                              action === "fold"
                                ? c.fold
                                : action === "check"
                                  ? c.check
                                  : action === "call"
                                    ? `${c.call} ${formatAmount(activeTable.availableActions?.toCall ?? "0.00")}`
                                    : action === "bet"
                                      ? `${c.bet} ${formatAmount(actionAmount)}`
                                      : action === "raise"
                                        ? `${c.raise} ${formatAmount(actionAmount)}`
                                        : c.allIn;

                            return (
                              <Button
                                key={action}
                                variant={action === "fold" ? "arcadeOutline" : action === "check" || action === "call" ? "arcadeDark" : "arcade"}
                                size="xl"
                                disabled={busyAction === action}
                                data-testid={`holdem-action-button-${action}`}
                                className={cn(
                                  "h-14 w-full text-base font-black uppercase tracking-[0.08em]",
                                  action === "fold"
                                    ? "border-[rgba(255,132,112,0.45)] bg-[rgba(109,34,28,0.95)] text-white hover:bg-[rgba(128,40,33,0.95)] hover:text-white"
                                    : action === "check" || action === "call"
                                      ? "bg-[var(--retro-gold)] text-[var(--retro-ink)]"
                                      : "bg-[#79b34a] text-[#12230d] hover:bg-[#8bc55c]",
                                )}
                                onClick={() => void runAction(action)}
                              >
                                {label}
                              </Button>
                            );
                          })}
                        </div>

                        {overflowActions.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {overflowActions.map((action) => (
                              <Button
                                key={action}
                                variant="arcadeOutline"
                                disabled={busyAction === action}
                                data-testid={`holdem-action-button-${action}`}
                                onClick={() => void runAction(action)}
                              >
                                {action === "all_in"
                                  ? c.allIn
                                  : action === "bet"
                                    ? c.bet
                                    : action === "raise"
                                      ? c.raise
                                      : action === "call"
                                        ? c.call
                                        : action === "check"
                                          ? c.check
                                          : c.fold}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-3">
                      <GameMetricTile
                        label={c.toCall}
                        value={formatAmount(activeTable.availableActions?.toCall ?? "0.00")}
                      />
                      <GameMetricTile
                        label={c.minRaiseTo}
                        value={
                          activeTable.availableActions?.minimumRaiseTo
                            ? formatAmount(activeTable.availableActions.minimumRaiseTo)
                            : "—"
                        }
                      />
                      <GameMetricTile
                        label={c.currentBet}
                        value={formatAmount(activeTable.availableActions?.currentBet ?? "0.00")}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {heroSeated ? (
                        <>
                          <Button
                            variant="arcadeOutline"
                            disabled={busyAction === "leave"}
                            onClick={() =>
                              void runTableMutation("leave", () =>
                                browserUserApiClient.leaveHoldemTable(activeTable.id),
                              )
                            }
                          >
                            {busyAction === "leave" ? c.leaveBusy : c.leave}
                          </Button>
                          {heroSeat ? (
                            <Button
                              variant="arcadeOutline"
                              disabled={busyAction !== null}
                              onClick={() =>
                                void runTableMutation(
                                  heroSeat.sittingOut ? "sitIn" : "sitOut",
                                  () =>
                                    browserUserApiClient.setHoldemSeatMode(activeTable.id, {
                                      sittingOut: !heroSeat.sittingOut,
                                    }),
                                )
                              }
                            >
                              {heroSeat.sittingOut
                                ? busyAction === "sitIn"
                                  ? c.sitInBusy
                                  : c.sitIn
                                : busyAction === "sitOut"
                                  ? c.sitOutBusy
                                  : c.sitOut}
                            </Button>
                          ) : null}
                          {activeTable.status === "waiting" && activeSummary?.canStart ? (
                            <Button
                              variant="arcadeDark"
                              disabled={busyAction === "start"}
                              onClick={() =>
                                void runTableMutation("start", () =>
                                  browserUserApiClient.startHoldemTable(activeTable.id),
                                )
                              }
                            >
                              {busyAction === "start" ? c.startBusy : c.start}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      <Button
                        variant="arcadeOutline"
                        onClick={() => void refreshTable(activeTable.id)}
                      >
                        {loadingTable ? c.loading : c.refresh}
                      </Button>
                    </div>

                    <GameStatusNotice tone="success">
                      {c.fairGame}: {activeTable.fairness?.commitHash.slice(0, 16) ?? "—"} ·{" "}
                      {c.actionClock}: {formatDurationMs(pendingActorClockMs)} · {c.timeBank}:{" "}
                      {formatDurationMs(heroSeated ? heroTimeBankMs : pendingActorTimeBankMs)}
                    </GameStatusNotice>
                  </div>
                </div>
              </CardContent>
            </GameSurfaceCard>

            {heroSeated &&
            activeTable.tableType === "casual" &&
            activeTable.status === "waiting" &&
            openSeatCount > 0 ? (
              <GameSurfaceCard tone="light" className="overflow-hidden">
                <CardContent className="space-y-4 p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(15,17,31,0.5)]">
                      {c.botPlayers}
                    </p>
                    <p className="mt-2 text-sm text-[rgba(15,17,31,0.62)]">
                      {c.casualBotHint}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={tableBotCount}
                      onChange={(event) => setTableBotCount(event.target.value)}
                      inputMode="numeric"
                      aria-label={c.botPlayers}
                      className="retro-field h-12"
                      data-testid="holdem-add-bot-count-input"
                    />
                    <Input
                      value={tableBotBuyIn}
                      onChange={(event) => setTableBotBuyIn(event.target.value)}
                      inputMode="decimal"
                      aria-label={c.botBuyIn}
                      className="retro-field h-12"
                      data-testid="holdem-add-bot-buyin-input"
                    />
                  </div>
                  <Button
                    variant="arcadeDark"
                    disabled={busyAction === "addBots"}
                    onClick={() =>
                      void runTableMutation("addBots", () =>
                        browserUserApiClient.addHoldemBots(activeTable.id, {
                          count: Math.max(1, Number.parseInt(tableBotCount.trim(), 10) || 1),
                          buyInAmount: tableBotBuyIn.trim(),
                        }),
                      )
                    }
                  >
                    {busyAction === "addBots" ? c.addBotsBusy : c.addBots}
                  </Button>
                </CardContent>
              </GameSurfaceCard>
            ) : null}

            <GameSurfaceCard className="hidden overflow-hidden 2xl:block">
              <CardHeader className="pb-0">
                <CardTitle>{c.players}</CardTitle>
                <CardDescription className="text-slate-300">{c.hand}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {activeTable.seats.map((seat) => (
                    <SeatCard
                      key={seat.seatIndex}
                      table={activeTable}
                      seat={seat}
                      c={c}
                    />
                  ))}
                </div>
              </CardContent>
            </GameSurfaceCard>

            <GameSurfaceCard className="overflow-hidden">
              <CardContent className="space-y-5 p-6">
                <DealerFeed
                  aiLabel={c.dealerAiTag}
                  dealerLabel={c.dealerHost}
                  emptyLabel={c.dealerFeedEmpty}
                  events={activeTable.dealerEvents}
                  ruleLabel={c.dealerRuleTag}
                  title={c.dealerFeedTitle}
                />

                <GameSectionBlock className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                      {c.tableChat}
                    </p>
                    {loadingMessages ? (
                      <span className="text-xs text-slate-500">{c.loading}</span>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {tableMessages.length > 0 ? (
                      tableMessages.map((entry) => (
                        <div
                          key={`chat-${entry.id}`}
                          className="rounded-[1.25rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">
                              {entry.displayName} · #{entry.seatIndex + 1}
                            </p>
                            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                              {new Date(entry.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                          <p className="mt-2 text-sm text-slate-200">
                            {entry.kind === "chat" ? entry.text : entry.emoji}
                          </p>
                        </div>
                      ))
                    ) : (
                      <GameStatusNotice tone="neutral">{c.tableChatEmpty}</GameStatusNotice>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {holdemTableEmojiValues.map((emoji) => (
                      <Button
                        key={emoji}
                        variant="outline"
                        size="sm"
                        className="rounded-full border-[#202745] bg-[rgba(255,255,255,0.04)] px-3 text-lg text-white hover:bg-[rgba(255,255,255,0.08)]"
                        disabled={!canSendTableMessages || sendingMessage}
                        onClick={() => void sendTableMessage({ kind: "emoji", emoji })}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {c.tableChatReactions}
                    </p>
                    {!canSendTableMessages ? (
                      <p className="text-xs text-slate-500">{c.tableChatSeatOnly}</p>
                    ) : null}
                  </div>

                  <div className="flex gap-3">
                    <Input
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      placeholder={c.tableChatPlaceholder}
                      className="retro-field-dark h-12"
                      maxLength={180}
                      disabled={!canSendTableMessages || sendingMessage}
                    />
                    <Button
                      variant="arcadeDark"
                      disabled={
                        !canSendTableMessages ||
                        sendingMessage ||
                        chatDraft.trim().length === 0
                      }
                      onClick={() =>
                        void sendTableMessage({
                          kind: "chat",
                          text: chatDraft.trim(),
                        })
                      }
                    >
                      {sendingMessage ? c.tableChatSending : c.tableChatSend}
                    </Button>
                  </div>
                </GameSectionBlock>
              </CardContent>
            </GameSurfaceCard>

            <GameSurfaceCard className="overflow-hidden">
              <CardHeader>
                <CardTitle>{c.recentHands}</CardTitle>
                <CardDescription className="text-slate-300">
                  {c.replayTimeline}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-0">
                {activeTable.recentHands.length > 0 ? (
                  activeTable.recentHands.map((hand) => (
                    <GameSectionBlock key={`hand-${hand.handNumber}`} className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">Hand #{hand.handNumber}</p>
                          <p className="mt-1 text-sm text-slate-300">
                            {c.winners}: {hand.winnerLabels.join(", ") || "—"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <GamePill tone="neutral">{formatAmount(hand.potAmount)}</GamePill>
                          {hand.roundId ? (
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="rounded-full border-cyan-400/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
                            >
                              <Link
                                href={`/app/holdem/hands/${encodeURIComponent(hand.roundId)}`}
                              >
                                {c.replayDetail}
                              </Link>
                            </Button>
                          ) : null}
                          {hand.roundId ? (
                            <Button
                              variant="arcadeOutline"
                              size="sm"
                              onClick={() => void toggleReplay(hand.roundId)}
                            >
                              {selectedReplayRoundId === hand.roundId
                                ? c.hideReplay
                                : c.viewReplay}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {hand.boardCards.map((card, index) => (
                          <CardFace
                            key={`recent-${hand.handNumber}-${index}`}
                            card={{ rank: card.rank, suit: card.suit, hidden: false }}
                          />
                        ))}
                      </div>

                      <p className="text-xs text-slate-500">
                        {c.replayRake}: {formatAmount(hand.rakeAmount)}
                      </p>
                    </GameSectionBlock>
                  ))
                ) : (
                  <GameStatusNotice tone="neutral">{c.noRecentHands}</GameStatusNotice>
                )}

                {loadingReplayRoundId ? (
                  <GameStatusNotice tone="neutral">{c.replayLoading}</GameStatusNotice>
                ) : null}

                {replayError ? (
                  <GameStatusNotice tone="danger">{replayError}</GameStatusNotice>
                ) : null}

                {selectedReplayVisible && selectedReplayHistory ? (
                  <HoldemReplayDetail history={selectedReplayHistory} mode="inline" />
                ) : null}
              </CardContent>
            </GameSurfaceCard>
          </>
        ) : (
          <GameSurfaceCard tone="light">
            <CardContent className="px-6 py-16 text-center text-[rgba(15,17,31,0.62)]">
              {c.emptySelection}
            </CardContent>
          </GameSurfaceCard>
        )}
      </div>
    </section>
  );
}
