import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5433/reward_test';

describe('blackjack service helpers', () => {
  it('shuffles a deterministic full deck from the fairness seed', async () => {
    const { drawBlackjackDeck } = await import('./service');
    const first = drawBlackjackDeck({
      seed: 'seed-1',
      userId: 42,
      clientNonce: 'nonce-1',
    });
    const second = drawBlackjackDeck({
      seed: 'seed-1',
      userId: 42,
      clientNonce: 'nonce-1',
    });

    expect(second).toEqual(first);
    expect(first.deck).toHaveLength(52);
    expect(new Set(first.deck.map((card) => `${card.rank}-${card.suit}`)).size).toBe(52);
    expect(first.rngDigest).toHaveLength(64);
    expect(first.deckDigest).toHaveLength(64);
  }, 10000);

  it('scores aces and naturals correctly', async () => {
    const { scoreBlackjackCards } = await import('./service');

    expect(
      scoreBlackjackCards([
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ])
    ).toEqual({
      total: 21,
      soft: true,
      blackjack: true,
      bust: false,
    });

    expect(
      scoreBlackjackCards([
        { rank: 'A', suit: 'spades' },
        { rank: '9', suit: 'hearts' },
        { rank: '9', suit: 'clubs' },
      ])
    ).toEqual({
      total: 19,
      soft: false,
      blackjack: false,
      bust: false,
    });
  });
});
