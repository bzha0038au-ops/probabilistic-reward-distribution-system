"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  HOLDEM_CONFIG,
  HOLDEM_DEFAULT_PRESENCE_HEARTBEAT_MS,
  HOLDEM_REALTIME_LOBBY_TOPIC,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  holdemTableEmojiValues,
  type HoldemAction,
  type HoldemCardView,
  type HoldemTableMessage,
  type HoldemTable,
  type HoldemTableResponse,
  type HoldemTablesResponse,
  buildHoldemRealtimeTableTopic,
} from "@reward/shared-types/holdem";
import type { HandHistory } from "@reward/shared-types/hand-history";
import {
  applyHoldemTableMessage,
  applyHoldemPrivateRealtimeUpdate,
  applyHoldemRealtimeUpdate,
  createHoldemRealtimeClient,
  type HoldemRealtimeClient,
  type HoldemRealtimeConnectionStatus,
} from "@reward/user-core";

import { useLocale } from "@/components/i18n-provider";
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
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import { HoldemReplayDetail } from "@/modules/holdem/components/holdem-replay-detail";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

const copy = {
  en: {
    title: "Texas Hold'em",
    description:
      "Multiplayer no-limit cash tables with real-money buy-ins, table-side chip movement, minimum raise enforcement, and side-pot showdown settlement.",
    lobby: "Lobby",
    createTable: "Create table",
    tableName: "Table name",
    tableNamePlaceholder: "Optional public table name",
    buyIn: "Buy-in",
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
    noTables: "No tables yet. Open the first cash table from the left rail.",
    players: "Players",
    blinds: "Blinds",
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
    actionClock: "Action clock",
    timeBank: "Time bank",
    currentBet: "Current bet",
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
      "多人无限注现金桌，支持真钱买入、桌上筹码流转、最小加注、side pot 和摊牌结算。",
    lobby: "大厅",
    createTable: "创建牌桌",
    tableName: "桌名",
    tableNamePlaceholder: "可选，公开桌名称",
    buyIn: "买入金额",
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
    noTables: "还没有牌桌。先在左侧创建第一张现金桌。",
    players: "玩家数",
    blinds: "盲注",
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
    actionClock: "行动时限",
    timeBank: "时间银行",
    currentBet: "当前下注",
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
        "flex h-24 w-16 flex-col justify-between rounded-2xl border p-3 text-left shadow-[0_14px_26px_rgba(15,23,42,0.22)]",
        hidden
          ? "border-white/10 bg-slate-950/80 text-slate-500"
          : "border-amber-100/70 bg-white text-slate-950",
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
        "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
        props.active
          ? "border-amber-200/60 bg-amber-200/15 text-amber-50"
          : "border-white/12 bg-white/5 text-slate-300",
      )}
    >
      {props.children}
    </span>
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
        "rounded-[28px] border p-4 shadow-[0_18px_42px_rgba(15,23,42,0.32)] transition-colors",
        isOpen
          ? "border-white/8 bg-white/[0.03]"
          : props.seat.winner
            ? "border-emerald-300/55 bg-emerald-300/12"
            : props.seat.isCurrentTurn
              ? "border-amber-300/55 bg-amber-300/12"
              : "border-white/10 bg-slate-950/35",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">{title}</p>
          {!isOpen ? (
            <div className="flex flex-wrap gap-2">
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
          <Badge variant="outline" className="border-white/15 bg-white/5 text-white">
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
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
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
  const [createBuyIn, setCreateBuyIn] = useState(HOLDEM_CONFIG.minimumBuyIn);
  const [joinBuyIn, setJoinBuyIn] = useState(HOLDEM_CONFIG.minimumBuyIn);
  const [actionAmount, setActionAmount] = useState(HOLDEM_CONFIG.bigBlind);
  const [chatDraft, setChatDraft] = useState("");
  const [loadingLobby, setLoadingLobby] = useState(true);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
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
  const activeTable = selectedTable?.table ?? null;
  const activeSummary =
    tables?.tables.find((table) => table.id === selectedTableId) ?? null;
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
        return current ?? response.data.currentTableId ?? response.data.tables[0]?.id ?? null;
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
    const currentTableId = tables?.currentTableId ?? null;
    if (currentTableId === null) {
      return;
    }

    let cancelled = false;

    const touchPresence = async () => {
      const response =
        await browserUserApiClient.touchHoldemTablePresence(currentTableId);
      if (cancelled) {
        return;
      }

      if (!response.ok && response.status !== 409) {
        setError(response.error.message);
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
  }, [tables?.currentTableId]);

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
      onWarning: (warning) => {
        if (!disposed) {
          setError(warning);
        }
      },
    });

    holdemRealtimeClientRef.current = client;
    client.syncTopics([
      HOLDEM_REALTIME_LOBBY_TOPIC,
      ...(selectedTableIdRef.current !== null
        ? [buildHoldemRealtimeTableTopic(selectedTableIdRef.current)]
        : []),
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
  }, [syncAuthoritativeHoldemState]);

  useEffect(() => {
    holdemRealtimeClientRef.current?.syncTopics([
      HOLDEM_REALTIME_LOBBY_TOPIC,
      ...(selectedTableId !== null
        ? [buildHoldemRealtimeTableTopic(selectedTableId)]
        : []),
    ]);
  }, [selectedTableId]);

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
    setMessage(`${c.table} #${response.data.table.id}`);
  }

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
    <section className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
      <Card className="border-slate-900 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),_rgba(2,6,23,1))] text-slate-100 shadow-[0_28px_80px_rgba(15,23,42,0.42)]">
        <CardHeader>
          <CardTitle>{c.title}</CardTitle>
          <CardDescription className="text-slate-300">
            {c.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-emerald-200/80">
              {c.createTable}
            </p>
            <div className="mt-3 space-y-3">
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={c.tableNamePlaceholder}
                className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-400"
              />
              <Input
                value={createBuyIn}
                onChange={(event) => setCreateBuyIn(event.target.value)}
                inputMode="decimal"
                className="border-white/10 bg-white/[0.04] text-white"
              />
              <Button
                className="w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                disabled={busyAction === "create"}
                onClick={() =>
                  void runTableMutation("create", () =>
                    browserUserApiClient.createHoldemTable({
                      tableName: createName.trim() || undefined,
                      buyInAmount: createBuyIn.trim(),
                    }),
                  )
                }
              >
                {busyAction === "create" ? c.createBusy : c.create}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
              {c.lobby}
            </p>
            <Button
              variant="ghost"
              className="rounded-full border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => void refreshLobby(selectedTableId)}
            >
              {c.refresh}
            </Button>
          </div>

          <div className="space-y-3">
            {loadingLobby ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                {c.loading}
              </div>
            ) : tables?.tables.length ? (
              tables.tables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setSelectedTableId(table.id)}
                  className={cn(
                    "w-full rounded-3xl border p-4 text-left transition-colors",
                    table.id === selectedTableId
                      ? "border-emerald-300/50 bg-emerald-300/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{table.name}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {c.blinds}: {formatAmount(table.smallBlind)} /{" "}
                        {formatAmount(table.bigBlind)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white"
                    >
                      {table.status === "active" ? c.statusActive : c.statusWaiting}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                    <span>
                      {c.players}: {table.occupiedSeats}/{table.maxSeats}
                    </span>
                    <span>
                      Buy-in: {formatAmount(table.minimumBuyIn)} -{" "}
                      {formatAmount(table.maximumBuyIn)}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                {c.noTables}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-800 bg-slate-950 text-slate-100 shadow-[0_28px_80px_rgba(15,23,42,0.42)]">
        <CardHeader className="border-b border-white/5 bg-[linear-gradient(135deg,_rgba(120,53,15,0.45),_rgba(20,83,45,0.18)_35%,_rgba(2,6,23,0.96)_100%)]">
          <CardTitle>{activeTable ? activeTable.name : c.title}</CardTitle>
          <CardDescription className="text-slate-300">
            {activeTable ? c.board : c.emptySelection}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            {realtimeStatusLabel}
          </div>
          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}

          {activeTable ? (
            <>
              <div className="rounded-[40px] border border-[#5d3412] bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.32),_rgba(15,23,42,0.98)_65%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_60px_rgba(2,6,23,0.5)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/70">
                      {c.table}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {activeTable.status === "active" ? c.statusActive : c.statusWaiting}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-emerald-50/90">
                    <span>
                      {c.currentBet}: {formatAmount(activeTable.availableActions?.currentBet ?? "0.00")}
                    </span>
                    <span>
                      {c.blinds}: {formatAmount(activeTable.smallBlind)} /{" "}
                      {formatAmount(activeTable.bigBlind)}
                    </span>
                    <span>
                      {c.fairness}:{" "}
                      {activeTable.fairness?.commitHash.slice(0, 12) ?? "—"}
                    </span>
                    <span>
                      {c.actionClock}: {formatDurationMs(pendingActorClockMs)}
                    </span>
                    <span>
                      {c.timeBank}: {formatDurationMs(pendingActorTimeBankMs)}
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  {Array.from({ length: 5 }, (_, index) => activeTable.communityCards[index] ?? null).map(
                    (card, index) => (
                      <CardFace
                        key={`community-${index}`}
                        card={card ?? { rank: null, suit: null, hidden: true }}
                      />
                    ),
                  )}
                </div>

                <div className="mt-6 grid gap-3 lg:grid-cols-3">
                  {activeTable.pots.length > 0 ? (
                    activeTable.pots.map((pot) => (
                      <div
                        key={`${pot.kind}-${pot.potIndex}`}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                          {pot.kind === "main" ? c.pot : `${c.pot} ${pot.potIndex}`}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {formatAmount(pot.amount)}
                        </p>
                        {pot.winnerSeatIndexes.length > 0 ? (
                          <p className="mt-2 text-sm text-emerald-100">
                            {c.winners}:{" "}
                            {pot.winnerSeatIndexes.map((seatIndex) => `#${seatIndex + 1}`).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400 lg:col-span-3">
                      {c.noRecentHands}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeTable.seats.map((seat) => (
                  <SeatCard key={seat.seatIndex} table={activeTable} seat={seat} c={c} />
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                        {c.action}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">{c.amountHint}</p>
                    </div>
                    <Button
                      variant="ghost"
                      className="rounded-full border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white"
                      onClick={() => activeTable && void refreshTable(activeTable.id)}
                    >
                      {loadingTable ? c.loading : c.refresh}
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Input
                      value={joinBuyIn}
                      onChange={(event) => setJoinBuyIn(event.target.value)}
                      inputMode="decimal"
                      className="border-white/10 bg-white/[0.04] text-white"
                    />
                    <Input
                      value={actionAmount}
                      onChange={(event) => setActionAmount(event.target.value)}
                      inputMode="decimal"
                      className="border-white/10 bg-white/[0.04] text-white"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {!heroSeated ? (
                      <Button
                        className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                        disabled={busyAction === "join"}
                        onClick={() =>
                          activeTable &&
                          void runTableMutation("join", () =>
                            browserUserApiClient.joinHoldemTable(activeTable.id, {
                              buyInAmount: joinBuyIn.trim(),
                            }),
                          )
                        }
                      >
                        {busyAction === "join" ? c.joinBusy : c.join}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                          disabled={busyAction === "leave"}
                          onClick={() =>
                            activeTable &&
                            void runTableMutation("leave", () =>
                              browserUserApiClient.leaveHoldemTable(activeTable.id),
                            )
                          }
                        >
                          {busyAction === "leave" ? c.leaveBusy : c.leave}
                        </Button>
                        {heroSeat ? (
                          <Button
                            variant="outline"
                            className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            disabled={busyAction !== null}
                            onClick={() =>
                              activeTable &&
                              void runTableMutation(
                                heroSeat.sittingOut ? "sitIn" : "sitOut",
                                () =>
                                  browserUserApiClient.setHoldemSeatMode(
                                    activeTable.id,
                                    {
                                      sittingOut: !heroSeat.sittingOut,
                                    },
                                  ),
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
                            className="rounded-full bg-amber-300 text-slate-950 hover:bg-amber-200"
                            disabled={busyAction === "start"}
                            onClick={() =>
                              activeTable &&
                              void runTableMutation("start", () =>
                                browserUserApiClient.startHoldemTable(activeTable.id),
                              )
                            }
                          >
                            {busyAction === "start" ? c.startBusy : c.start}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>

                  {heroSeat ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                      {c.timeBank}: {formatDurationMs(heroTimeBankMs)}
                    </div>
                  ) : null}

                  {activeTable.availableActions ? (
                    <>
                      <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                            {c.toCall}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {formatAmount(activeTable.availableActions.toCall)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                            {c.minRaiseTo}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {activeTable.availableActions.minimumRaiseTo
                              ? formatAmount(activeTable.availableActions.minimumRaiseTo)
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                            {c.currentBet}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {formatAmount(activeTable.availableActions.currentBet)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        {activeTable.availableActions.actions.map((action) => (
                          <Button
                            key={action}
                            variant={action === "fold" ? "outline" : "default"}
                            className={cn(
                              "rounded-full",
                              action === "fold"
                                ? "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                                : "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
                            )}
                            disabled={busyAction === action}
                            onClick={() =>
                              activeTable &&
                              void runTableMutation(action, () =>
                                browserUserApiClient.actOnHoldemTable(activeTable.id, {
                                  action,
                                  amount:
                                    action === "bet" || action === "raise"
                                      ? actionAmount.trim()
                                      : undefined,
                                }),
                              )
                            }
                          >
                            {action === "fold"
                              ? c.fold
                              : action === "check"
                                ? c.check
                                : action === "call"
                                  ? c.call
                                  : action === "bet"
                                    ? c.bet
                                    : action === "raise"
                                      ? c.raise
                                      : c.allIn}
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                          {c.tableChat}
                        </p>
                        {loadingMessages ? (
                          <span className="text-xs text-slate-500">{c.loading}</span>
                        ) : null}
                      </div>
                      <div className="mt-4 space-y-3">
                        {tableMessages.length > 0 ? (
                          tableMessages.map((entry) => (
                            <div
                              key={`chat-${entry.id}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
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
                          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                            {c.tableChatEmpty}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {holdemTableEmojiValues.map((emoji) => (
                          <Button
                            key={emoji}
                            variant="outline"
                            size="sm"
                            className="rounded-full border-white/10 bg-white/[0.04] px-3 text-lg text-white hover:bg-white/[0.08]"
                            disabled={!canSendTableMessages || sendingMessage}
                            onClick={() => void sendTableMessage({ kind: "emoji", emoji })}
                          >
                            {emoji}
                          </Button>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                          {c.tableChatReactions}
                        </p>
                        {!canSendTableMessages ? (
                          <p className="text-xs text-slate-500">{c.tableChatSeatOnly}</p>
                        ) : null}
                      </div>

                      <div className="mt-4 flex gap-3">
                        <Input
                          value={chatDraft}
                          onChange={(event) => setChatDraft(event.target.value)}
                          placeholder={c.tableChatPlaceholder}
                          className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-400"
                          maxLength={180}
                          disabled={!canSendTableMessages || sendingMessage}
                        />
                        <Button
                          className="rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
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
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                        {c.recentHands}
                      </p>
                      <div className="mt-4 space-y-3">
                    {activeTable.recentHands.length > 0 ? (
                      activeTable.recentHands.map((hand) => (
                        <div
                          key={`hand-${hand.handNumber}`}
                          className="rounded-2xl border border-white/10 bg-black/20 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-white">
                              Hand #{hand.handNumber}
                            </p>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Badge
                                variant="outline"
                                className="border-white/15 bg-white/5 text-white"
                              >
                                {formatAmount(hand.potAmount)}
                              </Badge>
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
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                                  onClick={() => void toggleReplay(hand.roundId)}
                                >
                                  {selectedReplayRoundId === hand.roundId
                                    ? c.hideReplay
                                    : c.viewReplay}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-slate-300">
                            {c.winners}: {hand.winnerLabels.join(", ") || "—"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {c.replayRake}: {formatAmount(hand.rakeAmount)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {hand.boardCards.map((card, index) => (
                              <CardFace
                                key={`recent-${hand.handNumber}-${index}`}
                                card={{ rank: card.rank, suit: card.suit, hidden: false }}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                        {c.noRecentHands}
                      </div>
                    )}

                    {loadingReplayRoundId ? (
                      <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-5 text-sm text-slate-300">
                        {c.replayLoading}
                      </div>
                    ) : null}

                    {replayError ? (
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-5 text-sm text-rose-100">
                        {replayError}
                      </div>
                    ) : null}

                    {selectedReplayVisible && selectedReplayHistory ? (
                      <HoldemReplayDetail
                        history={selectedReplayHistory}
                        mode="inline"
                      />
                    ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-slate-400">
              {c.emptySelection}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
