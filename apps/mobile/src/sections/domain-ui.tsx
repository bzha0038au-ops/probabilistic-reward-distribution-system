import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  mobileChromeTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";

type WalletAssetCardProps = {
  label: string;
  value: string;
  detailRows: Array<{ label: string; value: string }>;
  tone?: "blue" | "gold" | "peach" | "panel";
};

export function WalletAssetCard(props: WalletAssetCardProps) {
  return (
    <View
      style={[
        styles.walletAssetCard,
        props.tone === "gold"
          ? styles.walletAssetCardGold
          : props.tone === "peach"
            ? styles.walletAssetCardPeach
            : props.tone === "panel"
              ? styles.walletAssetCardPanel
              : styles.walletAssetCardBlue,
      ]}
    >
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
  tone?: "success" | "danger" | "blue" | "panel";
};

export function WalletHistoryEntryCard(props: WalletHistoryEntryCardProps) {
  const metaText = props.detailLines.filter(Boolean).join(" · ");

  return (
    <View
      style={[
        styles.walletHistoryCard,
        props.tone === "success"
          ? styles.walletHistoryCardSuccess
          : props.tone === "danger"
            ? styles.walletHistoryCardDanger
            : props.tone === "blue"
              ? styles.walletHistoryCardBlue
              : null,
      ]}
    >
      <View style={styles.walletHistoryHeader}>
        <Text style={styles.walletHistoryTitle}>{props.title}</Text>
        <Text
          style={[
            styles.walletHistoryAmount,
            props.tone === "danger"
              ? styles.walletHistoryAmountDanger
              : props.tone === "success"
                ? styles.walletHistoryAmountSuccess
                : null,
          ]}
      >
        {props.accentValue}
      </Text>
      </View>
      {metaText ? <Text style={styles.walletHistoryMeta}>{metaText}</Text> : null}
    </View>
  );
}

type RewardSummaryCardProps = {
  label: string;
  value: string | number;
  tone?: "gold" | "blue" | "peach" | "success" | "panel";
};

export function RewardSummaryCard(props: RewardSummaryCardProps) {
  return (
    <View
      style={[
        styles.rewardSummaryCard,
        props.tone === "gold"
          ? styles.rewardSummaryCardGold
          : props.tone === "blue"
            ? styles.rewardSummaryCardBlue
            : props.tone === "peach"
              ? styles.rewardSummaryCardPeach
              : props.tone === "success"
                ? styles.rewardSummaryCardSuccess
                : styles.rewardSummaryCardPanel,
      ]}
    >
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
  tone?: "gold" | "blue" | "success" | "muted";
};

export function RewardMissionCard(props: RewardMissionCardProps) {
  return (
    <View
      style={[
        styles.rewardMissionCard,
        props.tone === "gold"
          ? styles.rewardMissionCardGold
          : props.tone === "success"
            ? styles.rewardMissionCardSuccess
            : props.tone === "muted"
              ? styles.rewardMissionCardMuted
              : styles.rewardMissionCardBlue,
      ]}
    >
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
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#dfe1ff",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  walletAssetCardBlue: {
    backgroundColor: "#dfe1ff",
  },
  walletAssetCardGold: {
    backgroundColor: "#ffe58b",
  },
  walletAssetCardPeach: {
    backgroundColor: "#ffd9d2",
  },
  walletAssetCardPanel: {
    backgroundColor: "#fff8ef",
  },
  walletAssetTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  walletAssetValue: {
    color: mobilePalette.accentMuted,
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
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  walletHistoryCardSuccess: {
    backgroundColor: "#d8f5e3",
  },
  walletHistoryCardDanger: {
    backgroundColor: "#ffd9d2",
  },
  walletHistoryCardBlue: {
    backgroundColor: "#dfe1ff",
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
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  walletHistoryAmount: {
    color: mobilePalette.accentMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  walletHistoryAmountSuccess: {
    color: "#157347",
  },
  walletHistoryAmountDanger: {
    color: "#d92d20",
  },
  walletHistoryMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  rewardSummaryCard: {
    flexGrow: 1,
    minWidth: "30%",
    gap: mobileSpacing["2xs"],
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fff8ef",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  rewardSummaryCardGold: {
    backgroundColor: "#ffe58b",
  },
  rewardSummaryCardBlue: {
    backgroundColor: "#dfe1ff",
  },
  rewardSummaryCardPeach: {
    backgroundColor: "#ffd9d2",
  },
  rewardSummaryCardSuccess: {
    backgroundColor: "#d8f5e3",
  },
  rewardSummaryCardPanel: {
    backgroundColor: "#fff8ef",
  },
  rewardSummaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  rewardSummaryValue: {
    color: mobilePalette.accentMuted,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  rewardMissionCard: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  rewardMissionCardGold: {
    backgroundColor: "#ffe58b",
  },
  rewardMissionCardBlue: {
    backgroundColor: "#dfe1ff",
  },
  rewardMissionCardSuccess: {
    backgroundColor: "#d8f5e3",
  },
  rewardMissionCardMuted: {
    backgroundColor: "#efe6df",
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
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing.sm,
  },
  rewardAmountLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  rewardAmountValue: {
    color: mobilePalette.accentMuted,
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
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    height: mobileSpacing.sm,
    overflow: "hidden",
    borderRadius: mobileRadii.full,
    backgroundColor: "#efe2d9",
  },
  rewardProgressFill: {
    height: "100%",
    borderRadius: mobileRadii.full,
    backgroundColor: "#ffd200",
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
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
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
