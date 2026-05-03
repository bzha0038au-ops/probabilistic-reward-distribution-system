import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { KycVerificationCard } from '../sections/kyc-verification-card';
import { SessionSecuritySection } from '../sections/session-security-section';
import { mobileChromeTheme, mobilePalette as palette } from '../theme';
import { SectionCard } from '../ui';

type SecurityRouteScreenProps = ComponentProps<typeof SessionSecuritySection> & {
  kycProfile: ComponentProps<typeof KycVerificationCard>['profile'];
  loadingKycProfile: ComponentProps<typeof KycVerificationCard>['loading'];
  formatOptionalTimestamp: ComponentProps<
    typeof KycVerificationCard
  >['formatTimestamp'];
  onRefreshKycProfile: ComponentProps<typeof KycVerificationCard>['onRefresh'];
  onOpenKycVerification: ComponentProps<
    typeof KycVerificationCard
  >['onOpenVerification'];
};

const formatStatusLabel = (value: string) =>
  value
    .split('_')
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]!.toUpperCase()}${segment.slice(1)}`
        : segment,
    )
    .join(' ');

export function SecurityRouteScreen(props: SecurityRouteScreenProps) {
  const kycReady = props.kycProfile?.status === 'approved';
  const latestReviewTimestamp = props.formatOptionalTimestamp(
    props.kycProfile?.reviewedAt ?? props.kycProfile?.submittedAt ?? null,
  );
  const visibleSessionCount = props.visibleSessions.length;
  const currentTierLabel = props.kycProfile?.requestedTier
    ? formatStatusLabel(props.kycProfile.requestedTier)
    : props.copy.kyc.tier0;

  return (
    <>
      <SectionCard title={props.copy.overviewTitle}>
        <View style={localStyles.identityHeroCard}>
          <View style={localStyles.identityHeroAvatar}>
            <Text style={localStyles.identityHeroAvatarGlyph}>
              {kycReady ? '✓' : 'ID'}
            </Text>
          </View>
          <View style={localStyles.identityHeroCopy}>
            <Text style={localStyles.identityHeroTitle}>
              {kycReady ? props.copy.approvedBannerTitle : props.copy.pendingBannerTitle}
            </Text>
            <Text style={localStyles.identityHeroSubtitle}>
              {kycReady ? props.copy.kyc.tier2 : currentTierLabel}
            </Text>
            <View
              style={[
                localStyles.identityHeroPill,
                kycReady ? localStyles.identityHeroPillGold : localStyles.identityHeroPillIndigo,
              ]}
            >
              <Text style={localStyles.identityHeroPillText}>
                {props.kycProfile ? formatStatusLabel(props.kycProfile.status) : props.copy.kyc.title}
              </Text>
            </View>
          </View>
        </View>

        <View style={localStyles.summaryGrid}>
          <View style={[localStyles.summaryCard, localStyles.summaryCardIndigo]}>
            <Text style={localStyles.summaryLabel}>{props.copy.currentDevice}</Text>
            <Text style={localStyles.summaryValue}>
              {props.currentSession ? props.copy.currentBadge : '—'}
            </Text>
            <Text style={localStyles.summaryMeta}>
              {props.currentSession
                ? props.copy.currentDeviceSummary(
                    props.formatTimestamp(props.currentSession.expiresAt),
                  )
                : props.copy.empty}
            </Text>
          </View>

          <View style={[localStyles.summaryCard, localStyles.summaryCardPaper]}>
            <Text style={localStyles.summaryLabel}>{props.copy.activeSession}</Text>
            <Text style={localStyles.summaryValue}>{visibleSessionCount}</Text>
            <Text style={localStyles.summaryMeta}>
              {props.copy.sessionCount(visibleSessionCount)}
            </Text>
          </View>

          <View style={[localStyles.summaryCard, localStyles.summaryCardGold]}>
            <Text style={localStyles.summaryLabel}>{props.copy.kyc.status}</Text>
            <Text style={localStyles.summaryValue}>
              {props.kycProfile ? formatStatusLabel(props.kycProfile.status) : '—'}
            </Text>
            <Text style={localStyles.summaryMeta}>
              {latestReviewTimestamp ?? props.copy.kyc.noSubmission}
            </Text>
          </View>
        </View>
      </SectionCard>

      <KycVerificationCard
        styles={props.styles}
        copy={props.copy.kyc}
        profile={props.kycProfile}
        loading={props.loadingKycProfile}
        playingQuickEight={props.playingQuickEight}
        formatTimestamp={props.formatOptionalTimestamp}
        onRefresh={props.onRefreshKycProfile}
        onOpenVerification={props.onOpenKycVerification}
      />

      <SessionSecuritySection {...props} />
    </>
  );
}

const localStyles = StyleSheet.create({
  identityHeroAvatar: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 42,
    borderWidth: 4,
    borderColor: palette.border,
    backgroundColor: '#dfe1ff',
    ...mobileChromeTheme.cardShadowSm,
  },
  identityHeroAvatarGlyph: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
  },
  identityHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...mobileChromeTheme.cardShadow,
  },
  identityHeroCopy: {
    flex: 1,
    gap: 6,
  },
  identityHeroPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...mobileChromeTheme.cardShadowSm,
  },
  identityHeroPillGold: {
    backgroundColor: '#ffe58b',
  },
  identityHeroPillIndigo: {
    backgroundColor: '#dfe1ff',
  },
  identityHeroPillText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  identityHeroSubtitle: {
    color: palette.textMuted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  identityHeroTitle: {
    color: palette.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 148,
    gap: 6,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  summaryCardIndigo: {
    backgroundColor: '#dfe1ff',
  },
  summaryCardPaper: {
    backgroundColor: palette.panel,
  },
  summaryCardGold: {
    backgroundColor: '#fff3c2',
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: palette.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
  },
  summaryMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
