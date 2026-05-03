import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  RewardCenterResponse,
  RewardMission,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import type { MobileRewardCenterCopy } from "../mobile-copy";
import type { MobileRouteLabels } from "../route-copy";
import { RouteSwitcher } from "../screens/route-switcher";
import type { MobileAppRoute, MobileStyles } from "../screens/types";
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobileGameTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
import { ActionButton, SectionCard } from "../ui";
import { RewardMissionCard } from "./domain-ui";

const rewardMissionFilterOrder = [
  "all",
  "ready",
  "in_progress",
  "claimed",
  "disabled",
] as const;

type RewardMissionFilter = (typeof rewardMissionFilterOrder)[number];

type RewardCenterSectionProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  copy: MobileRewardCenterCopy;
  rewardCenter: RewardCenterResponse | null;
  loadingRewardCenter: boolean;
  claimingMissionId: RewardMissionId | null;
  lastClaimReceipt: {
    missionId: RewardMissionId;
    grantedAmount: string;
  } | null;
  submitting: boolean;
  playingDrawCount: number | null;
  playingQuickEight: boolean;
  formatAmount: (value: string) => string;
  formatOptionalTimestamp: (value: string | Date | null) => string | null;
  onRefreshRewardCenter: () => void;
  onClaimReward: (missionId: RewardMissionId) => void;
  onDismissClaimReceipt: () => void;
};

