import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { AuthSessionSummary } from '@reward/shared-types/auth';

import type { MobileSessionSecurityCopy } from '../mobile-copy';
import type { MobileStyles } from '../screens/types';
import { mobileChromeTheme, mobilePalette } from '../theme';
import { ActionButton, SectionCard } from '../ui';

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

function extractLabel(value: string) {
  const [label] = value.split(/[:：]/u);
  return label ?? value;
}

function ControlRow(props: {
  title: string;
  subtitle: string;
  action: ReactNode;
}) {
  return (
    <View style={styles.controlRow}>
      <View style={styles.controlCopy}>
        <Text style={styles.controlTitle}>{props.title}</Text>
        <Text style={styles.controlSubtitle}>{props.subtitle}</Text>
      </View>
      <View style={styles.controlAction}>{props.action}</View>
    </View>
  );
}

export function SessionSecuritySection(props: SessionSecuritySectionProps) {
  return (
    <SectionCard title={props.copy.title}>
      {props.currentSession ? (
        <View style={styles.currentDeviceCard}>
          <View style={styles.currentDeviceHeader}>
            <View style={styles.currentDeviceAvatar}>
              <Text style={styles.currentDeviceAvatarGlyph}>✓</Text>
            </View>
            <View style={styles.currentDeviceCopy}>
              <Text style={styles.currentDeviceLabel}>{props.copy.currentDevice}</Text>
              <Text style={styles.currentDeviceValue}>
                {props.summarizeUserAgent(props.currentSession.userAgent)}
              </Text>
              <Text style={styles.currentDeviceMeta}>
                {props.copy.currentSessionId(props.currentSession.sessionId)}
              </Text>
            </View>
            <View style={[styles.sessionBadge, styles.sessionBadgeCurrent]}>
              <Text style={styles.sessionBadgeText}>{props.copy.currentBadge}</Text>
            </View>
          </View>
          <View style={styles.currentDeviceSummaryRow}>
            <View style={styles.currentDeviceSummaryCard}>
              <Text style={styles.currentDeviceSummaryLabel}>{props.copy.activeSession}</Text>
              <Text style={styles.currentDeviceSummaryValue}>
                {props.visibleSessions.length}
              </Text>
            </View>
            <View style={styles.currentDeviceSummaryCard}>
              <Text style={styles.currentDeviceSummaryLabel}>
                {extractLabel(props.copy.expiresAt(''))}
              </Text>
              <Text style={styles.currentDeviceSummaryValue}>
                {props.formatTimestamp(props.currentSession.expiresAt)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.controlsCard}>
        <ControlRow
          title={props.copy.activeSession}
          subtitle={props.copy.sessionCount(props.visibleSessions.length)}
          action={
            <ActionButton
              label={
                props.loadingSessions ? props.copy.refreshing : props.copy.refresh
              }
              onPress={props.onRefreshSessions}
              disabled={props.loadingSessions || props.playingQuickEight}
              variant="secondary"
              compact
            />
          }
        />
        <ControlRow
          title={props.copy.resetPassword}
          subtitle={props.copy.resetPasswordSubtitle}
          action={
            <ActionButton
              label={props.copy.resetPassword}
              onPress={props.onOpenResetPassword}
              disabled={props.playingQuickEight}
              variant="secondary"
              compact
            />
          }
        />
        <ControlRow
          title={props.copy.signOutEverywhere}
          subtitle={props.copy.signOutEverywhereSubtitle}
          action={
            <ActionButton
              label={props.copy.signOutEverywhere}
              onPress={props.onRevokeAllSessions}
              disabled={props.loadingSessions || props.playingQuickEight}
              variant="danger"
              compact
            />
          }
        />
      </View>

      {props.loadingSessions ? (
        <View style={props.styles.loaderRow}>
          <ActivityIndicator color={mobilePalette.accent} />
          <Text style={props.styles.loaderText}>{props.copy.loading}</Text>
        </View>
      ) : null}

      {!props.loadingSessions && props.visibleSessions.length === 0 ? (
        <Text style={styles.helperText}>{props.copy.empty}</Text>
      ) : null}

      <View style={styles.sessionList}>
        {props.visibleSessions.map((entry) => (
          <View
            key={entry.sessionId}
            style={[
              styles.sessionCard,
              entry.current ? styles.sessionCardCurrent : null,
            ]}
          >
            <View style={styles.sessionHeader}>
              <View style={styles.sessionHeaderCopy}>
                <Text style={styles.sessionTitle}>
                  {entry.current ? props.copy.currentDevice : props.copy.activeSession}
                </Text>
                <Text style={styles.sessionMeta}>
                  {props.summarizeUserAgent(entry.userAgent)}
                </Text>
              </View>

              <View
                style={[
                  styles.sessionBadge,
                  entry.current ? styles.sessionBadgeCurrent : styles.sessionBadgeMuted,
                ]}
              >
                <Text style={styles.sessionBadgeText}>
                  {entry.current ? props.copy.currentBadge : entry.kind}
                </Text>
              </View>
            </View>

            <View style={styles.sessionDetailList}>
              <Text style={styles.sessionDetailLine}>
                {props.copy.id(entry.sessionId)}
              </Text>
              <Text style={styles.sessionDetailLine}>
                {props.copy.ip(entry.ip ?? props.copy.unavailable)}
              </Text>
              <Text style={styles.sessionDetailLine}>
                {props.copy.createdAt(props.formatTimestamp(entry.createdAt))}
              </Text>
              <Text style={styles.sessionDetailLine}>
                {props.copy.lastSeenAt(props.formatTimestamp(entry.lastSeenAt))}
              </Text>
              <Text style={styles.sessionDetailLine}>
                {props.copy.expiresAt(props.formatTimestamp(entry.expiresAt))}
              </Text>
            </View>

            <ActionButton
              label={
                entry.current ? props.copy.signOutDevice : props.copy.revokeSession
              }
              onPress={() => props.onRevokeSession(entry)}
              disabled={props.playingQuickEight}
              variant={entry.current ? 'danger' : 'secondary'}
              fullWidth
            />
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  currentDeviceCard: {
    gap: 14,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: '#fff3ec',
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...mobileChromeTheme.cardShadow,
  },
  currentDeviceAvatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    borderWidth: 4,
    borderColor: mobilePalette.border,
    backgroundColor: '#dfe1ff',
    ...mobileChromeTheme.cardShadowSm,
  },
  currentDeviceAvatarGlyph: {
    color: mobilePalette.text,
    fontSize: 24,
    fontWeight: '800',
  },
  currentDeviceCopy: {
    flex: 1,
    gap: 4,
  },
  currentDeviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  currentDeviceLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  currentDeviceValue: {
    color: mobilePalette.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
  },
  currentDeviceMeta: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  currentDeviceSummaryCard: {
    flex: 1,
    gap: 4,
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...mobileChromeTheme.cardShadowSm,
  },
  currentDeviceSummaryLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentDeviceSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  currentDeviceSummaryValue: {
    color: mobilePalette.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  controlsCard: {
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    overflow: 'hidden',
    ...mobileChromeTheme.cardShadow,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: mobileChromeTheme.borderWidth,
    borderTopColor: mobilePalette.border,
  },
  controlCopy: {
    flex: 1,
    gap: 3,
  },
  controlTitle: {
    color: mobilePalette.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  controlSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  controlAction: {
    alignItems: 'stretch',
    justifyContent: 'center',
    minWidth: 132,
  },
  helperText: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  sessionList: {
    gap: 12,
  },
  sessionCard: {
    gap: 12,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  sessionCardCurrent: {
    backgroundColor: '#ece9ff',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sessionTitle: {
    color: mobilePalette.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  sessionMeta: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  sessionBadge: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sessionBadgeCurrent: {
    backgroundColor: '#ffe58b',
  },
  sessionBadgeMuted: {
    backgroundColor: '#dfe1ff',
  },
  sessionBadgeText: {
    color: mobilePalette.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sessionDetailList: {
    gap: 4,
  },
  sessionDetailLine: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
