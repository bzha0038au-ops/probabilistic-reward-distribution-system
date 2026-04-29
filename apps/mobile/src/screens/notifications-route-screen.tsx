import { StyleSheet, Text, View } from "react-native";
import type { NotificationRecord } from "@reward/shared-types/notification";

import { buildTestId } from "../testing";
import { mobilePalette as palette } from "../theme";
import { ActionButton, SectionCard } from "../ui";
import type { MobileStyles } from "./types";

type NotificationsRouteScreenProps = {
  styles: MobileStyles;
  title: string;
  subtitle: string;
  copy: {
    unreadLabel: string;
    refresh: string;
    refreshing: string;
    markAllRead: string;
    markRead: string;
    empty: string;
    newBadge: string;
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

const formatNotificationKind = (kind: string) =>
  kind.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());

export function NotificationsRouteScreen(props: NotificationsRouteScreenProps) {
  return (
    <SectionCard title={props.title} subtitle={props.subtitle}>
      <View style={localStyles.summaryStrip}>
        <Text style={localStyles.summaryLabel}>{props.copy.unreadLabel}</Text>
        <Text style={localStyles.summaryValue}>{props.unreadCount}</Text>
      </View>

      <View style={localStyles.inlineActions}>
        <ActionButton
          label={props.loading ? props.copy.refreshing : props.copy.refresh}
          onPress={props.onRefresh}
          disabled={props.loading || props.mutating}
          variant="secondary"
          compact
          testID="notifications-refresh-button"
        />
        <ActionButton
          label={props.copy.markAllRead}
          onPress={props.onMarkAllRead}
          disabled={props.loading || props.mutating || props.unreadCount === 0}
          variant="secondary"
          compact
          testID="notifications-mark-all-read-button"
        />
      </View>

      {!props.notifications?.length ? (
        <Text style={localStyles.helperText}>{props.copy.empty}</Text>
      ) : null}

      {props.notifications?.map((item) => {
        const unread = !item.readAt;

        return (
          <View key={item.id} style={localStyles.card}>
            <View style={localStyles.stackRow}>
              <Text style={localStyles.cardTitle}>{item.title}</Text>
              {unread ? (
                <Text style={localStyles.badgeText}>{props.copy.newBadge}</Text>
              ) : null}
            </View>
            <Text style={localStyles.helperText}>{formatNotificationKind(item.kind)}</Text>
            <Text style={localStyles.cardBody}>{item.body}</Text>
            <Text style={localStyles.helperText}>
              {props.formatTimestamp(item.createdAt)}
            </Text>
            {unread ? (
              <ActionButton
                label={props.copy.markRead}
                onPress={() => props.onMarkRead(item.id)}
                disabled={props.mutating}
                variant="secondary"
                compact
                testID={buildTestId("notifications-mark-read-button", item.id)}
              />
            ) : null}
          </View>
        );
      })}
    </SectionCard>
  );
}

const localStyles = StyleSheet.create({
  summaryStrip: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  summaryValue: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "800",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  helperText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  stackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
  },
  cardBody: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  badgeText: {
    color: palette.background,
    backgroundColor: palette.accent,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
