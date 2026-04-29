import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  HOLD_EM_CREATE_MAX_SEAT_OPTIONS,
  HOLDEM_CONFIG,
  holdemTableEmojiValues,
} from "@reward/shared-types/holdem";
import type {
  HoldemAction,
  HoldemCardView,
  HoldemTableMessage,
  HoldemTable,
  HoldemTableType,
  HoldemTableResponse,
  HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import type {
  PlayModeSnapshot,
  PlayModeType,
} from "@reward/shared-types/play-mode";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import {
  buildHoldemReplayData,
  findReplayParticipant,
  type HoldemRealtimeConnectionStatus,
  type HoldemReplayData,
  type HoldemReplayEvent,
} from "@reward/user-core";

import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import { buildTestId } from "../testing";
import { mobileFeedbackTheme, mobilePalette as palette } from "../theme";
import type { PlayModeCopy } from "../ui";
import { ActionButton, PlayModeSelector, SectionCard } from "../ui";
import { HoldemReplayDetail } from "./holdem-replay-detail";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

type HoldemRouteScreenProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: MobileRouteScreens["holdem"];
  balance: string;
  playModeCopy: PlayModeCopy;
  formatAmount: (value: string) => string;
  emailVerified: boolean;
  holdemPlayMode: PlayModeSnapshot | null;
  updatingHoldemPlayMode: boolean;
  holdemTables: HoldemTablesResponse | null;
  selectedHoldemTable: HoldemTableResponse | null;
  selectedHoldemReplayRoundId: string | null;
  selectedHoldemReplay: HandHistory | null;
  loadingHoldemLobby: boolean;
  loadingHoldemTable: boolean;
  loadingHoldemReplay: boolean;
  holdemReplayError: string | null;
  holdemRealtimeStatus: HoldemRealtimeConnectionStatus;
  actingHoldem:
    | "create"
    | "join"
    | "leave"
    | "start"
    | "sitOut"
    | "sitIn"
    | HoldemAction
    | null;
  holdemTableName: string;
  holdemBuyInAmount: string;
  holdemCreateTableType: HoldemTableType;
  holdemCreateMaxSeats: number;
  holdemTournamentStartingStackAmount: string;
  holdemTournamentPayoutPlaces: string;
  holdemActionAmount: string;
  holdemTableMessages: HoldemTableMessage[];
  loadingHoldemMessages: boolean;
  sendingHoldemMessage: boolean;
  onChangeHoldemTableName: (value: string) => void;
  onChangeHoldemBuyInAmount: (value: string) => void;
  onChangeHoldemCreateTableType: (
    value: HoldemTableType,
  ) => void;
  onChangeHoldemCreateMaxSeats: (value: number) => void;
  onChangeHoldemTournamentStartingStackAmount: (value: string) => void;
  onChangeHoldemTournamentPayoutPlaces: (value: string) => void;
  onChangeHoldemActionAmount: (value: string) => void;
  onChangeHoldemPlayMode: (type: PlayModeType) => void;
  onSelectHoldemTable: (tableId: number) => void;
  onCreateHoldemTable: () => void;
  onJoinHoldemTable: (tableId: number) => void;
  onLeaveHoldemTable: (tableId: number) => void;
  onSetHoldemSeatMode: (tableId: number, sittingOut: boolean) => void;
  onStartHoldemTable: (tableId: number) => void;
  onRefreshHoldemLobby: () => void;
  onRefreshHoldemTable: (tableId: number) => void;
  onActOnHoldemTable: (tableId: number, action: HoldemAction) => void;
  onSendHoldemChatMessage: (tableId: number, text: string) => Promise<boolean>;
  onSendHoldemEmoji: (
    tableId: number,
    emoji: (typeof holdemTableEmojiValues)[number],
  ) => Promise<boolean>;
  onOpenHoldemReplay: (roundId: string) => void;
  onCloseHoldemReplay: () => void;
  loadHoldemEvidenceBundle: (
    roundId: string,
  ) => Promise<HoldemSignedEvidenceBundle | null>;
};

const createTableTypeOptions = ["casual", "cash", "tournament"] as const;

function isRedSuit(card: HoldemCardView) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function PlayingCard(props: { card: HoldemCardView }) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <View
      style={[
        styles.playingCard,
        hidden ? styles.playingCardHidden : null,
      ]}
    >
      {hidden ? (
        <Text style={styles.playingCardBack}>HOLD</Text>
      ) : (
        <>
          <Text
            style={[
              styles.playingCardLabel,
              isRedSuit(props.card) ? styles.playingCardLabelRed : null,
            ]}
          >
            {props.card.rank}
          </Text>
          <Text
            style={[
              styles.playingCardSuit,
              isRedSuit(props.card) ? styles.playingCardLabelRed : null,
            ]}
          >
            {suit}
          </Text>
        </>
      )}
    </View>
  );
}

function StatusChip(props: { active?: boolean; children: string }) {
  return (
    <View
      style={[
        styles.statusChip,
        props.active ? styles.statusChipActive : null,
      ]}
    >
      <Text
        style={[
          styles.statusChipLabel,
          props.active ? styles.statusChipLabelActive : null,
        ]}
      >
        {props.children}
      </Text>
    </View>
  );
}

