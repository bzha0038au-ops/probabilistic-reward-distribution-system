import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CurrentLegalDocument } from "@reward/shared-types/legal";

import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
import { ActionButton, SectionCard } from "../ui";

const formatLegalSlug = (slug: string) =>
  slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildLegalDocumentKey = (
  document: Pick<CurrentLegalDocument, "slug" | "version">,
) => `${document.slug}::${document.version}`;

type MobileLegalAcceptanceCardProps = {
  copy: {
    title: string;
    subtitle: string;
    pendingSummary: (count: number) => string;
    acceptedSummary: (count: number) => string;
    loading: string;
    empty: string;
    versionLabel: (version: string) => string;
    acceptedBadge: string;
    checkboxLabel: (slug: string, version: string) => string;
    submit: string;
    submitting: string;
    refresh: string;
  };
  documents: CurrentLegalDocument[];
  pendingDocumentKeys: string[];
  selectedDocumentKeys: string[];
  loading: boolean;
  submitting: boolean;
  onToggleDocument: (key: string) => void;
  onRefresh: () => void;
  onSubmit: () => void;
};

export function MobileLegalAcceptanceCard(
  props: MobileLegalAcceptanceCardProps,
) {
  const pendingCount = props.pendingDocumentKeys.length;
  const acceptedCount = props.documents.length - pendingCount;
  const readyToSubmit =
    pendingCount > 0 &&
    props.pendingDocumentKeys.every((key) =>
      props.selectedDocumentKeys.includes(key),
    );

  return (
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      <View style={styles.heroCard}>
        <View style={styles.heroArtBand} />
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>OK</Text>
        </View>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroEyebrow}>{props.copy.title}</Text>
          <View
            style={[
              styles.heroPill,
              readyToSubmit ? styles.heroPillReady : styles.heroPillPending,
            ]}
          >
            <Text style={styles.heroPillText}>
              {readyToSubmit
                ? props.copy.submit
                : props.copy.pendingSummary(pendingCount)}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>{props.copy.title}</Text>
        <Text style={styles.heroBody}>{props.copy.subtitle}</Text>
        <View style={styles.heroSummaryRow}>
          <View style={styles.heroSummaryCard}>
            <Text style={styles.heroSummaryLabel}>{props.copy.submit}</Text>
            <Text style={styles.heroSummaryValue}>
              {props.copy.pendingSummary(pendingCount)}
            </Text>
          </View>
          <View style={styles.heroSummaryCard}>
            <Text style={styles.heroSummaryLabel}>{props.copy.acceptedBadge}</Text>
            <Text style={styles.heroSummaryValue}>
              {props.copy.acceptedSummary(Math.max(acceptedCount, 0))}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summaryCardWarm]}>
          <Text style={styles.summaryLabel}>{props.copy.submit}</Text>
          <Text style={styles.summaryValue}>
            {props.copy.pendingSummary(pendingCount)}
          </Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardInfo]}>
          <Text style={styles.summaryLabel}>{props.copy.acceptedBadge}</Text>
          <Text style={styles.summaryValue}>
            {props.copy.acceptedSummary(Math.max(acceptedCount, 0))}
          </Text>
        </View>
      </View>

      {props.loading ? (
        <Text style={styles.helpText}>{props.copy.loading}</Text>
      ) : props.documents.length === 0 ? (
        <Text style={styles.helpText}>{props.copy.empty}</Text>
      ) : (
        <View style={styles.documentList}>
          {props.documents.map((document) => {
            const key = buildLegalDocumentKey(document);
            const pending = props.pendingDocumentKeys.includes(key);
            const selected = props.selectedDocumentKeys.includes(key);

            return (
              <View
                key={document.id}
                style={[
                  styles.item,
                  pending && selected ? styles.itemSelected : null,
                ]}
              >
                <View style={styles.itemHeader}>
                  <View style={styles.itemHeaderBody}>
                    <Text style={styles.itemTitle}>
                      {formatLegalSlug(document.slug)}
                    </Text>
                    <Text style={styles.itemVersion}>
                      {props.copy.versionLabel(document.version)}
                    </Text>
                  </View>
                  {pending ? (
                    <Pressable
                      onPress={() => props.onToggleDocument(key)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      style={[
                        styles.checkbox,
                        selected ? styles.checkboxSelected : null,
                      ]}
                    >
                      {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </Pressable>
                  ) : (
                    <View style={styles.acceptedBadge}>
                      <Text style={styles.acceptedBadgeText}>
                        {props.copy.acceptedBadge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.itemBody} numberOfLines={8}>
                  {stripHtml(document.html)}
                </Text>
                {pending ? (
                  <Text style={styles.itemHint}>
                    {props.copy.checkboxLabel(
                      formatLegalSlug(document.slug),
                      document.version,
                    )}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.actions}>
        <ActionButton
          label={props.loading ? props.copy.loading : props.copy.refresh}
          onPress={props.onRefresh}
          variant="secondary"
          disabled={props.loading || props.submitting}
          fullWidth
        />
        <ActionButton
          label={props.submitting ? props.copy.submitting : props.copy.submit}
          onPress={props.onSubmit}
          disabled={
            props.loading || props.submitting || props.documents.length === 0
          }
          fullWidth
        />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  heroArtBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 116,
    borderTopLeftRadius: mobileRadii.xl,
    borderTopRightRadius: mobileRadii.xl,
    backgroundColor: "#ffd0ad",
  },
  heroBadge: {
    position: "absolute",
    top: 76,
    alignSelf: "center",
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 38,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffe58b",
    ...mobileChromeTheme.cardShadow,
  },
  heroBadgeText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  heroBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  heroCard: {
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
  heroEyebrow: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  heroPill: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  heroPillPending: {
    backgroundColor: "#ffd9d2",
  },
  heroPillReady: {
    backgroundColor: "#d8f5e3",
  },
  heroPillText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  heroSummaryCard: {
    flex: 1,
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  heroSummaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  heroSummaryRow: {
    flexDirection: "row",
    gap: mobileSpacing.md,
  },
  heroSummaryValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  heroTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
    marginTop: 84,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.lg,
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  summaryCardWarm: {
    backgroundColor: "#ffe58b",
  },
  summaryCardInfo: {
    backgroundColor: "#dfe1ff",
  },
  summaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  summaryValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  helpText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  documentList: {
    gap: mobileSpacing.lg,
  },
  item: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  itemSelected: {
    backgroundColor: "#dfe1ff",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  itemHeaderBody: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  itemTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  itemVersion: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  itemBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  itemHint: {
    color: mobileFeedbackTheme.info.accentColor,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  checkbox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
  },
  checkboxSelected: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  checkboxMark: {
    color: mobileFeedbackTheme.active.accentColor,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "800",
  },
  acceptedBadge: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
  },
  acceptedBadgeText: {
    color: mobileFeedbackTheme.success.accentColor,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  actions: {
    gap: mobileSpacing.md,
  },
});
