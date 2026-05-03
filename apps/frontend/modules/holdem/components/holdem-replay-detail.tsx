"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import type { HoldemCardView } from "@reward/shared-types/holdem";

import { useLocale } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import {
  buildHoldemReplayData,
  findReplayParticipant,
} from "@reward/user-core";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

const copy = {
  en: {
    board: "Board",
    fairness: "Fairness commit",
    hand: "Hand",
    pot: "Pot",
    stack: "Stack",
    totalCommitted: "Total invested",
    winners: "Winners",
    replaySummary: "Replay summary",
    replayTimeline: "Event timeline",
    replayParticipants: "Participants",
    replayStake: "Stake",
    replayPayout: "Payout",
    replayRake: "Rake",
    replayStartedAt: "Started",
    replaySettledAt: "Settled",
    replayDispute: "Dispute detail",
    replayRoundId: "Round id",
    replayReferenceId: "Reference id",
    replayEventCount: "Events",
    replaySupportHint:
      "Use the round id, reference id, and fairness commit for audit or dispute review.",
    copyDisputePayload: "Copy dispute payload",
    exportHandEvidence: "Export signed evidence bundle",
    actionCopied: "Dispute payload copied.",
    actionExported: "Signed evidence bundle exported.",
    actionFailed: "Evidence bundle action failed.",
    bundleSummary: "Signed bundle summary",
    bundleExportedAt: "Exported",
    bundleKeyId: "Key id",
    bundleDigest: "Payload digest",
    stagePreflop: "Preflop",
    stageFlop: "Flop",
    stageTurn: "Turn",
    stageRiver: "River",
    stageShowdown: "Showdown",
    fold: "Fold",
    check: "Check",
    call: "Call",
    bet: "Bet",
    raise: "Raise",
    allIn: "All-in",
    hero: "You",
    openSeat: "Open seat",
    eventHandStarted: "Hand started",
    eventCardsDealt: "Hole cards dealt",
    eventSmallBlindPosted: "Small blind posted",
    eventBigBlindPosted: "Big blind posted",
    eventTurnStarted: "Turn started",
    eventTurnTimedOut: "Turn timed out",
    eventPlayerActed: "Player acted",
    eventBoardRevealed: "Board revealed",
    eventFairnessRevealed: "Fairness revealed",
    eventShowdownResolved: "Showdown resolved",
    eventHandWonByFold: "Won by fold",
    eventHandSettled: "Hand settled",
    replayUnavailable: "This hand replay is not available.",
  },
  "zh-CN": {
    board: "公共牌",
    fairness: "公平性提交",
    hand: "手牌",
    pot: "底池",
    stack: "筹码",
    totalCommitted: "本手总投入",
    winners: "赢家",
    replaySummary: "回放摘要",
    replayTimeline: "事件时间线",
    replayParticipants: "参与者",
    replayStake: "投入",
    replayPayout: "结算",
    replayRake: "抽水",
    replayStartedAt: "开始时间",
    replaySettledAt: "结算时间",
    replayDispute: "争议详情",
    replayRoundId: "回合编号",
    replayReferenceId: "牌局记录号",
    replayEventCount: "事件数",
    replaySupportHint: "审计或争议排查时，请使用回合编号、记录号和公平性提交值。",
    copyDisputePayload: "复制争议载荷",
    exportHandEvidence: "导出签名证据包",
    actionCopied: "争议载荷已复制。",
    actionExported: "签名证据包已导出。",
    actionFailed: "证据包操作失败。",
    bundleSummary: "签名证据摘要",
    bundleExportedAt: "导出时间",
    bundleKeyId: "签名键标识",
    bundleDigest: "载荷摘要",
    stagePreflop: "翻牌前",
    stageFlop: "翻牌",
    stageTurn: "转牌",
    stageRiver: "河牌",
    stageShowdown: "摊牌",
    fold: "弃牌",
    check: "过牌",
    call: "跟注",
    bet: "下注",
    raise: "加注",
    allIn: "全下",
    hero: "你",
    openSeat: "空位",
    eventHandStarted: "牌局开始",
    eventCardsDealt: "发出底牌",
    eventSmallBlindPosted: "小盲已下",
    eventBigBlindPosted: "大盲已下",
    eventTurnStarted: "轮到行动",
    eventTurnTimedOut: "行动超时",
    eventPlayerActed: "玩家行动",
    eventBoardRevealed: "翻开公共牌",
    eventFairnessRevealed: "公开公平性种子",
    eventShowdownResolved: "摊牌结算",
    eventHandWonByFold: "弃牌获胜",
    eventHandSettled: "牌局完成结算",
    replayUnavailable: "这手牌回放暂不可用。",
  },
} as const;

