import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type {
  RewardCenterResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import type { MobileRewardCenterCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import { mobileGameTheme, mobilePalette } from "../theme";
import { ActionButton, SectionCard } from "../ui";

type RewardCenterSectionProps = {
  styles: MobileStyles;
  copy: MobileRewardCenterCopy;
  rewardCenter: RewardCenterResponse | null;
  loadingRewardCenter: boolean;
  claimingMissionId: RewardMissionId | null;
  submitting: boolean;
  playingDrawCount: number | null;
  playingQuickEight: boolean;
  formatAmount: (value: string) => string;
  formatOptionalTimestamp: (value: string | Date | null) => string | null;
  onRefreshRewardCenter: () => void;
  onClaimReward: (missionId: RewardMissionId) => void;
};

export function RewardCenterSection(props: RewardCenterSectionProps) {
  return (
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      <View style={styles.rewardSummaryGrid}>
        <View style={styles.rewardSummaryCard}>
          <Text style={styles.rewardSummaryLabel}>
            {props.copy.summary.bonusBalance}
          </Text>
          <Text style={styles.rewardSummaryValue}>
            {props.formatAmount(
              props.rewardCenter?.summary.bonusBalance ?? "0",
            )}
          </Text>
        </View>
        <View style={styles.rewardSummaryCard}>
          <Text style={styles.rewardSummaryLabel}>
            {props.copy.summary.checkInStreak}
          </Text>
          <Text style={styles.rewardSummaryValue}>
            {props.rewardCenter?.summary.streakDays ?? 0}
          </Text>
        </View>
        <View style={styles.rewardSummaryCard}>
          <Text style={styles.rewardSummaryLabel}>
            {props.copy.summary.readyToClaim}
          </Text>
          <Text style={styles.rewardSummaryValue}>
            {props.rewardCenter?.summary.availableMissionCount ?? 0}
          </Text>
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
        {props.rewardCenter?.summary.todayDailyClaimed ? (
          <View style={[props.styles.badge, props.styles.badgeSuccess]}>
            <Text style={props.styles.badgeText}>
              {props.copy.todayCheckInGranted}
            </Text>
          </View>
        ) : null}
      </View>

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

      <View style={styles.rewardMissionList}>
        {props.rewardCenter?.missions.map((mission) => {
          const missionCopy = props.copy.missionCopy[mission.id];
          const progressRatio = Math.max(
            0,
            Math.min(
              100,
              Math.round(
                (mission.progressCurrent / mission.progressTarget) * 100,
              ),
            ),
          );
          const claimedAt = props.formatOptionalTimestamp(mission.claimedAt);
          const resetsAt = props.formatOptionalTimestamp(mission.resetsAt);

          return (
            <View key={mission.id} style={styles.rewardMissionCard}>
              <View style={styles.rewardMissionHeader}>
                <View style={styles.rewardMissionHeading}>
                  <View style={props.styles.badgeRow}>
                    <Text style={styles.rewardMissionTitle}>
                      {missionCopy.title}
                    </Text>
                    <View
                      style={[
                        props.styles.badge,
                        mission.status === "claimed"
                          ? props.styles.badgeSuccess
                          : mission.status === "ready"
                            ? styles.rewardReadyBadge
                            : mission.status === "disabled"
                              ? props.styles.badgeMuted
                              : null,
                      ]}
                    >
                      <Text style={props.styles.badgeText}>
                        {props.copy.statusLabels[mission.status]}
                      </Text>
                    </View>
                    {mission.autoAwarded ? (
                      <View
                        style={[props.styles.badge, props.styles.badgeMuted]}
                      >
                        <Text style={props.styles.badgeText}>
                          {props.copy.autoAwardedBadge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rewardMissionDescription}>
                    {missionCopy.description}
                  </Text>
                </View>

                <View style={styles.rewardAmountBlock}>
                  <Text style={styles.rewardAmountLabel}>
                    {props.copy.rewardAmount}
                  </Text>
                  <Text style={styles.rewardAmountValue}>
                    {props.formatAmount(mission.rewardAmount)}
                  </Text>
                </View>
              </View>

              <View style={styles.rewardProgressHeader}>
                <Text style={styles.rewardProgressText}>
                  {props.copy.progress(
                    mission.progressCurrent,
                    mission.progressTarget,
                  )}
                </Text>
                <Text style={styles.rewardProgressText}>{progressRatio}%</Text>
              </View>
              <View style={styles.rewardProgressTrack}>
                <View
                  style={[
                    styles.rewardProgressFill,
                    { width: `${progressRatio}%` },
                  ]}
                />
              </View>

              <View style={styles.rewardMissionFooter}>
                <View style={styles.rewardMissionMeta}>
                  {claimedAt ? (
                    <Text style={styles.rewardMissionMetaText}>
                      {props.copy.claimedAt(claimedAt)}
                    </Text>
                  ) : null}
                  {resetsAt ? (
                    <Text style={styles.rewardMissionMetaText}>
                      {props.copy.resetsAt(resetsAt)}
                    </Text>
                  ) : null}
                  {!claimedAt && !resetsAt ? (
                    <Text style={styles.rewardMissionMetaText}>
                      {props.copy.claimWhenReady}
                    </Text>
                  ) : null}
                </View>

                {mission.autoAwarded ? (
                  <Text style={styles.rewardAutoNote}>
                    {props.copy.autoAwardedNote}
                  </Text>
                ) : (
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
                      props.loadingRewardCenter
                    }
                    compact
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  rewardSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  rewardSummaryCard: {
    flexGrow: 1,
    minWidth: "30%",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  rewardSummaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  rewardSummaryValue: {
    color: mobilePalette.text,
    fontSize: 24,
    fontWeight: "800",
  },
  rewardMissionList: {
    gap: 12,
  },
  rewardMissionCard: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  rewardMissionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rewardMissionHeading: {
    flex: 1,
    gap: 8,
  },
  rewardMissionTitle: {
    color: mobilePalette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  rewardReadyBadge: {
    borderColor: mobileGameTheme.rewards.ready.borderColor,
    backgroundColor: mobileGameTheme.rewards.ready.backgroundColor,
  },
  rewardMissionDescription: {
    color: mobilePalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  rewardAmountBlock: {
    minWidth: 72,
    alignItems: "flex-end",
    gap: 4,
  },
  rewardAmountLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  rewardAmountValue: {
    color: mobilePalette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  rewardProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rewardProgressText: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  rewardProgressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: mobileGameTheme.rewards.progressTrack,
  },
  rewardProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: mobilePalette.accent,
  },
  rewardMissionFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rewardMissionMeta: {
    flex: 1,
    gap: 4,
  },
  rewardMissionMetaText: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  rewardAutoNote: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
