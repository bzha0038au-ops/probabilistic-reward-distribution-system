import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";

type WalletAssetCardProps = {
  label: string;
  value: string;
  detailRows: Array<{ label: string; value: string }>;
};

export function WalletAssetCard(props: WalletAssetCardProps) {
  return (
    <View style={styles.walletAssetCard}>
      <Text style={styles.walletAssetTitle}>{props.label}</Text>
      <Text style={styles.walletAssetValue}>{props.value}</Text>
      {props.detailRows.map((row, index) => (
        <View key={`${row.label}:${index}`} style={styles.walletAssetRow}>
          <Text style={styles.walletAssetLabel}>{row.label}</Text>
          <Text style={styles.walletAssetDetail}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

type WalletHistoryEntryCardProps = {
  title: string;
  accentValue: string;
  detailLines: string[];
};

export function WalletHistoryEntryCard(props: WalletHistoryEntryCardProps) {
  return (
    <View style={styles.walletHistoryCard}>
      <View style={styles.walletHistoryHeader}>
        <Text style={styles.walletHistoryTitle}>{props.title}</Text>
        <Text style={styles.walletHistoryAmount}>{props.accentValue}</Text>
      </View>
      {props.detailLines.map((line, index) => (
        <Text key={`${line}:${index}`} style={styles.walletHistoryMeta}>
          {line}
        </Text>
      ))}
    </View>
  );
}

type RewardSummaryCardProps = {
  label: string;
  value: string | number;
};

export function RewardSummaryCard(props: RewardSummaryCardProps) {
  return (
    <View style={styles.rewardSummaryCard}>
      <Text style={styles.rewardSummaryLabel}>{props.label}</Text>
      <Text style={styles.rewardSummaryValue}>{props.value}</Text>
    </View>
  );
}

type RewardMissionCardProps = {
  title: string;
  description: string;
  badges?: ReactNode;
  rewardLabel: string;
  rewardValue: string;
  progressLabel: string;
  progressPercent: number;
  metaLines: string[];
  action?: ReactNode;
};

export function RewardMissionCard(props: RewardMissionCardProps) {
  return (
    <View style={styles.rewardMissionCard}>
      <View style={styles.rewardMissionHeader}>
        <View style={styles.rewardMissionHeading}>
          <View style={styles.rewardMissionBadgeRow}>
            <Text style={styles.rewardMissionTitle}>{props.title}</Text>
            {props.badges}
          </View>
          <Text style={styles.rewardMissionDescription}>{props.description}</Text>
        </View>

        <View style={styles.rewardAmountBlock}>
          <Text style={styles.rewardAmountLabel}>{props.rewardLabel}</Text>
          <Text style={styles.rewardAmountValue}>{props.rewardValue}</Text>
        </View>
      </View>

      <View style={styles.rewardProgressHeader}>
        <Text style={styles.rewardProgressText}>{props.progressLabel}</Text>
        <Text style={styles.rewardProgressText}>{props.progressPercent}%</Text>
      </View>
      <View style={styles.rewardProgressTrack}>
        <View
          style={[
            styles.rewardProgressFill,
            { width: `${props.progressPercent}%` },
          ]}
        />
      </View>

      <View style={styles.rewardMissionFooter}>
        <View style={styles.rewardMissionMeta}>
          {props.metaLines.map((line, index) => (
            <Text key={`${line}:${index}`} style={styles.rewardMissionMetaText}>
              {line}
            </Text>
          ))}
        </View>
        {props.action}
      </View>
    </View>
  );
}

type SecuritySessionCardProps = {
  title: string;
  badge?: ReactNode;
  detailLines: string[];
  action?: ReactNode;
};

export function SecuritySessionCard(props: SecuritySessionCardProps) {
  return (
    <View style={styles.securitySessionCard}>
      <View style={styles.securitySessionHeader}>
        <Text style={styles.securitySessionTitle}>{props.title}</Text>
        {props.badge}
      </View>
      {props.detailLines.map((line, index) => (
        <Text key={`${line}:${index}`} style={styles.securitySessionBody}>
          {line}
        </Text>
      ))}
      {props.action ? <View style={styles.securitySessionAction}>{props.action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  walletAssetCard: {
    flexGrow: 1,
    minWidth: "44%",
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  walletAssetTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  walletAssetValue: {
    color: mobilePalette.text,
    fontSize: mobileSpacing["5xl"],
    fontWeight: "800",
  },
  walletAssetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  walletAssetLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  walletAssetDetail: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "600",
  },
  walletHistoryCard: {
    gap: mobileSpacing["2xs"],
    borderRadius: mobileRadii.lg,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.lg,
  },
  walletHistoryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  walletHistoryTitle: {
    flex: 1,
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.body,
    fontWeight: "700",
  },
  walletHistoryAmount: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.body,
    fontWeight: "700",
  },
  walletHistoryMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
  },
  rewardSummaryCard: {
    flexGrow: 1,
    minWidth: "30%",
    gap: mobileSpacing["2xs"],
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  rewardSummaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  rewardSummaryValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  rewardMissionCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  rewardMissionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  rewardMissionHeading: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  rewardMissionBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: mobileSpacing.sm,
  },
  rewardMissionTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  rewardMissionDescription: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  rewardAmountBlock: {
    alignItems: "flex-end",
    gap: mobileSpacing.xs,
  },
  rewardAmountLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  rewardAmountValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  rewardProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  rewardProgressText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
  },
  rewardProgressTrack: {
    height: mobileSpacing.sm,
    overflow: "hidden",
    borderRadius: mobileRadii.full,
    backgroundColor: mobilePalette.input,
  },
  rewardProgressFill: {
    height: "100%",
    borderRadius: mobileRadii.full,
    backgroundColor: mobilePalette.accent,
  },
  rewardMissionFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  rewardMissionMeta: {
    flex: 1,
    gap: mobileSpacing.xs,
  },
  rewardMissionMetaText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
  },
  securitySessionCard: {
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  securitySessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  securitySessionTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  securitySessionBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  securitySessionAction: {
    paddingTop: mobileSpacing.xs,
  },
});