type HoldemLocale = keyof typeof copy;
type HoldemCopy = (typeof copy)[HoldemLocale];

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

function isRedSuit(card: HoldemCardView) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function formatReplayTimestamp(
  value: string | Date | null | undefined,
  locale: HoldemLocale,
) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStageLabel(stage: string | null, c: HoldemCopy) {
  switch (stage) {
    case "preflop":
      return c.stagePreflop;
    case "flop":
      return c.stageFlop;
    case "turn":
      return c.stageTurn;
    case "river":
      return c.stageRiver;
    case "showdown":
      return c.stageShowdown;
    default:
      return stage ?? "—";
  }
}

function getActionLabel(action: string | null, c: HoldemCopy) {
  const normalized = action?.toLowerCase().replace(/[\s-]/g, "_") ?? null;

  switch (normalized) {
    case "fold":
      return c.fold;
    case "check":
      return c.check;
    case "call":
      return c.call;
    case "bet":
      return c.bet;
    case "raise":
      return c.raise;
    case "all_in":
      return c.allIn;
    default:
      return action ?? "—";
  }
}

function getEventLabel(type: string, c: HoldemCopy) {
  switch (type) {
    case "hand_started":
      return c.eventHandStarted;
    case "hole_cards_dealt":
      return c.eventCardsDealt;
    case "small_blind_posted":
      return c.eventSmallBlindPosted;
    case "big_blind_posted":
      return c.eventBigBlindPosted;
    case "turn_started":
      return c.eventTurnStarted;
    case "turn_timed_out":
      return c.eventTurnTimedOut;
    case "player_acted":
      return c.eventPlayerActed;
    case "board_revealed":
      return c.eventBoardRevealed;
    case "fairness_revealed":
      return c.eventFairnessRevealed;
    case "showdown_resolved":
      return c.eventShowdownResolved;
    case "hand_won_by_fold":
      return c.eventHandWonByFold;
    case "hand_settled":
      return c.eventHandSettled;
    default:
      return type;
  }
}

function resolveReplayStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("settled") || normalized.includes("won")) {
    return "success" as const;
  }

  if (
    normalized.includes("dispute") ||
    normalized.includes("failed") ||
    normalized.includes("cancel")
  ) {
    return "danger" as const;
  }

  if (normalized.includes("pending") || normalized.includes("active")) {
    return "warning" as const;
  }

  return "neutral" as const;
}

