import { StyleSheet, Text, View } from 'react-native';

import {
  homeMenuRouteOrder,
  type HomeMenuRouteKey,
  type MobileRouteCards,
} from '../route-copy';
import { buildTestId } from '../testing';
import { mobileChromeTheme, mobilePalette as palette } from '../theme';
import { ActionButton, SectionCard } from '../ui';
import type { MobileStyles } from './types';

const featuredGameRoutes = [
  'gacha',
  'quickEight',
  'predictionMarket',
  'holdem',
  'blackjack',
  'wallet',
] as const satisfies readonly HomeMenuRouteKey[];

const rewardSpotlightRoutes = [
  'rewards',
  'wallet',
  'fairness',
] as const satisfies readonly HomeMenuRouteKey[];

type HomeRouteScreenProps = {
  styles: MobileStyles;
  title: string;
  subtitle: string;
  tickerLabel: string;
  featuredLabel: string;
  moreTitle: string;
  moreSubtitle: string;
  cards: MobileRouteCards;
  formattedBalance: string;
  bonusBalance: string;
  streakDays: number;
  readyMissionCount: number;
  summaryLabels: {
    balance: string;
    bonus: string;
    streak: string;
    ready: string;
  };
  navigationLocked: boolean;
  onOpenRoute: (route: HomeMenuRouteKey) => void;
};

