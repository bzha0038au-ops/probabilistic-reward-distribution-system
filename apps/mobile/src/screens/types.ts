import type { mobileStyles } from '../mobile-styles';

export type MobileAppRoute =
  | 'home'
  | 'account'
  | 'wallet'
  | 'rewards'
  | 'security'
  | 'gacha'
  | 'quickEight'
  | 'predictionMarket'
  | 'holdem'
  | 'blackjack'
  | 'fairness';

export type MobileStyles = typeof mobileStyles;