function CardFace(props: { card: HoldemCardView }) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <div
      className={cn(
        "flex h-24 w-16 flex-col justify-between rounded-[1.2rem] border-2 p-3 text-left shadow-[4px_4px_0px_0px_rgba(15,17,31,0.18)]",
        hidden
          ? "border-[#202745] bg-[linear-gradient(180deg,rgba(17,23,45,0.98),rgba(9,11,27,1))] text-[var(--retro-gold)]"
          : "border-[rgba(15,17,31,0.94)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,240,234,0.98))] text-[var(--retro-ink)]",
        !hidden && isRedSuit(props.card) ? "text-[var(--retro-red)]" : null,
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

function getReplaySeatLabel(
  replay: NonNullable<ReturnType<typeof buildHoldemReplayData>>,
  seatIndex: number | null,
  c: HoldemCopy,
) {
  if (seatIndex === null) {
    return "—";
  }

  const participant = findReplayParticipant(replay, seatIndex);
  const baseLabel = participant?.displayName ?? `${c.openSeat} ${seatIndex + 1}`;

  return replay.viewerSeatIndex === seatIndex
    ? `${baseLabel} · ${c.hero}`
    : baseLabel;
}

function getReplayWinnerLabels(
  replay: NonNullable<ReturnType<typeof buildHoldemReplayData>>,
  seatIndexes: number[],
  c: HoldemCopy,
) {
  return seatIndexes.map((seatIndex) => getReplaySeatLabel(replay, seatIndex, c));
}

function describeReplayEvent(
  replay: NonNullable<ReturnType<typeof buildHoldemReplayData>>,
  event: NonNullable<ReturnType<typeof buildHoldemReplayData>>["events"][number],
  c: HoldemCopy,
  locale: HoldemLocale,
) {
  const winnerLabels =
    event.winnerSeatIndexes.length > 0
      ? getReplayWinnerLabels(replay, event.winnerSeatIndexes, c).join(", ")
      : null;
  const actorLabel = getReplaySeatLabel(replay, event.seatIndex, c);
  const eventCards =
    event.type === "board_revealed"
      ? event.newCards.length > 0
        ? event.newCards
        : event.boardCards
      : event.type === "hole_cards_dealt"
        ? (findReplayParticipant(replay, replay.viewerSeatIndex)?.holeCards ?? [])
        : [];

  switch (event.type) {
    case "hand_started":
      return {
        title: getEventLabel(event.type, c),
        detail: [
          replay.handNumber !== null ? `${c.hand} #${replay.handNumber}` : null,
          getStageLabel(event.stage ?? replay.stage, c),
        ]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
    case "small_blind_posted":
    case "big_blind_posted":
      return {
        title: getEventLabel(event.type, c),
        detail: [actorLabel, event.amount ? formatAmount(event.amount) : null]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
    case "turn_started":
      return {
        title: getEventLabel(event.type, c),
        detail: [
          actorLabel,
          getStageLabel(event.stage ?? replay.stage, c),
          event.turnDeadlineAt
            ? formatReplayTimestamp(event.turnDeadlineAt, locale)
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
    case "turn_timed_out":
      return {
        title: getEventLabel(event.type, c),
        detail: [
          actorLabel,
          event.timeoutAction ? getActionLabel(event.timeoutAction, c) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
    case "player_acted":
      return {
        title: getEventLabel(event.type, c),
        detail: [
          actorLabel,
          getActionLabel(event.action ?? event.lastAction, c),
          event.amount ? formatAmount(event.amount) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
    case "board_revealed":
      return {
        title: getEventLabel(event.type, c),
        detail: getStageLabel(event.stage ?? replay.stage, c),
        cards: eventCards,
      };
    case "showdown_resolved":
    case "hand_won_by_fold":
    case "hand_settled":
      return {
        title: getEventLabel(event.type, c),
        detail: [
          winnerLabels ? `${c.winners}: ${winnerLabels}` : null,
          event.type === "hand_settled" && replay.totalRakeAmount
            ? `${c.replayRake}: ${formatAmount(replay.totalRakeAmount)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
    default:
      return {
        title: getEventLabel(event.type, c),
        detail: [
          event.stage ? getStageLabel(event.stage, c) : null,
          winnerLabels ? `${c.winners}: ${winnerLabels}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cards: eventCards,
      };
  }
}

export function HoldemReplayDetail(props: {
  history: HandHistory;
  mode?: "inline" | "page";
}) {
  const locale = useLocale();
  const resolvedLocale: HoldemLocale = locale === "zh-CN" ? "zh-CN" : "en";
  const c = copy[resolvedLocale];
  const replay = buildHoldemReplayData(props.history);
  const [artifactStatus, setArtifactStatus] = useState<string | null>(null);
  const [evidenceBundle, setEvidenceBundle] =
    useState<HoldemSignedEvidenceBundle | null>(null);

  useEffect(() => {
    setArtifactStatus(null);
    setEvidenceBundle(null);
  }, [props.history.roundId]);

  const loadEvidenceBundle = useCallback(async () => {
    if (evidenceBundle) {
      return evidenceBundle;
    }

    const response = await browserUserApiClient.getHandHistoryEvidenceBundle(
      props.history.roundId,
    );
    if (!response.ok) {
      setArtifactStatus(response.error?.message ?? c.actionFailed);
      return null;
    }

    setEvidenceBundle(response.data);
    return response.data;
  }, [c.actionFailed, evidenceBundle, props.history.roundId]);

  const copyDisputePayload = useCallback(async () => {
    const bundle = await loadEvidenceBundle();
    if (!bundle || !navigator?.clipboard?.writeText) {
      setArtifactStatus(c.actionFailed);
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(bundle.disputePayload, null, 2),
      );
      setArtifactStatus(c.actionCopied);
    } catch {
      setArtifactStatus(c.actionFailed);
    }
  }, [c.actionCopied, c.actionFailed, loadEvidenceBundle]);

  const exportHandEvidence = useCallback(async () => {
    const bundle = await loadEvidenceBundle();
    if (!bundle) {
      return;
    }

    try {
      const fileSafeRoundId = props.history.roundId.replace(
        /[^a-zA-Z0-9_-]+/g,
        "-",
      );
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `holdem-signed-evidence-bundle-${fileSafeRoundId}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setArtifactStatus(c.actionExported);
    } catch {
      setArtifactStatus(c.actionFailed);
    }
  }, [c.actionExported, c.actionFailed, loadEvidenceBundle, props.history.roundId]);

  if (!replay) {
    return (
      <GameStatusNotice surface="light" tone="danger">
        {c.replayUnavailable}
      </GameStatusNotice>
    );
  }

  const isPage = props.mode === "page";
  const artifactTone =
    artifactStatus === c.actionCopied || artifactStatus === c.actionExported
      ? "success"
      : "danger";

  return (
    <div
      className={cn(
        "space-y-5",
        isPage ? "" : "rounded-[1.65rem] border border-[rgba(15,17,31,0.12)] bg-white/58 p-1",
      )}
    >
      <div className="grid gap-5 xl:grid-cols-[1.08fr,0.92fr]">
        <GameSurfaceCard className="overflow-hidden" tone="light">
          <CardContent className="retro-ivory-surface relative p-5 md:p-6">
            <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
            <div className="relative space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="retro-kicker">{c.replaySummary}</span>
                  <div className="space-y-2">
                    <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[var(--retro-ink)] md:text-[2.35rem]">
                      {c.hand} #{replay.handNumber ?? "—"} ·{" "}
                      {getStageLabel(replay.stage, c)}
                    </h2>
                    <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                      {replay.tableName ?? "—"}
                    </p>
                  </div>
                </div>

                <GamePill surface="light" tone={resolveReplayStatusTone(replay.status)}>
                  {replay.status}
                </GamePill>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <GameMetricTile
                  tone="light"
                  label={c.replayStake}
                  value={formatAmount(replay.stakeAmount)}
                  valueClassName="text-xl font-black tracking-[-0.03em] text-[var(--retro-orange)]"
                />
                <GameMetricTile
                  tone="light"
                  label={c.replayPayout}
                  value={formatAmount(replay.payoutAmount)}
                  valueClassName="text-xl font-black tracking-[-0.03em] text-[var(--retro-violet)]"
                />
                <GameMetricTile
                  tone="light"
                  label={c.replayStartedAt}
                  value={formatReplayTimestamp(replay.startedAt, resolvedLocale)}
                  valueClassName="mt-2 text-sm font-semibold text-[var(--retro-ink)]"
                />
                <GameMetricTile
                  tone="light"
                  label={c.replaySettledAt}
                  value={formatReplayTimestamp(replay.settledAt, resolvedLocale)}
                  valueClassName="mt-2 text-sm font-semibold text-[var(--retro-ink)]"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="arcadeDark" onClick={() => void copyDisputePayload()}>
                  {c.copyDisputePayload}
                </Button>
                <Button type="button" variant="arcadeOutline" onClick={exportHandEvidence}>
                  {c.exportHandEvidence}
                </Button>
              </div>

              {artifactStatus ? (
                <GameStatusNotice surface="light" tone={artifactTone}>
                  {artifactStatus}
                </GameStatusNotice>
              ) : null}
            </div>
          </CardContent>
        </GameSurfaceCard>

        <GameSurfaceCard tone="dark">
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                {c.replayDispute}
              </p>
              <div className="space-y-2">
                <h3 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-50">
                  {c.fairness}
                </h3>
                <p className="break-all font-mono text-sm leading-6 text-[var(--retro-gold)]">
                  {replay.fairnessCommitHash ?? "—"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <GameMetricTile
                tone="dark"
                label={c.replayRoundId}
                value={
                  <span className="break-all text-sm font-semibold text-slate-100">
                    {props.history.roundId}
                  </span>
                }
              />
              <GameMetricTile
                tone="dark"
                label={c.replayReferenceId}
                value={`#${props.history.referenceId}`}
              />
              <GameMetricTile
                tone="dark"
                label={c.replayEventCount}
                value={props.history.events.length}
              />
            </div>

            <p className="text-sm leading-6 text-slate-300">{c.replaySupportHint}</p>

            {evidenceBundle ? (
              <GameSectionBlock className="space-y-4" tone="dark">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                      {c.bundleSummary}
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-50">
                      {evidenceBundle.summaryPage.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {evidenceBundle.summaryPage.subtitle}
                    </p>
                  </div>
                  <GamePill surface="dark" tone="accent">
                    {evidenceBundle.signature.algorithm}
                  </GamePill>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <GameMetricTile
                    tone="dark"
                    label={c.bundleExportedAt}
                    value={formatReplayTimestamp(
                      evidenceBundle.exportedAt,
                      resolvedLocale,
                    )}
                  />
                  <GameMetricTile
                    tone="dark"
                    label={c.bundleKeyId}
                    value={
                      <span className="break-all text-sm font-semibold text-slate-100">
                        {evidenceBundle.signature.keyId}
                      </span>
                    }
                  />
                  <GameMetricTile
                    tone="dark"
                    label={c.bundleDigest}
                    value={
                      <span className="break-all text-sm font-semibold text-slate-100">
                        {evidenceBundle.signature.payloadDigest}
                      </span>
                    }
                  />
                </div>

                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[1.15rem] border border-white/10 bg-[rgba(7,10,23,0.78)] p-4 text-xs leading-6 text-slate-300">
                  {evidenceBundle.summaryPage.markdown}
                </pre>
              </GameSectionBlock>
            ) : null}
          </CardContent>
        </GameSurfaceCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.02fr,0.98fr]">
        <div className="space-y-5">
          <GameSurfaceCard tone="light">
            <CardContent className="space-y-5 p-5 md:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                  {c.board}
                </p>
                <h3 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                  {getStageLabel(replay.stage, c)}
                </h3>
              </div>

              <div className="retro-felt-surface rounded-[2.25rem] px-5 py-6">
                <div className="flex flex-wrap gap-2">
                  {replay.boardCards.length > 0 ? (
                    replay.boardCards.map((card, index) => (
                      <CardFace key={`replay-board-${index}`} card={card} />
                    ))
                  ) : (
                    <div className="rounded-[1.15rem] border border-dashed border-white/18 bg-[rgba(7,10,23,0.28)] px-4 py-6 text-sm text-slate-200">
                      {c.stagePreflop}
                    </div>
                  )}
                </div>
              </div>

              {replay.pots.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {replay.pots.map((pot) => (
                    <GameSectionBlock
                      key={`replay-pot-${pot.kind}-${pot.potIndex}`}
                      tone="light"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                        {pot.kind === "main" ? c.pot : `${c.pot} ${pot.potIndex}`}
                      </p>
                      <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[var(--retro-ink)]">
                        {formatAmount(pot.amount)}
                      </p>
                      <p className="mt-2 text-sm text-[rgba(15,17,31,0.62)]">
                        {c.replayRake}: {formatAmount(pot.rakeAmount)}
                      </p>
                      {pot.winnerSeatIndexes.length > 0 ? (
                        <p className="mt-3 text-sm font-semibold text-[var(--retro-green)]">
                          {c.winners}:{" "}
                          {getReplayWinnerLabels(replay, pot.winnerSeatIndexes, c).join(", ")}
                        </p>
                      ) : null}
                    </GameSectionBlock>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </GameSurfaceCard>

          <GameSurfaceCard tone="light">
            <CardContent className="space-y-4 p-5 md:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                  {c.replayParticipants}
                </p>
                <h3 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                  {c.replayParticipants}
                </h3>
              </div>

              <div className="space-y-3">
                {replay.participants.map((participant) => (
                  <div
                    key={`replay-participant-${participant.seatIndex}`}
                    className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/84 p-4 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--retro-ink)]">
                          {getReplaySeatLabel(replay, participant.seatIndex, c)}
                        </p>
                        <p className="mt-1 text-sm text-[rgba(15,17,31,0.58)]">
                          {participant.bestHandLabel ?? participant.lastAction ?? "—"}
                        </p>
                      </div>
                      {participant.winner ? (
                        <GamePill surface="light" tone="success">
                          {c.winners}
                        </GamePill>
                      ) : null}
                    </div>

                    {participant.holeCards.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {participant.holeCards.map((card, index) => (
                          <CardFace
                            key={`replay-hole-${participant.seatIndex}-${index}`}
                            card={card}
                          />
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <GameMetricTile
                        tone="light"
                        label={c.totalCommitted}
                        value={
                          participant.contributionAmount
                            ? formatAmount(participant.contributionAmount)
                            : "—"
                        }
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-ink)]"
                      />
                      <GameMetricTile
                        tone="light"
                        label={c.replayPayout}
                        value={
                          participant.payoutAmount
                            ? formatAmount(participant.payoutAmount)
                            : "—"
                        }
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-violet)]"
                      />
                      <GameMetricTile
                        tone="light"
                        label={c.stack}
                        value={
                          participant.stackAfter
                            ? formatAmount(participant.stackAfter)
                            : "—"
                        }
                        valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-orange)]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </GameSurfaceCard>
        </div>

        <GameSurfaceCard tone="dark">
          <CardContent className="space-y-4 p-5 md:p-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                {c.replayTimeline}
              </p>
              <h3 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-50">
                {c.replayTimeline}
              </h3>
            </div>

            <div className="space-y-3">
              {replay.events.map((event) => {
                const description = describeReplayEvent(
                  replay,
                  event,
                  c,
                  resolvedLocale,
                );

                return (
                  <div
                    key={`replay-event-${event.sequence}`}
                    className="rounded-[1.35rem] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-50">
                          {description.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          {description.detail || "—"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>#{event.sequence}</p>
                        <p>{formatReplayTimestamp(event.createdAt, resolvedLocale)}</p>
                      </div>
                    </div>

                    {description.cards.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {description.cards.map((card, index) => (
                          <CardFace
                            key={`replay-event-card-${event.sequence}-${index}`}
                            card={card}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </GameSurfaceCard>
      </div>
    </div>
  );
}
