import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { KycTier, KycUserProfile } from "@reward/shared-types/kyc";

import type { MobileKycCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import { mobilePalette } from "../theme";
import { ActionButton, SectionCard } from "../ui";

type KycVerificationCardProps = {
  styles: MobileStyles;
  copy: MobileKycCopy;
  profile: KycUserProfile | null;
  loading: boolean;
  playingQuickEight: boolean;
  formatTimestamp: (value: string | Date | null) => string | null;
  onRefresh: () => void;
  onOpenVerification: () => void;
};

const tierLabel = (copy: MobileKycCopy, tier: KycTier | null | undefined) => {
  if (tier === "tier_1") {
    return copy.tier1;
  }

  if (tier === "tier_2") {
    return copy.tier2;
  }

  return copy.tier0;
};

const formatStatusLabel = (value: string) =>
  value
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]!.toUpperCase()}${segment.slice(1)}`
        : segment,
    )
    .join(" ");

const renderTimestamp = (
  formatter: KycVerificationCardProps["formatTimestamp"],
  value: string | Date | null,
) => formatter(value) ?? "—";

export function KycVerificationCard(props: KycVerificationCardProps) {
  const { copy, profile } = props;

  return (
    <SectionCard title={copy.title} subtitle={copy.subtitle}>
      <View style={props.styles.inlineActions}>
        <ActionButton
          label={props.loading ? copy.refreshing : copy.refresh}
          onPress={props.onRefresh}
          disabled={props.loading || props.playingQuickEight}
          variant="secondary"
          compact
        />
        <ActionButton
          label={copy.open}
          onPress={props.onOpenVerification}
          disabled={props.playingQuickEight}
          compact
        />
      </View>

      {props.loading ? (
        <View style={props.styles.loaderRow}>
          <ActivityIndicator color={mobilePalette.accent} />
          <Text style={props.styles.loaderText}>{copy.loading}</Text>
        </View>
      ) : null}

      {!props.loading && !profile ? (
        <Text style={props.styles.gachaHint}>{copy.noSubmission}</Text>
      ) : null}

      {profile ? (
        <>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{copy.currentTier}</Text>
              <Text style={styles.summaryValue}>
                {tierLabel(copy, profile.currentTier)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{copy.requestedTier}</Text>
              <Text style={styles.summaryValue}>
                {tierLabel(copy, profile.requestedTier)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{copy.status}</Text>
              <Text style={styles.summaryValue}>
                {formatStatusLabel(profile.status)}
              </Text>
            </View>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLine}>
              {copy.submissionVersion(profile.submissionVersion)}
            </Text>
            <Text style={styles.detailLine}>
              {copy.documents(profile.documents.length)}
            </Text>
            <Text style={styles.detailLine}>
              {copy.submittedAt(
                renderTimestamp(props.formatTimestamp, profile.submittedAt),
              )}
            </Text>
            <Text style={styles.detailLine}>
              {copy.reviewedAt(
                renderTimestamp(props.formatTimestamp, profile.reviewedAt),
              )}
            </Text>
            {profile.rejectionReason ? (
              <Text style={styles.detailLine}>
                {copy.rejectionReason(profile.rejectionReason)}
              </Text>
            ) : null}
            {profile.riskFlags.length > 0 ? (
              <Text style={styles.detailLine}>
                {copy.riskFlags(profile.riskFlags.join(", "))}
              </Text>
            ) : null}
          </View>

          <Text style={props.styles.gachaHint}>{copy.hostedHandoff}</Text>
        </>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    gap: 12,
  },
  summaryCard: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  summaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: mobilePalette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  detailCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  detailLine: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
