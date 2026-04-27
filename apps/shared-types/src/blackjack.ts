import { z } from 'zod';

export const blackjackCardSuitValues = [
  'spades',
  'hearts',
  'diamonds',
  'clubs',
] as const;

export const blackjackCardRankValues = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

export const blackjackActionValues = ['hit', 'stand', 'double', 'split'] as const;

export const blackjackPlayerHandStateValues = [
  'active',
  'waiting',
  'stood',
  'bust',
  'win',
  'lose',
  'push',
] as const;

export const blackjackGameStatusValues = [
  'active',
  'player_blackjack',
  'dealer_blackjack',
  'player_bust',
  'dealer_bust',
  'player_win',
  'dealer_win',
  'push',
] as const;

export const BLACKJACK_MIN_STAKE = '1.00';
export const BLACKJACK_MAX_STAKE = '100.00';
export const BLACKJACK_WIN_PAYOUT_MULTIPLIER = '2.00';
export const BLACKJACK_PUSH_PAYOUT_MULTIPLIER = '1.00';
export const BLACKJACK_NATURAL_PAYOUT_MULTIPLIER = '2.50';
export const BLACKJACK_DEALER_HITS_SOFT_17 = false;
export const BLACKJACK_DOUBLE_DOWN_ALLOWED = true;
export const BLACKJACK_SPLIT_ACES_ALLOWED = true;
export const BLACKJACK_HIT_SPLIT_ACES_ALLOWED = true;
export const BLACKJACK_RESPLIT_ALLOWED = false;
export const BLACKJACK_MAX_SPLIT_HANDS = 4;
export const BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED = false;

const DateLikeSchema = z.union([z.string(), z.date()]);

export const BlackjackCardSuitSchema = z.enum(blackjackCardSuitValues);
export type BlackjackCardSuit = z.infer<typeof BlackjackCardSuitSchema>;

export const BlackjackCardRankSchema = z.enum(blackjackCardRankValues);
export type BlackjackCardRank = z.infer<typeof BlackjackCardRankSchema>;

export const BlackjackActionSchema = z.enum(blackjackActionValues);
export type BlackjackAction = z.infer<typeof BlackjackActionSchema>;

export const BlackjackPlayerHandStateSchema = z.enum(
  blackjackPlayerHandStateValues
);
export type BlackjackPlayerHandState = z.infer<
  typeof BlackjackPlayerHandStateSchema
>;

export const BlackjackGameStatusSchema = z.enum(blackjackGameStatusValues);
export type BlackjackGameStatus = z.infer<typeof BlackjackGameStatusSchema>;

export const BlackjackCardSchema = z.object({
  rank: BlackjackCardRankSchema,
  suit: BlackjackCardSuitSchema,
});
export type BlackjackCard = z.infer<typeof BlackjackCardSchema>;

export const BlackjackCardViewSchema = z.object({
  rank: BlackjackCardRankSchema.nullable(),
  suit: BlackjackCardSuitSchema.nullable(),
  hidden: z.boolean(),
});
export type BlackjackCardView = z.infer<typeof BlackjackCardViewSchema>;

export const BlackjackHandViewSchema = z.object({
  cards: z.array(BlackjackCardViewSchema).min(1),
  total: z.number().int().nullable(),
  visibleTotal: z.number().int().nullable(),
  soft: z.boolean().nullable(),
  blackjack: z.boolean().nullable(),
  bust: z.boolean().nullable(),
});
export type BlackjackHandView = z.infer<typeof BlackjackHandViewSchema>;

export const BlackjackPlayerHandViewSchema = BlackjackHandViewSchema.extend({
  index: z.number().int().nonnegative(),
  stakeAmount: z.string(),
  state: BlackjackPlayerHandStateSchema,
  active: z.boolean(),
});
export type BlackjackPlayerHandView = z.infer<
  typeof BlackjackPlayerHandViewSchema
>;

export const BlackjackFairnessSchema = z.object({
  epoch: z.number().int(),
  epochSeconds: z.number().int(),
  commitHash: z.string(),
  clientNonce: z.string(),
  nonceSource: z.enum(['client', 'server']),
  rngDigest: z.string(),
  deckDigest: z.string(),
  algorithm: z.string(),
});
export type BlackjackFairness = z.infer<typeof BlackjackFairnessSchema>;

