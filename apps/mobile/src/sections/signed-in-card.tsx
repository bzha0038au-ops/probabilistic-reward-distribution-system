import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MobileSignedInCopy } from '../mobile-copy';
import type { MobileStyles } from '../screens/types';
import { mobileChromeTheme, mobilePalette } from '../theme';
import { ActionButton, SectionCard } from '../ui';

type SignedInCardProps = {
  styles: MobileStyles;
  copy: MobileSignedInCopy;
  platform: string;
  email: string;
  role: string;
  emailVerified: boolean;
  currentSessionActive: boolean;
  formattedBalance: string;
  refreshingBalance: boolean;
  loadingSessions: boolean;
  submitting: boolean;
  loadingDrawCatalog: boolean;
  playingDrawCount: number | null;
  playingQuickEight: boolean;
  verificationCallout: ReactNode;
  onRefreshBalance: () => void;
  onRefreshSessions: () => void;
  onSignOut: () => void;
};

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

export function SignedInCard(props: SignedInCardProps) {
  const busyWithGame =
    props.playingDrawCount !== null ||
    props.loadingDrawCatalog ||
    props.playingQuickEight;
  const monogram =
    props.email.trim().charAt(0).toUpperCase() ||
    props.copy.profileMonogramFallback;
  const accountReady = props.emailVerified && props.currentSessionActive;

  return (
    <SectionCard title={props.copy.title(props.email)}>
      <View style={styles.profileCard}>
        <View style={styles.profileArtBand} />
        <View style={styles.profileTopRow}>
          <Text style={styles.profileEyebrow}>{props.copy.profileTitle}</Text>
          <View
            style={[
              styles.profileStatusPill,
              accountReady
                ? styles.profileStatusPillReady
                : styles.profileStatusPillPending,
            ]}
          >
            <Text style={styles.profileStatusPillText}>
              {props.emailVerified ? props.copy.emailVerified : props.copy.emailNotVerified}
            </Text>
          </View>
        </View>
        <View style={styles.profileHeroRow}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarLabel}>{monogram}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName}>{props.email}</Text>
            <Text style={styles.profileSubtitle}>{props.copy.profileSubtitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlsCard}>
        <ControlRow
          title={props.copy.refreshBalance}
          subtitle={props.copy.refreshBalanceSubtitle}
          action={
            <ActionButton
              label={props.refreshingBalance ? props.copy.refreshing : props.copy.refreshBalance}
              onPress={props.onRefreshBalance}
              disabled={props.refreshingBalance || props.submitting || busyWithGame}
              variant="secondary"
              compact
            />
          }
        />
        <ControlRow
          title={props.copy.refreshSessions}
          subtitle={props.copy.refreshSessionsSubtitle}
          action={
            <ActionButton
              label={props.loadingSessions ? props.copy.refreshing : props.copy.refreshSessions}
              onPress={props.onRefreshSessions}
              disabled={props.loadingSessions || props.submitting || busyWithGame}
              variant="secondary"
              compact
            />
          }
        />
        <ControlRow
          title={props.copy.signOut}
          subtitle={props.copy.signOutSubtitle}
          action={
            <ActionButton
              label={props.submitting ? props.copy.signingOut : props.copy.signOut}
              onPress={props.onSignOut}
              disabled={
                props.submitting ||
                props.playingDrawCount !== null ||
                props.playingQuickEight
              }
              variant="danger"
              compact
              testID="account-sign-out-button"
            />
          }
        />
      </View>

      {props.verificationCallout}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    gap: 12,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: 16,
    ...mobileChromeTheme.cardShadow,
  },
  profileArtBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 112,
    backgroundColor: '#1f2c48',
  },
  profileAvatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: '#1f2c48',
    flexShrink: 0,
  },
  profileAvatarLabel: {
    color: mobilePalette.accent,
    fontSize: 28,
    fontWeight: '800',
  },
  profileEyebrow: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  profileHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 28,
  },
  profileMeta: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    color: mobilePalette.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    flexShrink: 1,
  },
  profileSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  profileStatusPill: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...mobileChromeTheme.cardShadowSm,
  },
  profileStatusPillPending: {
    backgroundColor: '#2d1719',
  },
  profileStatusPillReady: {
    backgroundColor: '#2d220f',
  },
  profileStatusPillText: {
    color: mobilePalette.text,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
});
