// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { BlackjackOverviewResponse } from '@reward/shared-types/blackjack';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/components/i18n-provider';
import { getMessages } from '@/lib/i18n/messages';
import { BlackjackPanel } from './blackjack-panel';

const messages = getMessages('en');

const browserUserApiClientMock = vi.hoisted(() => ({
  getBlackjackOverview: vi.fn(),
  getUserRealtimeToken: vi.fn(),
  setPlayMode: vi.fn(),
  startBlackjack: vi.fn(),
  actOnBlackjack: vi.fn(),
}));

vi.mock('@/lib/api/user-client', () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

vi.mock('@reward/user-core', () => ({
  applyDealerEventFeed: ({ currentEvents }: { currentEvents: unknown[] }) => currentEvents,
  createDealerRealtimeClient: () => ({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const overview: BlackjackOverviewResponse = {
  balance: '12450.00',
  config: {
    minStake: '1.00',
    maxStake: '100.00',
    winPayoutMultiplier: '2.00',
    pushPayoutMultiplier: '1.00',
    naturalPayoutMultiplier: '2.50',
    dealerHitsSoft17: false,
    doubleDownAllowed: true,
    splitAcesAllowed: true,
    hitSplitAcesAllowed: true,
    resplitAllowed: false,
    maxSplitHands: 4,
    splitTenValueCardsAllowed: false,
  },
  playMode: {
    type: 'standard',
    appliedMultiplier: 1,
    nextMultiplier: 1,
    streak: 0,
    lastOutcome: null,
    carryActive: false,
    pendingPayoutAmount: '0.00',
    pendingPayoutCount: 0,
    snowballCarryAmount: '0.00',
    snowballEnvelopeAmount: '0.00',
  },
  fairness: {
    epoch: 7,
    epochSeconds: 30,
    commitHash: '0x8f3ca9a120000000',
  },
  activeGames: [
    {
      id: 21,
      roundId: 'round-21',
      userId: 42,
      stakeAmount: '500.00',
      totalStake: '500.00',
      payoutAmount: '0.00',
      status: 'active',
      turnDeadlineAt: null,
      turnTimeoutAction: 'stand',
      table: {
        tableId: 'blackjack:21',
        capacity: 2,
        sharedDeck: true,
        currentTurnSeatIndex: 1,
        turnTimeoutAction: 'stand',
        seats: [
          {
            seatIndex: 0,
            role: 'dealer',
            participantType: 'ai_robot',
            participantId: 'dealer-1',
            isSelf: false,
            turnDeadlineAt: null,
          },
          {
            seatIndex: 1,
            role: 'player',
            participantType: 'human_user',
            participantId: 'user-42',
            isSelf: true,
            turnDeadlineAt: null,
          },
        ],
      },
      playerHand: {
        cards: [
          { rank: 'A', suit: 'clubs', hidden: false },
          { rank: 'K', suit: 'diamonds', hidden: false },
          { rank: '9', suit: 'spades', hidden: false },
        ],
        total: 20,
        visibleTotal: 20,
        soft: false,
        blackjack: false,
        bust: false,
      },
      playerHands: [
        {
          index: 0,
          stakeAmount: '500.00',
          state: 'active',
          active: true,
          cards: [
            { rank: 'A', suit: 'clubs', hidden: false },
            { rank: 'K', suit: 'diamonds', hidden: false },
            { rank: '9', suit: 'spades', hidden: false },
          ],
          total: 20,
          visibleTotal: 20,
          soft: false,
          blackjack: false,
          bust: false,
        },
      ],
      activeHandIndex: 0,
      dealerHand: {
        cards: [
          { rank: 'J', suit: 'hearts', hidden: false },
          { rank: '7', suit: 'spades', hidden: false },
        ],
        total: 17,
        visibleTotal: 17,
        soft: false,
        blackjack: false,
        bust: false,
      },
      availableActions: ['hit', 'stand', 'double', 'split'],
      fairness: {
        epoch: 7,
        epochSeconds: 30,
        commitHash: '0x8f3ca9a120000000',
        clientNonce: 'nonce-1',
        nonceSource: 'client',
        rngDigest: 'rng-digest',
        deckDigest: 'deck-digest',
        algorithm: 'sha256',
      },
      playMode: {
        type: 'standard',
        appliedMultiplier: 1,
        nextMultiplier: 1,
        streak: 0,
        lastOutcome: null,
        carryActive: false,
        pendingPayoutAmount: '0.00',
        pendingPayoutCount: 0,
        snowballCarryAmount: '0.00',
        snowballEnvelopeAmount: '0.00',
      },
      linkedGroup: null,
      dealerEvents: [],
      createdAt: '2026-05-01T10:00:00.000Z',
      settledAt: null,
    },
  ],
  activeGame: null,
  recentGames: [
    {
      id: 18,
      roundId: 'round-18',
      userId: 42,
      stakeAmount: '25.00',
      totalStake: '25.00',
      payoutAmount: '50.00',
      status: 'player_win',
      playerTotal: 20,
      playerTotals: [20],
      dealerTotal: 18,
      createdAt: '2026-05-01T09:45:00.000Z',
      settledAt: '2026-05-01T09:46:00.000Z',
    },
  ],
};

function renderBlackjackPanel() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <BlackjackPanel />
    </I18nProvider>,
  );
}

describe('BlackjackPanel', () => {
  beforeEach(() => {
    browserUserApiClientMock.getBlackjackOverview.mockResolvedValue(ok(overview));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the table stage and action dock for an active hand', async () => {
    renderBlackjackPanel();

    await waitFor(() => {
      expect(screen.getByTestId('blackjack-action-dock').textContent).toContain('Hit');
    });

    expect(screen.getByTestId('blackjack-table-stage').textContent).toContain('You');
    expect(screen.getByTestId('blackjack-action-dock').textContent).toContain('Hit');
    expect(screen.getByTestId('blackjack-action-dock').textContent).toContain('Stand');
    expect(screen.getByText('Recent hands')).not.toBeNull();
  });
});
