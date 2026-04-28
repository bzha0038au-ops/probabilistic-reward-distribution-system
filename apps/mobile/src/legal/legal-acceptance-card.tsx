import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CurrentLegalDocument } from "@reward/shared-types/legal";

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
  return (
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      {props.loading ? (
        <Text style={styles.helpText}>{props.copy.loading}</Text>
      ) : props.documents.length === 0 ? (
        <Text style={styles.helpText}>{props.copy.empty}</Text>
      ) : (
        props.documents.map((document) => {
          const key = buildLegalDocumentKey(document);
          const pending = props.pendingDocumentKeys.includes(key);
          const selected = props.selectedDocumentKeys.includes(key);

          return (
            <View key={document.id} style={styles.item}>
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
              <Text style={styles.itemBody} numberOfLines={10}>
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
        })
      )}

      <View style={styles.actions}>
        <ActionButton
          label={props.loading ? props.copy.loading : props.copy.refresh}
          onPress={props.onRefresh}
          variant="secondary"
          disabled={props.loading || props.submitting}
        />
        <ActionButton
          label={props.submitting ? props.copy.submitting : props.copy.submit}
          onPress={props.onSubmit}
          disabled={props.loading || props.submitting || props.documents.length === 0}
        />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  helpText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  item: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    padding: 14,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  itemHeaderBody: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  itemVersion: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  itemBody: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 18,
  },
  itemHint: {
    color: "#7DD3FC",
    fontSize: 12,
    lineHeight: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#64748B",
  },
  checkboxSelected: {
    borderColor: "#22C55E",
    backgroundColor: "#22C55E",
  },
  checkboxMark: {
    color: "#020617",
    fontSize: 12,
    fontWeight: "800",
  },
  acceptedBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(34, 197, 94, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  acceptedBadgeText: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
});
