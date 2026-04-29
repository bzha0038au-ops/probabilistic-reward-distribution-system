import type { mobileStyles } from '../mobile-styles';

export type MobileAppRoute =
  | 'home'
  | 'account'
  | 'wallet'
  | 'rewards'
  | 'community'
  | 'security'
  | 'notifications'
  | 'gacha'
  | 'quickEight'
  | 'predictionMarket'
  | 'holdem'
  | 'blackjack'
  | 'fairness';

export type MobileStyles = typeof mobileStyles;
