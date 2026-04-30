import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  mobileFeedbackTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
  mobileTypography,
} from "./theme";

type GameInfoPanelProps = {
  children: ReactNode;
  className?: never;
  tone?: "default" | "muted";
};

export function GameInfoPanel({
  children,
  tone = "default",
}: GameInfoPanelProps) {
  return (
    <View
      style={[
        styles.infoPanel,
        tone === "muted" ? styles.infoPanelMuted : null,
      ]}
    >
      {children}
    </View>
  );
}

type GameStatCardProps = {
  label: string;
  value: ReactNode;
  valueTone?: "default" | "accent" | "success";
};

export function GameStatCard({
  label,
  value,
  valueTone = "default",
}: GameStatCardProps) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          valueTone === "accent"
            ? styles.statValueAccent
            : valueTone === "success"
              ? styles.statValueSuccess
              : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

type GameStatusPanelProps = {
  tone: "warning" | "danger" | "success" | "info" | "neutral";
  children: ReactNode;
};

export function GameStatusPanel({
  tone,
  children,
}: GameStatusPanelProps) {
  return (
    <View
      style={[
        styles.statusPanel,
        tone === "warning"
          ? styles.statusPanelWarning
          : tone === "danger"
            ? styles.statusPanelDanger
            : tone === "success"
              ? styles.statusPanelSuccess
              : tone === "info"
                ? styles.statusPanelInfo
                : styles.statusPanelNeutral,
      ]}
    >
      <Text
        style={[
          styles.statusPanelText,
          tone === "warning"
            ? styles.statusPanelTextWarning
            : tone === "danger"
              ? styles.statusPanelTextDanger
              : tone === "success"
                ? styles.statusPanelTextSuccess
                : tone === "info"
                  ? styles.statusPanelTextInfo
                  : null,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

type GameNumberChipProps = {
  value: ReactNode;
  tone?: "default" | "selected" | "hit";
};

export function GameNumberChip({
  value,
  tone = "default",
}: GameNumberChipProps) {
  return (
    <View
      style={[
        styles.numberChip,
        tone === "selected"
          ? styles.numberChipSelected
          : tone === "hit"
            ? styles.numberChipHit
            : styles.numberChipDefault,
      ]}
    >
      <Text
        style={[
          styles.numberChipText,
          tone === "selected"
            ? styles.numberChipTextSelected
            : tone === "hit"
              ? styles.numberChipTextHit
              : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

type GameHashCardProps = {
  label: string;
  value: string;
  valueTone?: "default" | "accent" | "warning";
};

export function GameHashCard({
  label,
  value,
  valueTone = "default",
}: GameHashCardProps) {
  return (
    <View style={styles.hashCard}>
      <Text style={styles.hashLabel}>{label}</Text>
      <Text
        style={[
          styles.hashValue,
          valueTone === "accent"
            ? styles.hashValueAccent
            : valueTone === "warning"
              ? styles.hashValueWarning
              : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoPanel: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  infoPanelMuted: {
    backgroundColor: mobilePalette.input,
  },
  statCard: {
    flexGrow: 1,
    minWidth: 140,
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  statLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
  },
  statValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  statValueAccent: {
    color: mobilePalette.accentMuted,
  },
  statValueSuccess: {
    color: mobilePalette.success,
  },
  statusPanel: {
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    paddingHorizontal: mobileSpacing.xl,
    paddingVertical: mobileSpacing.lg,
  },
  statusPanelNeutral: {
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
  },
  statusPanelWarning: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  statusPanelDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  statusPanelSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  statusPanelInfo: {
    borderColor: mobileFeedbackTheme.info.borderColor,
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  statusPanelText: {
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  statusPanelTextWarning: {
    color: mobilePalette.warning,
  },
  statusPanelTextDanger: {
    color: mobilePalette.danger,
  },
  statusPanelTextSuccess: {
    color: mobilePalette.success,
  },
  statusPanelTextInfo: {
    color: mobileFeedbackTheme.info.accentColor,
  },
  numberChip: {
    minWidth: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: 1,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing["2xs"],
  },
  numberChipDefault: {
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.input,
  },
  numberChipSelected: {
    borderColor: mobileFeedbackTheme.gold.borderColor,
    backgroundColor: mobileFeedbackTheme.gold.backgroundColor,
  },
  numberChipHit: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  numberChipText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  numberChipTextSelected: {
    color: mobileFeedbackTheme.gold.accentColor,
  },
  numberChipTextHit: {
    color: mobileFeedbackTheme.success.accentColor,
  },
  hashCard: {
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
  },
  hashLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
  },
  hashValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 19,
    fontFamily: mobileTypography.mono,
  },
  hashValueAccent: {
    color: mobileFeedbackTheme.infoHero.accentColor,
  },
  hashValueWarning: {
    color: mobileFeedbackTheme.gold.accentColor,
  },
});
