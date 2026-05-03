import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  NotificationKind,
  NotificationRecord,
} from "@reward/shared-types/notification";

import { buildTestId } from "../testing";
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette as palette,
} from "../theme";
import { ActionButton, SectionCard, TextLink } from "../ui";
import type { MobileStyles } from "./types";

type NotificationFilterKey =
  | "all"
  | "account"
  | "markets"
  | "tables"
  | "updates";

type NotificationsRouteScreenProps = {
  styles: MobileStyles;
  title: string;
  subtitle: string;
  copy: {
    unreadLabel: string;
    latestLabel: string;
    refresh: string;
    refreshing: string;
    markAllRead: string;
    markRead: string;
    empty: string;
    newBadge: string;
    allFilter: string;
    accountFilter: string;
    marketsFilter: string;
    tablesFilter: string;
    updatesFilter: string;
  };
  unreadCount: number;
  notifications: NotificationRecord[] | null;
  loading: boolean;
  mutating: boolean;
  formatTimestamp: (value: string | Date | null | undefined) => string;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (notificationId: number) => void;
};

type NotificationPresentation = {
  filter: NotificationFilterKey;
  categoryLabel: string;
  iconLabel: string;
  accentColor: string;
  panelColor: string;
  previewTone?: "quote";
};

const formatNotificationKind = (kind: string) =>
  kind.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());

function resolveNotificationPresentation(
  kind: NotificationKind,
  copy: NotificationsRouteScreenProps["copy"],
): NotificationPresentation {
  switch (kind) {
    case "prediction_market_settled":
      return {
        filter: "markets",
        categoryLabel: copy.marketsFilter,
        iconLabel: "PM",
        accentColor: mobileFeedbackTheme.info.accentColor,
        panelColor: mobileFeedbackTheme.info.backgroundColor,
      };
    case "holdem_table_invite":
      return {
        filter: "tables",
        categoryLabel: copy.tablesFilter,
        iconLabel: "H",
        accentColor: palette.accent,
        panelColor: mobileFeedbackTheme.warningSoft.backgroundColor,
        previewTone: "quote",
      };
    case "saas_tenant_invite":
    case "saas_onboarding_complete":
    case "saas_billing_budget_alert":
      return {
        filter: "updates",
        categoryLabel: copy.updatesFilter,
        iconLabel: "UP",
        accentColor: palette.danger,
        panelColor: mobileFeedbackTheme.danger.backgroundColor,
      };
    case "withdrawal_status_changed":
      return {
        filter: "account",
        categoryLabel: copy.accountFilter,
        iconLabel: "$",
        accentColor: palette.accent,
        panelColor: mobileFeedbackTheme.warningSoft.backgroundColor,
      };
    case "kyc_status_changed":
    case "kyc_reverification":
    case "aml_review":
      return {
        filter: "account",
        categoryLabel: copy.accountFilter,
        iconLabel: "ID",
        accentColor: mobileFeedbackTheme.info.accentColor,
        panelColor: mobileFeedbackTheme.info.backgroundColor,
      };
    case "password_reset":
    case "email_verification":
    case "phone_verification":
    case "security_alert":
    default:
      return {
        filter: "account",
        categoryLabel: copy.accountFilter,
        iconLabel: "!",
        accentColor: palette.danger,
        panelColor: "#26161a",
      };
  }
}

function getFilterLabel(
  filter: NotificationFilterKey,
  copy: NotificationsRouteScreenProps["copy"],
) {
  switch (filter) {
    case "account":
      return copy.accountFilter;
    case "markets":
      return copy.marketsFilter;
    case "tables":
      return copy.tablesFilter;
    case "updates":
      return copy.updatesFilter;
    default:
      return copy.allFilter;
  }
}

