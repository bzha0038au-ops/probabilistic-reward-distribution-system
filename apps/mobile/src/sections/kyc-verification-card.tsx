import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type {
  KycDocumentKind,
  KycDocumentType,
  KycTier,
  KycUserProfile,
} from "@reward/shared-types/kyc";

import type { MobileKycCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
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

const primaryDocumentTypeOrder: KycDocumentType[] = [
  "passport",
  "national_id",
  "driver_license",
] as const;

function formatStatusLabel(value: string) {
  return value
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]!.toUpperCase()}${segment.slice(1)}`
        : segment,
    )
    .join(" ");
}

function tierLabel(copy: MobileKycCopy, tier: KycTier | null | undefined) {
  if (tier === "tier_1") {
    return copy.tier1;
  }

  if (tier === "tier_2") {
    return copy.tier2;
  }

  return copy.tier0;
}

function renderTimestamp(
  formatter: KycVerificationCardProps["formatTimestamp"],
  value: string | Date | null,
) {
  return formatter(value) ?? "—";
}

function extractRowLabel(value: string) {
  const [label] = value.split(/[:：]/u);
  return label ?? value;
}

function documentTypeLabel(copy: MobileKycCopy, value: KycDocumentType | null) {
  switch (value) {
    case "passport":
      return copy.documentTypePassport;
    case "national_id":
      return copy.documentTypeNationalId;
    case "driver_license":
      return copy.documentTypeDriverLicense;
    case "proof_of_address":
      return copy.documentTypeProofOfAddress;
    case "supporting_document":
      return copy.documentTypeSupporting;
    default:
      return "—";
  }
}

function documentSlotLabel(copy: MobileKycCopy, kind: KycDocumentKind) {
  switch (kind) {
    case "identity_front":
      return copy.slotIdentityFront;
    case "identity_back":
      return copy.slotIdentityBack;
    case "selfie":
      return copy.slotSelfie;
    case "proof_of_address":
      return copy.slotProofOfAddress;
    case "supporting_document":
      return copy.slotSupporting;
  }
}

function reviewActionLabel(value: string) {
  return value
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]!.toUpperCase()}${segment.slice(1)}`
        : segment,
    )
    .join(" ");
}

function resolveStepState(profile: KycUserProfile | null) {
  const documentsComplete = Boolean(profile && profile.documents.length > 0);
  const selfieComplete = Boolean(
    profile?.documents.some((document) => document.kind === "selfie"),
  );
  const reviewComplete = profile?.status === "approved";

  return {
    documentsComplete,
    selfieComplete,
    reviewComplete,
  };
}

function resolveFlowState(copy: MobileKycCopy, profile: KycUserProfile | null) {
  const stepState = resolveStepState(profile);

  if (!profile || profile.status === "not_started" || !stepState.documentsComplete) {
    return {
      currentStep: 2,
      progressPercent: 50,
      title: copy.stepIdentityTitle,
      body: profile?.rejectionReason ?? copy.documentStageBody,
    };
  }

  if (!stepState.selfieComplete) {
    return {
      currentStep: 3,
      progressPercent: 75,
      title: copy.stepSelfieTitle,
      body: copy.stepSelfieDetail,
    };
  }

  if (profile.status === "approved") {
    return {
      currentStep: 4,
      progressPercent: 100,
      title: copy.approvedTitle,
      body: copy.approvedBody,
    };
  }

  if (profile.status === "rejected" || profile.status === "more_info_required") {
    return {
      currentStep: 4,
      progressPercent: 88,
      title: formatStatusLabel(profile.status),
      body: profile.rejectionReason ?? copy.stepReviewDetail,
    };
  }

  return {
    currentStep: 4,
    progressPercent: 90,
    title: copy.stepReviewTitle,
    body: copy.stepReviewDetail,
  };
}

