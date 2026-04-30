import type { HoldemAction, HoldemTable } from "@reward/shared-types/holdem";
import {
  findReplayParticipant,
  type HoldemRealtimeConnectionStatus,
  type HoldemReplayData,
  type HoldemReplayEvent,
} from "@reward/user-core";

import type { MobileRouteScreens } from "../route-copy";

export type HoldemScreenCopy = MobileRouteScreens["holdem"];
export type HoldemAmountFormatter = (value: string) => string;

export const createTableTypeOptions = ["casual", "cash", "tournament"] as const;

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTableTypeLabel(
  copy: HoldemScreenCopy,
  tableType: HoldemTable["tableType"],
) {
  if (tableType === "tournament") {
    return copy.tournamentTable;
  }

  return tableType === "casual" ? copy.casualTable : copy.cashTable;
}

export function formatRakePolicyLabel(params: {
  copy: HoldemScreenCopy;
  formatAmount: HoldemAmountFormatter;
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

export function getSeatStatusLabel(
  seat: HoldemTable["seats"][number],
  copy: HoldemScreenCopy,
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

export function formatDurationMs(value: number | null) {
  if (value === null || Number.isFinite(value) === false) {
    return "—";
  }

  const safeValue = Math.max(0, Math.ceil(value / 1_000));
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function parseTimeMs(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextValue = new Date(value).getTime();
  return Number.isNaN(nextValue) ? null : nextValue;
}

export function resolveSeatTimeBankRemainingMs(
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

export function getActionLabel(
  action: HoldemAction,
  copy: HoldemScreenCopy,
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

export function getRealtimeStatusLabel(
  status: HoldemRealtimeConnectionStatus,
  copy: HoldemScreenCopy,
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

export function getReplayStageLabel(
  stage: string | null,
  copy: HoldemScreenCopy,
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

export function getReplayActionLabel(
  action: string | null,
  copy: HoldemScreenCopy,
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

export function getReplayEventLabel(
  type: string,
  copy: HoldemScreenCopy,
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

export function formatReplayTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return date.toLocaleString();
}

export function getReplaySeatLabel(
  replay: HoldemReplayData,
  seatIndex: number | null,
  copy: HoldemScreenCopy,
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
  copy: HoldemScreenCopy,
) {
  return seatIndexes.map((seatIndex) => getReplaySeatLabel(replay, seatIndex, copy));
}

export function describeReplayEvent(
  replay: HoldemReplayData,
  event: HoldemReplayEvent,
  copy: HoldemScreenCopy,
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
