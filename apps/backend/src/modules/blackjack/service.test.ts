import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5433/reward_test';

const { drawBlackjackDeck, scoreBlackjackCards } = await import('./service');
const { toGameState } = await import('./blackjack-state');

describe('blackjack service helpers', () => {
  it('shuffles a deterministic full deck from the fairness seed', () => {
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

  it('scores aces and naturals correctly', () => {
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

  it('backfills an AI dealer table for legacy game metadata', () => {
    const game = toGameState({
      id: 7,
      userId: 42,
      stakeAmount: '10.00',
      totalStake: '10.00',
      payoutAmount: '0.00',
      playerCards: [
        { rank: '10', suit: 'spades' },
        { rank: '7', suit: 'clubs' },
      ],
      dealerCards: [
        { rank: '9', suit: 'hearts' },
        { rank: '8', suit: 'diamonds' },
      ],
      deck: [
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'hearts' },
        { rank: '7', suit: 'clubs' },
        { rank: '8', suit: 'diamonds' },
      ],
      nextCardIndex: 4,
      status: 'active',
      metadata: {
        fairness: {
          epoch: 12,
          epochSeconds: 300,
          commitHash: 'c'.repeat(64),
          clientNonce: 'legacy-table',
          nonceSource: 'client',
          rngDigest: 'r'.repeat(64),
          deckDigest: 'd'.repeat(64),
          algorithm: 'legacy',
        },
        actionHistory: [],
        playerHands: [
          {
            cards: [
              { rank: '10', suit: 'spades' },
              { rank: '7', suit: 'clubs' },
            ],
            stakeAmount: '10.00',
            state: 'active',
            splitFromAces: false,
          },
        ],
        activeHandIndex: 0,
      },
      settledAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(game.metadata.table).toMatchObject({
      capacity: 2,
      sharedDeck: true,
      seats: [
        {
          seatIndex: 0,
          role: 'dealer',
          participantType: 'ai_robot',
          participantId: 'ai-dealer:default',
          isSelf: false,
        },
        {
          seatIndex: 1,
          role: 'player',
          participantType: 'human_user',
          participantId: 'user:42',
          isSelf: true,
        },
      ],
    });
    expect(game.metadata.table?.tableId).toBe('bj-12-42-legacy-table');
  });
});