function getVisibleDocumentKinds(profile: KycUserProfile | null) {
  const selectedType = profile?.documentType ?? null;
  const kinds: KycDocumentKind[] =
    selectedType === "passport"
      ? ["identity_front", "selfie"]
      : ["identity_front", "identity_back", "selfie"];

  const needsProofOfAddress =
    profile?.requestedTier === "tier_2" ||
    profile?.documents.some((document) => document.kind === "proof_of_address") ||
    false;
  const needsSupportingDocument =
    profile?.documents.some((document) => document.kind === "supporting_document") ||
    profile?.riskFlags.some(
      (flag) =>
        flag.includes("source_of_funds") || flag.includes("supporting"),
    ) ||
    false;

  if (needsProofOfAddress) {
    kinds.push("proof_of_address");
  }

  if (needsSupportingDocument) {
    kinds.push("supporting_document");
  }

  return Array.from(new Set(kinds));
}

function documentCountForKind(
  profile: KycUserProfile | null,
  kind: KycDocumentKind,
) {
  if (!profile) {
    return 0;
  }

  return profile.documents.filter((document) => document.kind === kind).length;
}

function sortReviewEvents(profile: KycUserProfile | null) {
  if (!profile) {
    return [];
  }

  return [...profile.reviewEvents]
    .sort((left, right) => {
      const leftMs = new Date(left.createdAt).getTime();
      const rightMs = new Date(right.createdAt).getTime();
      return rightMs - leftMs;
    })
    .slice(0, 3);
}

