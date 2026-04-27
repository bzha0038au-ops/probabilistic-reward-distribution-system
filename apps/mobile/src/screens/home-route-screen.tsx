import { StyleSheet, Text, View } from 'react-native';

import {
  homeMenuRouteOrder,
  type HomeMenuRouteKey,
  type MobileRouteCards,
} from '../route-copy';
import { mobilePalette as palette } from '../theme';
import { ActionButton, SectionCard } from '../ui';
import type { MobileStyles } from './types';

type HomeRouteScreenProps = {
  styles: MobileStyles;
  title: string;
  subtitle: string;
  cards: MobileRouteCards;
  navigationLocked: boolean;
  onOpenRoute: (route: HomeMenuRouteKey) => void;
};

export function HomeRouteScreen(props: HomeRouteScreenProps) {
  return (
    <>
      <SectionCard title={props.title} subtitle={props.subtitle}>
        <View style={styles.routeCardGrid}>
          {homeMenuRouteOrder.map((route) => (
            <View key={route} style={styles.routeCard}>
              <Text style={styles.routeCardTitle}>{props.cards[route].title}</Text>
              <Text style={styles.routeCardBody}>{props.cards[route].body}</Text>
              <ActionButton
                label={props.cards[route].open}
                onPress={() => props.onOpenRoute(route)}
                disabled={props.navigationLocked}
                variant={isPrimaryRoute(route) ? 'primary' : 'secondary'}
                compact
              />
            </View>
          ))}
        </View>
      </SectionCard>
    </>
  );
}

function isPrimaryRoute(route: HomeMenuRouteKey) {
  return route === 'account' || route === 'rewards' || route === 'gacha';
}

const styles = StyleSheet.create({
  routeCardGrid: {
    gap: 12,
  },
  routeCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  routeCardTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
  },
  routeCardBody: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