export const BlackjackConfigSchema = z.object({
  minStake: z.string(),
  maxStake: z.string(),
  winPayoutMultiplier: z.string(),
  pushPayoutMultiplier: z.string(),
  naturalPayoutMultiplier: z.string(),
  dealerHitsSoft17: z.boolean(),
  doubleDownAllowed: z.boolean(),
  splitAcesAllowed: z.boolean(),
  hitSplitAcesAllowed: z.boolean(),
  resplitAllowed: z.boolean(),
  maxSplitHands: z.number().int().min(2).max(8),
  splitTenValueCardsAllowed: z.boolean(),
});
export type BlackjackConfig = z.infer<typeof BlackjackConfigSchema>;

export const BLACKJACK_CONFIG: BlackjackConfig = {
  minStake: BLACKJACK_MIN_STAKE,
  maxStake: BLACKJACK_MAX_STAKE,
  winPayoutMultiplier: BLACKJACK_WIN_PAYOUT_MULTIPLIER,
  pushPayoutMultiplier: BLACKJACK_PUSH_PAYOUT_MULTIPLIER,
  naturalPayoutMultiplier: BLACKJACK_NATURAL_PAYOUT_MULTIPLIER,
  dealerHitsSoft17: BLACKJACK_DEALER_HITS_SOFT_17,
  doubleDownAllowed: BLACKJACK_DOUBLE_DOWN_ALLOWED,
  splitAcesAllowed: BLACKJACK_SPLIT_ACES_ALLOWED,
  hitSplitAcesAllowed: BLACKJACK_HIT_SPLIT_ACES_ALLOWED,
  resplitAllowed: BLACKJACK_RESPLIT_ALLOWED,
  maxSplitHands: BLACKJACK_MAX_SPLIT_HANDS,
  splitTenValueCardsAllowed: BLACKJACK_SPLIT_TEN_VALUE_CARDS_ALLOWED,
};

export const BlackjackGameSummarySchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  stakeAmount: z.string(),
  totalStake: z.string(),
  payoutAmount: z.string(),
  status: BlackjackGameStatusSchema,
  playerTotal: z.number().int(),
  playerTotals: z.array(z.number().int()).min(1),
  dealerTotal: z.number().int(),
  createdAt: DateLikeSchema,
  settledAt: DateLikeSchema.nullable(),
});
export type BlackjackGameSummary = z.infer<typeof BlackjackGameSummarySchema>;

export const BlackjackGameSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  stakeAmount: z.string(),
  totalStake: z.string(),
  payoutAmount: z.string(),
  status: BlackjackGameStatusSchema,
  playerHand: BlackjackHandViewSchema,
  playerHands: z.array(BlackjackPlayerHandViewSchema).min(1),
  activeHandIndex: z.number().int().nonnegative().nullable(),
  dealerHand: BlackjackHandViewSchema,
  availableActions: z.array(BlackjackActionSchema),
  fairness: BlackjackFairnessSchema,
  createdAt: DateLikeSchema,
  settledAt: DateLikeSchema.nullable(),
});
export type BlackjackGame = z.infer<typeof BlackjackGameSchema>;

export const BlackjackOverviewResponseSchema = z.object({
  balance: z.string(),
  config: BlackjackConfigSchema,
  fairness: z.object({
    epoch: z.number().int(),
    epochSeconds: z.number().int(),
    commitHash: z.string(),
  }),
  activeGame: BlackjackGameSchema.nullable(),
  recentGames: z.array(BlackjackGameSummarySchema),
});
export type BlackjackOverviewResponse = z.infer<
  typeof BlackjackOverviewResponseSchema
>;

export const BlackjackStartRequestSchema = z.object({
  stakeAmount: z.string().min(1).max(32),
  clientNonce: z.string().min(1).max(128).nullable().optional(),
});
export type BlackjackStartRequest = z.infer<typeof BlackjackStartRequestSchema>;

export const BlackjackActionRequestSchema = z.object({
  action: BlackjackActionSchema,
});
export type BlackjackActionRequest = z.infer<
  typeof BlackjackActionRequestSchema
>;

export const BlackjackMutationResponseSchema = z.object({
  balance: z.string(),
  game: BlackjackGameSchema,
});
export type BlackjackMutationResponse = z.infer<
  typeof BlackjackMutationResponseSchema
>;
