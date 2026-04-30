import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type {
  RewardCenterResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import type { MobileRewardCenterCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import { mobileGameTheme, mobilePalette } from "../theme";
import { RewardMissionCard, RewardSummaryCard } from "./domain-ui";
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
  const legacyMissionCopy = props.copy.legacyMissionCopy as Record<
    string,
    { title: string; description: string }
  >;

  const resolveMissionCopy = (mission: NonNullable<
    RewardCenterSectionProps["rewardCenter"]
  >["missions"][number]) =>
    (mission.title.trim() !== "" || mission.description.trim() !== ""
      ? {
          title: mission.title,
          description: mission.description,
        }
      : legacyMissionCopy[mission.id]) ?? {
      title: mission.title,
      description: mission.description,
    };

  return (
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      <View style={styles.rewardSummaryGrid}>
        <RewardSummaryCard
          label={props.copy.summary.bonusBalance}
          value={props.formatAmount(
            props.rewardCenter?.summary.bonusBalance ?? "0",
          )}
        />
        <RewardSummaryCard
          label={props.copy.summary.checkInStreak}
          value={props.rewardCenter?.summary.streakDays ?? 0}
        />
        <RewardSummaryCard
          label={props.copy.summary.readyToClaim}
          value={props.rewardCenter?.summary.availableMissionCount ?? 0}
        />
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
          const claimedAt = props.formatOptionalTimestamp(mission.claimedAt);
          const resetsAt = props.formatOptionalTimestamp(mission.resetsAt);

          return (
            <RewardMissionCard
              key={mission.id}
              title={missionCopy.title}
              description={missionCopy.description}
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
                            : null,
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
              metaLines={[
                ...(claimedAt ? [props.copy.claimedAt(claimedAt)] : []),
                ...(resetsAt ? [props.copy.resetsAt(resetsAt)] : []),
                ...(!claimedAt && !resetsAt ? [props.copy.claimWhenReady] : []),
              ]}
              action={
                mission.autoAwarded ? (
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
                )
              }
            />
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
  rewardMissionList: {
    gap: 12,
  },
  rewardReadyBadge: {
    borderColor: mobileGameTheme.rewards.ready.borderColor,
    backgroundColor: mobileGameTheme.rewards.ready.backgroundColor,
  },
  rewardAutoNote: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
