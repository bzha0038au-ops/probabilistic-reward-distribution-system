import {
  describeIntegrationSuite,
  findBlackjackClientNonce,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedBlackjackScenario,
  setConfigNumber,
  verifyUserContacts,
} from './integration-test-support';
import { and, asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  blackjackGames,
  houseAccount,
  ledgerEntries,
  playModeSessions,
  roundEvents,
  userPlayModes,
  userWallets,
} from '@reward/database';

const TEN_VALUE_RANKS = new Set(['10', 'J', 'Q', 'K']);

describeIntegrationSuite('backend blackjack integration', () => {
  it(
    'POST /blackjack/start and /blackjack/:gameId/action settle a hand for authenticated users',
    { timeout: 30000 },
    async () => {
      const user = await seedBlackjackScenario();
      await verifyUserContacts(user.id, { email: true });
      const { ensureFairnessSeed } = await import('../modules/fairness/service');
      const fairnessSeed = await ensureFairnessSeed(getDb());
      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack',
        attempts: 5000,
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return !playerScore.blackjack && !dealerScore.blackjack;
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      expect(startPayload.data).toMatchObject({
        balance: '90.00',
        game: {
          userId: user.id,
          stakeAmount: '10.00',
          totalStake: '10.00',
          payoutAmount: '0.00',
          status: 'active',
          table: {
            capacity: 2,
            sharedDeck: true,
            seats: [
              {
                seatIndex: 0,
                role: 'dealer',
                participantType: 'ai_robot',
                isSelf: false,
              },
              {
                seatIndex: 1,
                role: 'player',
                participantType: 'human_user',
                isSelf: true,
              },
            ],
          },
          fairness: {
            clientNonce,
            commitHash: fairnessSeed.commitHash,
          },
        },
      });
      expect(startPayload.data.game.table.tableId).toContain(`bj-${fairnessSeed.epoch}-${user.id}-`);
      expect(startPayload.data.game.availableActions).toEqual(
        expect.arrayContaining(['hit', 'stand'])
      );
      expect(startPayload.data.game.dealerHand.total).toBeNull();

      const gameId = Number(startPayload.data.game.id);
      const actionResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(actionResponse.statusCode).toBe(200);
      const actionPayload = actionResponse.json();
      expect(actionPayload.ok).toBe(true);
      expect(actionPayload.data.game.id).toBe(gameId);
      expect(actionPayload.data.game.status).not.toBe('active');
      expect(actionPayload.data.game.availableActions).toEqual([]);
      expect(actionPayload.data.game.dealerHand.total).not.toBeNull();

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet?.withdrawableBalance).toBe(
        (90 + Number(actionPayload.data.game.payoutAmount)).toFixed(2)
      );

      const [house] = await getDb()
        .select({ prizePoolBalance: houseAccount.prizePoolBalance })
        .from(houseAccount)
        .where(eq(houseAccount.id, 1))
        .limit(1);

      expect(house?.prizePoolBalance).toBe(
        (1000 + 10 - Number(actionPayload.data.game.payoutAmount)).toFixed(2)
      );

      const [storedGame] = await getDb()
        .select({
          totalStake: blackjackGames.totalStake,
          payoutAmount: blackjackGames.payoutAmount,
          status: blackjackGames.status,
        })
        .from(blackjackGames)
        .where(eq(blackjackGames.userId, user.id))
        .limit(1);

      expect(storedGame).toEqual({
        totalStake: '10.00',
        payoutAmount: actionPayload.data.game.payoutAmount,
        status: actionPayload.data.game.status,
      });

      const storedEvents = await getDb()
        .select({
          eventType: roundEvents.eventType,
        })
        .from(roundEvents)
        .where(
          and(
            eq(roundEvents.roundType, 'blackjack'),
            eq(roundEvents.roundEntityId, gameId)
          )
        )
        .orderBy(asc(roundEvents.eventIndex));

      expect(storedEvents.map((event) => event.eventType)).toContain('round_started');
      expect(storedEvents.map((event) => event.eventType)).toContain('stake_debited');
      expect(storedEvents.map((event) => event.eventType)).toContain('player_stand');
      expect(storedEvents.map((event) => event.eventType)).toContain('round_settled');

      const historyResponse = await getApp().inject({
        method: 'GET',
        url: `/hand-history/${encodeURIComponent(startPayload.data.game.roundId)}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(historyResponse.statusCode).toBe(200);
      const historyPayload = historyResponse.json();
      expect(historyPayload.ok).toBe(true);
      expect(historyPayload.data).toMatchObject({
        roundId: startPayload.data.game.roundId,
        roundType: 'blackjack',
        stakeAmount: '10.00',
        totalStake: '10.00',
        payoutAmount: actionPayload.data.game.payoutAmount,
        status: actionPayload.data.game.status,
      });
      expect(
        historyPayload.data.events.map((event: { type: string }) => event.type)
      ).toContain('player_stand');
    }
  );

  it(
    'POST /blackjack/:gameId/action supports split hands and tracks the extra stake',
    { timeout: 15000 },
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-split-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-split',
        predicate: (preview, { scoreBlackjackCards }) => {
          const firstOpeningCard = preview.deck[0];
          const secondOpeningCard = preview.deck[2];
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          const firstSplitScore = scoreBlackjackCards([firstOpeningCard, preview.deck[4]]);
          const secondSplitScore = scoreBlackjackCards([secondOpeningCard, preview.deck[5]]);
          return Boolean(
            firstOpeningCard?.rank === secondOpeningCard?.rank &&
              !dealerScore.blackjack &&
              firstSplitScore.total < 21 &&
              secondSplitScore.total < 21
          );
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      expect(startPayload.data.game.availableActions).toContain('split');

      const gameId = Number(startPayload.data.game.id);
      const splitResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'split',
        },
      });

      expect(splitResponse.statusCode).toBe(200);
      const splitPayload = splitResponse.json();
      expect(splitPayload.ok).toBe(true);
      expect(splitPayload.data).toMatchObject({
        balance: '80.00',
        game: {
          id: gameId,
          totalStake: '20.00',
          status: 'active',
          activeHandIndex: 0,
        },
      });
      expect(splitPayload.data.game.playerHands).toHaveLength(2);
      expect(
        splitPayload.data.game.playerHands.map((hand: { state: string }) => hand.state)
      ).toEqual(['active', 'waiting']);
      expect(splitPayload.data.game.availableActions).not.toContain('split');

      const firstStandResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(firstStandResponse.statusCode).toBe(200);
      const firstStandPayload = firstStandResponse.json();
      expect(firstStandPayload.ok).toBe(true);
      expect(firstStandPayload.data.game.status).toBe('active');
      expect(firstStandPayload.data.game.activeHandIndex).toBe(1);
      expect(firstStandPayload.data.game.playerHands[0].state).toBe('stood');
      expect(firstStandPayload.data.game.playerHands[1].state).toBe('active');

      const secondStandResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(secondStandResponse.statusCode).toBe(200);
      const secondStandPayload = secondStandResponse.json();
      expect(secondStandPayload.ok).toBe(true);
      expect(secondStandPayload.data.game.status).not.toBe('active');
      expect(secondStandPayload.data.game.playerHands).toHaveLength(2);
      expect(
        secondStandPayload.data.game.playerHands.every((hand: { state: string }) =>
          ['win', 'lose', 'push', 'bust'].includes(hand.state)
        )
      ).toBe(true);

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet?.withdrawableBalance).toBe(
        (80 + Number(secondStandPayload.data.game.payoutAmount)).toFixed(2)
      );

      const splitEntries = await getDb()
        .select({
          entryType: ledgerEntries.entryType,
          amount: ledgerEntries.amount,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, user.id))
        .orderBy(asc(ledgerEntries.id));

      expect(splitEntries).toEqual(
        expect.arrayContaining([
          {
            entryType: 'blackjack_stake',
            amount: '-10.00',
          },
          {
            entryType: 'blackjack_split',
            amount: '-10.00',
          },
        ])
      );

      const [storedGame] = await getDb()
        .select({
          totalStake: blackjackGames.totalStake,
          payoutAmount: blackjackGames.payoutAmount,
          status: blackjackGames.status,
        })
        .from(blackjackGames)
        .where(eq(blackjackGames.userId, user.id))
        .limit(1);

      expect(storedGame).toEqual({
        totalStake: '20.00',
        payoutAmount: secondStandPayload.data.game.payoutAmount,
        status: secondStandPayload.data.game.status,
      });
    }
  );

  it(
    'POST /blackjack/:gameId/action returns BLACKJACK_TURN_EXPIRED after the timeout action is committed',
    { timeout: 15000 },
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-timeout-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-timeout',
        attempts: 5000,
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return !playerScore.blackjack && !dealerScore.blackjack;
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      const gameId = Number(startPayload.data.game.id);

      await getDb()
        .update(blackjackGames)
        .set({
          turnDeadlineAt: new Date(Date.now() - 1_000),
        })
        .where(eq(blackjackGames.id, gameId));

      const actionResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(actionResponse.statusCode).toBe(409);
      expect(actionResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: 'BLACKJACK_TURN_EXPIRED',
        },
      });

      const [storedGame] = await getDb()
        .select({
          status: blackjackGames.status,
          settledAt: blackjackGames.settledAt,
        })
        .from(blackjackGames)
        .where(eq(blackjackGames.id, gameId))
        .limit(1);

      expect(storedGame?.status).not.toBe('active');
      expect(storedGame?.settledAt).not.toBeNull();

      const storedEvents = await getDb()
        .select({
          eventType: roundEvents.eventType,
        })
        .from(roundEvents)
        .where(
          and(
            eq(roundEvents.roundType, 'blackjack'),
            eq(roundEvents.roundEntityId, gameId)
          )
        )
        .orderBy(asc(roundEvents.eventIndex));

      expect(storedEvents.map((event) => event.eventType)).toEqual(
        expect.arrayContaining(['turn_timeout', 'player_stand', 'round_settled'])
      );

      const overviewResponse = await getApp().inject({
        method: 'GET',
        url: '/blackjack',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(overviewResponse.statusCode).toBe(200);
      expect(overviewResponse.json().data.activeGame).toBeNull();
    }
  );

  it(
    'GET /blackjack reflects runtime config and disables double when configured off',
    { timeout: 15000 },
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-config-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      await setConfigNumber('blackjack.min_stake', '5.00');
      await setConfigNumber('blackjack.max_stake', '50.00');
      await setConfigNumber('blackjack.win_payout_multiplier', '2.10');
      await setConfigNumber('blackjack.push_payout_multiplier', '1.00');
      await setConfigNumber('blackjack.natural_payout_multiplier', '2.75');
      await setConfigNumber('blackjack.dealer_hits_soft_17', '1');
      await setConfigNumber('blackjack.double_down_allowed', '0');
      await setConfigNumber('blackjack.split_aces_allowed', '1');
      await setConfigNumber('blackjack.hit_split_aces_allowed', '0');
      await setConfigNumber('blackjack.resplit_allowed', '1');
      await setConfigNumber('blackjack.max_split_hands', '4');
      await setConfigNumber('blackjack.split_ten_value_cards_allowed', '1');

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const overviewResponse = await getApp().inject({
        method: 'GET',
        url: '/blackjack',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(overviewResponse.statusCode).toBe(200);
      const overviewPayload = overviewResponse.json();
      expect(overviewPayload.ok).toBe(true);
      expect(overviewPayload.data.config).toEqual({
        minStake: '5.00',
        maxStake: '50.00',
        winPayoutMultiplier: '2.10',
        pushPayoutMultiplier: '1.00',
        naturalPayoutMultiplier: '2.75',
        dealerHitsSoft17: true,
        doubleDownAllowed: false,
        splitAcesAllowed: true,
        hitSplitAcesAllowed: false,
        resplitAllowed: true,
        maxSplitHands: 4,
        splitTenValueCardsAllowed: true,
      });

      const belowMinStartResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '2.00',
        },
      });

      expect(belowMinStartResponse.statusCode).toBe(409);

      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-config',
        attempts: 5000,
        predicate: (preview, { scoreBlackjackCards }) => {
          const firstOpeningRank = preview.deck[0]?.rank;
          const secondOpeningRank = preview.deck[2]?.rank;
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          const splitEligibleOpening =
            firstOpeningRank === secondOpeningRank ||
            (firstOpeningRank !== undefined &&
              secondOpeningRank !== undefined &&
              TEN_VALUE_RANKS.has(firstOpeningRank) &&
              TEN_VALUE_RANKS.has(secondOpeningRank));

          return Boolean(
            !playerScore.blackjack &&
              !dealerScore.blackjack &&
              !splitEligibleOpening
          );
        },
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      expect(startPayload.data.game.availableActions).toEqual(['hit', 'stand']);
      expect(startPayload.data.game.fairness.algorithm).toContain(
        'dealer hits soft 17s'
      );
      expect(startPayload.data.game.fairness.algorithm).toContain(
        'double down disabled'
      );
    }
  );

  it(
    'POST /blackjack/:gameId/action allows mixed 10-value split and re-split when configured',
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-resplit-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      await setConfigNumber('blackjack.resplit_allowed', '1');
      await setConfigNumber('blackjack.max_split_hands', '3');
      await setConfigNumber('blackjack.split_ten_value_cards_allowed', '1');

      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-resplit',
        predicate: (preview, { scoreBlackjackCards }) => {
          const firstOpeningCard = preview.deck[0];
          const secondOpeningCard = preview.deck[2];
          const leftDraw = preview.deck[4];
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return Boolean(
            firstOpeningCard &&
              secondOpeningCard &&
              leftDraw &&
              firstOpeningCard.rank !== secondOpeningCard.rank &&
              ['10', 'J', 'Q', 'K'].includes(firstOpeningCard.rank) &&
              ['10', 'J', 'Q', 'K'].includes(secondOpeningCard.rank) &&
              ['10', 'J', 'Q', 'K'].includes(leftDraw.rank) &&
              !dealerScore.blackjack
          );
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      expect(startPayload.data.game.availableActions).toContain('split');

      const gameId = Number(startPayload.data.game.id);
      const splitResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'split',
        },
      });

      expect(splitResponse.statusCode).toBe(200);
      const splitPayload = splitResponse.json();
      expect(splitPayload.ok).toBe(true);
      expect(splitPayload.data.game.totalStake).toBe('20.00');
      expect(splitPayload.data.game.playerHands).toHaveLength(2);
      expect(splitPayload.data.game.availableActions).toContain('split');

      const resplitResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'split',
        },
      });

      expect(resplitResponse.statusCode).toBe(200);
      const resplitPayload = resplitResponse.json();
      expect(resplitPayload.ok).toBe(true);
      expect(resplitPayload.data.game.totalStake).toBe('30.00');
      expect(resplitPayload.data.game.playerHands).toHaveLength(3);

      const splitEntries = await getDb()
        .select({
          entryType: ledgerEntries.entryType,
          amount: ledgerEntries.amount,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, user.id))
        .orderBy(asc(ledgerEntries.id));

      expect(
        splitEntries.filter((entry) => entry.entryType === 'blackjack_split')
      ).toHaveLength(2);
    }
  );

  it(
    'POST /blackjack/:gameId/action auto-resolves split aces when hit is disabled',
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-split-aces-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      await setConfigNumber('blackjack.split_aces_allowed', '1');
      await setConfigNumber('blackjack.hit_split_aces_allowed', '0');
      await setConfigNumber('blackjack.resplit_allowed', '0');

      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-split-aces',
        predicate: (preview, { scoreBlackjackCards }) => {
          const firstOpeningCard = preview.deck[0];
          const secondOpeningCard = preview.deck[2];
          const leftDraw = preview.deck[4];
          const rightDraw = preview.deck[5];
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return Boolean(
            firstOpeningCard?.rank === 'A' &&
              secondOpeningCard?.rank === 'A' &&
              leftDraw?.rank !== 'A' &&
              rightDraw?.rank !== 'A' &&
              !dealerScore.blackjack
          );
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      expect(startPayload.data.game.availableActions).toContain('split');

      const gameId = Number(startPayload.data.game.id);
      const splitResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'split',
        },
      });

      expect(splitResponse.statusCode).toBe(200);
      const splitPayload = splitResponse.json();
      expect(splitPayload.ok).toBe(true);
      expect(splitPayload.data.game.status).not.toBe('active');
      expect(splitPayload.data.game.availableActions).toEqual([]);
      expect(
        splitPayload.data.game.playerHands.every((hand: { state: string }) =>
          ['win', 'lose', 'push', 'bust'].includes(hand.state)
        )
      ).toBe(true);
    }
  );

  it(
    'POST /blackjack/start opens two linked games for dual_bet and settles play mode after both hands finish',
    { timeout: 30000 },
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-dual-bet@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      const { ensureFairnessSeed } = await import('../modules/fairness/service');
      const { drawBlackjackDeck, scoreBlackjackCards } = await import(
        '../modules/blackjack/service'
      );
      const fairnessSeed = await ensureFairnessSeed(getDb());

      let clientNonce: string | null = null;
      for (let attempt = 0; attempt < 10000; attempt += 1) {
        const candidate = `integration-blackjack-dual-bet-${attempt}`;
        const firstPreview = drawBlackjackDeck({
          seed: fairnessSeed.seed,
          userId: user.id,
          clientNonce: `leg-1/2:${candidate}`,
        });
        const secondPreview = drawBlackjackDeck({
          seed: fairnessSeed.seed,
          userId: user.id,
          clientNonce: `leg-2/2:${candidate}`,
        });
        const firstPlayerScore = scoreBlackjackCards([
          firstPreview.deck[0],
          firstPreview.deck[2],
        ]);
        const firstDealerScore = scoreBlackjackCards([
          firstPreview.deck[1],
          firstPreview.deck[3],
        ]);
        const secondPlayerScore = scoreBlackjackCards([
          secondPreview.deck[0],
          secondPreview.deck[2],
        ]);
        const secondDealerScore = scoreBlackjackCards([
          secondPreview.deck[1],
          secondPreview.deck[3],
        ]);
        if (
          !firstPlayerScore.blackjack &&
          !firstDealerScore.blackjack &&
          !secondPlayerScore.blackjack &&
          !secondDealerScore.blackjack
        ) {
          clientNonce = candidate;
          break;
        }
      }
      expect(clientNonce).not.toBeNull();

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce,
          playMode: {
            type: 'dual_bet',
          },
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      expect(startPayload.data).toMatchObject({
        balance: '80.00',
        playMode: {
          type: 'dual_bet',
          appliedMultiplier: 2,
          nextMultiplier: 2,
        },
      });
      expect(startPayload.data.games).toHaveLength(2);
      expect(
        startPayload.data.games.map((game: { linkedGroup: { executionIndex: number } | null }) =>
          game.linkedGroup?.executionIndex
        )
      ).toEqual([1, 2]);
      expect(
        startPayload.data.games.map((game: { stakeAmount: string; totalStake: string; status: string }) => ({
          stakeAmount: game.stakeAmount,
          totalStake: game.totalStake,
          status: game.status,
        }))
      ).toEqual([
        {
          stakeAmount: '10.00',
          totalStake: '10.00',
          status: 'active',
        },
        {
          stakeAmount: '10.00',
          totalStake: '10.00',
          status: 'active',
        },
      ]);
      const primaryGameId = Number(startPayload.data.games[0].id);
      const secondaryGameId = Number(startPayload.data.games[1].id);
      expect(startPayload.data.game.id).toBe(primaryGameId);
      expect(startPayload.data.games[0].linkedGroup).toMatchObject({
        executionIndex: 1,
        executionCount: 2,
        primaryGameId,
        gameIds: [primaryGameId, secondaryGameId],
      });
      expect(startPayload.data.games[1].linkedGroup).toMatchObject({
        executionIndex: 2,
        executionCount: 2,
        primaryGameId,
        gameIds: [primaryGameId, secondaryGameId],
      });

      const stakeEntries = await getDb()
        .select({
          referenceId: ledgerEntries.referenceId,
          amount: ledgerEntries.amount,
          entryType: ledgerEntries.entryType,
        })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, user.id),
            eq(ledgerEntries.entryType, 'blackjack_stake'),
          )
        )
        .orderBy(asc(ledgerEntries.id));
      expect(stakeEntries).toEqual([
        {
          referenceId: primaryGameId,
          amount: '-10.00',
          entryType: 'blackjack_stake',
        },
        {
          referenceId: secondaryGameId,
          amount: '-10.00',
          entryType: 'blackjack_stake',
        },
      ]);

      const activeSessions = await getDb()
        .select({
          id: playModeSessions.id,
          parentSessionId: playModeSessions.parentSessionId,
          status: playModeSessions.status,
          executionIndex: playModeSessions.executionIndex,
          referenceId: playModeSessions.referenceId,
        })
        .from(playModeSessions)
        .where(eq(playModeSessions.userId, user.id))
        .orderBy(asc(playModeSessions.id));
      expect(activeSessions).toHaveLength(3);
      expect(activeSessions[0]).toMatchObject({
        parentSessionId: null,
        status: 'active',
        executionIndex: 0,
        referenceId: null,
      });
      expect(activeSessions[1]).toMatchObject({
        parentSessionId: activeSessions[0]?.id ?? null,
        status: 'active',
        executionIndex: 1,
        referenceId: primaryGameId,
      });
      expect(activeSessions[2]).toMatchObject({
        parentSessionId: activeSessions[0]?.id ?? null,
        status: 'active',
        executionIndex: 2,
        referenceId: secondaryGameId,
      });

      const overviewResponse = await getApp().inject({
        method: 'GET',
        url: '/blackjack',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(overviewResponse.statusCode).toBe(200);
      const overviewPayload = overviewResponse.json();
      expect(overviewPayload.ok).toBe(true);
      expect(overviewPayload.data.activeGames).toHaveLength(2);
      expect(overviewPayload.data.activeGame.id).toBe(primaryGameId);

      const settleFirstResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${primaryGameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(settleFirstResponse.statusCode).toBe(200);
      const settleFirstPayload = settleFirstResponse.json();
      expect(settleFirstPayload.ok).toBe(true);
      expect(settleFirstPayload.data.game.id).toBe(primaryGameId);
      expect(settleFirstPayload.data.game.status).not.toBe('active');
      expect(settleFirstPayload.data.playMode).toMatchObject({
        type: 'dual_bet',
        lastOutcome: null,
      });

      const midOverviewResponse = await getApp().inject({
        method: 'GET',
        url: '/blackjack',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(midOverviewResponse.statusCode).toBe(200);
      const midOverviewPayload = midOverviewResponse.json();
      expect(midOverviewPayload.ok).toBe(true);
      expect(midOverviewPayload.data.activeGames).toHaveLength(1);
      expect(midOverviewPayload.data.activeGame.id).toBe(secondaryGameId);
      expect(midOverviewPayload.data.playMode.lastOutcome).toBeNull();

      const settleSecondResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${secondaryGameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });
      expect(settleSecondResponse.statusCode).toBe(200);
      const settleSecondPayload = settleSecondResponse.json();
      expect(settleSecondPayload.ok).toBe(true);
      expect(settleSecondPayload.data.game.id).toBe(secondaryGameId);
      expect(settleSecondPayload.data.game.status).not.toBe('active');
      expect(settleSecondPayload.data.playMode.lastOutcome).not.toBeNull();

      const [storedMode] = await getDb()
        .select({
          mode: userPlayModes.mode,
          state: userPlayModes.state,
        })
        .from(userPlayModes)
        .where(eq(userPlayModes.userId, user.id))
        .limit(1);
      expect(storedMode).toMatchObject({
        mode: 'dual_bet',
        state: expect.objectContaining({
          type: 'dual_bet',
          nextMultiplier: 2,
          lastOutcome: settleSecondPayload.data.playMode.lastOutcome,
        }),
      });

      const settledSessions = await getDb()
        .select({
          parentSessionId: playModeSessions.parentSessionId,
          status: playModeSessions.status,
          executionIndex: playModeSessions.executionIndex,
          referenceId: playModeSessions.referenceId,
        })
        .from(playModeSessions)
        .where(eq(playModeSessions.userId, user.id))
        .orderBy(asc(playModeSessions.id));
      expect(settledSessions).toHaveLength(3);
      expect(settledSessions.every((session) => session.status === 'settled')).toBe(
        true
      );
    }
  );

  it(
    'POST /blackjack/start carries snowball rewards across wins without changing blackjack engine rules',
    { timeout: 30000 },
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-snowball@example.com',
      });
      await verifyUserContacts(user.id, { email: true });

      const firstWinningNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-snowball-win-one',
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return Boolean(
            !playerScore.blackjack &&
              !dealerScore.blackjack &&
              !playerScore.bust &&
              dealerScore.total >= 17 &&
              playerScore.total > dealerScore.total
          );
        },
      });

      const secondWinningNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-snowball-win-two',
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return Boolean(
            !playerScore.blackjack &&
              !dealerScore.blackjack &&
              !playerScore.bust &&
              dealerScore.total >= 17 &&
              playerScore.total > dealerScore.total
          );
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const firstStartResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce: firstWinningNonce,
          playMode: {
            type: 'snowball',
          },
        },
      });

      expect(firstStartResponse.statusCode).toBe(200);
      const firstStartPayload = firstStartResponse.json();
      expect(firstStartPayload.ok).toBe(true);
      expect(firstStartPayload.data).toMatchObject({
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 1,
        },
        game: {
          stakeAmount: '10.00',
          totalStake: '10.00',
          playMode: {
            type: 'snowball',
            appliedMultiplier: 1,
            nextMultiplier: 1,
          },
        },
      });

      const firstGameId = Number(firstStartPayload.data.game.id);
      const firstSettleResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${firstGameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(firstSettleResponse.statusCode).toBe(200);
      const firstSettlePayload = firstSettleResponse.json();
      expect(firstSettlePayload.ok).toBe(true);
      expect(firstSettlePayload.data).toMatchObject({
        balance: '100.00',
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 2,
          streak: 1,
          lastOutcome: 'win',
          carryActive: true,
          pendingPayoutAmount: '10.00',
          pendingPayoutCount: 1,
          snowballCarryAmount: '10.00',
        },
        game: {
          status: 'player_win',
          playMode: {
            type: 'snowball',
            appliedMultiplier: 1,
            nextMultiplier: 2,
          },
        },
      });

      const secondStartResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce: secondWinningNonce,
          playMode: {
            type: 'snowball',
          },
        },
      });

      expect(secondStartResponse.statusCode).toBe(200);
      const secondStartPayload = secondStartResponse.json();
      expect(secondStartPayload.ok).toBe(true);
      expect(secondStartPayload.data).toMatchObject({
        balance: '90.00',
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 2,
          carryActive: true,
          pendingPayoutAmount: '10.00',
          pendingPayoutCount: 1,
          snowballCarryAmount: '10.00',
        },
        game: {
          status: 'active',
          stakeAmount: '10.00',
          totalStake: '10.00',
          playMode: {
            type: 'snowball',
            appliedMultiplier: 1,
            nextMultiplier: 2,
          },
        },
      });

      const secondGameId = Number(secondStartPayload.data.game.id);
      const secondSettleResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${secondGameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(secondSettleResponse.statusCode).toBe(200);
      const secondSettlePayload = secondSettleResponse.json();
      expect(secondSettlePayload.ok).toBe(true);
      expect(secondSettlePayload.data).toMatchObject({
        balance: '100.00',
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 3,
          streak: 2,
          lastOutcome: 'win',
          carryActive: true,
          pendingPayoutAmount: '20.00',
          pendingPayoutCount: 2,
          snowballCarryAmount: '20.00',
        },
        game: {
          status: 'player_win',
          playMode: {
            type: 'snowball',
            appliedMultiplier: 1,
            nextMultiplier: 3,
          },
        },
      });

      const overviewResponse = await getApp().inject({
        method: 'GET',
        url: '/blackjack',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(overviewResponse.statusCode).toBe(200);
      expect(overviewResponse.json()).toMatchObject({
        ok: true,
        data: {
          playMode: {
            type: 'snowball',
            nextMultiplier: 3,
            streak: 2,
            lastOutcome: 'win',
            carryActive: true,
            pendingPayoutAmount: '20.00',
            pendingPayoutCount: 2,
            snowballCarryAmount: '20.00',
          },
          activeGame: null,
        },
      });
    }
  );

  it(
    'POST /blackjack/start defers blackjack profit until the next hand without changing blackjack engine rules',
    async () => {
      const user = await seedBlackjackScenario({
        email: 'blackjack-deferred-double@example.com',
      });
      await verifyUserContacts(user.id, { email: true });

      const winningNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-deferred-double-win',
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return Boolean(
            !playerScore.blackjack &&
              !dealerScore.blackjack &&
              !playerScore.bust &&
              dealerScore.total >= 17 &&
              playerScore.total > dealerScore.total
          );
        },
      });

      const followUpNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-blackjack-deferred-double-followup',
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return !playerScore.blackjack && !dealerScore.blackjack;
        },
      });

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const firstStartResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce: winningNonce,
          playMode: {
            type: 'deferred_double',
          },
        },
      });

      expect(firstStartResponse.statusCode).toBe(200);
      const firstStartPayload = firstStartResponse.json();
      expect(firstStartPayload.ok).toBe(true);
      expect(firstStartPayload.data).toMatchObject({
        balance: '90.00',
        playMode: {
          type: 'deferred_double',
          appliedMultiplier: 1,
        },
        game: {
          stakeAmount: '10.00',
          totalStake: '10.00',
          playMode: {
            type: 'deferred_double',
            appliedMultiplier: 1,
          },
        },
      });

      const gameId = Number(firstStartPayload.data.game.id);
      const settleResponse = await getApp().inject({
        method: 'POST',
        url: `/blackjack/${gameId}/action`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          action: 'stand',
        },
      });

      expect(settleResponse.statusCode).toBe(200);
      const settlePayload = settleResponse.json();
      expect(settlePayload.ok).toBe(true);
      expect(settlePayload.data).toMatchObject({
        balance: '100.00',
        playMode: {
          type: 'deferred_double',
          appliedMultiplier: 1,
          nextMultiplier: 1,
          lastOutcome: 'win',
          carryActive: true,
          pendingPayoutAmount: '10.00',
          pendingPayoutCount: 1,
        },
        game: {
          id: gameId,
          status: 'player_win',
          playMode: {
            type: 'deferred_double',
            appliedMultiplier: 1,
            nextMultiplier: 1,
          },
        },
      });

      const [storedMode] = await getDb()
        .select({
          mode: userPlayModes.mode,
          state: userPlayModes.state,
        })
        .from(userPlayModes)
        .where(eq(userPlayModes.userId, user.id))
        .limit(1);
      expect(storedMode).toMatchObject({
        mode: 'deferred_double',
        state: expect.objectContaining({
          type: 'deferred_double',
          pendingPayoutAmount: '10.00',
          pendingPayoutCount: 1,
          lastOutcome: 'win',
        }),
      });

      const secondStartResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          stakeAmount: '10.00',
          clientNonce: followUpNonce,
          playMode: {
            type: 'deferred_double',
          },
        },
      });

      expect(secondStartResponse.statusCode).toBe(200);
      const secondStartPayload = secondStartResponse.json();
      expect(secondStartPayload.ok).toBe(true);
      expect(secondStartPayload.data).toMatchObject({
        balance: '100.00',
        playMode: {
          type: 'deferred_double',
          appliedMultiplier: 1,
          nextMultiplier: 1,
          carryActive: false,
        },
        game: {
          status: 'active',
          stakeAmount: '10.00',
          totalStake: '10.00',
          playMode: {
            type: 'deferred_double',
            appliedMultiplier: 1,
            nextMultiplier: 1,
          },
        },
      });
    }
  );
});
