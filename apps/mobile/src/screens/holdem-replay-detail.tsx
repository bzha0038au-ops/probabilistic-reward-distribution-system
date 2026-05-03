import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import { buildHoldemReplayData } from "@reward/user-core";

import type { MobileRouteScreens } from "../route-copy";
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette as palette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
  mobileTypography,
} from "../theme";
import { ActionButton } from "../ui";
import { PlayingCard } from "./holdem-route-screen.components";
import {
  describeReplayEvent,
  formatReplayTimestamp,
  getReplaySeatLabel,
  getReplayStageLabel,
} from "./holdem-route-screen.helpers";

function StatCard(props: {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "success" | "info";
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{props.label}</Text>
      <Text
        style={[
          styles.statValue,
          props.accent === "success"
            ? styles.statValueSuccess
            : props.accent === "info"
              ? styles.statValueInfo
              : null,
        ]}
      >
        {props.value}
      </Text>
      {props.hint ? <Text style={styles.statHint}>{props.hint}</Text> : null}
    </View>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{props.label}</Text>
      <Text style={styles.detailValue}>{props.value}</Text>
    </View>
  );
}

function ReplayChip(props: {
  label: string;
  tone?: "default" | "info" | "gold";
}) {
  return (
    <View
      style={[
        styles.replayChip,
        props.tone === "info"
          ? styles.replayChipInfo
          : props.tone === "gold"
            ? styles.replayChipGold
            : null,
      ]}
    >
      <Text
        style={[
          styles.replayChipLabel,
          props.tone === "info"
            ? styles.replayChipLabelInfo
            : props.tone === "gold"
              ? styles.replayChipLabelGold
              : null,
        ]}
      >
        {props.label}
      </Text>
    </View>
  );
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

  const ensureEvidenceBundle = useCallback(async () => {
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
    const bundle = await ensureEvidenceBundle();
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
    ensureEvidenceBundle,
    props.screenCopy.replayArtifactCopied,
    props.screenCopy.replayArtifactFailed,
  ]);

  const exportHandEvidence = useCallback(async () => {
    const bundle = await ensureEvidenceBundle();
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
    ensureEvidenceBundle,
    props.history.roundId,
    props.screenCopy.replayArtifactExported,
    props.screenCopy.replayArtifactFailed,
  ]);

  if (!replay) {
    return (
      <View style={[styles.bannerCard, styles.bannerDanger]}>
        <Text style={[styles.bannerText, styles.bannerTextDanger]}>
          {props.screenCopy.replayFailed}
        </Text>
      </View>
    );
  }

  const artifactFailed =
    artifactStatus === props.screenCopy.replayArtifactFailed;

  return (
    <View style={styles.root}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{props.screenCopy.replaySummary}</Text>
            <Text style={styles.heroTitle}>
              {props.screenCopy.hand} #{replay.handNumber ?? "--"}
            </Text>
            <Text style={styles.heroSubtitle}>{replay.tableName ?? "--"}</Text>
          </View>
          <ActionButton
            label={props.screenCopy.replayBackToTable}
            onPress={props.onBack}
            variant="secondary"
            compact
          />
        </View>

        <View style={styles.chipRow}>
          <ReplayChip
            label={getReplayStageLabel(replay.stage, props.screenCopy)}
            tone="gold"
          />
          <ReplayChip
            label={`${props.screenCopy.replayParticipants} ${replay.participants.length}`}
          />
          <ReplayChip
            label={`${props.screenCopy.replayTimeline} ${replay.events.length}`}
            tone="info"
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
      </View>

      {artifactStatus ? (
        <View
          style={[
            styles.bannerCard,
            artifactFailed ? styles.bannerDanger : styles.bannerInfo,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              artifactFailed ? styles.bannerTextDanger : styles.bannerTextInfo,
            ]}
          >
            {artifactStatus}
          </Text>
        </View>
      ) : null}

      <View style={styles.statGrid}>
        <StatCard
          label={props.screenCopy.replayStake}
          value={props.formatAmount(replay.stakeAmount)}
        />
        <StatCard
          label={props.screenCopy.replayPayout}
          value={props.formatAmount(replay.payoutAmount)}
          accent={replay.payoutAmount !== "0.00" ? "success" : "default"}
        />
        <StatCard
          label={props.screenCopy.replayStartedAt}
          value={formatReplayTimestamp(replay.startedAt)}
        />
        <StatCard
          label={props.screenCopy.replaySettledAt}
          value={formatReplayTimestamp(replay.settledAt)}
        />
      </View>

      {evidenceBundle ? (
        <View style={styles.sectionCard}>
          <Text style={styles.eyebrow}>
            {props.screenCopy.replayBundleSummary}
          </Text>
          <Text style={styles.sectionTitle}>
            {evidenceBundle.summaryPage.title}
          </Text>
          <Text style={styles.sectionBody}>
            {evidenceBundle.summaryPage.subtitle}
          </Text>
          <View style={styles.detailList}>
            <DetailRow
              label={props.screenCopy.replayBundleExportedAt}
              value={formatReplayTimestamp(evidenceBundle.exportedAt)}
            />
            <DetailRow
              label={props.screenCopy.replayBundleKeyId}
              value={evidenceBundle.signature.keyId}
            />
            <DetailRow
              label={props.screenCopy.replayBundleDigest}
              value={evidenceBundle.signature.payloadDigest}
            />
          </View>
          <Text style={styles.bundleMarkdown}>
            {evidenceBundle.summaryPage.markdown}
          </Text>
        </View>
      ) : null}

      <View style={styles.panelRow}>
        <View style={[styles.sectionCard, styles.panelCard]}>
          <Text style={styles.eyebrow}>{props.screenCopy.fairness}</Text>
          <Text style={styles.sectionTitle}>
            {props.screenCopy.replayBundleDigest}
          </Text>
          <Text style={styles.hashText}>{replay.fairnessCommitHash ?? "--"}</Text>
          <Text style={styles.sectionBody}>
            {props.screenCopy.replaySupportHint}
          </Text>
        </View>

        <View style={[styles.sectionCard, styles.panelCard]}>
          <Text style={styles.eyebrow}>{props.screenCopy.replayDispute}</Text>
          <View style={styles.detailList}>
            <DetailRow
              label={props.screenCopy.replayRoundId}
              value={props.history.roundId}
            />
            <DetailRow
              label={props.screenCopy.replayReferenceId}
              value={`#${props.history.referenceId}`}
            />
            <DetailRow
              label={props.screenCopy.replayEventCount}
              value={String(props.history.events.length)}
            />
          </View>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>{props.screenCopy.board}</Text>
        <Text style={styles.sectionTitle}>
          {getReplayStageLabel(replay.stage, props.screenCopy)}
        </Text>
        <View style={styles.cardRow}>
          {replay.boardCards.length > 0 ? (
            replay.boardCards.map((card, index) => (
              <PlayingCard key={`board-${index}`} card={card} />
            ))
          ) : (
            <Text style={styles.placeholderText}>
              {props.screenCopy.stagePreflop}
            </Text>
          )}
        </View>
      </View>

      {replay.pots.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Text style={styles.eyebrow}>{props.screenCopy.mainPot}</Text>
          <View style={styles.statGrid}>
            {replay.pots.map((pot) => (
              <StatCard
                key={`pot-${pot.kind}-${pot.potIndex}`}
                label={
                  pot.kind === "main"
                    ? props.screenCopy.mainPot
                    : `${props.screenCopy.sidePot} ${pot.potIndex}`
                }
                value={props.formatAmount(pot.amount)}
                hint={`${props.screenCopy.replayRake}: ${props.formatAmount(
                  pot.rakeAmount,
                )}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionBlock}>
        <Text style={styles.eyebrow}>{props.screenCopy.replayParticipants}</Text>
        <View style={styles.stackColumn}>
          {replay.participants.map((participant) => (
            <View
              key={`participant-${participant.seatIndex}`}
              style={styles.participantCard}
            >
              <View style={styles.rowBetween}>
                <View style={styles.participantHeader}>
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
                  <ReplayChip label={props.screenCopy.winners} tone="gold" />
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

              <View style={styles.statGrid}>
                <StatCard
                  label={props.screenCopy.totalCommitted}
                  value={
                    participant.contributionAmount
                      ? props.formatAmount(participant.contributionAmount)
                      : "--"
                  }
                />
                <StatCard
                  label={props.screenCopy.replayPayout}
                  value={
                    participant.payoutAmount
                      ? props.formatAmount(participant.payoutAmount)
                      : "--"
                  }
                  accent={participant.winner ? "success" : "default"}
                />
                <StatCard
                  label={props.screenCopy.stack}
                  value={
                    participant.stackAfter
                      ? props.formatAmount(participant.stackAfter)
                      : "--"
                  }
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.eyebrow}>{props.screenCopy.replayTimeline}</Text>
        <View style={styles.stackColumn}>
          {replay.events.map((event) => {
            const description = describeReplayEvent(
              replay,
              event,
              props.screenCopy,
            );

            return (
              <View key={`event-${event.sequence}`} style={styles.timelineCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineTitle}>{description.title}</Text>
                    <Text style={styles.timelineDetail}>
                      {description.detail || "--"}
                    </Text>
                  </View>
                  <View style={styles.timelineStamp}>
                    <Text style={styles.timelineStampText}>#{event.sequence}</Text>
                    <Text style={styles.timelineStampText}>
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
    gap: mobileSpacing.lg,
  },
  heroCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: mobileFeedbackTheme.infoHero.backgroundColor,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: mobileSpacing.xs,
  },
  eyebrow: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.hero,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
  },
  replayChip: {
    borderRadius: mobileRadii.full,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
  },
  replayChipInfo: {
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  replayChipGold: {
    backgroundColor: mobileFeedbackTheme.gold.backgroundColor,
  },
  replayChipLabel: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  replayChipLabelInfo: {
    color: mobileFeedbackTheme.info.accentColor,
  },
  replayChipLabelGold: {
    color: mobileFeedbackTheme.gold.accentColor,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  bannerCard: {
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    paddingHorizontal: mobileSpacing.xl,
    paddingVertical: mobileSpacing.lg,
  },
  bannerInfo: {
    borderColor: mobileFeedbackTheme.info.borderColor,
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
    ...mobileChromeTheme.cardShadowSm,
  },
  bannerDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
    ...mobileChromeTheme.cardShadowSm,
  },
  bannerText: {
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  bannerTextInfo: {
    color: mobileFeedbackTheme.info.accentColor,
  },
  bannerTextDanger: {
    color: mobileFeedbackTheme.danger.accentColor,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  statCard: {
    flexGrow: 1,
    minWidth: 140,
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  statLabel: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
    textTransform: "uppercase",
  },
  statValue: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  statValueSuccess: {
    color: palette.success,
  },
  statValueInfo: {
    color: mobileFeedbackTheme.info.accentColor,
  },
  statHint: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 19,
  },
  sectionBlock: {
    gap: mobileSpacing.md,
  },
  sectionCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  panelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  panelCard: {
    flex: 1,
    minWidth: 180,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  sectionBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  detailList: {
    gap: mobileSpacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  detailLabel: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
  },
  detailValue: {
    color: palette.text,
    flexShrink: 1,
    fontFamily: mobileTypography.mono,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
    textAlign: "right",
  },
  bundleMarkdown: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 20,
  },
  hashText: {
    color: mobileFeedbackTheme.infoHero.accentColor,
    fontFamily: mobileTypography.mono,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 20,
  },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  placeholderText: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
  },
  stackColumn: {
    gap: mobileSpacing.md,
  },
  participantCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  participantHeader: {
    flex: 1,
    gap: mobileSpacing.xs,
  },
  participantTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  participantMeta: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  timelineCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  timelineCopy: {
    flex: 1,
    gap: mobileSpacing.xs,
  },
  timelineTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  timelineDetail: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  timelineStamp: {
    alignItems: "flex-end",
    gap: 2,
  },
  timelineStampText: {
    color: palette.textMuted,
    fontFamily: mobileTypography.mono,
    fontSize: mobileTypeScale.fontSize.labelXs,
  },
});