export function RewardCenterSection(props: RewardCenterSectionProps) {
  const [filter, setFilter] = useState<RewardMissionFilter>("all");

  const legacyMissionCopy = props.copy.legacyMissionCopy as Record<
    string,
    { title: string; description: string }
  >;

  const resolveMissionCopy = (mission: RewardCenterResponse["missions"][number]) =>
    (mission.title.trim() !== "" || mission.description.trim() !== ""
      ? {
          title: mission.title,
          description: mission.description,
        }
      : legacyMissionCopy[mission.id]) ?? {
      title: mission.title,
      description: mission.description,
    };

  const buildMissionMetaLines = (mission: RewardMission) => {
    const claimedAt = props.formatOptionalTimestamp(mission.claimedAt);
    const resetsAt = props.formatOptionalTimestamp(mission.resetsAt);

    return [
      ...(claimedAt ? [props.copy.claimedAt(claimedAt)] : []),
      ...(resetsAt ? [props.copy.resetsAt(resetsAt)] : []),
      ...(!claimedAt && !resetsAt ? [props.copy.claimWhenReady] : []),
    ];
  };

  const missions = props.rewardCenter?.missions ?? [];
  const summary = props.rewardCenter?.summary;
  const readyMissionCount = summary?.availableMissionCount ?? 0;
  const claimedMissionCount =
    summary?.claimedMissionCount ??
    missions.filter((mission) => mission.status === "claimed").length;
  const liveMissionCount = missions.filter(
    (mission) =>
      mission.status === "ready" || mission.status === "in_progress",
  ).length;
  const featuredMission =
    missions.find((mission) => mission.status === "ready") ??
    missions.find((mission) => mission.status === "in_progress") ??
    missions[0] ??
    null;
  const featuredMissionCopy = featuredMission
    ? resolveMissionCopy(featuredMission)
    : null;
  const featuredProgressPercent = featuredMission
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (featuredMission.progressCurrent / featuredMission.progressTarget) * 100,
          ),
        ),
      )
    : 0;
  const claimSpotlightMission =
    missions.find((mission) => mission.claimable && !mission.autoAwarded) ??
    missions.find((mission) => mission.claimable) ??
    null;
  const claimSpotlightCopy = claimSpotlightMission
    ? resolveMissionCopy(claimSpotlightMission)
    : null;
  const claimSpotlightProgressPercent = claimSpotlightMission
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (claimSpotlightMission.progressCurrent /
              claimSpotlightMission.progressTarget) *
              100,
          ),
        ),
      )
    : 0;
  const claimReceiptMission = props.lastClaimReceipt
    ? missions.find((mission) => mission.id === props.lastClaimReceipt?.missionId) ??
      null
    : null;
  const claimReceiptCopy = claimReceiptMission
    ? resolveMissionCopy(claimReceiptMission)
    : props.lastClaimReceipt
      ? legacyMissionCopy[props.lastClaimReceipt.missionId] ?? null
      : null;

  const statusCounts: Record<RewardMissionFilter, number> = {
    all: missions.length,
    ready: missions.filter((mission) => mission.status === "ready").length,
    in_progress: missions.filter((mission) => mission.status === "in_progress")
      .length,
    claimed: missions.filter((mission) => mission.status === "claimed").length,
    disabled: missions.filter((mission) => mission.status === "disabled").length,
  };

  const filteredMissions =
    filter === "all"
      ? missions
      : missions.filter((mission) => mission.status === filter);
  const featuredMissionIncluded =
    featuredMission !== null
      ? filteredMissions.some((mission) => mission.id === featuredMission.id)
      : false;
  const queueMissions = featuredMissionIncluded
    ? filteredMissions.filter((mission) => mission.id !== featuredMission?.id)
    : filteredMissions;

  const renderMissionAction = (mission: RewardMission) => {
    const fullWidth = mission.id === featuredMission?.id;
    if (mission.autoAwarded) {
      return <Text style={styles.rewardAutoNote}>{props.copy.autoAwardedNote}</Text>;
    }

    return (
      <ActionButton
        label={
          props.claimingMissionId === mission.id
            ? props.copy.claiming
            : props.copy.claim
        }
        onPress={() => props.onClaimReward(mission.id)}
        disabled={
          !mission.claimable ||
          props.claimingMissionId === mission.id ||
          props.loadingRewardCenter ||
          props.submitting
        }
        variant={mission.claimable ? "gold" : "secondary"}
        compact={!fullWidth}
        fullWidth={fullWidth}
      />
    );
  };

  const resolveMissionTone = (mission: RewardMission) =>
    mission.status === "claimed"
      ? "success"
      : mission.status === "ready"
        ? "gold"
        : mission.status === "disabled"
          ? "muted"
          : "blue";

  return (
    <>
      <SectionCard title={props.copy.title}>
        <RouteSwitcher
          styles={props.styles}
          currentRoute={props.currentRoute}
          labels={props.routeLabels}
          navigationLocked={props.routeNavigationLocked}
          onOpenRoute={props.onOpenRoute}
        />

        <View style={styles.rewardBoardCard}>
          <View style={styles.rewardBoardHeader}>
            <View style={styles.rewardBoardCopy}>
              <Text style={styles.rewardBoardTitle}>{props.copy.overviewTitle}</Text>
            </View>

            <View
              style={[
                props.styles.badge,
                summary?.todayDailyClaimed
                  ? props.styles.badgeSuccess
                  : styles.rewardBoardPendingBadge,
              ]}
            >
              <Text style={props.styles.badgeText}>
                {summary?.todayDailyClaimed
                  ? props.copy.todayClaimedTitle
                  : props.copy.todayPendingTitle}
              </Text>
            </View>
          </View>

          <View style={styles.rewardBoardMetrics}>
            <View style={styles.rewardBoardPrimaryMetric}>
              <Text style={styles.rewardBoardPrimaryLabel}>
                {props.copy.summary.bonusBalance}
              </Text>
              <Text style={styles.rewardBoardPrimaryValue}>
                {props.formatAmount(summary?.bonusBalance ?? "0")}
              </Text>
            </View>

            <View style={styles.rewardBoardSecondaryColumn}>
              <View style={styles.rewardBoardSecondaryMetric}>
                <Text style={styles.rewardBoardSecondaryLabel}>
                  {props.copy.summary.readyToClaim}
                </Text>
                <Text style={styles.rewardBoardSecondaryValue}>
                  {readyMissionCount}
                </Text>
              </View>
              <View style={styles.rewardBoardSecondaryMetric}>
                <Text style={styles.rewardBoardSecondaryLabel}>
                  {props.copy.summary.claimedMissions}
                </Text>
                <Text style={styles.rewardBoardSecondaryValue}>
                  {claimedMissionCount}
                </Text>
              </View>
            </View>
          </View>

          <View style={props.styles.inlineActions}>
            <ActionButton
              label={
                props.loadingRewardCenter
                  ? props.copy.refreshing
                  : props.copy.refresh
              }
              onPress={props.onRefreshRewardCenter}
              disabled={
                props.loadingRewardCenter ||
                props.submitting ||
                props.claimingMissionId !== null ||
                props.playingDrawCount !== null ||
                props.playingQuickEight
              }
              variant="secondary"
              compact
            />
            <View style={[props.styles.badge, props.styles.badgeMuted]}>
              <Text style={props.styles.badgeText}>
                {props.copy.summary.checkInStreak} {summary?.streakDays ?? 0}
              </Text>
            </View>
            <View style={[props.styles.badge, props.styles.badgeMuted]}>
              <Text style={props.styles.badgeText}>
                {liveMissionCount} {props.copy.liveMissionLabel}
              </Text>
            </View>
            {summary?.todayDailyClaimed ? (
              <View style={[props.styles.badge, props.styles.badgeSuccess]}>
                <Text style={props.styles.badgeText}>
                  {props.copy.todayCheckInGranted}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {props.lastClaimReceipt ? (
          <View style={styles.claimSuccessCard}>
            <View style={styles.claimSuccessHeader}>
              <View style={styles.claimSuccessMedallion}>
                <Text style={styles.claimSuccessGlyph}>✦</Text>
              </View>
              <View style={styles.claimSuccessCopy}>
                <Text style={styles.claimSuccessTitle}>
                  {props.copy.claimSuccessTitle}
                </Text>
              </View>
            </View>

            <View style={styles.claimSuccessAmountCard}>
              <Text style={styles.claimSuccessAmountLabel}>
                {props.copy.claimSuccessAmount}
              </Text>
              <Text style={styles.claimSuccessAmountValue}>
                +{props.formatAmount(props.lastClaimReceipt.grantedAmount)}
              </Text>
            </View>

            <View style={styles.claimSuccessMetaGrid}>
              <View style={styles.claimSuccessMetaCard}>
                <Text style={styles.claimSuccessMetaLabel}>
                  {props.copy.claimSuccessMission}
                </Text>
                <Text style={styles.claimSuccessMetaValue}>
                  {claimReceiptCopy?.title ?? props.lastClaimReceipt.missionId}
                </Text>
              </View>
              <View style={styles.claimSuccessMetaCard}>
                <Text style={styles.claimSuccessMetaLabel}>
                  {props.copy.claimSuccessBalance}
                </Text>
                <Text style={styles.claimSuccessMetaValue}>
                  {props.formatAmount(summary?.bonusBalance ?? "0")}
                </Text>
              </View>
            </View>

            <View style={styles.claimSuccessActionRow}>
              <ActionButton
                label={props.copy.claimSuccessDismiss}
                onPress={props.onDismissClaimReceipt}
                variant="secondary"
                fullWidth
              />
            </View>
          </View>
        ) : null}

        {claimSpotlightMission && claimSpotlightCopy ? (
          <View style={styles.claimSpotlightCard}>
            <View style={styles.claimSpotlightHeader}>
              <View style={styles.claimSpotlightCopy}>
                <Text style={styles.claimSpotlightEyebrow}>
                  {props.copy.claimSpotlightTitle}
                </Text>
                <Text style={styles.claimSpotlightTitle}>
                  {claimSpotlightCopy.title}
                </Text>
                <Text style={styles.claimSpotlightBody}>
                  {props.copy.claimSpotlightSubtitle}
                </Text>
              </View>
              <View style={styles.claimSpotlightGlyphPanel}>
                <Text style={styles.claimSpotlightGlyph}>★</Text>
              </View>
            </View>

            <Text style={styles.claimSpotlightDescription}>
              {claimSpotlightCopy.description}
            </Text>

            <View style={styles.claimSpotlightStatGrid}>
              <View style={styles.claimSpotlightStatCard}>
                <Text style={styles.claimSpotlightStatLabel}>
                  {props.copy.claimSpotlightAmount}
                </Text>
                <Text style={styles.claimSpotlightStatValue}>
                  {props.formatAmount(claimSpotlightMission.rewardAmount)}
                </Text>
              </View>
              <View style={styles.claimSpotlightStatCard}>
                <Text style={styles.claimSpotlightStatLabel}>
                  {props.copy.claimSpotlightStatus}
                </Text>
                <Text style={styles.claimSpotlightStatValue}>
                  {props.copy.statusLabels[claimSpotlightMission.status]}
                </Text>
              </View>
              <View style={styles.claimSpotlightStatCard}>
                <Text style={styles.claimSpotlightStatLabel}>
                  {props.copy.claimSpotlightReset}
                </Text>
                <Text style={styles.claimSpotlightStatValue}>
                  {props.formatOptionalTimestamp(claimSpotlightMission.resetsAt) ??
                    "—"}
                </Text>
              </View>
            </View>

            <View style={styles.claimSpotlightProgressHeader}>
              <Text style={styles.claimSpotlightProgressLabel}>
                {props.copy.progress(
                  claimSpotlightMission.progressCurrent,
                  claimSpotlightMission.progressTarget,
                )}
              </Text>
              <Text style={styles.claimSpotlightProgressValue}>
                {claimSpotlightProgressPercent}%
              </Text>
            </View>
            <View style={styles.claimSpotlightTrack}>
              <View
                style={[
                  styles.claimSpotlightFill,
                  {
                    width: `${
                      claimSpotlightProgressPercent === 0
                        ? 0
                        : Math.max(claimSpotlightProgressPercent, 10)
                    }%`,
                  },
                ]}
              />
            </View>

            <ActionButton
              label={
                props.claimingMissionId === claimSpotlightMission.id
                  ? props.copy.claiming
                  : props.copy.claim
              }
              onPress={() => props.onClaimReward(claimSpotlightMission.id)}
              disabled={
                !claimSpotlightMission.claimable ||
                props.claimingMissionId === claimSpotlightMission.id ||
                props.loadingRewardCenter ||
                props.submitting
              }
              variant="gold"
              fullWidth
            />
          </View>
        ) : null}

        {props.loadingRewardCenter && !props.rewardCenter ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={mobilePalette.accent} />
            <Text style={props.styles.loaderText}>{props.copy.loading}</Text>
          </View>
        ) : null}

        {!props.loadingRewardCenter &&
        props.rewardCenter &&
        props.rewardCenter.missions.length === 0 ? (
          <Text style={props.styles.gachaHint}>{props.copy.empty}</Text>
        ) : null}
      </SectionCard>

      <SectionCard title={props.copy.featuredTitle}>
        {featuredMission && featuredMissionCopy ? (
          <View
            style={[
              styles.featuredMissionCard,
              featuredMission.status === "ready"
                ? styles.featuredMissionCardReady
                : featuredMission.status === "claimed"
                  ? styles.featuredMissionCardClaimed
                  : featuredMission.status === "disabled"
                    ? styles.featuredMissionCardDisabled
                    : styles.featuredMissionCardProgress,
            ]}
          >
            <View style={styles.featuredMissionHeader}>
              <View style={styles.featuredMissionCopy}>
                <View style={props.styles.badgeRow}>
                  <View
                    style={[
                      props.styles.badge,
                      featuredMission.status === "claimed"
                        ? props.styles.badgeSuccess
                        : featuredMission.status === "ready"
                          ? styles.rewardReadyBadge
                          : featuredMission.status === "disabled"
                            ? props.styles.badgeMuted
                            : styles.rewardProgressBadge,
                    ]}
                  >
                    <Text style={props.styles.badgeText}>
                      {props.copy.statusLabels[featuredMission.status]}
                    </Text>
                  </View>
                  {featuredMission.autoAwarded ? (
                    <View style={[props.styles.badge, props.styles.badgeMuted]}>
                      <Text style={props.styles.badgeText}>
                        {props.copy.autoAwardedBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.featuredMissionTitle}>
                  {featuredMissionCopy.title}
                </Text>
                <Text style={styles.featuredMissionDescription}>
                  {featuredMissionCopy.description}
                </Text>
              </View>

              <View style={styles.featuredRewardBlock}>
                <Text style={styles.featuredRewardLabel}>
                  {props.copy.rewardAmount}
                </Text>
                <Text style={styles.featuredRewardValue}>
                  {props.formatAmount(featuredMission.rewardAmount)}
                </Text>
              </View>
            </View>

            <View style={styles.featuredStatsRow}>
              <View style={styles.featuredStatCard}>
                <Text style={styles.featuredStatLabel}>
                  {props.copy.progress(
                    featuredMission.progressCurrent,
                    featuredMission.progressTarget,
                  )}
                </Text>
                <Text style={styles.featuredStatValue}>
                  {featuredProgressPercent}%
                </Text>
              </View>
              <View style={styles.featuredStatCard}>
                <Text style={styles.featuredStatLabel}>
                  {props.copy.summary.readyToClaim}
                </Text>
                <Text style={styles.featuredStatValue}>
                  {featuredMission.claimable ? props.copy.claim : "—"}
                </Text>
              </View>
            </View>

            <View style={styles.featuredProgressTrack}>
              <View
                style={[
                  styles.featuredProgressFill,
                  {
                    width: `${
                      featuredProgressPercent === 0
                        ? 0
                        : Math.max(featuredProgressPercent, 10)
                    }%`,
                  },
                ]}
              />
            </View>

            <View style={styles.featuredMetaBlock}>
              {buildMissionMetaLines(featuredMission).map((line, index) => (
                <Text key={`${featuredMission.id}-meta-${index}`} style={styles.featuredMetaText}>
                  {line}
                </Text>
              ))}
            </View>

            <View style={styles.featuredActionRow}>
              {renderMissionAction(featuredMission)}
            </View>
          </View>
        ) : (
          <Text style={props.styles.gachaHint}>{props.copy.featuredEmpty}</Text>
        )}

        <View style={styles.rewardRulesCard}>
          <Text style={styles.rewardRulesTitle}>{props.copy.howItWorksTitle}</Text>

          {[
            props.copy.howItWorks.streakTitle,
            props.copy.howItWorks.claimTitle,
            props.copy.howItWorks.resetTitle,
          ].map((title, index) => {
            const body =
              index === 0
                ? props.copy.howItWorks.streakBody
                : index === 1
                  ? props.copy.howItWorks.claimBody
                  : props.copy.howItWorks.resetBody;

            return (
              <View key={`${title}-${index}`} style={styles.rewardRuleRow}>
                <View style={styles.rewardRuleIndex}>
                  <Text style={styles.rewardRuleIndexText}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View style={styles.rewardRuleCopy}>
                  <Text style={styles.rewardRuleTitle}>{title}</Text>
                  <Text style={styles.rewardRuleBody}>{body}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title={props.copy.missionQueueTitle}>
        <View style={styles.filterRow}>
          {rewardMissionFilterOrder.map((entry) => {
            const active = filter === entry;

            return (
              <Pressable
                key={entry}
                onPress={() => setFilter(entry)}
                accessibilityRole="button"
                accessibilityLabel={props.copy.filterLabels[entry]}
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterChip,
                  active ? styles.filterChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipLabel,
                    active ? styles.filterChipLabelActive : null,
                  ]}
                >
                  {props.copy.filterLabels[entry]}
                </Text>
                <View
                  style={[
                    styles.filterChipCount,
                    active ? styles.filterChipCountActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipCountLabel,
                      active ? styles.filterChipCountLabelActive : null,
                    ]}
                  >
                    {statusCounts[entry]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {props.loadingRewardCenter && props.rewardCenter ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={mobilePalette.accent} />
            <Text style={props.styles.loaderText}>{props.copy.refreshing}</Text>
          </View>
        ) : null}

        {!props.loadingRewardCenter &&
        props.rewardCenter &&
        filteredMissions.length === 0 ? (
          <Text style={props.styles.gachaHint}>{props.copy.filteredEmpty}</Text>
        ) : null}

        {!props.loadingRewardCenter &&
        props.rewardCenter &&
        filteredMissions.length > 0 &&
        queueMissions.length === 0 &&
        featuredMissionIncluded ? (
          <Text style={props.styles.gachaHint}>{props.copy.pinnedOnlyHint}</Text>
        ) : null}

        <View style={styles.rewardMissionList}>
          {queueMissions.map((mission) => {
            const missionCopy = resolveMissionCopy(mission);
            const progressRatio = Math.max(
              0,
              Math.min(
                100,
                Math.round(
                  (mission.progressCurrent / mission.progressTarget) * 100,
                ),
              ),
            );

            return (
              <RewardMissionCard
                key={mission.id}
                title={missionCopy.title}
                description={missionCopy.description}
                tone={resolveMissionTone(mission)}
                rewardLabel={props.copy.rewardAmount}
                rewardValue={props.formatAmount(mission.rewardAmount)}
                progressLabel={props.copy.progress(
                  mission.progressCurrent,
                  mission.progressTarget,
                )}
                progressPercent={progressRatio}
                badges={
                  <>
                    <View
                      style={[
                        props.styles.badge,
                        mission.status === "claimed"
                          ? props.styles.badgeSuccess
                          : mission.status === "ready"
                            ? styles.rewardReadyBadge
                            : mission.status === "disabled"
                              ? props.styles.badgeMuted
                              : styles.rewardProgressBadge,
                      ]}
                    >
                      <Text style={props.styles.badgeText}>
                        {props.copy.statusLabels[mission.status]}
                      </Text>
                    </View>
                    {mission.autoAwarded ? (
                      <View style={[props.styles.badge, props.styles.badgeMuted]}>
                        <Text style={props.styles.badgeText}>
                          {props.copy.autoAwardedBadge}
                        </Text>
                      </View>
                    ) : null}
                  </>
                }
                metaLines={buildMissionMetaLines(mission)}
                action={renderMissionAction(mission)}
              />
            );
          })}
        </View>
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  rewardBoardCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fff6ea",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  rewardBoardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  rewardBoardCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  rewardBoardTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  rewardBoardPendingBadge: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  rewardBoardMetrics: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: mobileSpacing.lg,
  },
  rewardBoardPrimaryMetric: {
    flex: 1.25,
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  rewardBoardPrimaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  rewardBoardPrimaryValue: {
    color: mobilePalette.accentMuted,
    fontSize: mobileTypeScale.fontSize.hero,
    fontWeight: "800",
  },
  rewardBoardSecondaryColumn: {
    flex: 1,
    gap: mobileSpacing.md,
  },
  rewardBoardSecondaryMetric: {
    flex: 1,
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#dfe1ff",
    padding: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  rewardBoardSecondaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  rewardBoardSecondaryValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  claimSuccessCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  claimSuccessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpacing.lg,
  },
  claimSuccessMedallion: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    ...mobileChromeTheme.cardShadowSm,
  },
  claimSuccessGlyph: {
    color: mobileFeedbackTheme.success.accentColor,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  claimSuccessCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  claimSuccessTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  claimSuccessAmountCard: {
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  claimSuccessAmountLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  claimSuccessAmountValue: {
    color: mobileFeedbackTheme.success.accentColor,
    fontSize: mobileTypeScale.fontSize.hero,
    fontWeight: "800",
  },
  claimSuccessMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  claimSuccessMetaCard: {
    flexGrow: 1,
    minWidth: 150,
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  claimSuccessMetaLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  claimSuccessMetaValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  claimSuccessActionRow: {
    flexDirection: "row",
    alignSelf: "stretch",
  },
  claimSpotlightCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffe6bf",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  claimSpotlightHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  claimSpotlightCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  claimSpotlightEyebrow: {
    color: "#705d00",
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
  },
  claimSpotlightTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  claimSpotlightBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  claimSpotlightGlyphPanel: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fffdfb",
    ...mobileChromeTheme.cardShadowSm,
  },
  claimSpotlightGlyph: {
    color: "#ff5c00",
    fontSize: mobileTypeScale.fontSize.hero,
    fontWeight: "800",
  },
  claimSpotlightDescription: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  claimSpotlightStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  claimSpotlightStatCard: {
    flexGrow: 1,
    minWidth: 120,
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  claimSpotlightStatLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  claimSpotlightStatValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  claimSpotlightProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  claimSpotlightProgressLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
  },
  claimSpotlightProgressValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "800",
  },
  claimSpotlightTrack: {
    overflow: "hidden",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.72)",
    height: mobileSpacing.md,
  },
  claimSpotlightFill: {
    height: "100%",
    borderRightWidth: mobileChromeTheme.borderWidth,
    borderRightColor: mobilePalette.border,
    backgroundColor: mobileFeedbackTheme.gold.backgroundColor,
  },
  featuredMissionCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  featuredMissionCardReady: {
    backgroundColor: "#ffe58b",
  },
  featuredMissionCardProgress: {
    backgroundColor: "#dfe1ff",
  },
  featuredMissionCardClaimed: {
    backgroundColor: "#d8f5e3",
  },
  featuredMissionCardDisabled: {
    backgroundColor: "#efe6df",
  },
  featuredMissionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  featuredMissionCopy: {
    flex: 1,
    gap: mobileSpacing.sm,
  },
  featuredMissionTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  featuredMissionDescription: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  featuredRewardBlock: {
    minWidth: 126,
    alignItems: "flex-end",
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  featuredRewardLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  featuredRewardValue: {
    color: mobilePalette.accentMuted,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  featuredStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.lg,
  },
  featuredStatCard: {
    flex: 1,
    minWidth: 120,
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: mobileSpacing.lg,
  },
  featuredStatLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  featuredStatValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  featuredProgressTrack: {
    overflow: "hidden",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.65)",
    height: mobileSpacing.md,
  },
  featuredProgressFill: {
    height: "100%",
    borderRightWidth: mobileChromeTheme.borderWidth,
    borderRightColor: mobilePalette.border,
    backgroundColor: mobileGameTheme.rewards.ready.backgroundColor,
  },
  featuredMetaBlock: {
    gap: mobileSpacing.xs,
  },
  featuredMetaText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
  },
  featuredActionRow: {
    flexDirection: "row",
    alignSelf: "stretch",
  },
  rewardRulesCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  rewardRulesTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  rewardRuleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: mobileSpacing.lg,
  },
  rewardRuleIndex: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#dfe1ff",
    ...mobileChromeTheme.cardShadowSm,
  },
  rewardRuleIndexText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "800",
  },
  rewardRuleCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  rewardRuleTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  rewardRuleBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  filterChipActive: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  filterChipLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  filterChipLabelActive: {
    color: mobileFeedbackTheme.active.accentColor,
  },
  filterChipCount: {
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fff3ec",
    paddingHorizontal: mobileSpacing.sm,
    paddingVertical: mobileSpacing["2xs"],
  },
  filterChipCountActive: {
    backgroundColor: "#ffffff",
  },
  filterChipCountLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
  },
  filterChipCountLabelActive: {
    color: mobileFeedbackTheme.active.backgroundColor,
  },
  rewardMissionList: {
    gap: mobileSpacing.lg,
  },
  rewardReadyBadge: {
    borderColor: mobileGameTheme.rewards.ready.borderColor,
    backgroundColor: mobileGameTheme.rewards.ready.backgroundColor,
  },
  rewardProgressBadge: {
    borderColor: mobileFeedbackTheme.info.borderColor,
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  rewardAutoNote: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "600",
  },
});