function SummaryCard(props: {
  label: string;
  value: string;
  meta?: string;
  tone: "indigo" | "paper" | "gold";
}) {
  return (
    <View
      style={[
        styles.summaryCard,
        props.tone === "indigo"
          ? styles.summaryCardIndigo
          : props.tone === "gold"
            ? styles.summaryCardGold
            : styles.summaryCardPaper,
      ]}
    >
      <Text style={styles.summaryLabel}>{props.label}</Text>
      <Text style={styles.summaryValue}>{props.value}</Text>
      {props.meta ? <Text style={styles.summaryMeta}>{props.meta}</Text> : null}
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

function VerificationStepRow(props: {
  index: number;
  title: string;
  detail: string;
  active?: boolean;
  complete?: boolean;
}) {
  return (
    <View style={styles.verificationStepRow}>
      <View
        style={[
          styles.verificationStepIndex,
          props.complete
            ? styles.verificationStepIndexGold
            : props.active
              ? styles.verificationStepIndexIndigo
              : null,
        ]}
      >
        <Text style={styles.verificationStepIndexText}>{props.index}</Text>
      </View>
      <View style={styles.verificationStepCopy}>
        <Text style={styles.verificationStepTitle}>{props.title}</Text>
        <Text style={styles.verificationStepDetail}>{props.detail}</Text>
      </View>
      <View style={styles.verificationStepStatus}>
        <Text style={styles.verificationStepStatusText}>
          {props.complete ? "✓" : props.active ? "•" : "○"}
        </Text>
      </View>
    </View>
  );
}

export function KycVerificationCard(props: KycVerificationCardProps) {
  const { copy, profile } = props;
  const stepState = resolveStepState(profile);
  const flowState = resolveFlowState(copy, profile);
  const visibleDocumentKinds = getVisibleDocumentKinds(profile);
  const reviewEvents = sortReviewEvents(profile);

  return (
    <SectionCard title={copy.title}>
      <View style={styles.flowCard}>
        <View style={styles.flowArtBand} />
        <View style={styles.flowOrbBadge}>
          <Text style={styles.flowOrbBadgeText}>ID</Text>
        </View>
        <View style={styles.flowTopRow}>
          <Text style={styles.flowLabel}>{copy.flowLabel}</Text>
          <View style={styles.flowPill}>
            <Text style={styles.flowPillText}>
              {copy.flowStep(flowState.currentStep, 4)}
            </Text>
          </View>
        </View>

        <Text style={styles.flowTitle}>{flowState.title}</Text>
        <Text style={styles.flowBody}>{flowState.body}</Text>

        <View style={styles.verificationStepsCard}>
          <VerificationStepRow
            index={1}
            title={copy.stepIdentityTitle}
            detail={copy.stepIdentityDetail}
            complete
          />
          <VerificationStepRow
            index={2}
            title={copy.documentStageTitle}
            detail={copy.documentStageBody}
            active={flowState.currentStep === 2}
            complete={stepState.documentsComplete}
          />
          <VerificationStepRow
            index={3}
            title={copy.stepSelfieTitle}
            detail={copy.stepSelfieDetail}
            active={flowState.currentStep === 3}
            complete={stepState.selfieComplete}
          />
          <VerificationStepRow
            index={4}
            title={copy.stepReviewTitle}
            detail={copy.stepReviewDetail}
            active={flowState.currentStep === 4}
            complete={stepState.reviewComplete}
          />
        </View>

        <View style={styles.progressMetaRow}>
          <Text style={styles.progressMetaText}>{copy.status}</Text>
          <Text style={styles.progressMetaText}>{flowState.progressPercent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${flowState.progressPercent}%` },
            ]}
          />
        </View>
      </View>

      {props.loading ? (
        <View style={props.styles.loaderRow}>
          <ActivityIndicator color={mobilePalette.accent} />
          <Text style={props.styles.loaderText}>{copy.loading}</Text>
        </View>
      ) : null}

      <View style={styles.stageRow}>
        <View style={styles.stageCard}>
          <Text style={styles.stageEyebrow}>{copy.stepIdentityTitle}</Text>
          <Text style={styles.stageTitle}>{copy.documentStageTitle}</Text>
          <Text style={styles.stageBody}>{copy.documentStageBody}</Text>

          <View style={styles.documentTypeGrid}>
            {primaryDocumentTypeOrder.map((documentType) => {
              const selected = profile?.documentType === documentType;
              return (
                <View
                  key={documentType}
                  style={[
                    styles.documentTypeTile,
                    selected ? styles.documentTypeTileSelected : null,
                  ]}
                >
                  <View style={styles.documentTypeTileIcon}>
                    <Text style={styles.documentTypeTileIconText}>
                      {selected ? "✓" : "○"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.documentTypeTileLabel,
                      selected ? styles.documentTypeTileLabelSelected : null,
                    ]}
                  >
                    {documentTypeLabel(copy, documentType)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.slotGrid}>
            {visibleDocumentKinds.map((kind) => {
              const uploadedCount = documentCountForKind(profile, kind);
              const complete = uploadedCount > 0;

              return (
                <View
                  key={kind}
                  style={[
                    styles.slotCard,
                    complete ? styles.slotCardComplete : styles.slotCardPending,
                  ]}
                >
                  <Text style={styles.slotLabel}>{documentSlotLabel(copy, kind)}</Text>
                  <Text style={styles.slotStatus}>
                    {complete ? copy.slotUploaded : copy.slotPending}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.stageCard}>
          <View style={styles.selfieProgressHeader}>
            <Text style={styles.stageEyebrow}>{copy.stepSelfieTitle}</Text>
            <Text style={styles.selfieProgressValue}>{flowState.progressPercent}%</Text>
          </View>
          <View style={styles.selfieInstructionBanner}>
            <Text style={styles.selfieInstructionText}>
              {stepState.selfieComplete ? copy.selfieReady : copy.stepSelfieTitle}
            </Text>
          </View>
          <View style={styles.viewfinderFrame}>
            <View style={styles.viewfinderRing}>
              <View style={styles.viewfinderInnerRing}>
                <Text style={styles.viewfinderLabel}>SCAN</Text>
              </View>
              <View style={styles.scanBar} />
            </View>
          </View>
          <Text style={styles.stageTitle}>
            {stepState.selfieComplete ? copy.selfieReady : copy.stepSelfieTitle}
          </Text>
          <Text style={styles.stageBody}>
            {stepState.selfieComplete ? copy.selfieReadyBody : copy.stepSelfieDetail}
          </Text>
        </View>
      </View>

      {!props.loading && !profile ? (
        <Text style={styles.helperText}>{copy.noSubmission}</Text>
      ) : null}

      {profile ? (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard
              label={copy.currentTier}
              value={tierLabel(copy, profile.currentTier)}
              meta={copy.submissionVersion(profile.submissionVersion)}
              tone="indigo"
            />
            <SummaryCard
              label={copy.requestedTier}
              value={
                profile.requestedTier
                  ? tierLabel(copy, profile.requestedTier)
                  : "—"
              }
              meta={documentTypeLabel(copy, profile.documentType)}
              tone="paper"
            />
            <SummaryCard
              label={copy.status}
              value={formatStatusLabel(profile.status)}
              meta={renderTimestamp(props.formatTimestamp, profile.reviewedAt)}
              tone="gold"
            />
          </View>

          <View style={styles.detailCard}>
            <DetailRow
              label={copy.documentTypeLabel}
              value={documentTypeLabel(copy, profile.documentType)}
            />
            <DetailRow
              label={copy.countryCodeLabel}
              value={profile.countryCode ?? "—"}
            />
            <DetailRow
              label={copy.documentNumberLabel}
              value={profile.documentNumberLast4 ?? "—"}
            />
            <DetailRow
              label={copy.documents(profile.documents.length)}
              value={copy.submissionVersion(profile.submissionVersion)}
            />
            <DetailRow
              label={extractRowLabel(copy.submittedAt("—"))}
              value={renderTimestamp(props.formatTimestamp, profile.submittedAt)}
            />
            <DetailRow
              label={extractRowLabel(copy.reviewedAt("—"))}
              value={renderTimestamp(props.formatTimestamp, profile.reviewedAt)}
            />
            {profile.rejectionReason ? (
              <Text style={styles.detailNote}>
                {copy.rejectionReason(profile.rejectionReason)}
              </Text>
            ) : null}
            {profile.riskFlags.length > 0 ? (
              <View style={styles.flagRow}>
                {profile.riskFlags.map((flag) => (
                  <View key={flag} style={styles.flagChip}>
                    <Text style={styles.flagChipText}>{flag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>{copy.reviewHistoryTitle}</Text>
            {reviewEvents.length === 0 ? (
              <Text style={styles.reviewEmpty}>{copy.reviewHistoryEmpty}</Text>
            ) : (
              <View style={styles.reviewList}>
                {reviewEvents.map((event) => (
                  <View key={event.id} style={styles.reviewItem}>
                    <View style={styles.reviewBadge}>
                      <Text style={styles.reviewBadgeText}>
                        {reviewActionLabel(event.action)}
                      </Text>
                    </View>
                    <View style={styles.reviewCopy}>
                      <Text style={styles.reviewStatusLine}>
                        {formatStatusLabel(event.fromStatus)}
                        {" -> "}
                        {formatStatusLabel(event.toStatus)}
                      </Text>
                      <Text style={styles.reviewMeta}>
                        {renderTimestamp(props.formatTimestamp, event.createdAt)}
                      </Text>
                      {event.reason ? (
                        <Text style={styles.reviewMeta}>{event.reason}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      ) : null}

      <ActionButton
        label={copy.open}
        onPress={props.onOpenVerification}
        disabled={props.playingQuickEight}
        fullWidth
      />

      <View style={styles.footerRow}>
        <View style={styles.trustBadge}>
          <Text style={styles.trustBadgeText}>{copy.trustBadge}</Text>
        </View>
        <ActionButton
          label={props.loading ? copy.refreshing : copy.refresh}
          onPress={props.onRefresh}
          disabled={props.loading || props.playingQuickEight}
          variant="secondary"
          compact
        />
      </View>

      <Text style={styles.handoffText}>{copy.hostedHandoff}</Text>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  flowCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: mobileSpacing.xl,
    paddingTop: mobileSpacing["5xl"],
    paddingBottom: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  flowArtBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 132,
    borderTopLeftRadius: mobileRadii.xl,
    borderTopRightRadius: mobileRadii.xl,
    backgroundColor: "#ffd0ad",
  },
  flowOrbBadge: {
    position: "absolute",
    top: 92,
    alignSelf: "center",
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 44,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffe58b",
    ...mobileChromeTheme.cardShadow,
  },
  flowOrbBadgeText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.hero,
    fontWeight: "800",
  },
  flowTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
    marginTop: 92,
  },
  flowLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
    textTransform: "uppercase",
  },
  flowPill: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  flowPillText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "800",
  },
  flowTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  flowBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  progressMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  progressMetaText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  progressTrack: {
    overflow: "hidden",
    height: mobileSpacing.md,
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  progressFill: {
    height: "100%",
    borderRightWidth: mobileChromeTheme.borderWidth,
    borderRightColor: mobilePalette.border,
    backgroundColor: mobilePalette.accent,
  },
  stageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.lg,
  },
  stageCard: {
    flexGrow: 1,
    minWidth: 180,
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  stageEyebrow: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
    textTransform: "uppercase",
  },
  stageTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  stageBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  documentTypeGrid: {
    gap: mobileSpacing.sm,
  },
  documentTypeTileIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    ...mobileChromeTheme.cardShadowSm,
  },
  documentTypeTileIconText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  documentTypeTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  documentTypeTileSelected: {
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  documentTypeTileLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  documentTypeTileLabelSelected: {
    color: mobileFeedbackTheme.info.accentColor,
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
  },
  slotCard: {
    minWidth: 84,
    gap: mobileSpacing["2xs"],
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  slotCardComplete: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  slotCardPending: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  slotLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  slotStatus: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  viewfinderFrame: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: mobileSpacing.md,
  },
  viewfinderRing: {
    width: 184,
    height: 184,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 92,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#f7d6c6",
    ...mobileChromeTheme.cardShadow,
  },
  viewfinderInnerRing: {
    width: 130,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 65,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  viewfinderLabel: {
    color: mobilePalette.accentMuted,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  scanBar: {
    position: "absolute",
    top: 88,
    left: 20,
    right: 20,
    height: 10,
    borderRadius: mobileRadii.full,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  helperText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  summaryGrid: {
    gap: mobileSpacing.md,
  },
  selfieInstructionBanner: {
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  selfieInstructionText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
    textAlign: "center",
  },
  selfieProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  selfieProgressValue: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  summaryCard: {
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  summaryCardIndigo: {
    backgroundColor: "#dfe1ff",
  },
  summaryCardPaper: {
    backgroundColor: mobilePalette.panel,
  },
  summaryCardGold: {
    backgroundColor: "#fff3c2",
  },
  summaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
  },
  summaryValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  summaryMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
  },
  detailCard: {
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fff8ef",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  detailLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
  },
  detailValue: {
    color: mobilePalette.text,
    flexShrink: 1,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
    textAlign: "right",
  },
  detailNote: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 19,
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
    paddingTop: mobileSpacing.xs,
  },
  flagChip: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing["2xs"],
  },
  flagChipText: {
    color: mobileFeedbackTheme.danger.accentColor,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
  },
  reviewCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  reviewTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  reviewEmpty: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  reviewList: {
    gap: mobileSpacing.md,
  },
  reviewItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: mobileSpacing.md,
  },
  reviewBadge: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#dfe1ff",
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  reviewBadgeText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reviewCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  reviewStatusLine: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  reviewMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 19,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  trustBadge: {
    flex: 1,
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#f0eded",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  trustBadgeText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
    textAlign: "center",
  },
  handoffText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 19,
    textAlign: "center",
  },
  verificationStepCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  verificationStepDetail: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: 19,
  },
  verificationStepIndex: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffffff",
    ...mobileChromeTheme.cardShadowSm,
  },
  verificationStepIndexGold: {
    backgroundColor: "#ffe58b",
  },
  verificationStepIndexIndigo: {
    backgroundColor: "#dfe1ff",
  },
  verificationStepIndexText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  verificationStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpacing.md,
    paddingVertical: mobileSpacing.md,
    borderTopWidth: mobileChromeTheme.borderWidth,
    borderTopColor: mobilePalette.border,
  },
  verificationStepStatus: {
    width: 28,
    alignItems: "center",
  },
  verificationStepStatusText: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  verificationStepTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  verificationStepsCard: {
    gap: 0,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
});