export function HomeRouteScreen(props: HomeRouteScreenProps) {
  const quickEntrySet = new Set<HomeMenuRouteKey>(featuredGameRoutes);
  const secondaryRoutes = homeMenuRouteOrder.filter(
    (route) => !quickEntrySet.has(route),
  );
  const tickerMessage =
    props.readyMissionCount > 0
      ? `${props.readyMissionCount} mission${props.readyMissionCount === 1 ? '' : 's'} ready • ${props.streakDays} day streak live • Bonus ${props.bonusBalance}`
      : `${props.streakDays} day streak live • Bonus ${props.bonusBalance} waiting in rewards`;
  const playerLevel = 20 + Math.min(props.streakDays, 9) + props.readyMissionCount;
  const missionRows = [
    {
      title: props.summaryLabels.ready,
      progressLabel: `${Math.min(props.readyMissionCount, 3)}/3`,
      rewardLabel: props.bonusBalance,
      progress: Math.min(1, props.readyMissionCount / 3),
    },
    {
      title: props.summaryLabels.streak,
      progressLabel: `${Math.min(props.streakDays, 7)}/7`,
      rewardLabel: `${props.streakDays}`,
      progress: Math.min(1, props.streakDays / 7),
    },
  ];

  return (
    <View style={styles.lobbyStack}>
      <View style={styles.playerStrip}>
        <View style={styles.playerIdentity}>
          <View style={styles.playerAvatar}>
            <Text style={styles.playerAvatarText}>R</Text>
          </View>
          <View style={styles.playerCopy}>
            <Text style={styles.playerName}>Rex</Text>
            <Text style={styles.playerMeta}>Lv. {playerLevel}</Text>
          </View>
        </View>
        <View style={styles.playerBalanceChip}>
          <Text style={styles.playerBalanceLabel}>{props.summaryLabels.balance}</Text>
          <Text style={styles.playerBalanceValue}>{props.formattedBalance}</Text>
        </View>
        <View style={styles.playerAlertDot} />
      </View>

      <View style={styles.promoCard}>
        <View style={styles.promoCopy}>
          <Text style={styles.promoEyebrow}>{props.featuredLabel}</Text>
          <Text style={styles.promoTitle}>Play games{'\n'}win rewards</Text>
          <Text style={styles.promoBody}>{props.cards.gacha.body}</Text>
        </View>
        <View style={styles.promoMascot}>
          <Text style={styles.promoMascotText}>🎁</Text>
        </View>
      </View>

      <View style={styles.tickerBar}>
        <View style={styles.tickerLabel}>
          <Text style={styles.tickerLabelText}>{props.tickerLabel}</Text>
        </View>
        <Text style={styles.tickerMessage}>{tickerMessage}</Text>
      </View>

      <SectionCard title={props.title}>
        <View style={styles.routeCardGrid}>
          {featuredGameRoutes.map((route) => (
            <View
              key={route}
              style={[
                styles.routeCard,
                styles.routeCardFeatured,
                routeCardTone(route),
              ]}
            >
              <View style={styles.routeCardHeader}>
                <View style={styles.routeCardIcon}>
                  <Text style={styles.routeCardIconText}>
                    {props.cards[route].title.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.routeCardTitle}>{props.cards[route].title}</Text>
              <Text style={styles.routeCardBody}>{props.cards[route].body}</Text>
              <ActionButton
                label={props.cards[route].open}
                onPress={() => props.onOpenRoute(route)}
                disabled={props.navigationLocked}
                variant={isPrimaryRoute(route) ? 'primary' : 'secondary'}
                compact
                testID={buildTestId('home-open-route-button', route)}
              />
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Missions">
        <View style={styles.missionList}>
          {missionRows.map((mission) => (
            <View key={mission.title} style={styles.missionCard}>
              <View style={styles.missionHeader}>
                <Text style={styles.missionTitle}>{mission.title}</Text>
                <Text style={styles.missionProgress}>{mission.progressLabel}</Text>
              </View>
              <View style={styles.missionTrack}>
                <View
                  style={[
                    styles.missionFill,
                    { width: `${Math.max(12, mission.progress * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.missionReward}>{mission.rewardLabel}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Today's rewards">
        <View style={styles.rewardStrip}>
          {rewardSpotlightRoutes.map((route, index) => (
            <View key={route} style={styles.rewardTile}>
              <View style={styles.rewardTileTop}>
                <View style={styles.rewardTileBadge}>
                  <Text style={styles.rewardTileBadgeText}>
                    {index === 0 ? 'Epic' : index === 1 ? 'Rare' : 'Daily'}
                  </Text>
                </View>
                <Text style={styles.rewardTileIcon}>
                  {props.cards[route].title.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.rewardTileTitle}>{props.cards[route].title}</Text>
            </View>
          ))}
        </View>

        <View style={styles.moreRouteList}>
          {secondaryRoutes.map((route) => (
            <View key={route} style={styles.moreRouteCard}>
              <View style={styles.moreRouteCopy}>
                <Text style={styles.moreRouteTitle}>{props.cards[route].title}</Text>
                <Text style={styles.moreRouteBody}>{props.cards[route].body}</Text>
              </View>
              <ActionButton
                label={props.cards[route].open}
                onPress={() => props.onOpenRoute(route)}
                disabled={props.navigationLocked}
                variant="secondary"
                compact
                testID={buildTestId('home-open-route-button', route)}
              />
            </View>
          ))}
        </View>
      </SectionCard>
    </View>
  );
}

function isPrimaryRoute(route: HomeMenuRouteKey) {
  return (
    route === 'account' ||
    route === 'rewards' ||
    route === 'gacha' ||
    route === 'predictionMarket'
  );
}

function routeCardTone(route: HomeMenuRouteKey) {
  switch (route) {
    case 'wallet':
    case 'gacha':
      return styles.routeCardGold;
    case 'quickEight':
      return styles.routeCardOrange;
    case 'predictionMarket':
      return styles.routeCardBlue;
    case 'holdem':
      return styles.routeCardGreen;
    case 'blackjack':
      return styles.routeCardRose;
    default:
      return styles.routeCardPanel;
  }
}

const styles = StyleSheet.create({
  lobbyStack: {
    gap: 18,
  },
  playerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...mobileChromeTheme.cardShadowSm,
  },
  playerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerAvatar: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#29354f',
  },
  playerAvatarText: {
    color: palette.accent,
    fontSize: 21,
    fontWeight: '800',
  },
  playerCopy: {
    gap: 2,
  },
  playerName: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800',
  },
  playerMeta: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  playerBalanceChip: {
    gap: 2,
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#241b0b',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playerBalanceLabel: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  playerBalanceValue: {
    color: palette.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  playerAlertDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#ff5643',
    borderWidth: 2,
    borderColor: palette.panel,
  },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#ef8f1e',
    padding: 18,
    ...mobileChromeTheme.cardShadow,
  },
  promoCopy: {
    flex: 1,
    gap: 8,
  },
  promoEyebrow: {
    color: '#3a2208',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  promoTitle: {
    color: '#fff4d1',
    fontSize: 34,
    lineHeight: 34,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  promoBody: {
    color: '#41250c',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  promoMascot: {
    width: 98,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: '#ffcf6c',
    backgroundColor: '#d26d11',
  },
  promoMascotText: {
    fontSize: 48,
  },
  tickerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#20180c',
    ...mobileChromeTheme.cardShadowSm,
  },
  tickerLabel: {
    backgroundColor: palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tickerLabelText: {
    color: '#241605',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tickerMessage: {
    flex: 1,
    color: palette.accent,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  routeCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  routeCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  routeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  routeCardIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#0f1420',
  },
  routeCardIconText: {
    color: palette.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  routeCardFeatured: {
    width: '47%',
    minHeight: 176,
  },
  routeCardTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800',
  },
  routeCardBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  routeCardPanel: {
    backgroundColor: palette.panelMuted,
  },
  routeCardGold: {
    backgroundColor: '#291f0c',
  },
  routeCardOrange: {
    backgroundColor: '#32210f',
  },
  routeCardBlue: {
    backgroundColor: '#172741',
  },
  routeCardGreen: {
    backgroundColor: '#142f1d',
  },
  routeCardRose: {
    backgroundColor: '#351924',
  },
  missionList: {
    gap: 12,
  },
  missionCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  missionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800',
  },
  missionProgress: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  missionTrack: {
    height: 12,
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#0a0f18',
  },
  missionFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  missionReward: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  rewardStrip: {
    flexDirection: 'row',
    gap: 12,
  },
  rewardTile: {
    flex: 1,
    gap: 8,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#241528',
    padding: 12,
    ...mobileChromeTheme.cardShadowSm,
  },
  rewardTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rewardTileBadge: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rewardTileBadgeText: {
    color: '#241605',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  rewardTileIcon: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  rewardTileTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  moreRouteList: {
    gap: 12,
  },
  moreRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  moreRouteCopy: {
    flex: 1,
    gap: 6,
  },
  moreRouteTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  moreRouteBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
