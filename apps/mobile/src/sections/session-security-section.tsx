import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { AuthSessionSummary } from "@reward/shared-types/auth";

import type { MobileSessionSecurityCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import { mobilePalette } from "../theme";
import { ActionButton, SectionCard } from "../ui";

type SessionSecuritySectionProps = {
  styles: MobileStyles;
  copy: MobileSessionSecurityCopy;
  currentSession: AuthSessionSummary | null;
  visibleSessions: AuthSessionSummary[];
  loadingSessions: boolean;
  playingQuickEight: boolean;
  formatTimestamp: (value: string | null) => string;
  summarizeUserAgent: (value: string | null) => string;
  onRefreshSessions: () => void;
  onOpenResetPassword: () => void;
  onRevokeAllSessions: () => void;
  onRevokeSession: (session: AuthSessionSummary) => void;
};

export function SessionSecuritySection(props: SessionSecuritySectionProps) {
  return (
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      {props.currentSession ? (
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionMetaLine}>
            {props.copy.currentSessionId(props.currentSession.sessionId)}
          </Text>
          <Text style={styles.sessionMetaLine}>
            {props.copy.expiresSummary(
              props.formatTimestamp(props.currentSession.expiresAt),
            )}
          </Text>
        </View>
      ) : null}

      <View style={props.styles.inlineActions}>
        <ActionButton
          label={
            props.loadingSessions ? props.copy.refreshing : props.copy.refresh
          }
          onPress={props.onRefreshSessions}
          disabled={props.loadingSessions || props.playingQuickEight}
          variant="secondary"
          compact
        />
        <ActionButton
          label={props.copy.resetPassword}
          onPress={props.onOpenResetPassword}
          disabled={props.playingQuickEight}
          variant="secondary"
          compact
        />
        <ActionButton
          label={props.copy.signOutEverywhere}
          onPress={props.onRevokeAllSessions}
          disabled={props.loadingSessions || props.playingQuickEight}
          variant="danger"
          compact
        />
      </View>

      {props.loadingSessions ? (
        <View style={props.styles.loaderRow}>
          <ActivityIndicator color={mobilePalette.accent} />
          <Text style={props.styles.loaderText}>{props.copy.loading}</Text>
        </View>
      ) : null}

      {!props.loadingSessions && props.visibleSessions.length === 0 ? (
        <Text style={props.styles.gachaHint}>{props.copy.empty}</Text>
      ) : null}

      {props.visibleSessions.map((entry) => (
        <View key={entry.sessionId} style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionTitle}>
              {entry.current
                ? props.copy.currentDevice
                : props.copy.activeSession}
            </Text>
            <View
              style={[
                props.styles.badge,
                entry.current
                  ? props.styles.badgeSuccess
                  : props.styles.badgeMuted,
              ]}
            >
              <Text style={props.styles.badgeText}>
                {entry.current ? props.copy.currentBadge : entry.kind}
              </Text>
            </View>
          </View>
          <Text style={styles.sessionBody}>
            {props.copy.id(entry.sessionId)}
          </Text>
          <Text style={styles.sessionBody}>
            {props.copy.ip(entry.ip ?? props.copy.unavailable)}
          </Text>
          <Text style={styles.sessionBody}>
            {props.copy.userAgent(props.summarizeUserAgent(entry.userAgent))}
          </Text>
          <Text style={styles.sessionBody}>
            {props.copy.createdAt(props.formatTimestamp(entry.createdAt))}
          </Text>
          <Text style={styles.sessionBody}>
            {props.copy.lastSeenAt(props.formatTimestamp(entry.lastSeenAt))}
          </Text>
          <Text style={styles.sessionBody}>
            {props.copy.expiresAt(props.formatTimestamp(entry.expiresAt))}
          </Text>
          <View style={styles.sessionActionRow}>
            <ActionButton
              label={
                entry.current
                  ? props.copy.signOutDevice
                  : props.copy.revokeSession
              }
              onPress={() => props.onRevokeSession(entry)}
              disabled={props.playingQuickEight}
              variant={entry.current ? "danger" : "secondary"}
              compact
            />
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  sessionMeta: {
    gap: 4,
  },
  sessionMetaLine: {
    color: mobilePalette.textMuted,
    fontSize: 13,
  },
  sessionCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sessionTitle: {
    color: mobilePalette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  sessionBody: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  sessionActionRow: {
    paddingTop: 4,
  },
});