export function NotificationsRouteScreen(props: NotificationsRouteScreenProps) {
  const [selectedFilter, setSelectedFilter] =
    useState<NotificationFilterKey>("all");
  const latestCreatedAt = props.notifications?.[0]?.createdAt ?? null;
  const activeFilterLabel = getFilterLabel(selectedFilter, props.copy);

  const filteredNotifications = useMemo(() => {
    if (!props.notifications?.length) {
      return [];
    }

    return props.notifications.filter((item) => {
      if (selectedFilter === "all") {
        return true;
      }

      return (
        resolveNotificationPresentation(item.kind, props.copy).filter ===
        selectedFilter
      );
    });
  }, [props.copy, props.notifications, selectedFilter]);

  const filters: NotificationFilterKey[] = [
    "all",
    "account",
    "markets",
    "tables",
    "updates",
  ];

  return (
    <SectionCard title={props.title}>
      <View style={localStyles.heroCard}>
        <View style={localStyles.heroArtBand} />
        <View style={localStyles.heroBadge}>
          <Text style={localStyles.heroBadgeText}>{props.unreadCount}</Text>
        </View>
        <View style={localStyles.heroTopRow}>
          <Text style={localStyles.heroEyebrow}>{props.copy.unreadLabel}</Text>
          <View style={localStyles.heroPill}>
            <Text style={localStyles.heroPillText}>{activeFilterLabel}</Text>
          </View>
        </View>
        <Text style={localStyles.heroTitle}>{props.title}</Text>
        <Text style={localStyles.heroBody}>{props.subtitle}</Text>
        <View style={localStyles.heroSummaryRow}>
          <View style={localStyles.heroSummaryCard}>
            <Text style={localStyles.heroSummaryLabel}>{props.copy.unreadLabel}</Text>
            <Text style={localStyles.heroSummaryValue}>{props.unreadCount}</Text>
          </View>
          <View style={localStyles.heroSummaryCard}>
            <Text style={localStyles.heroSummaryLabel}>{props.copy.latestLabel}</Text>
            <Text style={localStyles.heroSummaryValue}>
              {latestCreatedAt ? props.formatTimestamp(latestCreatedAt) : "—"}
            </Text>
          </View>
          <View style={localStyles.heroSummaryCard}>
            <Text style={localStyles.heroSummaryLabel}>{props.copy.allFilter}</Text>
            <Text style={localStyles.heroSummaryValue}>{activeFilterLabel}</Text>
          </View>
        </View>
      </View>

      <View style={localStyles.filterRow}>
        {filters.map((filter) => {
          const active = selectedFilter === filter;

          return (
            <Pressable
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              style={[
                localStyles.filterChip,
                active ? localStyles.filterChipActive : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={getFilterLabel(filter, props.copy)}
              accessibilityState={{ selected: active }}
              testID={buildTestId("notifications-filter", filter)}
            >
              <Text
                style={[
                  localStyles.filterChipLabel,
                  active ? localStyles.filterChipLabelActive : null,
                ]}
              >
                {getFilterLabel(filter, props.copy)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={localStyles.toolbarRow}>
        <ActionButton
          label={props.loading ? props.copy.refreshing : props.copy.refresh}
          onPress={props.onRefresh}
          disabled={props.loading || props.mutating}
          variant="secondary"
          compact
          testID="notifications-refresh-button"
        />
        <TextLink
          label={props.copy.markAllRead}
          onPress={props.onMarkAllRead}
          disabled={props.loading || props.mutating || props.unreadCount === 0}
          testID="notifications-mark-all-read-button"
        />
      </View>

      {!filteredNotifications.length ? (
        <View style={localStyles.emptyCard}>
          <Text style={localStyles.emptyTitle}>{activeFilterLabel}</Text>
          <Text style={localStyles.helperText}>{props.copy.empty}</Text>
        </View>
      ) : null}

      {filteredNotifications.map((item) => {
        const unread = !item.readAt;
        const presentation = resolveNotificationPresentation(item.kind, props.copy);

        return (
          <View
            key={item.id}
            style={[localStyles.card, !unread ? localStyles.cardRead : null]}
          >
            <View
              style={[
                localStyles.iconTile,
                { backgroundColor: presentation.panelColor },
              ]}
            >
              <Text
                style={[
                  localStyles.iconTileLabel,
                  { color: presentation.accentColor },
                ]}
              >
                {presentation.iconLabel}
              </Text>
            </View>

            <View style={localStyles.cardContent}>
              <View style={localStyles.cardMetaRow}>
                <Text
                  style={[
                    localStyles.categoryLabel,
                    { color: presentation.accentColor },
                  ]}
                >
                  {presentation.categoryLabel}
                </Text>
                <View style={localStyles.cardMetaRight}>
                  <Text style={localStyles.timestampText}>
                    {props.formatTimestamp(item.createdAt)}
                  </Text>
                  {unread ? <View style={localStyles.unreadDot} /> : null}
                </View>
              </View>

              <Text style={localStyles.cardTitle}>{item.title}</Text>
              <Text style={localStyles.cardBody}>{item.body}</Text>
              <Text style={localStyles.kindLabel}>
                {formatNotificationKind(item.kind)}
              </Text>

              {presentation.previewTone === "quote" ? (
                <View style={localStyles.quoteCard}>
                  <Text style={localStyles.quoteText}>{item.body}</Text>
                </View>
              ) : null}

              {unread ? (
                <ActionButton
                  label={props.copy.markRead}
                  onPress={() => props.onMarkRead(item.id)}
                  disabled={props.mutating}
                  variant="secondary"
                  fullWidth
                  testID={buildTestId("notifications-mark-read-button", item.id)}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}

const localStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: 14,
    ...mobileChromeTheme.cardShadow,
  },
  cardContent: {
    flex: 1,
    gap: 6,
  },
  cardBody: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  cardMetaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardRead: {
    opacity: 0.82,
  },
  cardTitle: {
    color: palette.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  emptyCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...mobileChromeTheme.cardShadowSm,
  },
  filterChipActive: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  filterChipLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  filterChipLabelActive: {
    color: mobileFeedbackTheme.active.accentColor,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  heroArtBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#2b183d",
  },
  heroBadge: {
    position: "absolute",
    top: 54,
    alignSelf: "center",
    minWidth: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
    ...mobileChromeTheme.cardShadow,
  },
  heroBadgeText: {
    color: "#241605",
    fontSize: 20,
    fontWeight: "800",
  },
  heroBody: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    gap: 10,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    paddingHorizontal: 16,
    paddingTop: 110,
    paddingBottom: 16,
    ...mobileChromeTheme.cardShadow,
  },
  heroEyebrow: {
    color: "#fff2cf",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroPill: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...mobileChromeTheme.cardShadowSm,
  },
  heroPillText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroSummaryCard: {
    flex: 1,
    gap: 4,
    minWidth: 88,
    borderRadius: 14,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...mobileChromeTheme.cardShadowSm,
  },
  heroSummaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroSummaryValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  heroTitle: {
    color: palette.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  heroTopRow: {
    position: "absolute",
    top: 14,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  helperText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  iconTile: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    ...mobileChromeTheme.cardShadowSm,
  },
  iconTileLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  kindLabel: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  quoteCard: {
    borderRadius: 12,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quoteText: {
    color: palette.text,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
  timestampText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
});
