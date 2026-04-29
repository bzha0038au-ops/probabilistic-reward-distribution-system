import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { MobileSignedInCopy } from '../mobile-copy';
import type { MobileStyles } from '../screens/types';
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

export function SignedInCard(props: SignedInCardProps) {
  const busyWithGame =
    props.playingDrawCount !== null || props.loadingDrawCatalog || props.playingQuickEight;

  return (
    <SectionCard
      title={props.copy.title(props.email)}
      subtitle={props.copy.subtitle(props.platform, props.role)}
    >
      <View style={props.styles.badgeRow}>
        <View
          style={[
            props.styles.badge,
            props.emailVerified ? props.styles.badgeSuccess : props.styles.badgeWarning,
          ]}
        >
          <Text style={props.styles.badgeText}>
            {props.emailVerified ? props.copy.emailVerified : props.copy.emailNotVerified}
          </Text>
        </View>
        <View style={props.styles.badge}>
          <Text style={props.styles.badgeText}>
            {props.currentSessionActive ? props.copy.sessionActive : props.copy.sessionLoading}
          </Text>
        </View>
        <View style={[props.styles.badge, props.styles.badgeMuted]}>
          <Text style={props.styles.badgeText}>
            {props.copy.balance(props.formattedBalance)}
          </Text>
        </View>
      </View>

      <View style={props.styles.inlineActions}>
        <ActionButton
          label={props.refreshingBalance ? props.copy.refreshing : props.copy.refreshBalance}
          onPress={props.onRefreshBalance}
          disabled={props.refreshingBalance || props.submitting || busyWithGame}
          variant="secondary"
          compact
        />
        <ActionButton
          label={props.loadingSessions ? props.copy.refreshing : props.copy.refreshSessions}
          onPress={props.onRefreshSessions}
          disabled={props.loadingSessions || props.submitting || busyWithGame}
          variant="secondary"
          compact
        />
        <ActionButton
          label={props.submitting ? props.copy.signingOut : props.copy.signOut}
          onPress={props.onSignOut}
          disabled={props.submitting || props.playingDrawCount !== null || props.playingQuickEight}
          variant="danger"
          compact
          testID="account-sign-out-button"
        />
      </View>

      {props.verificationCallout}
    </SectionCard>
  );
}
