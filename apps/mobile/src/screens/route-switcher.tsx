import { View } from 'react-native';

import type { MobileRouteLabels } from '../route-copy';
import { ActionButton } from '../ui';
import type { MobileAppRoute, MobileStyles } from './types';

type RouteSwitcherProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  labels: MobileRouteLabels;
  navigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
};

export function RouteSwitcher(props: RouteSwitcherProps) {
  return (
    <View style={props.styles.routeSwitcher}>
      {(
        [
          'home',
          'gacha',
          'quickEight',
          'predictionMarket',
          'holdem',
          'blackjack',
          'fairness',
        ] as const
      ).map((route) => (
        <ActionButton
          key={route}
          label={props.labels[route]}
          onPress={() => props.onOpenRoute(route)}
          disabled={props.navigationLocked}
          variant={props.currentRoute === route ? 'primary' : 'secondary'}
          compact
        />
      ))}
    </View>
  );
}
