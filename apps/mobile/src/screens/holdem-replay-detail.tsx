import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import type { HoldemCardView } from "@reward/shared-types/holdem";
import {
  buildHoldemReplayData,
  findReplayParticipant,
  type HoldemReplayData,
  type HoldemReplayEvent,
} from "@reward/user-core";

import type { MobileRouteScreens } from "../route-copy";
import { mobileFeedbackTheme, mobilePalette as palette } from "../theme";
import { ActionButton } from "../ui";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

function isRedSuit(card: HoldemCardView) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function PlayingCard(props: { card: HoldemCardView }) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <View style={[styles.playingCard, hidden ? styles.playingCardHidden : null]}>
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
    case "fairness_revealed":
      return copy.eventFairnessRevealed;
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
        detail: [actorLabel, event.amount].filter(Boolean).join(" · "),
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

export function HoldemReplayDetail(props: {
  history: HandHistory;
  screenCopy: MobileRouteScreens["holdem"];
  formatAmount: (value: string) => string;
  onBack: () => void;
  loadEvidenceBundle: (
    roundId: string,
  ) => Promise<HoldemSignedEvidenceBundle | null>;
}) {
  const replay = buildHoldemReplayData(props.history);
  const [artifactStatus, setArtifactStatus] = useState<string | null>(null);
  const [evidenceBundle, setEvidenceBundle] =
    useState<HoldemSignedEvidenceBundle | null>(null);

  useEffect(() => {
    setArtifactStatus(null);
    setEvidenceBundle(null);
  }, [props.history.roundId]);

  if (!replay) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorLabel}>{props.screenCopy.replayFailed}</Text>
      </View>
    );
  }

  const loadEvidenceBundle = useCallback(async () => {
    if (evidenceBundle) {
      return evidenceBundle;
    }

    const bundle = await props.loadEvidenceBundle(props.history.roundId);
    if (!bundle) {
      setArtifactStatus(props.screenCopy.replayArtifactFailed);
      return null;
    }

    setEvidenceBundle(bundle);
    return bundle;
  }, [
    evidenceBundle,
    props.history.roundId,
    props.loadEvidenceBundle,
    props.screenCopy.replayArtifactFailed,
  ]);

  const copyDisputePayload = useCallback(async () => {
    const bundle = await loadEvidenceBundle();
    if (!bundle) {
      return;
    }

    try {
      await Clipboard.setStringAsync(
        JSON.stringify(bundle.disputePayload, null, 2),
      );
      setArtifactStatus(props.screenCopy.replayArtifactCopied);
    } catch {
      setArtifactStatus(props.screenCopy.replayArtifactFailed);
    }
  }, [
    loadEvidenceBundle,
    props.screenCopy.replayArtifactCopied,
    props.screenCopy.replayArtifactFailed,
  ]);

  const exportHandEvidence = useCallback(async () => {
    const bundle = await loadEvidenceBundle();
    if (!bundle) {
      return;
    }

    try {
      await Share.share({
        title: `holdem-signed-evidence-bundle-${props.history.roundId}.json`,
        message: JSON.stringify(bundle, null, 2),
      });
      setArtifactStatus(props.screenCopy.replayArtifactExported);
    } catch {
      setArtifactStatus(props.screenCopy.replayArtifactFailed);
    }
  }, [
    loadEvidenceBundle,
    props.history.roundId,
    props.screenCopy.replayArtifactExported,
    props.screenCopy.replayArtifactFailed,
  ]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerBody}>
          <Text style={styles.sectionLabel}>{props.screenCopy.replaySummary}</Text>
          <Text style={styles.title}>
            {props.screenCopy.hand} #{replay.handNumber ?? "--"} ·{" "}
            {getReplayStageLabel(replay.stage, props.screenCopy)}
          </Text>
          <Text style={styles.subtitle}>{replay.tableName ?? "--"}</Text>
        </View>
        <ActionButton
          label={props.screenCopy.replayBackToTable}
          onPress={props.onBack}
          variant="secondary"
          compact
        />
      </View>

      <View style={styles.actionRow}>
        <ActionButton
          label={props.screenCopy.copyDisputePayload}
          onPress={() => void copyDisputePayload()}
          variant="secondary"
          compact
        />
        <ActionButton
          label={props.screenCopy.exportHandEvidence}
          onPress={() => void exportHandEvidence()}
          compact
        />
      </View>

      {artifactStatus ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>{artifactStatus}</Text>
        </View>
      ) : null}

      {evidenceBundle ? (
        <View style={styles.blockCard}>
          <Text style={styles.sectionLabel}>
            {props.screenCopy.replayBundleSummary}
          </Text>
          <Text style={styles.eventTitle}>{evidenceBundle.summaryPage.title}</Text>
          <Text style={styles.participantMeta}>
            {evidenceBundle.summaryPage.subtitle}
          </Text>
          <View style={styles.disputeList}>
            <View style={styles.disputeRow}>
              <Text style={styles.disputeLabel}>
                {props.screenCopy.replayBundleExportedAt}
              </Text>
              <Text style={styles.disputeValue}>
                {formatReplayTimestamp(evidenceBundle.exportedAt)}
              </Text>
            </View>
            <View style={styles.disputeRow}>
              <Text style={styles.disputeLabel}>
                {props.screenCopy.replayBundleKeyId}
              </Text>
              <Text style={styles.disputeValue}>
                {evidenceBundle.signature.keyId}
              </Text>
            </View>
            <View style={styles.disputeRow}>
              <Text style={styles.disputeLabel}>
                {props.screenCopy.replayBundleDigest}
              </Text>
              <Text style={styles.disputeValue}>
                {evidenceBundle.signature.payloadDigest}
              </Text>
            </View>
          </View>
          <Text style={styles.bundleMarkdown}>
            {evidenceBundle.summaryPage.markdown}
          </Text>
        </View>
      ) : null}

      <View style={styles.metaGrid}>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>{props.screenCopy.replayStake}</Text>
          <Text style={styles.metaValue}>
            {props.formatAmount(replay.stakeAmount)}
          </Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>{props.screenCopy.replayPayout}</Text>
          <Text style={styles.metaValue}>
            {props.formatAmount(replay.payoutAmount)}
          </Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>{props.screenCopy.replayStartedAt}</Text>
          <Text style={styles.metaValue}>
            {formatReplayTimestamp(replay.startedAt)}
          </Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>{props.screenCopy.replaySettledAt}</Text>
          <Text style={styles.metaValue}>
            {formatReplayTimestamp(replay.settledAt)}
          </Text>
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.blockCard}>
          <Text style={styles.metaLabel}>{props.screenCopy.fairness}</Text>
          <Text style={styles.fairnessValue}>
            {replay.fairnessCommitHash ?? "--"}
          </Text>
        </View>

        <View style={styles.blockCard}>
          <Text style={styles.metaLabel}>{props.screenCopy.replayDispute}</Text>
          <View style={styles.disputeList}>
            <View style={styles.disputeRow}>
              <Text style={styles.disputeLabel}>{props.screenCopy.replayRoundId}</Text>
              <Text style={styles.disputeValue}>{props.history.roundId}</Text>
            </View>
            <View style={styles.disputeRow}>
              <Text style={styles.disputeLabel}>
                {props.screenCopy.replayReferenceId}
              </Text>
              <Text style={styles.disputeValue}>#{props.history.referenceId}</Text>
            </View>
            <View style={styles.disputeRow}>
              <Text style={styles.disputeLabel}>{props.screenCopy.replayEventCount}</Text>
              <Text style={styles.disputeValue}>{props.history.events.length}</Text>
            </View>
          </View>
          <Text style={styles.supportHint}>{props.screenCopy.replaySupportHint}</Text>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>{props.screenCopy.board}</Text>
        <View style={styles.cardRow}>
          {replay.boardCards.length > 0 ? (
            replay.boardCards.map((card, index) => (
              <PlayingCard key={`board-${index}`} card={card} />
            ))
          ) : (
            <Text style={styles.placeholderText}>{props.screenCopy.stagePreflop}</Text>
          )}
        </View>
      </View>

      {replay.pots.length > 0 ? (
        <View style={styles.gridRow}>
          {replay.pots.map((pot) => (
            <View
              key={`pot-${pot.kind}-${pot.potIndex}`}
              style={styles.blockCard}
            >
              <Text style={styles.metaLabel}>
                {pot.kind === "main"
                  ? props.screenCopy.mainPot
                  : `${props.screenCopy.sidePot} ${pot.potIndex}`}
              </Text>
              <Text style={styles.metaValue}>
                {props.formatAmount(pot.amount)}
              </Text>
              <Text style={styles.metaHint}>
                {props.screenCopy.replayRake}: {props.formatAmount(pot.rakeAmount)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>{props.screenCopy.replayParticipants}</Text>
        <View style={styles.column}>
          {replay.participants.map((participant) => (
            <View
              key={`participant-${participant.seatIndex}`}
              style={styles.blockCard}
            >
              <View style={styles.rowBetween}>
                <View style={styles.headerBody}>
                  <Text style={styles.participantTitle}>
                    {getReplaySeatLabel(
                      replay,
                      participant.seatIndex,
                      props.screenCopy,
                    )}
                  </Text>
                  <Text style={styles.participantMeta}>
                    {participant.bestHandLabel ?? participant.lastAction ?? "--"}
                  </Text>
                </View>
                {participant.winner ? (
                  <Text style={styles.participantWinner}>
                    {props.screenCopy.winners}
                  </Text>
                ) : null}
              </View>

              {participant.holeCards.length > 0 ? (
                <View style={styles.cardRow}>
                  {participant.holeCards.map((card, index) => (
                    <PlayingCard
                      key={`hole-${participant.seatIndex}-${index}`}
                      card={card}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.metaGrid}>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>
                    {props.screenCopy.totalCommitted}
                  </Text>
                  <Text style={styles.metaValue}>
                    {participant.contributionAmount
                      ? props.formatAmount(participant.contributionAmount)
                      : "--"}
                  </Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>
                    {props.screenCopy.replayPayout}
                  </Text>
                  <Text style={styles.metaValue}>
                    {participant.payoutAmount
                      ? props.formatAmount(participant.payoutAmount)
                      : "--"}
                  </Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{props.screenCopy.stack}</Text>
                  <Text style={styles.metaValue}>
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

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>{props.screenCopy.replayTimeline}</Text>
        <View style={styles.column}>
          {replay.events.map((event) => {
            const description = describeReplayEvent(replay, event, props.screenCopy);
            return (
              <View key={`event-${event.sequence}`} style={styles.blockCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.headerBody}>
                    <Text style={styles.eventTitle}>{description.title}</Text>
                    <Text style={styles.participantMeta}>
                      {description.detail || "--"}
                    </Text>
                  </View>
                  <View style={styles.eventStamp}>
                    <Text style={styles.eventStampText}>#{event.sequence}</Text>
                    <Text style={styles.eventStampText}>
                      {formatReplayTimestamp(event.createdAt)}
                    </Text>
                  </View>
                </View>

                {description.cards.length > 0 ? (
                  <View style={styles.cardRow}>
                    {description.cards.map((card, index) => (
                      <PlayingCard
                        key={`event-card-${event.sequence}-${index}`}
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
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerBody: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 13,
  },
  sectionLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaCard: {
    flex: 1,
    minWidth: 120,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  metaLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  metaHint: {
    color: palette.textMuted,
    fontSize: 12,
  },
  block: {
    gap: 10,
  },
  statusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusLabel: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  bundleMarkdown: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  blockCard: {
    flex: 1,
    minWidth: 140,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 12,
  },
  fairnessValue: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  disputeList: {
    gap: 8,
  },
  disputeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  disputeLabel: {
    color: palette.textMuted,
    fontSize: 13,
  },
  disputeValue: {
    color: palette.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  supportHint: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  placeholderText: {
    color: palette.textMuted,
    fontSize: 14,
  },
  column: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  participantTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  participantMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  participantWinner: {
    color: mobileFeedbackTheme.success.accentColor,
    fontSize: 12,
    fontWeight: "700",
  },
  eventTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  eventStamp: {
    alignItems: "flex-end",
    gap: 2,
  },
  eventStampText: {
    color: palette.textMuted,
    fontSize: 11,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorLabel: {
    color: mobileFeedbackTheme.danger.accentColor,
    fontSize: 13,
    lineHeight: 18,
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
});
