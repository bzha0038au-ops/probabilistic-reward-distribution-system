import {
  describeIntegrationSuite,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  listUserLedgerEntries,
  seedQuickEightScenario,
  verifyUserContacts,
} from './integration-test-support';
import { and, asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  houseAccount,
  quickEightRounds,
  roundEvents,
  userWallets,
} from '@reward/database';

describeIntegrationSuite('backend quick-eight integration', () => {
  it(
    'POST /quick-eight settles a winning round for authenticated users',
    { timeout: 15000 },
    async () => {
      const user = await seedQuickEightScenario();
      await verifyUserContacts(user.id, { email: true });
      const { ensureFairnessSeed } = await import('../modules/fairness/service');
      const { drawQuickEightNumbers } = await import('../modules/quick-eight/service');
      const fairnessSeed = await ensureFairnessSeed(getDb());
      const clientNonce = 'integration-quick-eight';
      const preview = drawQuickEightNumbers({
        seed: fairnessSeed.seed,
        userId: user.id,
        clientNonce,
      });
      const winningNumbers = preview.drawnNumbers.slice(0, 8);

      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const response = await getApp().inject({
        method: 'POST',
        url: '/quick-eight',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          numbers: winningNumbers,
          stakeAmount: '1.00',
          clientNonce,
        },
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data).toMatchObject({
        userId: user.id,
        selectedNumbers: winningNumbers,
        matchedNumbers: winningNumbers,
        hitCount: 8,
        multiplier: '4800.00',
        stakeAmount: '1.00',
        payoutAmount: '4800.00',
        status: 'won',
        fairness: {
          clientNonce,
          commitHash: fairnessSeed.commitHash,
        },
      });

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
          wageredAmount: userWallets.wageredAmount,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet).toEqual({
        withdrawableBalance: '4899.00',
        wageredAmount: '1.00',
      });

      const [house] = await getDb()
        .select({ prizePoolBalance: houseAccount.prizePoolBalance })
        .from(houseAccount)
        .where(eq(houseAccount.id, 1))
        .limit(1);

      expect(house?.prizePoolBalance).toBe('45201.00');

      const userEntries = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount, referenceType }) => ({
          entryType,
          amount,
          referenceType,
        }),
      );

      expect(userEntries).toEqual([
        {
          entryType: 'quick_eight_stake',
          amount: '-1.00',
          referenceType: 'quick_eight',
        },
        {
          entryType: 'quick_eight_payout',
          amount: '4800.00',
          referenceType: 'quick_eight',
        },
      ]);

      const [storedRound] = await getDb()
        .select({
          hitCount: quickEightRounds.hitCount,
          multiplier: quickEightRounds.multiplier,
          stakeAmount: quickEightRounds.stakeAmount,
          payoutAmount: quickEightRounds.payoutAmount,
          status: quickEightRounds.status,
        })
        .from(quickEightRounds)
        .where(eq(quickEightRounds.userId, user.id))
        .limit(1);

      expect(storedRound).toEqual({
        hitCount: 8,
        multiplier: '4800.00',
        stakeAmount: '1.00',
        payoutAmount: '4800.00',
        status: 'won',
      });

      const storedEvents = await getDb()
        .select({
          eventType: roundEvents.eventType,
        })
        .from(roundEvents)
        .where(
          and(
            eq(roundEvents.roundType, 'quick_eight'),
            eq(roundEvents.roundEntityId, payload.data.id)
          )
        )
        .orderBy(asc(roundEvents.eventIndex));

      expect(storedEvents.map((event) => event.eventType)).toEqual([
        'round_started',
        'stake_debited',
        'numbers_drawn',
        'round_settled',
        'payout_credited',
      ]);

      const historyResponse = await getApp().inject({
        method: 'GET',
        url: `/hand-history/${encodeURIComponent(payload.data.roundId)}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(historyResponse.statusCode).toBe(200);
      const historyPayload = historyResponse.json();
      expect(historyPayload.ok).toBe(true);
      expect(historyPayload.data).toMatchObject({
        roundId: payload.data.roundId,
        roundType: 'quick_eight',
        status: 'won',
        stakeAmount: '1.00',
        totalStake: '1.00',
        payoutAmount: '4800.00',
      });
      expect(
        historyPayload.data.events.map((event: { type: string }) => event.type)
      ).toEqual([
        'round_started',
        'stake_debited',
        'numbers_drawn',
        'round_settled',
        'payout_credited',
      ]);
    }
  );
});
