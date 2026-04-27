import type { mobileStyles } from '../mobile-styles';

export type MobileAppRoute =
  | 'home'
  | 'account'
  | 'wallet'
  | 'rewards'
  | 'security'
  | 'gacha'
  | 'quickEight'
  | 'blackjack'
  | 'fairness';

export type MobileStyles = typeof mobileStyles;