function SelectionChip(props: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{
        disabled: props.disabled ?? false,
        selected: props.active,
      }}
      testID={props.testID}
      style={[
        styles.choiceChip,
        props.active ? styles.choiceChipActive : null,
        props.disabled ? styles.choiceChipDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.choiceChipLabel,
          props.active ? styles.choiceChipLabelActive : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
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

function formatTableTypeLabel(
  copy: MobileRouteScreens["holdem"],
  tableType: HoldemTable["tableType"],
) {
  if (tableType === "tournament") {
    return copy.tournamentTable;
  }

  return tableType === "casual" ? copy.casualTable : copy.cashTable;
}

function formatRakePolicyLabel(params: {
  copy: MobileRouteScreens["holdem"];
  formatAmount: (value: string) => string;
  table: Pick<HoldemTable, "tableType" | "rakePolicy">;
}) {
  const { copy, formatAmount, table } = params;
  const policy = table.rakePolicy;
  if (table.tableType !== "cash" || !policy || policy.rakeBps <= 0) {
    return copy.rakeNone;
  }

  const base = `${formatPercent(policy.rakeBps / 100)}% ${copy.rakeCap} ${formatAmount(
    policy.capAmount,
  )}`;
  return policy.noFlopNoDrop ? `${base} · ${copy.rakeNoFlopNoDrop}` : base;
}

function getSeatStatusLabel(
  seat: HoldemTable["seats"][number],
  copy: MobileRouteScreens["holdem"],
) {
  if (seat.status === "active") {
    return copy.activeStatus;
  }

  if (seat.status === "folded") {
    return copy.fold;
  }

  if (seat.status === "all_in") {
    return copy.allIn;
  }

  if (seat.sittingOut) {
    return copy.sittingOutStatus;
  }

  return copy.waitingStatus;
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

function SeatCard(props: {
  table: HoldemTable;
  seat: HoldemTable["seats"][number];
  copy: MobileRouteScreens["holdem"];
  formatAmount: (value: string) => string;
}) {
  const isOpen = props.seat.userId === null;
  const title = isOpen
    ? `${props.copy.openSeat} ${props.seat.seatIndex + 1}`
    : `${props.seat.displayName ?? `Seat ${props.seat.seatIndex + 1}`}${
        props.table.heroSeatIndex === props.seat.seatIndex
          ? ` · ${props.copy.you}`
          : ""
      }`;

  return (
    <View
      style={[
        styles.seatCard,
        isOpen
          ? styles.seatCardOpen
          : props.seat.winner
            ? styles.seatCardWinner
            : props.seat.isCurrentTurn
              ? styles.seatCardTurn
              : null,
      ]}
    >
      <View style={styles.seatHeader}>
        <View style={styles.seatHeaderBody}>
          <Text style={styles.seatTitle}>{title}</Text>
          {!isOpen ? (
            <View style={styles.seatBadgeRow}>
              <StatusChip active={props.seat.isDealer}>
                {props.copy.dealer}
              </StatusChip>
              <StatusChip active={props.seat.isSmallBlind}>
                {props.copy.smallBlind}
              </StatusChip>
              <StatusChip active={props.seat.isBigBlind}>
                {props.copy.bigBlind}
              </StatusChip>
              <StatusChip active={props.seat.isCurrentTurn}>
                {props.copy.turn}
              </StatusChip>
            </View>
          ) : null}
        </View>
        {!isOpen ? (
          <Text style={styles.seatStateLabel}>
            {getSeatStatusLabel(props.seat, props.copy)}
          </Text>
        ) : null}
      </View>

      {!isOpen ? (
        <>
          <View style={styles.cardRow}>
            {props.seat.cards.length > 0 ? (
              props.seat.cards.map((card, index) => (
                <PlayingCard
                  key={`${props.seat.seatIndex}-${card.rank ?? "hidden"}-${index}`}
                  card={card}
                />
              ))
            ) : (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderCardLabel}>
                  {props.copy.waitingStatus}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.seatMetaGrid}>
            <View style={styles.seatMetaCard}>
              <Text style={styles.seatMetaLabel}>{props.copy.stack}</Text>
              <Text style={styles.seatMetaValue}>
                {props.formatAmount(props.seat.stackAmount)}
              </Text>
            </View>
            <View style={styles.seatMetaCard}>
              <Text style={styles.seatMetaLabel}>
                {props.copy.streetCommitted}
              </Text>
              <Text style={styles.seatMetaValue}>
                {props.formatAmount(props.seat.committedAmount)}
              </Text>
            </View>
            <View style={styles.seatMetaCard}>
              <Text style={styles.seatMetaLabel}>
                {props.copy.totalCommitted}
              </Text>
              <Text style={styles.seatMetaValue}>
                {props.formatAmount(props.seat.totalCommittedAmount)}
              </Text>
            </View>
          </View>

          {props.seat.bestHand ? (
            <Text style={styles.bestHandLabel}>{props.seat.bestHand.label}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function getActionLabel(
  action: HoldemAction,
  copy: MobileRouteScreens["holdem"],
) {
  switch (action) {
    case "fold":
      return copy.fold;
    case "check":
      return copy.check;
    case "call":
      return copy.call;
    case "bet":
      return copy.bet;
    case "raise":
      return copy.raise;
    default:
      return copy.allIn;
  }
}

function getRealtimeStatusLabel(
  status: HoldemRealtimeConnectionStatus,
  copy: MobileRouteScreens["holdem"],
) {
  switch (status) {
    case "live":
      return copy.realtimeLive;
    case "reconnecting":
      return copy.realtimeReconnecting;
    case "resyncing":
      return copy.realtimeResyncing;
    default:
      return copy.realtimeConnecting;
  }
}

function getReplayStageLabel(
  stage: string | null,
  copy: MobileRouteScreens["holdem"],
) {
  switch (stage) {
    case "preflop":
      return copy.stagePreflop;
    case "flop":
      return copy.stageFlop;
    case "turn":
      return copy.stageTurn;
    case "river":
      return copy.stageRiver;
    case "showdown":
      return copy.stageShowdown;
    default:
      return stage ?? "--";
  }
}

function getReplayActionLabel(
  action: string | null,
  copy: MobileRouteScreens["holdem"],
) {
  const normalized = action?.toLowerCase().replace(/[\s-]/g, "_") ?? null;

  switch (normalized) {
    case "fold":
      return copy.fold;
    case "check":
      return copy.check;
    case "call":
      return copy.call;
    case "bet":
      return copy.bet;
    case "raise":
      return copy.raise;
    case "all_in":
      return copy.allIn;
    default:
      return action ?? "--";
  }
}

function getReplayEventLabel(
  type: string,
  copy: MobileRouteScreens["holdem"],
) {
  switch (type) {
    case "hand_started":
      return copy.eventHandStarted;
    case "hole_cards_dealt":
      return copy.eventCardsDealt;
    case "small_blind_posted":
      return copy.eventSmallBlindPosted;
    case "big_blind_posted":
      return copy.eventBigBlindPosted;
    case "turn_started":
      return copy.eventTurnStarted;
    case "turn_timed_out":
      return copy.eventTurnTimedOut;
    case "player_acted":
      return copy.eventPlayerActed;
    case "board_revealed":
      return copy.eventBoardRevealed;
    case "showdown_resolved":
      return copy.eventShowdownResolved;
    case "hand_won_by_fold":
      return copy.eventHandWonByFold;
    case "hand_settled":
      return copy.eventHandSettled;
    default:
      return type;
  }
}

function formatReplayTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return date.toLocaleString();
}

function getReplaySeatLabel(
  replay: HoldemReplayData,
  seatIndex: number | null,
  copy: MobileRouteScreens["holdem"],
) {
  if (seatIndex === null) {
    return "--";
  }

  const participant = findReplayParticipant(replay, seatIndex);
  const baseLabel =
    participant?.displayName ?? `${copy.openSeat} ${seatIndex + 1}`;

  return replay.viewerSeatIndex === seatIndex
    ? `${baseLabel} · ${copy.you}`
    : baseLabel;
}

function getReplayWinnerLabels(
  replay: HoldemReplayData,
  seatIndexes: number[],
  copy: MobileRouteScreens["holdem"],
) {
  return seatIndexes.map((seatIndex) => getReplaySeatLabel(replay, seatIndex, copy));
}

function describeReplayEvent(
  replay: HoldemReplayData,
  event: HoldemReplayEvent,
  copy: MobileRouteScreens["holdem"],
) {
  const winnerLabels =
    event.winnerSeatIndexes.length > 0
      ? getReplayWinnerLabels(replay, event.winnerSeatIndexes, copy).join(", ")
      : null;
  const actorLabel = getReplaySeatLabel(replay, event.seatIndex, copy);
  const cards =
    event.type === "board_revealed"
      ? (event.newCards.length > 0 ? event.newCards : event.boardCards)
      : event.type === "hole_cards_dealt"
        ? (findReplayParticipant(replay, replay.viewerSeatIndex)?.holeCards ?? [])
        : [];

  switch (event.type) {
    case "hand_started":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          replay.handNumber !== null
            ? `${copy.hand} #${replay.handNumber}`
            : null,
          getReplayStageLabel(event.stage ?? replay.stage, copy),
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
    case "small_blind_posted":
    case "big_blind_posted":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          actorLabel,
          event.amount,
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
    case "turn_started":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          actorLabel,
          getReplayStageLabel(event.stage ?? replay.stage, copy),
          event.turnDeadlineAt ? formatReplayTimestamp(event.turnDeadlineAt) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
    case "turn_timed_out":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          actorLabel,
          event.timeoutAction ? getReplayActionLabel(event.timeoutAction, copy) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
    case "player_acted":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          actorLabel,
          getReplayActionLabel(event.action ?? event.lastAction, copy),
          event.amount,
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
    case "board_revealed":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: getReplayStageLabel(event.stage ?? replay.stage, copy),
        cards,
      };
    case "showdown_resolved":
    case "hand_won_by_fold":
    case "hand_settled":
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          winnerLabels ? `${copy.winners}: ${winnerLabels}` : null,
          event.type === "hand_settled" && replay.totalRakeAmount
            ? `${copy.replayRake}: ${replay.totalRakeAmount}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
    default:
      return {
        title: getReplayEventLabel(event.type, copy),
        detail: [
          event.stage ? getReplayStageLabel(event.stage, copy) : null,
          winnerLabels ? `${copy.winners}: ${winnerLabels}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards,
      };
  }
}

export function HoldemRouteScreen(props: HoldemRouteScreenProps) {
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [chatDraft, setChatDraft] = useState("");
  const activeTable = props.selectedHoldemTable?.table ?? null;
  const effectiveBuyInPreview = (() => {
    const numericBuyIn = Number(props.holdemBuyInAmount || "0");
    const multiplier = props.holdemPlayMode?.appliedMultiplier ?? 1;
    if (!Number.isFinite(numericBuyIn) || multiplier <= 1) {
      return null;
    }

    return props.formatAmount((numericBuyIn * multiplier).toFixed(2));
  })();
  const activeSummary =
    activeTable === null
      ? null
      : props.holdemTables?.tables.find((table) => table.id === activeTable.id) ??
        null;
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
  const summaryStatus =
    props.loadingHoldemLobby || props.loadingHoldemTable
      ? props.screenCopy.summaryLoading
      : activeTable
        ? activeTable.status === "active"
          ? props.screenCopy.activeStatus
          : props.screenCopy.waitingStatus
        : "—";
  const selectedReplay =
    props.selectedHoldemReplay &&
    props.selectedHoldemReplay.roundId === props.selectedHoldemReplayRoundId
      ? buildHoldemReplayData(props.selectedHoldemReplay)
      : null;
  const showingReplayDetail = props.selectedHoldemReplayRoundId !== null;

  useEffect(() => {
    if (!activeTable?.pendingActorDeadlineAt) {
      return;
    }

    setClockNowMs(Date.now());
    const interval = setInterval(() => {
      setClockNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, [activeTable?.pendingActorDeadlineAt, activeTable?.pendingActorTimeBankStartsAt]);

  useEffect(() => {
    setChatDraft("");
  }, [activeTable?.id]);

  if (showingReplayDetail) {
    return (
      <>
        <SectionCard
          title={props.screenCopy.routeTitle}
          subtitle={props.screenCopy.routeSubtitle}
        >
          <RouteSwitcher
            styles={props.styles}
            currentRoute={props.currentRoute}
            labels={props.routeLabels}
            navigationLocked={props.routeNavigationLocked}
            onOpenRoute={props.onOpenRoute}
          />
          <View style={props.styles.routeSummaryRow}>
            <View style={props.styles.routeSummaryCard}>
              <Text style={props.styles.routeSummaryLabel}>
                {props.screenCopy.summaryBalance}
              </Text>
              <Text style={props.styles.routeSummaryValue}>
                {props.formatAmount(props.balance)}
              </Text>
            </View>
            <View style={props.styles.routeSummaryCard}>
              <Text style={props.styles.routeSummaryLabel}>
                {props.screenCopy.summaryStatus}
              </Text>
              <Text style={props.styles.routeSummaryValue}>{summaryStatus}</Text>
            </View>
          </View>
          <View style={styles.realtimeBanner}>
            <Text style={styles.realtimeBannerLabel}>
              {getRealtimeStatusLabel(
                props.holdemRealtimeStatus,
                props.screenCopy,
              )}
            </Text>
          </View>
          {props.verificationCallout}
        </SectionCard>

        <SectionCard
          title={props.screenCopy.replayDetailTitle}
          subtitle={props.screenCopy.replayDetailSubtitle}
        >
          {props.loadingHoldemReplay ? (
            <View style={styles.replayStatusCard}>
              <ActivityIndicator color={palette.accent} />
              <Text style={styles.replayStatusLabel}>
                {props.screenCopy.replayLoading}
              </Text>
            </View>
          ) : props.holdemReplayError ? (
            <View style={styles.replayErrorCard}>
              <Text style={styles.replayErrorLabel}>
                {props.holdemReplayError}
              </Text>
            </View>
          ) : props.selectedHoldemReplay ? (
            <HoldemReplayDetail
              history={props.selectedHoldemReplay}
              screenCopy={props.screenCopy}
              formatAmount={props.formatAmount}
              onBack={props.onCloseHoldemReplay}
              loadEvidenceBundle={props.loadHoldemEvidenceBundle}
            />
          ) : (
            <View style={styles.replayErrorCard}>
              <Text style={styles.replayErrorLabel}>
                {props.screenCopy.replayFailed}
              </Text>
            </View>
          )}
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <SectionCard
        title={props.screenCopy.routeTitle}
        subtitle={props.screenCopy.routeSubtitle}
      >
        <RouteSwitcher
          styles={props.styles}
          currentRoute={props.currentRoute}
          labels={props.routeLabels}
          navigationLocked={props.routeNavigationLocked}
          onOpenRoute={props.onOpenRoute}
        />
        <View style={props.styles.routeSummaryRow}>
          <View style={props.styles.routeSummaryCard}>
            <Text style={props.styles.routeSummaryLabel}>
              {props.screenCopy.summaryBalance}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {props.formatAmount(props.balance)}
            </Text>
          </View>
          <View style={props.styles.routeSummaryCard}>
            <Text style={props.styles.routeSummaryLabel}>
              {props.screenCopy.summaryStatus}
            </Text>
            <Text style={props.styles.routeSummaryValue}>{summaryStatus}</Text>
          </View>
        </View>
        <View style={styles.realtimeBanner}>
          <Text style={styles.realtimeBannerLabel}>
            {getRealtimeStatusLabel(
              props.holdemRealtimeStatus,
              props.screenCopy,
            )}
          </Text>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <PlayModeSelector
        copy={props.playModeCopy}
        gameKey="holdem"
        snapshot={props.holdemPlayMode}
        disabled={props.updatingHoldemPlayMode || props.actingHoldem !== null}
        onSelect={props.onChangeHoldemPlayMode}
      />

      <SectionCard
        title={props.screenCopy.sectionTitle}
        subtitle={props.screenCopy.sectionSubtitle}
      >
        <View style={styles.fieldStack}>
          <View style={props.styles.field}>
            <Text style={props.styles.fieldLabel}>
              {props.screenCopy.tableMode}
            </Text>
            <View style={styles.choiceRow}>
              {createTableTypeOptions.map((tableType) => (
                <SelectionChip
                  key={tableType}
                  label={
                    tableType === "casual"
                      ? props.screenCopy.casualTable
                      : tableType === "tournament"
                        ? props.screenCopy.tournamentTable
                      : props.screenCopy.cashTable
                  }
                  active={props.holdemCreateTableType === tableType}
                  disabled={props.actingHoldem !== null}
                  onPress={() => props.onChangeHoldemCreateTableType(tableType)}
                  testID={`holdem-create-table-type-${tableType}-button`}
                />
              ))}
            </View>
            <Text style={props.styles.gachaHint}>
              {props.holdemCreateTableType === "casual"
                ? props.screenCopy.casualTableHint
                : props.holdemCreateTableType === "tournament"
                  ? props.screenCopy.tournamentTableHint
                  : props.screenCopy.cashTableHint}
            </Text>
          </View>

          <View style={props.styles.field}>
            <Text style={props.styles.fieldLabel}>
              {props.screenCopy.seatCount}
            </Text>
            <View style={styles.choiceRow}>
              {HOLD_EM_CREATE_MAX_SEAT_OPTIONS.map((seatCount) => (
                <SelectionChip
                  key={seatCount}
                  label={String(seatCount)}
                  active={props.holdemCreateMaxSeats === seatCount}
                  disabled={props.actingHoldem !== null}
                  onPress={() => props.onChangeHoldemCreateMaxSeats(seatCount)}
                  testID={`holdem-create-max-seats-${seatCount}-button`}
                />
              ))}
            </View>
          </View>

          <View style={props.styles.field}>
            <Text style={props.styles.fieldLabel}>
              {props.screenCopy.tableName}
            </Text>
            <TextInput
              value={props.holdemTableName}
              onChangeText={props.onChangeHoldemTableName}
              style={props.styles.input}
              autoCorrect={false}
              autoCapitalize="words"
              placeholder={props.screenCopy.tableName}
              placeholderTextColor={palette.textMuted}
              testID="holdem-table-name-input"
            />
          </View>

          <View style={props.styles.field}>
            <Text style={props.styles.fieldLabel}>
              {props.screenCopy.buyInAmount}
            </Text>
            <TextInput
              value={props.holdemBuyInAmount}
              onChangeText={props.onChangeHoldemBuyInAmount}
              style={props.styles.input}
              keyboardType="decimal-pad"
              autoCorrect={false}
              placeholderTextColor={palette.textMuted}
              testID="holdem-buy-in-input"
            />
            <Text style={props.styles.gachaHint}>
              {props.holdemCreateTableType === "tournament"
                ? props.screenCopy.tournamentTableHint
                : props.screenCopy.buyInRange(
                    HOLDEM_CONFIG.minimumBuyIn,
                    HOLDEM_CONFIG.maximumBuyIn,
                  )}
            </Text>
            {effectiveBuyInPreview ? (
              <Text style={props.styles.gachaHint}>
                {props.screenCopy.effectiveBuyInPreview(effectiveBuyInPreview)}
              </Text>
            ) : null}
          </View>

          {props.holdemCreateTableType === "tournament" ? (
            <>
              <View style={props.styles.field}>
                <Text style={props.styles.fieldLabel}>
                  {props.screenCopy.tournamentStartingStack}
                </Text>
                <TextInput
                  value={props.holdemTournamentStartingStackAmount}
                  onChangeText={props.onChangeHoldemTournamentStartingStackAmount}
                  style={props.styles.input}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  placeholder={props.screenCopy.tournamentStartingStack}
                  placeholderTextColor={palette.textMuted}
                  testID="holdem-tournament-starting-stack-input"
                />
              </View>

              <View style={props.styles.field}>
                <Text style={props.styles.fieldLabel}>
                  {props.screenCopy.tournamentPayoutPlaces}
                </Text>
                <TextInput
                  value={props.holdemTournamentPayoutPlaces}
                  onChangeText={props.onChangeHoldemTournamentPayoutPlaces}
                  style={props.styles.input}
                  keyboardType="number-pad"
                  autoCorrect={false}
                  placeholder={props.screenCopy.tournamentPayoutPlaces}
                  placeholderTextColor={palette.textMuted}
                  testID="holdem-tournament-payout-places-input"
                />
                <Text style={props.styles.gachaHint}>
                  {props.screenCopy.tournamentPayoutPlacesHint}
                </Text>
              </View>
            </>
          ) : null}

          <View style={props.styles.inlineActions}>
            <ActionButton
              label={
                props.actingHoldem === "create"
                  ? props.screenCopy.creatingTable
                  : props.screenCopy.createTable
              }
              onPress={props.onCreateHoldemTable}
              disabled={props.actingHoldem !== null || !props.emailVerified}
              testID="holdem-create-table-button"
            />
            <ActionButton
              label={
                props.loadingHoldemLobby
                  ? props.screenCopy.refreshingTable
                  : props.screenCopy.refreshTable
              }
              onPress={props.onRefreshHoldemLobby}
              variant="secondary"
              compact
              testID="holdem-refresh-lobby-button"
            />
          </View>
        </View>

        <View style={styles.lobbyList}>
          {props.loadingHoldemLobby ? (
            <View style={props.styles.loaderRow}>
              <ActivityIndicator color={palette.accent} />
              <Text style={props.styles.loaderText}>
                {props.screenCopy.refreshingTable}
              </Text>
            </View>
          ) : props.holdemTables?.tables.length ? (
            props.holdemTables.tables.map((table) => (
              <Pressable
                key={`table-${table.id}`}
                onPress={() => props.onSelectHoldemTable(table.id)}
                accessibilityRole="button"
                accessibilityLabel={`${table.name} ${table.id}`}
                testID={buildTestId("holdem-lobby-card", table.name)}
                style={[
                  styles.lobbyCard,
                  activeTable?.id === table.id ? styles.lobbyCardActive : null,
                ]}
              >
                <View style={styles.lobbyCardHeader}>
                  <View style={styles.lobbyCardBody}>
                    <Text style={styles.lobbyCardTitle}>{table.name}</Text>
                    <Text style={styles.lobbyCardMeta}>
                      {props.screenCopy.summaryStatus}:{" "}
                      {table.status === "active"
                        ? props.screenCopy.activeStatus
                        : props.screenCopy.waitingStatus}
                    </Text>
                  </View>
                  <Text style={styles.lobbyCardCount}>
                    {table.occupiedSeats}/{table.maxSeats}
                  </Text>
                </View>
                <Text style={styles.lobbyCardMeta}>
                  {props.screenCopy.blinds} {props.formatAmount(table.smallBlind)} /{" "}
                  {props.formatAmount(table.bigBlind)}
                </Text>
                <Text style={styles.lobbyCardMeta}>
                  {props.screenCopy.tableType}:{" "}
                  {formatTableTypeLabel(props.screenCopy, table.tableType)}
                </Text>
                <Text style={styles.lobbyCardMeta}>
                  {props.screenCopy.rakePolicy}:{" "}
                  {formatRakePolicyLabel({
                    copy: props.screenCopy,
                    formatAmount: props.formatAmount,
                    table,
                  })}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyStateLabel}>{props.screenCopy.noTables}</Text>
          )}
        </View>

        {activeTable ? (
          <>
            <View style={styles.tableHero}>
              <View style={styles.tableHeroHeader}>
                <View>
                  <Text style={styles.tableHeroTitle}>{activeTable.name}</Text>
                  <Text style={styles.tableHeroSubtitle}>
                    {activeTable.status === "active"
                      ? props.screenCopy.activeStatus
                      : props.screenCopy.waitingStatus}
                  </Text>
                </View>
                <ActionButton
                  label={
                    props.loadingHoldemTable
                      ? props.screenCopy.refreshingTable
                      : props.screenCopy.refreshTable
                  }
                  onPress={() => props.onRefreshHoldemTable(activeTable.id)}
                  variant="secondary"
                  compact
                  testID="holdem-refresh-table-button"
                />
              </View>

              <View style={styles.tableMetaRow}>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.currentBet}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {props.formatAmount(
                      activeTable.availableActions?.currentBet ?? "0.00",
                    )}
                  </Text>
                </View>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.blinds}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {props.formatAmount(activeTable.smallBlind)} /{" "}
                    {props.formatAmount(activeTable.bigBlind)}
                  </Text>
                </View>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.tableType}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {formatTableTypeLabel(
                      props.screenCopy,
                      activeTable.tableType,
                    )}
                  </Text>
                </View>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.rakePolicy}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {formatRakePolicyLabel({
                      copy: props.screenCopy,
                      formatAmount: props.formatAmount,
                      table: activeTable,
                    })}
                  </Text>
                </View>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.fairness}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {activeTable.fairness?.commitHash.slice(0, 12) ?? "--"}
                  </Text>
                </View>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.actionClock}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {formatDurationMs(pendingActorClockMs)}
                  </Text>
                </View>
                <View style={styles.tableMetaCard}>
                  <Text style={styles.tableMetaLabel}>
                    {props.screenCopy.timeBank}
                  </Text>
                  <Text style={styles.tableMetaValue}>
                    {formatDurationMs(pendingActorTimeBankMs)}
                  </Text>
                </View>
              </View>

              <View style={styles.boardRow}>
                {Array.from({ length: 5 }, (_, index) => (
                  <PlayingCard
                    key={`board-${index}`}
                    card={
                      activeTable.communityCards[index] ?? {
                        rank: null,
                        suit: null,
                        hidden: true,
                      }
                    }
                  />
                ))}
              </View>

              <View style={styles.potGrid}>
                {activeTable.pots.length > 0 ? (
                  activeTable.pots.map((pot) => (
                    <View
                      key={`${pot.kind}-${pot.potIndex}`}
                      style={styles.potCard}
                    >
                      <Text style={styles.potLabel}>
                        {pot.kind === "main"
                          ? props.screenCopy.mainPot
                          : `${props.screenCopy.sidePot} ${pot.potIndex}`}
                      </Text>
                      <Text style={styles.potValue}>
                        {props.formatAmount(pot.amount)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.potCardWide}>
                    <Text style={styles.emptyStateLabel}>
                      {props.screenCopy.noRecentHands}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.seatList}>
              {activeTable.seats.map((seat) => (
                <SeatCard
                  key={`seat-${seat.seatIndex}`}
                  table={activeTable}
                  seat={seat}
                  copy={props.screenCopy}
                  formatAmount={props.formatAmount}
                />
              ))}
            </View>

            <View style={styles.actionPanel}>
              {!heroSeated ? (
                <ActionButton
                  label={
                    props.actingHoldem === "join"
                      ? props.screenCopy.joiningTable
                      : props.screenCopy.joinTable
                  }
                  onPress={() => props.onJoinHoldemTable(activeTable.id)}
                  disabled={props.actingHoldem !== null || !props.emailVerified}
                  testID="holdem-join-table-button"
                />
              ) : (
                <View style={props.styles.inlineActions}>
                  <ActionButton
                    label={
                      props.actingHoldem === "leave"
                        ? props.screenCopy.leavingTable
                        : props.screenCopy.leaveTable
                    }
                    onPress={() => props.onLeaveHoldemTable(activeTable.id)}
                    disabled={props.actingHoldem !== null}
                    variant="secondary"
                    testID="holdem-leave-table-button"
                  />
                  {heroSeat ? (
                    <ActionButton
                      label={
                        heroSeat.sittingOut
                          ? props.actingHoldem === "sitIn"
                            ? props.screenCopy.sittingInTable
                            : props.screenCopy.sitInTable
                          : props.actingHoldem === "sitOut"
                            ? props.screenCopy.sittingOutTable
                            : props.screenCopy.sitOutTable
                      }
                      onPress={() =>
                        props.onSetHoldemSeatMode(
                          activeTable.id,
                          !heroSeat.sittingOut,
                        )
                      }
                      disabled={props.actingHoldem !== null}
                      variant="secondary"
                      testID="holdem-toggle-seat-mode-button"
                    />
                  ) : null}
                  {activeTable.status === "waiting" && activeSummary?.canStart ? (
                    <ActionButton
                      label={
                        props.actingHoldem === "start"
                          ? props.screenCopy.startingHand
                          : props.screenCopy.startHand
                      }
                      onPress={() => props.onStartHoldemTable(activeTable.id)}
                      disabled={props.actingHoldem !== null}
                      testID="holdem-start-hand-button"
                    />
                  ) : null}
                </View>
              )}

              {heroSeat ? (
                <View style={styles.tableMetaRow}>
                  <View style={styles.tableMetaCard}>
                    <Text style={styles.tableMetaLabel}>
                      {props.screenCopy.timeBank}
                    </Text>
                    <Text style={styles.tableMetaValue}>
                      {formatDurationMs(heroTimeBankMs)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={props.styles.field}>
                <Text style={props.styles.fieldLabel}>
                  {props.screenCopy.actionAmount}
                </Text>
                <TextInput
                  value={props.holdemActionAmount}
                  onChangeText={props.onChangeHoldemActionAmount}
                  style={props.styles.input}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  placeholderTextColor={palette.textMuted}
                  testID="holdem-action-amount-input"
                />
                <Text style={props.styles.gachaHint}>
                  {props.screenCopy.amountHint}
                </Text>
              </View>

              {activeTable.availableActions ? (
                <>
                  <View style={styles.tableMetaRow}>
                    <View style={styles.tableMetaCard}>
                      <Text style={styles.tableMetaLabel}>
                        {props.screenCopy.toCall}
                      </Text>
                      <Text style={styles.tableMetaValue}>
                        {props.formatAmount(activeTable.availableActions.toCall)}
                      </Text>
                    </View>
                    <View style={styles.tableMetaCard}>
                      <Text style={styles.tableMetaLabel}>
                        {props.screenCopy.minRaiseTo}
                      </Text>
                      <Text style={styles.tableMetaValue}>
                        {activeTable.availableActions.minimumRaiseTo
                          ? props.formatAmount(
                              activeTable.availableActions.minimumRaiseTo,
                            )
                          : "--"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionButtonGrid}>
                    {activeTable.availableActions.actions.map((action) => (
                      <ActionButton
                        key={action}
                        label={getActionLabel(action, props.screenCopy)}
                        onPress={() =>
                          props.onActOnHoldemTable(activeTable.id, action)
                        }
                        disabled={props.actingHoldem !== null}
                        variant={action === "fold" ? "secondary" : "primary"}
                        compact
                        testID={buildTestId("holdem-action-button", action)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </View>

            <View style={styles.tableChatCard}>
              <View style={styles.tableChatHeader}>
                <Text style={styles.tableChatTitle}>
                  {props.screenCopy.tableChat}
                </Text>
                {props.loadingHoldemMessages ? (
                  <Text style={styles.tableChatMeta}>{props.screenCopy.summaryLoading}</Text>
                ) : null}
              </View>

              {props.holdemTableMessages.length > 0 ? (
                <View style={styles.tableChatList}>
                  {props.holdemTableMessages.map((entry) => (
                    <View key={`holdem-message-${entry.id}`} style={styles.tableChatBubble}>
                      <View style={styles.tableChatBubbleHeader}>
                        <Text style={styles.tableChatAuthor}>
                          {entry.displayName} · #{entry.seatIndex + 1}
                        </Text>
                        <Text style={styles.tableChatMeta}>
                          {formatReplayTimestamp(entry.createdAt)}
                        </Text>
                      </View>
                      <Text style={styles.tableChatBody}>
                        {entry.kind === "chat" ? entry.text : entry.emoji}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyStateLabel}>
                  {props.screenCopy.tableChatEmpty}
                </Text>
              )}

              <View style={styles.tableChatEmojiRow}>
                {holdemTableEmojiValues.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => void props.onSendHoldemEmoji(activeTable.id, emoji)}
                    disabled={
                      activeTable.heroSeatIndex === null || props.sendingHoldemMessage
                    }
                    style={[
                      styles.tableChatEmojiButton,
                      activeTable.heroSeatIndex === null || props.sendingHoldemMessage
                        ? styles.tableChatEmojiButtonDisabled
                        : null,
                    ]}
                  >
                    <Text style={styles.tableChatEmojiLabel}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.tableChatHint}>
                {activeTable.heroSeatIndex === null
                  ? props.screenCopy.tableChatSeatOnly
                  : props.screenCopy.tableChatReactions}
              </Text>

              <View style={styles.tableChatComposer}>
                <TextInput
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  style={[props.styles.input, styles.tableChatInput]}
                  autoCorrect={false}
                  maxLength={180}
                  editable={
                    activeTable.heroSeatIndex !== null && !props.sendingHoldemMessage
                  }
                  placeholder={props.screenCopy.tableChatPlaceholder}
                  placeholderTextColor={palette.textMuted}
                />
                <ActionButton
                  label={
                    props.sendingHoldemMessage
                      ? props.screenCopy.tableChatSending
                      : props.screenCopy.tableChatSend
                  }
                  onPress={() => {
                    const nextDraft = chatDraft.trim();
                    if (!nextDraft) {
                      return;
                    }

                    void props
                      .onSendHoldemChatMessage(activeTable.id, nextDraft)
                      .then((sent) => {
                        if (sent) {
                          setChatDraft("");
                        }
                      });
                  }}
                  disabled={
                    activeTable.heroSeatIndex === null ||
                    props.sendingHoldemMessage ||
                    chatDraft.trim().length === 0
                  }
                  compact
                />
              </View>
            </View>

            <View style={styles.recentHandsList}>
              <Text style={styles.recentHandsTitle}>
                {props.screenCopy.recentHands}
              </Text>
              {activeTable.recentHands.length > 0 ? (
                activeTable.recentHands.map((hand) => (
                  <View
                    key={`hand-${hand.handNumber}`}
                    style={styles.recentHandCard}
                  >
                    <View style={styles.recentHandHeader}>
                      <Text style={styles.recentHandTitle}>
                        {props.screenCopy.hand} #{hand.handNumber}
                      </Text>
                      <View style={styles.recentHandHeaderActions}>
                        <Text style={styles.recentHandPot}>
                          {props.formatAmount(hand.potAmount)}
                        </Text>
                        {hand.roundId ? (
                          <ActionButton
                            label={
                              props.selectedHoldemReplayRoundId === hand.roundId
                                ? props.screenCopy.hideReplay
                                : props.screenCopy.viewReplay
                            }
                            onPress={() =>
                              props.selectedHoldemReplayRoundId === hand.roundId
                                ? props.onCloseHoldemReplay()
                                : hand.roundId
                                  ? props.onOpenHoldemReplay(hand.roundId)
                                  : undefined
                            }
                            variant="secondary"
                            compact
                          />
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.recentHandMeta}>
                      {props.screenCopy.winners}: {hand.winnerLabels.join(", ") || "--"}
                    </Text>
                    <Text style={styles.recentHandMeta}>
                      {props.screenCopy.replayRake}:{" "}
                      {props.formatAmount(hand.rakeAmount)}
                    </Text>
                    <View style={styles.cardRow}>
                      {hand.boardCards.map((card, index) => (
                        <PlayingCard
                          key={`recent-${hand.handNumber}-${index}`}
                          card={{
                            rank: card.rank,
                            suit: card.suit,
                            hidden: false,
                          }}
                        />
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyStateLabel}>
                  {props.screenCopy.noRecentHands}
                </Text>
              )}

              {props.loadingHoldemReplay ? (
                <View style={styles.replayStatusCard}>
                  <ActivityIndicator color={palette.accent} />
                  <Text style={styles.replayStatusLabel}>
                    {props.screenCopy.replayLoading}
                  </Text>
                </View>
              ) : null}

              {props.holdemReplayError ? (
                <View style={styles.replayErrorCard}>
                  <Text style={styles.replayErrorLabel}>
                    {props.holdemReplayError}
                  </Text>
                </View>
              ) : null}

              {selectedReplay ? (
                <View style={styles.replayCard}>
                  <View style={styles.replayHeader}>
                    <View style={styles.replayHeaderBody}>
                      <Text style={styles.replaySectionLabel}>
                        {props.screenCopy.replaySummary}
                      </Text>
                      <Text style={styles.replayTitle}>
                        {props.screenCopy.hand} #{selectedReplay.handNumber ?? "--"} ·{" "}
                        {getReplayStageLabel(
                          selectedReplay.stage,
                          props.screenCopy,
                        )}
                      </Text>
                      <Text style={styles.replaySubtitle}>
                        {selectedReplay.tableName ?? activeTable.name}
                      </Text>
                    </View>
                    <ActionButton
                      label={props.screenCopy.hideReplay}
                      onPress={props.onCloseHoldemReplay}
                      variant="secondary"
                      compact
                    />
                  </View>

                  <View style={styles.replayMetaGrid}>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.replayStake}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {props.formatAmount(selectedReplay.stakeAmount)}
                      </Text>
                    </View>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.replayPayout}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {props.formatAmount(selectedReplay.payoutAmount)}
                      </Text>
                    </View>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.replayStartedAt}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {formatReplayTimestamp(selectedReplay.startedAt)}
                      </Text>
                    </View>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.replaySettledAt}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {formatReplayTimestamp(selectedReplay.settledAt)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.replayFairnessCard}>
                    <Text style={styles.replayMetaLabel}>
                      {props.screenCopy.fairness}
                    </Text>
                    <Text style={styles.replayFairnessValue}>
                      {selectedReplay.fairnessCommitHash ?? "--"}
                    </Text>
                  </View>

                  <View style={styles.replayBlock}>
                    <Text style={styles.replaySectionLabel}>
                      {props.screenCopy.blinds}
                    </Text>
                    <Text style={styles.replaySummaryRow}>
                      {props.formatAmount(
                        selectedReplay.blinds.smallBlind ?? "0.00",
                      )}{" "}
                      /{" "}
                      {props.formatAmount(
                        selectedReplay.blinds.bigBlind ?? "0.00",
                      )}
                    </Text>
                  </View>

                  <View style={styles.replayBlock}>
                    <Text style={styles.replaySectionLabel}>
                      {props.screenCopy.board}
                    </Text>
                    <View style={styles.cardRow}>
                      {selectedReplay.boardCards.length > 0 ? (
                        selectedReplay.boardCards.map((card, index) => (
                          <PlayingCard
                            key={`replay-board-${index}`}
                            card={card}
                          />
                        ))
                      ) : (
                        <Text style={styles.emptyStateLabel}>
                          {props.screenCopy.stagePreflop}
                        </Text>
                      )}
                    </View>
                  </View>

                  {selectedReplay.pots.length > 0 ? (
                    <View style={styles.replayPotGrid}>
                      {selectedReplay.pots.map((pot) => (
                        <View
                          key={`replay-pot-${pot.kind}-${pot.potIndex}`}
                          style={styles.replayPotCard}
                        >
                          <Text style={styles.replayMetaLabel}>
                            {pot.kind === "main"
                              ? props.screenCopy.mainPot
                              : `${props.screenCopy.sidePot} ${pot.potIndex}`}
                          </Text>
                          <Text style={styles.replayMetaValue}>
                            {props.formatAmount(pot.amount)}
                          </Text>
                          <Text style={styles.recentHandMeta}>
                            {props.screenCopy.replayRake}:{" "}
                            {props.formatAmount(pot.rakeAmount)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.replayBlock}>
                    <Text style={styles.replaySectionLabel}>
                      {props.screenCopy.replayParticipants}
                    </Text>
                    <View style={styles.replayParticipantList}>
                      {selectedReplay.participants.map((participant) => (
                        <View
                          key={`replay-participant-${participant.seatIndex}`}
                          style={styles.replayParticipantCard}
                        >
                          <View style={styles.replayParticipantHeader}>
                            <View style={styles.replayParticipantHeaderBody}>
                              <Text style={styles.replayParticipantTitle}>
                                {getReplaySeatLabel(
                                  selectedReplay,
                                  participant.seatIndex,
                                  props.screenCopy,
                                )}
                              </Text>
                              <Text style={styles.replayParticipantMeta}>
                                {participant.bestHandLabel ??
                                  participant.lastAction ??
                                  "--"}
                              </Text>
                            </View>
                            {participant.winner ? (
                              <Text style={styles.replayParticipantWinner}>
                                {props.screenCopy.winners}
                              </Text>
                            ) : null}
                          </View>

                          {participant.holeCards.length > 0 ? (
                            <View style={styles.cardRow}>
                              {participant.holeCards.map((card, index) => (
                                <PlayingCard
                                  key={`replay-hole-${participant.seatIndex}-${index}`}
                                  card={card}
                                />
                              ))}
                            </View>
                          ) : null}

                          <View style={styles.replayMetaGrid}>
                            <View style={styles.replayMetaCard}>
                              <Text style={styles.replayMetaLabel}>
                                {props.screenCopy.totalCommitted}
                              </Text>
                              <Text style={styles.replayMetaValue}>
                                {participant.contributionAmount
                                  ? props.formatAmount(
                                      participant.contributionAmount,
                                    )
                                  : "--"}
                              </Text>
                            </View>
                            <View style={styles.replayMetaCard}>
                              <Text style={styles.replayMetaLabel}>
                                {props.screenCopy.replayPayout}
                              </Text>
                              <Text style={styles.replayMetaValue}>
                                {participant.payoutAmount
                                  ? props.formatAmount(participant.payoutAmount)
                                  : "--"}
                              </Text>
                            </View>
                            <View style={styles.replayMetaCard}>
                              <Text style={styles.replayMetaLabel}>
                                {props.screenCopy.stack}
                              </Text>
                              <Text style={styles.replayMetaValue}>
                                {participant.stackAfter
                                  ? props.formatAmount(participant.stackAfter)
                                  : "--"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.replayBlock}>
                    <Text style={styles.replaySectionLabel}>
                      {props.screenCopy.replayTimeline}
                    </Text>
                    <View style={styles.replayEventList}>
                      {selectedReplay.events.map((event) => {
                        const description = describeReplayEvent(
                          selectedReplay,
                          event,
                          props.screenCopy,
                        );

                        return (
                          <View
                            key={`replay-event-${event.sequence}`}
                            style={styles.replayEventCard}
                          >
                            <View style={styles.replayEventHeader}>
                              <View style={styles.replayEventHeaderBody}>
                                <Text style={styles.replayEventTitle}>
                                  {description.title}
                                </Text>
                                <Text style={styles.replayEventMeta}>
                                  {description.detail || "--"}
                                </Text>
                              </View>
                              <View style={styles.replayEventStamp}>
                                <Text style={styles.replayEventStampText}>
                                  #{event.sequence}
                                </Text>
                                <Text style={styles.replayEventStampText}>
                                  {formatReplayTimestamp(event.createdAt)}
                                </Text>
                              </View>
                            </View>

                            {description.cards.length > 0 ? (
                              <View style={styles.cardRow}>
                                {description.cards.map((card, index) => (
                                  <PlayingCard
                                    key={`replay-event-card-${event.sequence}-${index}`}
                                    card={card}
                                  />
                                ))}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={styles.emptyStateLabel}>{props.screenCopy.noSelection}</Text>
        )}
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  actionButtonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionPanel: {
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  bestHandLabel: {
    color: mobileFeedbackTheme.success.accentColor,
    fontSize: 13,
    fontWeight: "600",
  },
  boardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  emptyStateLabel: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldStack: {
    gap: 14,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  choiceChipActive: {
    borderColor: palette.accent,
    backgroundColor: "#103246",
  },
  choiceChipDisabled: {
    opacity: 0.55,
  },
  choiceChipLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  choiceChipLabelActive: {
    color: palette.text,
  },
  realtimeBanner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#38bdf833",
    backgroundColor: "#0c4a6e33",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  realtimeBannerLabel: {
    color: "#dbeafe",
    fontSize: 13,
    fontWeight: "600",
  },
  lobbyCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  lobbyCardActive: {
    borderColor: palette.accent,
    backgroundColor: "#103246",
  },
  lobbyCardBody: {
    flex: 1,
    gap: 4,
  },
  lobbyCardCount: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  lobbyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lobbyCardMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  lobbyCardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  lobbyList: {
    gap: 10,
  },
  placeholderCard: {
    width: 64,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.border,
    backgroundColor: palette.input,
  },
  placeholderCardLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  playingCard: {
    width: 64,
    height: 92,
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdf7",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  playingCardBack: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },
  playingCardHidden: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.input,
  },
  playingCardLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },
  playingCardLabelRed: {
    color: "#be123c",
  },
  playingCardSuit: {
    alignSelf: "flex-end",
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
  },
  potCard: {
    flex: 1,
    minWidth: 120,
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#0f172a",
    padding: 12,
  },
  potCardWide: {
    flex: 1,
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#0f172a",
    padding: 12,
  },
  potGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  potLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  potValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "800",
  },
  tableChatAuthor: {
    color: palette.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  tableChatBody: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  tableChatBubble: {
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableChatBubbleHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  tableChatCard: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  tableChatComposer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  tableChatEmojiButton: {
    alignItems: "center",
    backgroundColor: palette.input,
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  tableChatEmojiButtonDisabled: {
    opacity: 0.45,
  },
  tableChatEmojiLabel: {
    fontSize: 20,
  },
  tableChatEmojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tableChatHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  tableChatHint: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  tableChatInput: {
    flex: 1,
    marginBottom: 0,
  },
  tableChatList: {
    gap: 10,
  },
  tableChatMeta: {
    color: palette.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  tableChatTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  recentHandCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  recentHandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  recentHandHeaderActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  recentHandMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  recentHandPot: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  recentHandsList: {
    gap: 10,
  },
  recentHandsTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  recentHandTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  replayBlock: {
    gap: 10,
  },
  replayCard: {
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#38bdf833",
    backgroundColor: "#082f491a",
    padding: 14,
  },
  replayErrorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileFeedbackTheme.dangerButton.borderColor,
    backgroundColor: mobileFeedbackTheme.dangerButton.backgroundColor,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  replayErrorLabel: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  replayEventCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  replayEventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  replayEventHeaderBody: {
    flex: 1,
    gap: 4,
  },
  replayEventList: {
    gap: 10,
  },
  replayEventMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  replayEventStamp: {
    alignItems: "flex-end",
    gap: 2,
  },
  replayEventStampText: {
    color: palette.textMuted,
    fontSize: 11,
  },
  replayEventTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  replayFairnessCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  replayFairnessValue: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  replayHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  replayHeaderBody: {
    flex: 1,
    gap: 4,
  },
  replayMetaCard: {
    flex: 1,
    minWidth: 120,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  replayMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  replayMetaLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  replayMetaValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  replayParticipantCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  replayParticipantHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  replayParticipantHeaderBody: {
    flex: 1,
    gap: 4,
  },
  replayParticipantList: {
    gap: 10,
  },
  replayParticipantMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  replayParticipantTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  replayParticipantWinner: {
    color: mobileFeedbackTheme.success.accentColor,
    fontSize: 12,
    fontWeight: "700",
  },
  replayPotCard: {
    flex: 1,
    minWidth: 120,
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  replayPotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  replaySectionLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  replayStatusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  replayStatusLabel: {
    color: palette.textMuted,
    fontSize: 13,
  },
  replaySubtitle: {
    color: palette.textMuted,
    fontSize: 13,
  },
  replaySummaryRow: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  replayTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  seatBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  seatCard: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  seatCardOpen: {
    borderStyle: "dashed",
  },
  seatCardTurn: {
    borderColor: mobileFeedbackTheme.warning.borderColor,
    backgroundColor: mobileFeedbackTheme.warning.backgroundColor,
  },
  seatCardWinner: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  seatHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  seatHeaderBody: {
    flex: 1,
    gap: 8,
  },
  seatList: {
    gap: 12,
  },
  seatMetaCard: {
    flex: 1,
    minWidth: 90,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#0f172a",
    padding: 10,
  },
  seatMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  seatMetaLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  seatMetaValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  seatStateLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  seatTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusChipActive: {
    borderColor: palette.accent,
    backgroundColor: "#103246",
  },
  statusChipLabel: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusChipLabelActive: {
    color: palette.text,
  },
  tableHero: {
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#5d3412",
    backgroundColor: "#0f2d22",
    padding: 16,
  },
  tableHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tableHeroSubtitle: {
    color: "#cbd5e1",
    fontSize: 13,
  },
  tableHeroTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  tableMetaCard: {
    flex: 1,
    minWidth: 100,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(2,6,23,0.42)",
    padding: 10,
  },
  tableMetaLabel: {
    color: "#94a3b8",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tableMetaValue: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
});
